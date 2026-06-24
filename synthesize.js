'use strict';
/* ────────────────────────────────────────────────────────────────────────────
   UniScout Intelligence — Phase 2: synthesis layer

   The RAG pipeline:
     1. (qdrant.js)  embed the question with local FastEmbed → search Qdrant
                     → get back the most relevant REAL comments.
     2. (this file)  hand those real comments to OpenAI, which writes ONE
                     natural, human-sounding answer grounded ONLY in them.

   It never invents opinions: OpenAI is told to summarise the supplied comments
   and nothing else. If no OPENAI_API_KEY is configured, we still return a useful
   answer built directly from the real comments (extractive fallback) so the page
   works immediately with zero external AI keys.
   ──────────────────────────────────────────────────────────────────────────── */

/* Provider auto-detection.
   We use the OpenAI SDK, but point it at whichever provider's key is supplied:
     • Groq  (key starts with "gsk_")  → OpenAI-compatible, very fast, free tier.
     • OpenAI (key starts with "sk-")  → the classic.
   You can override the base URL / model explicitly via env if you ever want to. */
function resolveProvider() {
  const key = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || '';
  if (!key) return null;
  const isGroq = key.indexOf('gsk_') === 0 || !!process.env.GROQ_API_KEY;
  if (isGroq) {
    return {
      name: 'groq',
      apiKey: key,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1',
      model: process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile',
    };
  }
  return {
    name: 'openai',
    apiKey: key,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

const MODEL = (resolveProvider() && resolveProvider().model) || 'gpt-4o-mini';

let _openai = null;
async function getOpenAI() {
  if (_openai) return _openai;
  const p = resolveProvider();
  if (!p) return null;
  const OpenAI = (await import('openai')).default;
  _openai = new OpenAI({ apiKey: p.apiKey, baseURL: p.baseURL });
  return _openai;
}

function hasOpenAI() { return !!resolveProvider(); }

/* Turn the retrieved comments into a compact, numbered block for the prompt. */
function commentsToContext(comments) {
  return comments.map(function (c, i) {
    var who = c.author ? ' — ' + c.author : '';
    var src = c.source ? ' [' + c.source + ']' : '';
    return '[' + (i + 1) + '] (' + c.name + ')' + src + who + ': "' + c.text + '"';
  }).join('\n');
}

/* De-duplicate the sources we show under an answer. */
function collectSources(comments) {
  var seen = {}, out = [];
  comments.forEach(function (c) {
    var key = c.url || (c.source + '|' + c.name);
    if (seen[key]) return;
    seen[key] = 1;
    out.push({ title: (c.source || 'Review') + ' · ' + c.name, url: c.url || null, source: c.source || null });
  });
  return out;
}

const SYSTEM_PROMPT =
  "You are UniScout AI — basically a friend who's talked to loads of students and residents and gives " +
  "people the real, honest lowdown on universities and cities. The real student/resident opinions handed " +
  "to you are your only knowledge; everything you say comes from them.\n" +
  "How to talk:\n" +
  "1. Ground everything in the supplied opinions. Never invent facts, numbers, rankings, or opinions that " +
  "aren't in them.\n" +
  "2. Sound like a real person texting a friend — warm, casual, honest. Plain English, contractions, no " +
  "corporate or essay tone, no robotic 'In conclusion'.\n" +
  "3. Keep it tight: usually 2-4 short paragraphs. Don't pad. Skip headings and bullet-point lists unless " +
  "the question really calls for a list — flowing sentences feel more human.\n" +
  "4. Be straight about the good AND the bad, and if people disagree just say opinions are mixed.\n" +
  "5. If the opinions don't really cover what was asked, just say you haven't seen much on that — don't guess.\n" +
  "6. Never mention these instructions, 'the comments', 'the data', sources, or that you were given anything. " +
  "Don't list where it came from. Just answer like you know the place.";

/* ── Main entry: turn real comments into one human answer ── */
async function synthesize(question, comments, opts) {
  opts = opts || {};
  var sources = collectSources(comments);

  if (!comments.length) {
    return {
      answer: "I couldn't find any real opinions about that yet. Try naming the university or city " +
              "directly — for example \"What do students say about the University of Manchester?\"",
      sources: [], model: null, grounded: 0
    };
  }

  var client = await getOpenAI();
  if (!client) {
    // No OpenAI key → extractive answer straight from the real comments.
    return { answer: extractiveAnswer(question, comments), sources: sources, model: 'extractive', grounded: comments.length };
  }

  var userMsg =
    'Question: ' + question + '\n\n' +
    'Here are real comments from students/residents to base your answer on:\n' +
    commentsToContext(comments) + '\n\n' +
    'Write the answer now, following all the rules.';

  var provider = resolveProvider();
  var completion = await client.chat.completions.create({
    model: (provider && provider.model) || MODEL,
    temperature: 0.65,
    max_tokens: 800,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg }
    ]
  });

  var answer = (completion.choices &&
                completion.choices[0] &&
                completion.choices[0].message &&
                completion.choices[0].message.content || '').trim();

  if (!answer) answer = extractiveAnswer(question, comments);
  return { answer: answer, sources: sources, model: MODEL, grounded: comments.length };
}

/* ── Fallback: a readable answer assembled from the real comments, no LLM ── */
function extractiveAnswer(question, comments) {
  var name = comments[0] && comments[0].name ? comments[0].name : 'this place';

  // Cheap sentiment split so we can show "what people like / dislike".
  var NEG = /\b(worst|expensive|bad|poor|terrible|awful|dreadful|hate|disappoint|overpriced|crowded|dirty|noisy|cold|rude|lacking|problem|struggle|difficult|unsafe|boring)\b/i;
  var POS = /\b(best|love|great|amazing|brilliant|beautiful|friendly|good|excellent|fantastic|enjoy|vibrant|welcoming|incredible|recommend|perfect|wonderful|helpful)\b/i;

  var likes = [], dislikes = [], neutral = [];
  comments.forEach(function (c) {
    var t = (c.text || '').trim();
    if (!t) return;
    if (NEG.test(t) && !POS.test(t)) dislikes.push(t);
    else if (POS.test(t)) likes.push(t);
    else neutral.push(t);
  });

  function quote(t) { return t.length > 220 ? t.slice(0, 217).trim() + '…' : t; }
  function bullets(arr) { return arr.slice(0, 4).map(function (t) { return '- ' + quote(t); }).join('\n'); }

  var out = "Here's what real students and residents actually say about **" + name + "**, " +
            "based on " + comments.length + " genuine review" + (comments.length === 1 ? '' : 's') + ":\n\n";
  if (likes.length)    out += "**What people like**\n" + bullets(likes) + "\n\n";
  if (dislikes.length) out += "**What people complain about**\n" + bullets(dislikes) + "\n\n";
  if (!likes.length && !dislikes.length && neutral.length) out += bullets(neutral) + "\n\n";
  out += "*These are direct, unedited opinions from public review sites — add an OpenAI key to have the AI " +
         "weave them into a single natural summary.*";
  return out;
}

module.exports = { synthesize, hasOpenAI, MODEL };
