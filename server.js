'use strict';

/**
 * UniScout — Stripe Elite subscription backend.
 *
 *  • Serves the existing static site from ../design
 *  • POST /api/checkout            → creates a Stripe Checkout Session (subscription)
 *  • POST /api/portal              → opens the Stripe Customer Portal
 *  • GET  /api/subscription/status → current Elite status for a user (from DB)
 *  • GET  /api/elite/content       → example Elite-only protected route
 *  • POST /webhook                 → verified Stripe webhook receiver (source of truth)
 *  • GET  /api/config              → publishable key for the frontend
 *
 * The DB is the source of truth; it is only mutated by verified webhook events
 * and the checkout bootstrap. The frontend is never trusted for payment state.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const {
  upsertUser, getUserById, getUserByCustomer, setCustomerId, setManualElite,
  upsertSubscription, getLatestSubByUser, getActiveSubByUser,
  setSetting, getSetting,
} = require('./db');

// ── Config / env validation ───────────────────────────────────
const {
  STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_ID,
} = process.env;

const PORT = parseInt(process.env.PORT || '4242', 10);
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

if (!STRIPE_SECRET_KEY) {
  console.error('FATAL: STRIPE_SECRET_KEY is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (!STRIPE_WEBHOOK_SECRET) {
  console.warn('WARNING: STRIPE_WEBHOOK_SECRET is not set — /webhook will reject all events until you set it.');
}

const stripe = require('stripe')(STRIPE_SECRET_KEY);

const ELITE_STATUSES = ['active', 'trialing'];

// Accounts that are always Elite (granted manually, no Stripe needed).
// Match is case-insensitive against the user's email OR username.
const ELITE_ACCOUNTS = (process.env.ELITE_ACCOUNTS || 'vanyochek')
  .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);

function isGrantedAccount(user) {
  if (!user) return false;
  return (user.email && ELITE_ACCOUNTS.indexOf(user.email.toLowerCase()) !== -1) ||
         (user.username && ELITE_ACCOUNTS.indexOf(user.username.toLowerCase()) !== -1);
}

// True Elite = active Stripe subscription OR a persisted manual grant.
function userIsElite(userId) {
  const sub = getLatestSubByUser(userId);
  if (sub && ELITE_STATUSES.indexOf(sub.status) !== -1) return true;
  const user = getUserById(userId);
  return !!(user && user.manual_elite);
}

// ── Helpers ───────────────────────────────────────────────────
const log = (...a) => console.log(new Date().toISOString(), ...a);
const errlog = (...a) => console.error(new Date().toISOString(), ...a);

/** Ensure a recurring €15/year Price exists; create + remember it if needed. */
let cachedPriceId = null;
async function ensurePrice() {
  if (cachedPriceId) return cachedPriceId;

  let priceId = STRIPE_PRICE_ID || getSetting('price_id');
  if (priceId) {
    try {
      const p = await stripe.prices.retrieve(priceId);
      if (p && p.active) { cachedPriceId = priceId; return priceId; }
    } catch (e) {
      errlog('Configured STRIPE_PRICE_ID invalid, will recreate:', e.message);
    }
  }

  const product = await stripe.products.create({
    name: 'UniScout Elite',
    description: 'UniScout Elite — full access to every destination, advanced tools and Elite status.',
    metadata: { app: 'uniscout', plan: 'elite' },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'eur',
    unit_amount: 1500,               // €15.00
    recurring: { interval: 'year' }, // yearly billing
    metadata: { app: 'uniscout', plan: 'elite' },
  });
  setSetting('price_id', price.id);
  cachedPriceId = price.id;
  log('Created Elite product/price:', product.id, price.id, '(€15/year)');
  return price.id;
}

