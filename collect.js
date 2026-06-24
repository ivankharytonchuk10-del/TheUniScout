'use strict';
/* ────────────────────────────────────────────────────────────────────────────
   UniScout — high-throughput comment collection engine

   Goal: collect large volumes of REAL student review comments fast, dedupe them,
   and stage them for downstream processing / translation / the AI-reviews RAG.

   Pipeline:
     1. Read target universities (top-N per region) from ../design/data/<cc>.json
     2. Resolve each to its EDUopinions page via the site search AJAX
     3. Fetch the page, extract verbatim <reviewBody> comments (no analysis)
     4. Insert into SQLite (collected.db) with text-level dedup
     5. Flush batches of 50–100 raw comments to data/batches/ in the format
          { "source": "...", "comments": ["...", ...] }
     6. Print collection stats (collected / duplicates removed / remaining)

   Usage:
     node collect.js                 # all regions, top 10 each
     node collect.js --per-region 20 # deeper per region
     node collect.js --regions de,fr,it
     node collect.js --stats         # just print DB stats
   Collection only — never summarises, classifies, or rewrites comments.
   ──────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR   = path.join(__dirname, '..', 'design', 'data');
const DB_PATH    = path.join(__dirname, 'collected.db');
const BATCH_DIR  = path.join(__dirname, 'data', 'batches');
const AJAX       = 'https://www.eduopinions.com/wp-admin/admin-ajax.php';
const UA         = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CONCURRENCY = 3;
const BATCH_SIZE  = 80;          // comments per flushed batch (50–100 per spec)
const REGION_FILES = ['gb','de','fr','es','it','nl','se','ch','pt','ua','us','be','dk','fi','ie'];

/* ── CLI ── */
const argv = process.argv.slice(2);
function flag(name, def) { const i = argv.indexOf('--' + name); return i === -1 ? def : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); }
const PER_REGION = parseInt(flag('per-region', '10'), 10) || 10;
const ONLY_REGIONS = (typeof flag('regions', '') === 'string' && flag('regions', '')) ? String(flag('regions')).split(',') : REGION_FILES;
const STATS_ONLY = argv.includes('--stats');

/* ── DB ── */
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source     TEXT NOT NULL,
    country    TEXT,
    entity_id  TEXT,
    entity_name TEXT,
    text       TEXT NOT NULL,
    text_norm  TEXT NOT NULL UNIQUE,
    author     TEXT,
    url        TEXT,
    batched    INTEGER DEFAULT 0,
    collected_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_entity ON comments(country, entity_id);
