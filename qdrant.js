'use strict';
/* ────────────────────────────────────────────────────────────────────────────
   UniScout Intelligence — Qdrant semantic-search layer (retrieval only)

   Source of truth : server/data/comments.json  (real student/resident reviews
                     collected from public review sites — WhatUni, StudentCrowd…)
   Embeddings      : local FastEmbed (BGE-small-en-v1.5, 384-dim) — NO API key,
                     NO external AI provider.
   Vector store    : Qdrant (URL + API key from server/.env, admin-only).

   Phase 1: this file ONLY embeds + retrieves. It never calls an LLM.
   ──────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COLLECTION = process.env.QDRANT_COLLECTION || 'uniscout_comments';
const DIM = 384;                                   // BGE-small-en-v1.5 vector size
const CORPUS_PATH = path.join(__dirname, 'data', 'comments.json');

let _client = null;
let _embedder = null;

/* ── lazy clients (so the rest of the server boots even if these aren't set) ── */
async function getClient() {
  if (_client) return _client;
  const url = process.env.QDRANT_URL;
  if (!url) throw new Error('QDRANT_URL is not configured (server/.env)');
  const { QdrantClient } = await import('@qdrant/js-client-rest');
  _client = new QdrantClient({ url, apiKey: process.env.QDRANT_API_KEY || undefined });
  return _client;
}
async function getEmbedder() {
  if (_embedder) return _embedder;
  const { FlagEmbedding, EmbeddingModel } = await import('fastembed');
  // Downloads the small ONNX model to ./local_cache on first run, then offline.
  _embedder = await FlagEmbedding.init({ model: EmbeddingModel.BGESmallENV15 });
  return _embedder;
}

/* ── embeddings (local, no provider keys) ── */
async function embedPassages(texts) {
  const model = await getEmbedder();
  const out = [];
  for await (const batch of model.embed(texts, 32)) {
    for (const v of batch) out.push(Array.from(v));
  }
  return out;
}
async function embedQuery(text) {
  const model = await getEmbedder();
  const v = await model.queryEmbed(text);
  return Array.from(v);
}

/* Qdrant point ids must be uint or UUID — derive a stable UUID from our string id. */
function toPointId(strId) {
  const h = crypto.createHash('md5').update(String(strId)).digest('hex');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32);
}