/** Read the card / billing details attached to a subscription. */
async function getBillingFor(sub) {
  let pm = sub.default_payment_method;
  if (pm && typeof pm === 'string') pm = await stripe.paymentMethods.retrieve(pm);
  if (!pm) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const cust = await stripe.customers.retrieve(customerId);
    const defPm = cust && cust.invoice_settings && cust.invoice_settings.default_payment_method;
    if (defPm) pm = await stripe.paymentMethods.retrieve(defPm);
  }
  if (pm && pm.card) {
    return {
      card_brand: pm.card.brand,
      card_last4: pm.card.last4,
      billing_name: pm.billing_details && pm.billing_details.name,
      billing_email: pm.billing_details && pm.billing_details.email,
    };
  }
  return { card_brand: null, card_last4: null, billing_name: null, billing_email: null };
}

/** Work out which app user a subscription belongs to. */
function resolveUserId(sub) {
  if (sub.metadata && sub.metadata.userId) return sub.metadata.userId;
  const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id);
  const u = getUserByCustomer(customerId);
  return u ? u.id : null;
}

/** Fetch a subscription from Stripe and persist its full state to our DB. */
async function syncSubscription(subscriptionId) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['default_payment_method'],
  });
  const userId = resolveUserId(sub);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // Keep the user <-> customer link fresh
  if (userId && customerId) {
    const u = getUserById(userId);
    if (u && !u.stripe_customer_id) setCustomerId(userId, customerId);
  }

  const billing = await getBillingFor(sub);
  upsertSubscription({
    id: sub.id,
    user_id: userId,
    customer_id: customerId,
    status: sub.status,
    price_id: sub.items.data[0] && sub.items.data[0].price.id,
    current_period_end: sub.current_period_end,
    cancel_at_period_end: sub.cancel_at_period_end ? 1 : 0,
    ...billing,
  });
  log(`Synced subscription ${sub.id} → ${sub.status} (user ${userId || 'unknown'})`);
}

// ── App ───────────────────────────────────────────────────────
const app = express();
app.use(cors());

// IMPORTANT: the webhook needs the RAW body for signature verification, so it
// must be registered BEFORE the global express.json() parser.
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET || '');
  } catch (err) {
    errlog('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.client_reference_id && s.customer) setCustomerId(s.client_reference_id, s.customer);
        if (s.subscription) await syncSubscription(s.subscription);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await syncSubscription(event.data.object.id);
        break;
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        upsertSubscription({
          id: sub.id,
          user_id: resolveUserId(sub),
          customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
          status: 'canceled',
          price_id: sub.items.data[0] && sub.items.data[0].price.id,
          current_period_end: sub.current_period_end,
          cancel_at_period_end: 0,
        });
        log(`Subscription ${sub.id} canceled`);
        break;
      }
      case 'invoice.payment_succeeded': {
        const inv = event.data.object;
        if (inv.subscription) await syncSubscription(inv.subscription);
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object;
        errlog(`Payment FAILED for customer ${inv.customer} (invoice ${inv.id})`);
        if (inv.subscription) await syncSubscription(inv.subscription);
        break;
      }
      default:
        // Unhandled event types are fine to ignore.
        break;
    }
    res.json({ received: true });
  } catch (err) {
    errlog('Webhook handler error:', err);
    // 500 tells Stripe to retry later.
    res.status(500).send('Webhook handler failed');
  }
});

// JSON parser for the rest of the API
app.use(express.json());

// Expose the publishable key (safe) to the frontend
app.get('/api/config', (_req, res) => {
  res.json({ publishableKey: STRIPE_PUBLISHABLE_KEY || null });
});

// ── Email verification codes (for Google/Apple sign-in) ──────
const nodemailer = require('nodemailer');
const authCodes = {};   // email -> { code, expires, attempts }

// Configure an email transporter from env (e.g. a Gmail App Password).
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  log('Email transporter configured (' + process.env.SMTP_HOST + ')');
} else {
  log('No SMTP configured — verification codes will be logged to this console (dev mode).');
}

function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