`);
const insert = db.prepare(`INSERT OR IGNORE INTO comments
  (source, country, entity_id, entity_name, text, text_norm, author, url)
  VALUES (@source, @country, @entity_id, @entity_name, @text, @text_norm, @author, @url)`);

/* ── helpers ── */
function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;|&lsquo;/g, "'").replace(/&rdquo;|&ldquo;/g, '"').replace(/&hellip;/g, '…');
}
function clean(s) { return decodeEntities(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function norm(s) { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url, opts, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, Object.assign({ headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest' } }, opts));
      if (r.status === 200) return await r.text();
      if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; }
      return null;
    } catch (e) { await sleep(500 * (i + 1)); }
  }
  return null;
}

async function searchEdu(query) {
  const body = new URLSearchParams({ action: 'main_search', query, search: query, term: query });
  const txt = await fetchText(AJAX, { method: 'POST', body });
  if (!txt) return null;
  let data; try { data = JSON.parse(txt); } catch (e) { return null; }
  const unis = data && data.data && data.data.items && data.data.items.universities;
  return (Array.isArray(unis) && unis.length) ? unis : null;
}
function stripName(name) {
  return name.replace(/\([^)]*\)/g, ' ')               // drop parentheticals
             .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents
             .replace(/\s+/g, ' ').trim();
}
/* Resolve a university name → EDUopinions {slug, country_slug} via site search.
   Tries the full name, then a simplified variant; picks the best name match. */
async function resolveEdu(name, countryHint) {
  const queries = [name];
  const simple = stripName(name);
  if (simple && simple !== name) queries.push(simple);
  const words = simple.split(' ').filter(w => w.length > 2);
  if (words.length > 3) queries.push(words.slice(0, 4).join(' '));
  for (const q of queries) {
    const unis = await searchEdu(q);
    if (!unis) { await sleep(200); continue; }
    const lname = name.toLowerCase(), lsimple = stripName(name).toLowerCase();
    let best = unis.find(u => u.name && u.name.toLowerCase() === lname)
            || unis.find(u => u.name && stripName(u.name).toLowerCase() === lsimple)
            || unis.find(u => u.name && (u.name.toLowerCase().includes(lsimple) || lsimple.includes(u.name.toLowerCase())))
            || unis.find(u => countryHint && u.country_slug && u.country_slug.includes(countryHint))
            || unis[0];
    if (best && best.slug && best.country_slug) return { slug: best.slug, country_slug: best.country_slug, eduName: best.name, eduId: best.id };
  }
  return null;
}

/* Extract verbatim review comments from an EDUopinions university page. */
function extractReviews(html) {
  const out = [];
  const re = /itemprop="reviewBody"[^>]*>([\s\S]*?)<\/(?:span|div|p)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = clean(m[1]);
    if (text && text.length >= 25 && !/\+comment\+|view more/i.test(text)) out.push(text);
  }
  return out;
}

const COUNTRY_SLUG = { gb:'united-kingdom', de:'germany', fr:'france', es:'spain', it:'italy', nl:'netherlands', se:'sweden', ch:'switzerland', pt:'portugal', ua:'ukraine', us:'united-states', be:'belgium', dk:'denmark', fi:'finland', ie:'ireland' };
async function scrapeUni(target) {
  const res = await resolveEdu(target.entity_name, COUNTRY_SLUG[target.country]);
  if (!res || !res.slug || !res.country_slug) return { uni: target.entity_name, found: 0, added: 0, dupes: 0, ok: false };
  const url = `https://www.eduopinions.com/universities/universities-in-${res.country_slug}/${res.slug}/`;
  const html = await fetchText(url);
  if (!html) return { uni: target.entity_name, found: 0, added: 0, dupes: 0, ok: false, url };
  const reviews = extractReviews(html);
  let added = 0, dupes = 0;
  for (const text of reviews) {
    const info = insert.run({
      source: 'EDUopinions', country: target.country, entity_id: target.entity_id,
      entity_name: target.entity_name, text, text_norm: norm(text), author: null, url,
    });
    if (info.changes) added++; else dupes++;
  }
  return { uni: target.entity_name, found: reviews.length, added, dupes, ok: true, url };
}

/* Flush any un-batched rows into source-grouped batch files of BATCH_SIZE. */
function flushBatches() {
  if (!fs.existsSync(BATCH_DIR)) fs.mkdirSync(BATCH_DIR, { recursive: true });
  const rows = db.prepare(`SELECT id, source, text FROM comments WHERE batched = 0 ORDER BY source, id`).all();
  if (!rows.length) return 0;
  const mark = db.prepare(`UPDATE comments SET batched = 1 WHERE id = ?`);
  const bySource = {};
  for (const r of rows) (bySource[r.source] = bySource[r.source] || []).push(r);
  let files = 0;
  const existing = fs.existsSync(BATCH_DIR) ? fs.readdirSync(BATCH_DIR).filter(f => /^batch_\d+\.json$/.test(f)).length : 0;
  for (const source of Object.keys(bySource)) {
    const list = bySource[source];
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const slice = list.slice(i, i + BATCH_SIZE);
      const file = path.join(BATCH_DIR, `batch_${String(existing + files + 1).padStart(4, '0')}.json`);
      fs.writeFileSync(file, JSON.stringify({ source, comments: slice.map(r => r.text) }, null, 2) + '\n');
      const tx = db.transaction(rs => rs.forEach(r => mark.run(r.id)));
      tx(slice);
      files++;
    }
  }
  return files;
}

function stats() {
  const total = db.prepare(`SELECT COUNT(*) n FROM comments`).get().n;
  const bySrc = db.prepare(`SELECT source, COUNT(*) n FROM comments GROUP BY source`).all();
  const byCountry = db.prepare(`SELECT country, COUNT(*) n FROM comments GROUP BY country ORDER BY n DESC`).all();
  return { total, bySrc, byCountry };
}

