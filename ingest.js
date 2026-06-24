'use strict';
/* ────────────────────────────────────────────────────────────────────────────
   UniScout Intelligence — corpus ingestion helper

   Use this to GROW the real-comment corpus toward 150 comments per university /
   city without hand-editing the big JSON. Drop a batch of new comments into a
   file and run:

       node ingest.js path/to/new-comments.json
       node ingest.js path/to/new-comments.json --reindex   (also pushes to Qdrant)

   Each item in the batch file must look like:
   {
     "type": "university" | "city",
     "entityId": "manchester",                  // stable slug, groups the comments
     "name": "University of Manchester",        // display name shown in the UI
     "text": "the real comment, verbatim…",     // REAL words of a real person
     "author": "optional — name/course",        // optional
     "source": "WhatUni" | "Reddit" | …,        // where it came from
     "url": "https://…"                          // link to the original (optional)
   }

   The `id` is generated for you (entityId + running number) and duplicates of the
   exact same text under the same entity are skipped, so re-running is safe.
   ──────────────────────────────────────────────────────────────────────────── */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const CORPUS_PATH = path.join(__dirname, 'data', 'comments.json');

function load(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return []; } }

function nextIndexFor(corpus, entityId, type) {
  const prefix = (type === 'city' ? 'city-' : 'uni-') + entityId + '-';
  let max = 0;
  corpus.forEach(c => {
    if (typeof c.id === 'string' && c.id.indexOf(prefix) === 0) {
      const n = parseInt(c.id.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return max + 1;
}

async function main() {
  const batchPath = process.argv[2];
  const doReindex = process.argv.includes('--reindex');
  if (!batchPath) {
    console.error('Usage: node ingest.js <new-comments.json> [--reindex]');
    process.exit(1);
  }

  const corpus = load(CORPUS_PATH);
  const batch = load(batchPath);
  if (!Array.isArray(batch) || !batch.length) {
    console.error('Batch file is empty or not a JSON array:', batchPath);
    process.exit(1);
  }

  // Skip exact-duplicate text within the same entity.
  const existing = new Set(corpus.map(c => c.entityId + '|' + (c.text || '').trim().toLowerCase()));
  let added = 0, skipped = 0;

  for (const item of batch) {
    if (!item || !item.type || !item.entityId || !item.name || !item.text) {
      console.warn('Skipping malformed item:', JSON.stringify(item).slice(0, 80));
      skipped++; continue;
    }
    const key = item.entityId + '|' + item.text.trim().toLowerCase();
    if (existing.has(key)) { skipped++; continue; }
    existing.add(key);

    const idx = nextIndexFor(corpus, item.entityId, item.type);
    const prefix = (item.type === 'city' ? 'city-' : 'uni-') + item.entityId + '-';
    corpus.push({
      id: prefix + idx,
      type: item.type,
      entityId: item.entityId,
      name: item.name,
      text: item.text.trim(),
      author: item.author || null,
      source: item.source || null,
      url: item.url || null,
    });
    added++;
  }

  fs.writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 2) + '\n');
  console.log(`Added ${added} new comments, skipped ${skipped}. Corpus is now ${corpus.length}.`);

  // Per-entity tally so you can see how close each place is to 150.
  const tally = {};
  corpus.forEach(c => { const k = c.type + ':' + c.entityId; tally[k] = (tally[k] || 0) + 1; });
  Object.entries(tally).sort().forEach(([k, v]) => console.log('  ' + String(v).padStart(3) + '  ' + k));

  if (doReindex) {
    console.log('\nReindexing into Qdrant…');
    const q = require('./qdrant');
    const r = await q.reindexAllComments();
    console.log('Reindexed', r.indexed, 'vectors.');
  } else {
    console.log('\nRun with --reindex (or POST /api/admin/qdrant/reindex) to push these into Qdrant.');
  }
}

main().catch(e => { console.error('Ingest failed:', e.message); process.exit(1); });