app.post('/api/auth/send-code', async (req, res) => {
  try {
    var email = (req.body && req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });

    var code = genCode();
    authCodes[email] = { code: code, expires: Date.now() + 10 * 60 * 1000, attempts: 0 };

    if (mailer) {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || ('UniScout <' + process.env.SMTP_USER + '>'),
        to: email,
        subject: 'Your UniScout verification code',
        text: 'Your UniScout verification code is ' + code + '. It expires in 10 minutes.',
        html: '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto">' +
              '<h2 style="color:#d97c14">UniScout</h2>' +
              '<p>Your verification code is:</p>' +
              '<div style="font-size:30px;font-weight:800;letter-spacing:6px;color:#1a1d23">' + code + '</div>' +
              '<p style="color:#777;font-size:13px">This code expires in 10 minutes. If you didn’t request it, ignore this email.</p></div>',
      });
      log('Sent verification code to ' + email);
    } else {
      // Dev fallback: never returned to the browser, only the server operator sees it.
      log('DEV verification code for ' + email + ': ' + code);
    }
    // The code is NEVER sent back to the client.
    res.json({ ok: true, delivered: !!mailer });
  } catch (err) {
    errlog('send-code error:', err);
    res.status(500).json({ error: 'send_failed', message: err.message });
  }
});

app.post('/api/auth/verify-code', (req, res) => {
  var email = (req.body && req.body.email || '').trim().toLowerCase();
  var code = (req.body && req.body.code || '').trim();
  var rec = authCodes[email];
  if (!rec) return res.status(400).json({ ok: false, error: 'no_code' });
  if (Date.now() > rec.expires) { delete authCodes[email]; return res.status(400).json({ ok: false, error: 'expired' }); }
  rec.attempts++;
  if (rec.attempts > 6) { delete authCodes[email]; return res.status(429).json({ ok: false, error: 'too_many_attempts' }); }
  if (code !== rec.code) return res.status(400).json({ ok: false, error: 'incorrect' });
  delete authCodes[email];
  res.json({ ok: true });
});

// ── Subscription status (read from DB — the source of truth) ──
app.get('/api/subscription/status', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'missing_user' });
  const email = req.query.email;
  const username = req.query.username;

  // Persist the user in the DB so manual Elite grants survive logout/login.
  let user = getUserById(userId);
  if (email || username || !user) {
    user = upsertUser({
      id: userId,
      email: email || (user && user.email),
      username: username || (user && user.username),
    });
  }

  // Auto-grant Elite to configured accounts and store it in the DB.
  if (isGrantedAccount(user) && !(user && user.manual_elite)) {
    setManualElite(userId, 1);
    user = getUserById(userId);
  }

  const sub = getLatestSubByUser(userId);
  const subActive = !!(sub && ELITE_STATUSES.includes(sub.status));
  const manual = !!(user && user.manual_elite);
  const elite = subActive || manual;

  res.json({
    elite,
    status: subActive ? sub.status : (manual ? 'granted' : (sub ? sub.status : 'none')),
    manualElite: manual,
    currentPeriodEnd: sub ? sub.current_period_end : null,
    cancelAtPeriodEnd: sub ? !!sub.cancel_at_period_end : false,
    cardBrand: sub ? sub.card_brand : null,
    cardLast4: sub ? sub.card_last4 : null,
    billingName: sub ? sub.billing_name : null,
  });
});

// ── Admin: manually grant / revoke Elite (persisted in DB) ────
// Protected by ADMIN_TOKEN. Send header `x-admin-token` or body { token }.
app.post('/api/admin/grant-elite', (req, res) => {
  const token = req.headers['x-admin-token'] || (req.body && req.body.token);
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { userId, email, username, revoke } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_user' });
  upsertUser({ id: userId, email, username });
  setManualElite(userId, revoke ? 0 : 1);
  log(`Admin ${revoke ? 'revoked' : 'granted'} Elite for user ${userId}`);
  res.json({ ok: true, elite: !revoke });
});