/* simple async pool */
async function pool(items, worker, n) {
  const results = []; let idx = 0;
  async function run() { while (idx < items.length) { const i = idx++; results[i] = await worker(items[i], i); await sleep(120); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return results;
}

function loadTargets() {
  const targets = [];
  for (const cc of ONLY_REGIONS) {
    const p = path.join(DATA_DIR, cc + '.json');
    if (!fs.existsSync(p)) continue;
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    (d.universities || []).slice(0, PER_REGION).forEach(u => {
      targets.push({ country: cc, entity_id: u.id, entity_name: u.name });
    });
  }
  return targets;
}

/* Export DB → app ingest format (rich records for the RAG corpus).
   Resolves the two cross-country entityId collisions (tum, uu) to unique slugs. */
const COLLISION = { 'nl:tum': 'maastricht', 'nl:uu': 'utrecht', 'se:uu': 'uppsala' };
function exportIngest(outFile) {
  const rows = db.prepare(`SELECT * FROM comments ORDER BY country, entity_id, id`).all();
  const records = rows.map(r => ({
    type: 'university',
    entityId: COLLISION[r.country + ':' + r.entity_id] || r.entity_id,
    name: r.entity_name,
    text: r.text,
    author: r.author || null,
    source: r.source,
    url: r.url || null,
  }));
  fs.writeFileSync(outFile, JSON.stringify(records, null, 2) + '\n');
  console.log(`Exported ${records.length} records → ${outFile}`);
}

async function main() {
  if (STATS_ONLY) { console.log(JSON.stringify(stats(), null, 2)); return; }
  const exp = flag('export-ingest', '');
  if (exp && typeof exp === 'string') { exportIngest(path.resolve(exp)); return; }
  const reb = argv.includes('--rebatch');
  if (reb) { db.prepare('UPDATE comments SET batched = 0').run(); const f = flushBatches(); console.log('Rewrote', f, 'batch files'); return; }
  const imp = flag('import-ingest', '');
  if (imp && typeof imp === 'string') {
    const cc = String(flag('country', '') || '');
    const recs = JSON.parse(fs.readFileSync(path.resolve(imp), 'utf8'));
    let added = 0, dup = 0;
    for (const r of recs) {
      if (!r || !r.text) continue;
      const info = insert.run({ source: r.source || 'manual', country: cc || null, entity_id: r.entityId,
        entity_name: r.name, text: r.text, text_norm: norm(r.text), author: r.author || null, url: r.url || null });
      if (info.changes) added++; else dup++;
    }
    console.log(`Imported ${imp} (country=${cc||'?'}): +${added} dup=${dup}`);
    return;
  }
  const startTotal = db.prepare(`SELECT COUNT(*) n FROM comments`).get().n;
  const targets = loadTargets();
  console.log(`Targets: ${targets.length} universities across ${ONLY_REGIONS.length} regions (top ${PER_REGION} each)`);
  let done = 0, totalAdded = 0, totalDupes = 0, notFound = 0;

  const results = await pool(targets, async (t) => {
    const r = await scrapeUni(t);
    done++; totalAdded += r.added; totalDupes += r.dupes; if (!r.ok) notFound++;
    process.stdout.write(`[${done}/${targets.length}] ${t.country}:${t.entity_id}  found=${r.found} +${r.added} dup=${r.dupes}${r.ok ? '' : '  (unresolved)'}\n`);
    if (totalAdded && totalAdded % BATCH_SIZE < r.added) flushBatches();
    return r;
  }, CONCURRENCY);

  const files = flushBatches();
  const endTotal = db.prepare(`SELECT COUNT(*) n FROM comments`).get().n;
  console.log('\n──────── COLLECTION STATS ────────');
  console.log(`Universities processed : ${targets.length}  (unresolved: ${notFound})`);
  console.log(`Comments collected new : ${totalAdded}`);
  console.log(`Duplicates removed     : ${totalDupes}`);
  console.log(`DB total comments      : ${endTotal}  (was ${startTotal})`);
  console.log(`Batch files written    : ${files}  -> ${path.relative(process.cwd(), BATCH_DIR)}`);
  const remaining = results.filter(r => r && r.ok && r.found >= 6).length;
  console.log(`Pages that hit the page cap (likely have more): ${remaining} (use AJAX/program subpages to go deeper)`);
  console.log('By source  :', JSON.stringify(stats().bySrc));
  console.log('By country :', JSON.stringify(stats().byCountry));
}

main().catch(e => { console.error('collect failed:', e); process.exit(1); });