function loadCorpus() {
  try { return JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8')); } catch (e) { return []; }
}

/* ── colloquial entity detection ──
   Lets people name a place the human way — "Harvard", "Bocconi", "MIT",
   "Sapienza" — instead of the full "Harvard University". We build a small set of
   aliases for every entity (full name, the distinctive core word(s) once the
   generic "University of…" filler is stripped, and the abbreviation/slug) and
   match them against the question on WORD boundaries so short ids like "ie"
   don't accidentally fire on words like "review". */
function stripAccents(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function normLower(s) { return stripAccents(String(s).toLowerCase()); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const GENERIC_WORDS = /\b(the|a|of|and|fur|den|der|und|for|di|de|del|della|do|da)\b/g;
const UNI_WORDS = /\b(university|universit[aeyà]?|universidad|universidade|universita|universitat|universiteit|universite|college|institute|institut|school|polytechnic|polytechnique|technical|technology|national|state|royal|federal|catholic|business|sciences?|studies?|higher|education|academy)\b/g;
// 2-letter slugs are too ambiguous to match on their own.
function aliasesFor(e) {
  const aliases = new Set();
  const full = normLower(e.name).replace(/\s+/g, ' ').trim();
  if (full) aliases.add(full);
  const core = full.replace(UNI_WORDS, ' ').replace(GENERIC_WORDS, ' ')
                   .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (core && core.length >= 3) aliases.add(core);
  const id = normLower(e.entityId);
  if (id.length >= 3 && /[a-z]/.test(id)) aliases.add(id);
  return aliases;
}
function aliasHit(qNorm, alias) {
  if (alias.length < 3) return 0;
  const re = new RegExp('(^|[^a-z0-9])' + escapeRe(alias) + '($|[^a-z0-9])');
  return re.test(qNorm) ? alias.length : 0;
}

/* Detect which known entity (university/city) a free-text question is about, so
   we can filter the search to just that place instead of mixing universities.
   Returns { entityId, type, name } or null. */
function detectEntity(query) {
  const qNorm = ' ' + normLower(query).replace(/\s+/g, ' ').trim() + ' ';
  const seen = {};
  const entities = [];
  for (const c of loadCorpus()) {
    const k = c.entityId + '|' + c.type;     // keep city + university of the same name distinct
    if (seen[k]) continue;
    seen[k] = 1;
    entities.push({ entityId: c.entityId, type: c.type, name: c.name });
  }
  // Soft hints to break ties between a same-named university and city.
  const wantCity = /\b(city|town|live|living|move|moving|nightlife|rent|neighbourhood|neighborhood)\b/.test(qNorm);
  const wantUni  = /\b(university|uni|college|campus|study|studying|course|degree|professor|lecturer|tuition|faculty|student life)\b/.test(qNorm);

  let best = null, bestScore = 0;
  for (const e of entities) {
    let len = 0;
    for (const a of aliasesFor(e)) len = Math.max(len, aliasHit(qNorm, a));
    if (!len) continue;
    let score = len;                       // prefer the most specific (longest) match
    if (wantCity && e.type === 'city') score += 0.5;
    if (wantUni && e.type === 'university') score += 0.5;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best ? { entityId: best.entityId, type: best.type, name: best.name } : null;
}

/* ── collection lifecycle ── */
async function createCollection() {
  const client = await getClient();
  const list = await client.getCollections();
  const exists = (list.collections || []).some(c => c.name === COLLECTION);
  if (!exists) {
    await client.createCollection(COLLECTION, { vectors: { size: DIM, distance: 'Cosine' } });
  }
  // Payload indexes are required before you can filter on a field (e.g. type=university).
  for (const field of ['type', 'entityId']) {
    try {
      await client.createPayloadIndex(COLLECTION, { field_name: field, field_schema: 'keyword', wait: true });
    } catch (e) { /* already exists — fine */ }
  }
  return COLLECTION;
}

/* ── index one comment (call these on create/update of a comment) ── */
async function indexComment(c) {
  const client = await getClient();
  await createCollection();
  const [vector] = await embedPassages([c.text]);
  await client.upsert(COLLECTION, {
    wait: true,
    points: [{
      id: toPointId(c.id),
      vector,
      payload: {
        commentId: c.id, type: c.type, entityId: c.entityId,
        name: c.name, text: c.text, author: c.author || null,
        source: c.source || null, url: c.url || null
      }
    }]
  });
  return c.id;
}
function indexUniversityComment(c) { return indexComment(Object.assign({ type: 'university' }, c)); }
function indexCityComment(c) { return indexComment(Object.assign({ type: 'city' }, c)); }

/* ── delete one comment (call on delete) ── */
async function deleteComment(id) {
  const client = await getClient();
  await client.delete(COLLECTION, { wait: true, points: [toPointId(id)] });
  return id;
}

/* ── semantic search (retrieval only — returns comments, no LLM) ── */
async function searchComments(query, opts) {
  opts = opts || {};
  const client = await getClient();
  const vector = await embedQuery(query);
  const must = [];
  if (opts.entityId) must.push({ key: 'entityId', match: { value: opts.entityId } });
  if (opts.type === 'university' || opts.type === 'city') must.push({ key: 'type', match: { value: opts.type } });
  const filter = must.length ? { must } : undefined;
  const res = await client.search(COLLECTION, {
    vector, limit: opts.limit || 8, with_payload: true, filter
  });
  return res.map(r => ({ score: r.score, ...r.payload }));
}

/* ── (re)index the whole corpus ── */
async function reindexAllComments() {
  const client = await getClient();
  // fresh collection so removed comments don't linger
  try { await client.deleteCollection(COLLECTION); } catch (e) { /* may not exist */ }
  await createCollection();
  const corpus = loadCorpus();
  if (!corpus.length) return { indexed: 0 };
  const vectors = await embedPassages(corpus.map(c => c.text));
  const points = corpus.map((c, i) => ({
    id: toPointId(c.id),
    vector: vectors[i],
    payload: {
      commentId: c.id, type: c.type, entityId: c.entityId,
      name: c.name, text: c.text, author: c.author || null,
      source: c.source || null, url: c.url || null
    }
  }));
  // upsert in chunks
  for (let i = 0; i < points.length; i += 64) {
    await client.upsert(COLLECTION, { wait: true, points: points.slice(i, i + 64) });
  }
  return { indexed: points.length };
}

/* ── how many vectors are indexed ── */
async function indexedCount() {
  const client = await getClient();
  try {
    const c = await client.count(COLLECTION, { exact: true });
    return c.count;
  } catch (e) { return 0; }
}

function isConfigured() { return !!process.env.QDRANT_URL; }

module.exports = {
  COLLECTION, DIM, loadCorpus, isConfigured, detectEntity,
  createCollection, indexComment, indexUniversityComment, indexCityComment,
  deleteComment, searchComments, reindexAllComments, indexedCount
};