// ── Create a Checkout Session (subscription, €15/year) ────────
app.post('/api/checkout', async (req, res) => {
  try {
    const { userId, email, username } = req.body || {};
    if (!userId || !email) return res.status(400).json({ error: 'missing_user' });

    const user = upsertUser({ id: userId, email, username });

    // Prevent duplicate subscriptions — if already active, send to the portal.
    if (getActiveSubByUser(userId)) {
      return res.status(409).json({ error: 'already_subscribed' });
    }

    // Reuse or create the Stripe customer for this user.
    let customerId = user.stripe_customer_id;
    if (customerId) {
      try { await stripe.customers.retrieve(customerId); }
      catch (_) { customerId = null; } // stale id (e.g. test data reset) → recreate
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: username || undefined,
        metadata: { userId },
      });
      customerId = customer.id;
      setCustomerId(userId, customerId);
    }

    const priceId = await ensurePrice();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      allow_promotion_codes: true,
      subscription_data: { metadata: { userId } },
      success_url: `${APP_URL}/mainPage.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/mainPage.html?checkout=cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    errlog('Checkout error:', err);
    res.status(500).json({ error: 'checkout_failed', message: err.message });
  }
});

// ── Confirm a completed Checkout Session (post-redirect) ──────
// Securely verifies the session with Stripe's API (not the frontend) and writes
// Elite status to the DB. Lets the glow appear immediately after payment without
// waiting for the webhook listener. Webhooks remain the source of truth for
// ongoing lifecycle (renewals, cancellations, failures).
app.get('/api/checkout/confirm', async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: 'missing_session' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === 'paid' || session.status === 'complete';

    if (paid) {
      if (session.client_reference_id && session.customer) {
        setCustomerId(session.client_reference_id, session.customer);
      }
      if (session.subscription) await syncSubscription(session.subscription);
    }

    const userId = session.client_reference_id;
    const sub = getLatestSubByUser(userId);
    const elite = !!(sub && ELITE_STATUSES.includes(sub.status));
    log(`Confirm session ${sessionId} → paid=${paid}, elite=${elite} (user ${userId || 'unknown'})`);
    res.json({ elite, status: sub ? sub.status : 'none', paid });
  } catch (err) {
    errlog('Confirm error:', err);
    res.status(500).json({ error: 'confirm_failed', message: err.message });
  }
});

// ── Customer Portal (manage / cancel / update card) ───────────
app.post('/api/portal', async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_user' });
    const user = getUserById(userId);
    if (!user || !user.stripe_customer_id) return res.status(404).json({ error: 'no_customer' });

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${APP_URL}/mainPage.html`,
    });
    res.json({ url: session.url });
  } catch (err) {
    errlog('Portal error:', err);
    res.status(500).json({ error: 'portal_failed', message: err.message });
  }
});

// ── Example protected Elite-only route ────────────────────────
function requireElite(req, res, next) {
  const userId = req.query.userId || (req.body && req.body.userId);
  if (userId && userIsElite(userId)) return next();
  return res.status(403).json({ error: 'elite_required' });
}
app.get('/api/elite/content', requireElite, (_req, res) => {
  res.json({ ok: true, secret: 'This payload is only returned to verified Elite members.' });
});

// ── UniScout Intelligence (Qdrant retrieval + OpenAI synthesis) ────────────
const qdrant = require('./qdrant');
const synthesize = require('./synthesize');
const digest = require('./digest');

function requireAdmin(req, res) {
  const token = req.headers['x-admin-token'] || (req.body && req.body.token) || req.query.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    res.status(403).json({ error: 'forbidden', message: 'Admin token required' });
    return false;
  }
  return true;
}

