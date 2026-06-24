'use strict';
/* ────────────────────────────────────────────────────────────────────────────
   UniScout — daily "what's new about your saved universities" email digest.

   Every day the agent looks at each subscriber's saved universities, pulls the
   latest real news headlines for them (Google News RSS — no API key), optionally
   writes a short friendly intro with the LLM, and emails the digest.

   Storage: a `digest_subs` table in the existing SQLite db. The browser keeps the
   subscription in sync (saved unis live in localStorage) by POSTing to
   /api/digest/subscribe whenever the page loads.
   ──────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const { db } = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS digest_subs (
    email        TEXT PRIMARY KEY,
    user_id      TEXT,
    universities TEXT,                -- JSON array of names
    last_sent    TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );
`);

const _upsert = db.prepare(`
  INSERT INTO digest_subs (email, user_id, universities)
  VALUES (@email, @user_id, @universities)
  ON CONFLICT(email) DO UPDATE SET user_id = @user_id, universities = @universities
`);
const _all = db.prepare(`SELECT * FROM digest_subs`);
const _one = db.prepare(`SELECT * FROM digest_subs WHERE email = ?`);
const _markSent = db.prepare(`UPDATE digest_subs SET last_sent = datetime('now') WHERE email = ?`);
const _delete = db.prepare(`DELETE FROM digest_subs WHERE email = ?`);

/* Remove a subscriber (toggle off). */
function unsubscribe(email) {
  email = String(email || '').trim().toLowerCase();
  _delete.run(email);
  return { email, unsubscribed: true };
}

/* Save / update a subscriber's saved-university list. */
function subscribe({ email, userId, universities }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid_email');
  const names = (Array.isArray(universities) ? universities : [])
    .map(u => (typeof u === 'string' ? u : (u && u.name) || ''))
    .map(s => String(s).trim()).filter(Boolean);
  _upsert.run({ email, user_id: String(userId || ''), universities: JSON.stringify([...new Set(names)]) });
  return { email, count: names.length };
}

function decode(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim();
}

/* Pull the latest real headlines about one university from Google News RSS. */
async function fetchUniNews(name, max = 4) {
  const q = encodeURIComponent('"' + name + '"');
  const url = 'https://news.google.com/rss/search?q=' + q + '&hl=en-US&gl=US&ceid=US:en';
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (UniScout digest)' } });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) !== null && items.length < max) {
      const block = m[1];
      const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
      const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
      const date = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
      if (title) items.push({ title: decode(title), link: decode(link || ''), date: decode(date || '') });
    }
    return items;
  } catch (e) { return []; }
}

/* Optional: a short, warm one-liner intro written by the LLM (falls back to a
   plain greeting if no provider key is set). */