// Public (used by the AI page): semantic search → returns real comments. NO LLM.
app.post('/api/ai/search', async (req, res) => {
  try {
    const { query, type, limit } = req.body || {};
    if (!query || !String(query).trim()) return res.status(400).json({ error: 'missing_query' });
    if (!qdrant.isConfigured()) return res.status(503).json({ error: 'not_configured', message: 'Search is not set up yet.' });
    const results = await qdrant.searchComments(String(query).trim(), { type: type, limit: Math.min(20, limit || 8) });
    res.json({ ok: true, query: query, count: results.length, results });
  } catch (e) {
    errlog('ai/search failed:', e.message);
    res.status(500).json({ error: 'search_failed', message: e.message });
  }
});

// Public (used by the AI page): the full pipeline — retrieve REAL comments from
// Qdrant, then have OpenAI write one natural human answer grounded only in them.
// This is "our own model": the browser never needs an Anthropic/OpenAI key.
app.post('/api/ai/ask', async (req, res) => {
  try {
    const { query, type } = req.body || {};
    if (!query || !String(query).trim()) return res.status(400).json({ error: 'missing_query' });
    if (!qdrant.isConfigured()) {
      return res.status(503).json({ error: 'not_configured', message: 'The opinion database is not set up yet.' });
    }
    // 1. Retrieve the most relevant real comments (local FastEmbed → Qdrant).
    //    If the question names a known place, lock the search to just that entity
    //    so we don't mix opinions from other universities/cities.
    const detected = qdrant.detectEntity(String(query));
    const comments = await qdrant.searchComments(String(query).trim(), {
      entityId: detected ? detected.entityId : undefined,
      type: detected ? detected.type : ((type === 'university' || type === 'city') ? type : undefined),
      limit: 12,
    });
    // 2. Synthesise one human answer from those real comments (OpenAI, or fallback).
    const out = await synthesize.synthesize(String(query).trim(), comments, {});
    res.json({
      ok: true,
      query,
      answer: out.answer,
      sources: out.sources,
      model: out.model,
      grounded: out.grounded,
      usedComments: comments.length,
    });
  } catch (e) {
    errlog('ai/ask failed:', e.message);
    res.status(500).json({ error: 'ask_failed', message: e.message });
  }
});

// ── Daily university-news digest ──────────────────────────────
// The browser keeps each user's saved-university list in sync here (saved unis
// live in the browser's localStorage), so the daily job knows what to look up.
app.post('/api/digest/subscribe', (req, res) => {
  try {
    const { email, userId, universities } = req.body || {};
    const out = digest.subscribe({ email, userId, universities });
    res.json({ ok: true, ...out });
  } catch (e) { res.status(400).json({ error: 'subscribe_failed', message: e.message }); }
});

app.post('/api/digest/unsubscribe', (req, res) => {
  try {
    const out = digest.unsubscribe((req.body && req.body.email) || '');
    res.json({ ok: true, ...out });
  } catch (e) { res.status(400).json({ error: 'unsubscribe_failed', message: e.message }); }
});

// Send the digest right now (on-demand / for testing). Optional { email } sends
// to just that subscriber; otherwise every subscriber.
app.post('/api/digest/run-now', async (req, res) => {
  try {
    const email = (req.body && req.body.email) || undefined;
    const results = await digest.runDigest(mailer, synthesize, email);
    res.json({ ok: true, mailer: !!mailer, results });
  } catch (e) { res.status(500).json({ error: 'run_failed', message: e.message }); }
});

// External daily trigger so a free cron pinger (cron-job.org, GitHub Actions, …)
// can fire the digest even on hosts whose in-process timer sleeps. Protect with
// ?token=DIGEST_CRON_TOKEN (or an x-cron-token header).
app.all('/api/digest/cron', async (req, res) => {
  const want = process.env.DIGEST_CRON_TOKEN;
  const got = (req.query && req.query.token) || req.get('x-cron-token');
  if (!want || got !== want) return res.status(403).json({ error: 'forbidden' });
  try {
    digest.seedFromTargetsFile();
    const results = await digest.runDigest(mailer, synthesize);
    res.json({ ok: true, mailer: !!mailer, count: results.length, results: results.map(r => ({ to: r.email, sent: !!r.sent, headlines: r.headlines })) });
  } catch (e) { res.status(500).json({ error: 'cron_failed', message: e.message }); }
});

// Schedule the digest to run once a day at DIGEST_HOUR (local time, default 08:00).
function scheduleDailyDigest() {
  const HOUR = parseInt(process.env.DIGEST_HOUR || '8', 10);
  function msUntilNext() {
    const now = new Date();
    const t = new Date(now); t.setHours(HOUR, 0, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    return t - now;
  }
  function run() {
    try { digest.seedFromTargetsFile(); } catch (e) {}
    digest.runDigest(mailer, synthesize)
      .then(r => log('Daily digest run:', JSON.stringify(r.map(x => ({ to: x.email, sent: !!x.sent, headlines: x.headlines })))))
      .catch(e => errlog('Daily digest failed:', e.message));
    setTimeout(run, 24 * 60 * 60 * 1000);
  }
  setTimeout(run, msUntilNext());
  log('Daily digest scheduled for ' + HOUR + ':00 local (~' + Math.round(msUntilNext() / 3600000) + 'h away).' + (mailer ? '' : ' NOTE: no SMTP configured — emails will not send until SMTP_* is set in .env.'));
}

// Admin: status / indexed count
app.get('/api/admin/qdrant/status', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json({
      ok: true, configured: qdrant.isConfigured(), collection: qdrant.COLLECTION,
      corpusSize: qdrant.loadCorpus().length,
      indexed: qdrant.isConfigured() ? await qdrant.indexedCount() : 0
    });
  } catch (e) { res.status(500).json({ error: 'status_failed', message: e.message }); }
});

// Admin: (re)index the whole corpus
app.post('/api/admin/qdrant/reindex', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try { const r = await qdrant.reindexAllComments(); log('Qdrant reindexed:', r.indexed); res.json({ ok: true, indexed: r.indexed }); }
  catch (e) { errlog('reindex failed:', e.message); res.status(500).json({ error: 'reindex_failed', message: e.message }); }
});

// Admin: test semantic search
app.post('/api/admin/qdrant/test', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try { const results = await qdrant.searchComments(String((req.body && req.body.query) || 'student life'), { limit: 5 }); res.json({ ok: true, results }); }
  catch (e) { res.status(500).json({ error: 'test_failed', message: e.message }); }
});

// Admin: configure Qdrant URL/key (persisted in settings; never exposed to users)
app.post('/api/admin/qdrant/config', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { url, apiKey } = req.body || {};
  if (url) { setSetting('qdrant_url', url); process.env.QDRANT_URL = url; }
  if (apiKey) { setSetting('qdrant_api_key', apiKey); process.env.QDRANT_API_KEY = apiKey; }
  res.json({ ok: true, configured: qdrant.isConfigured() });
});

// ── Static site (serve the existing frontend) ─────────────────
app.use(express.static(path.join(__dirname, '..', 'design')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'design', 'index.html')));

// ── Boot ──────────────────────────────────────────────────────
app.listen(PORT, async () => {
  log(`UniScout payment server listening on ${APP_URL}`);
  // Qdrant config: .env wins; otherwise fall back to admin-saved settings.
  try {
    if (!process.env.QDRANT_URL) { const u = getSetting('qdrant_url'); if (u) process.env.QDRANT_URL = u; }
    if (!process.env.QDRANT_API_KEY) { const k = getSetting('qdrant_api_key'); if (k) process.env.QDRANT_API_KEY = k; }
    log('Qdrant configured:', qdrant.isConfigured());
  } catch (e) { /* settings optional */ }
  try {
    const priceId = await ensurePrice();
    log('Elite price ready:', priceId);
  } catch (e) {
    errlog('Could not ensure Elite price on boot (will retry on first checkout):', e.message);
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    log('Reminder: run `stripe listen --forward-to localhost:' + PORT + '/webhook` and put the printed whsec_ into .env');
  }
  scheduleDailyDigest();
});