async function introLine(synth, totalHeadlines, uniCount) {
  if (!synth || !synth.hasOpenAI || !synth.hasOpenAI()) {
    return "Here's what's been happening at the universities you're keeping an eye on.";
  }
  try {
    const OpenAI = (await import('openai')).default;
    const key = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    const isGroq = (key || '').indexOf('gsk_') === 0 || !!process.env.GROQ_API_KEY;
    const client = new OpenAI({ apiKey: key, baseURL: isGroq ? 'https://api.groq.com/openai/v1' : process.env.OPENAI_BASE_URL });
    const model = process.env.OPENAI_MODEL || (isGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');
    const c = await client.chat.completions.create({
      model, temperature: 0.7, max_tokens: 60,
      messages: [{ role: 'user', content: 'Write ONE short, warm, casual sentence (max 18 words) to open a daily email that rounds up ' + totalHeadlines + ' fresh news headlines about ' + uniCount + ' universities a student is interested in. No greeting like "Hi". Just the sentence.' }]
    });
    return (c.choices[0].message.content || '').trim().replace(/^["']|["']$/g, '');
  } catch (e) {
    return "Here's what's been happening at the universities you're keeping an eye on.";
  }
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function buildHtml(intro, blocks) {
  const sections = blocks.map(b => {
    if (!b.items.length) {
      return '<div style="margin:0 0 22px"><div style="font-weight:700;font-size:16px;color:#1a1d23;margin:0 0 6px">' + esc(b.name) + '</div>' +
             '<div style="font-size:13px;color:#8a909c">No fresh headlines today — all quiet.</div></div>';
    }
    const lis = b.items.map(it =>
      '<li style="margin:0 0 9px;font-size:14px;line-height:1.5">' +
        '<a href="' + esc(it.link) + '" style="color:#d97c14;text-decoration:none;font-weight:600">' + esc(it.title) + '</a>' +
        (it.date ? '<div style="font-size:11px;color:#8a909c;margin-top:2px">' + esc(it.date) + '</div>' : '') +
      '</li>').join('');
    return '<div style="margin:0 0 22px"><div style="font-weight:700;font-size:16px;color:#1a1d23;margin:0 0 8px">' + esc(b.name) + '</div>' +
           '<ul style="margin:0;padding-left:18px">' + lis + '</ul></div>';
  }).join('');

  return '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#faf9f5;padding:0">' +
    '<div style="background:linear-gradient(135deg,#d97c14,#f59220);padding:22px 24px;border-radius:14px 14px 0 0">' +
      '<div style="color:#fff;font-size:20px;font-weight:800">UniScout · Daily Brief</div>' +
      '<div style="color:rgba(255,255,255,.9);font-size:13px;margin-top:4px">News on your saved universities</div>' +
    '</div>' +
    '<div style="background:#fff;padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 14px 14px">' +
      '<p style="font-size:14.5px;color:#4a5160;line-height:1.6;margin:0 0 20px">' + esc(intro) + '</p>' +
      sections +
      '<div style="border-top:1px solid #eee;margin-top:8px;padding-top:14px;font-size:11.5px;color:#8a909c">' +
        'You\'re getting this because you saved these universities on UniScout. Headlines are pulled from public news sources.' +
      '</div>' +
    '</div></div>';
}

/* Build + (optionally) send the digest for one subscriber. */
async function sendOne(mailer, synth, sub) {
  let names = [];
  try { names = JSON.parse(sub.universities || '[]'); } catch (e) {}
  if (!names.length) return { email: sub.email, skipped: 'no_saved_universities' };

  const blocks = [];
  let total = 0;
  for (const name of names.slice(0, 12)) {           // cap to keep it snappy
    const items = await fetchUniNews(name);
    total += items.length;
    blocks.push({ name, items });
  }
  const intro = await introLine(synth, total, names.length);
  const html = buildHtml(intro, blocks);
  const subject = 'Your university brief — ' + total + ' new ' + (total === 1 ? 'headline' : 'headlines');

  if (!mailer) { return { email: sub.email, sent: false, reason: 'no_smtp', headlines: total, html }; }
  await mailer.sendMail({
    from: process.env.SMTP_FROM || ('UniScout <' + process.env.SMTP_USER + '>'),
    to: sub.email, subject, html,
  });
  _markSent.run(sub.email);
  return { email: sub.email, sent: true, headlines: total };
}

/* Run the digest for every subscriber (or just one email, for testing). */
async function runDigest(mailer, synth, onlyEmail) {
  const subs = onlyEmail ? [_one.get(String(onlyEmail).toLowerCase())].filter(Boolean) : _all.all();
  const results = [];
  for (const sub of subs) {
    try { results.push(await sendOne(mailer, synth, sub)); }
    catch (e) { results.push({ email: sub.email, error: e.message }); }
  }
  return results;
}

/* Seed subscribers from a committed digest-targets.json (for cloud hosts whose
   disk is ephemeral / that don't share the app's live SQLite). Safe to call
   repeatedly — subscribe() upserts. */
function seedFromTargetsFile() {
  const p = path.join(__dirname, 'digest-targets.json');
  if (!fs.existsSync(p)) return 0;
  try {
    const t = JSON.parse(fs.readFileSync(p, 'utf8'));
    const list = Array.isArray(t) ? t : [t];
    let n = 0;
    list.forEach(s => { if (s && s.email) { try { subscribe(s); n++; } catch (e) {} } });
    return n;
  } catch (e) { return 0; }
}

module.exports = { subscribe, unsubscribe, runDigest, sendOne, fetchUniNews, seedFromTargetsFile, _all };
