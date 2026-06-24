'use strict';

/**
 * SQLite data layer for the UniScout Elite subscription system.
 *
 * Tables (created/migrated automatically on require):
 *   users          – one row per app user, links them to a Stripe customer
 *   subscriptions  – the canonical, webhook-driven state of every subscription
 *   settings       – small key/value store (e.g. auto-created Price ID)
 *
 * The `subscriptions` table is the SINGLE SOURCE OF TRUTH for whether a user
 * is Elite. It is only ever written from verified Stripe webhook events (and
 * the checkout flow), never from the browser.
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'uniscout.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Migrations ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                 TEXT PRIMARY KEY,           -- app user id (from localStorage auth)
    email              TEXT UNIQUE,
    username           TEXT,
    stripe_customer_id TEXT,
    created_at         TEXT DEFAULT (datetime('now')),
    updated_at         TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id                   TEXT PRIMARY KEY,          -- Stripe subscription id (sub_...)
    user_id              TEXT,
    customer_id          TEXT,
    status               TEXT,                      -- active|trialing|past_due|canceled|unpaid|incomplete...
    price_id             TEXT,
    current_period_end   INTEGER,                   -- unix seconds
    cancel_at_period_end INTEGER DEFAULT 0,
    card_brand           TEXT,                      -- billing info
    card_last4           TEXT,
    billing_name         TEXT,
    billing_email        TEXT,
    updated_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_subs_user     ON subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_subs_customer ON subscriptions(customer_id);
  CREATE INDEX IF NOT EXISTS idx_users_customer ON users(stripe_customer_id);
`);

// Add columns that may be missing on databases created by older versions.
function ensureColumn(table, column, decl) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
  if (!cols.some(function (c) { return c.name === column; })) {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + decl);
  }
}
// manual_elite = Elite granted by an admin (not via Stripe). Persists in the DB.
ensureColumn('users', 'manual_elite', 'INTEGER DEFAULT 0');

// ── Users ─────────────────────────────────────────────────────
const _upsertUser = db.prepare(`
  INSERT INTO users (id, email, username)
  VALUES (@id, @email, @username)
  ON CONFLICT(id) DO UPDATE SET
    email = excluded.email,
    username = excluded.username,
    updated_at = datetime('now')
`);

function upsertUser({ id, email, username }) {
  _upsertUser.run({ id, email: email || null, username: username || null });
  return getUserById(id);
}

const _getUserById = db.prepare('SELECT * FROM users WHERE id = ?');
function getUserById(id) { return _getUserById.get(id); }

const _getUserByEmail = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)');
function getUserByEmail(email) { return email ? _getUserByEmail.get(email) : undefined; }

const _getUserByCustomer = db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?');
function getUserByCustomer(customerId) { return customerId ? _getUserByCustomer.get(customerId) : undefined; }

const _setCustomerId = db.prepare(`UPDATE users SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?`);
function setCustomerId(userId, customerId) { _setCustomerId.run(customerId, userId); }

const _setManualElite = db.prepare(`UPDATE users SET manual_elite = ?, updated_at = datetime('now') WHERE id = ?`);
function setManualElite(userId, on) { _setManualElite.run(on ? 1 : 0, userId); }

// ── Subscriptions ─────────────────────────────────────────────
const _upsertSub = db.prepare(`
  INSERT INTO subscriptions
    (id, user_id, customer_id, status, price_id, current_period_end,
     cancel_at_period_end, card_brand, card_last4, billing_name, billing_email, updated_at)
  VALUES
    (@id, @user_id, @customer_id, @status, @price_id, @current_period_end,
     @cancel_at_period_end, @card_brand, @card_last4, @billing_name, @billing_email, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    user_id              = COALESCE(excluded.user_id, subscriptions.user_id),
    customer_id          = COALESCE(excluded.customer_id, subscriptions.customer_id),
    status               = excluded.status,
    price_id             = excluded.price_id,
    current_period_end   = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    card_brand           = COALESCE(excluded.card_brand, subscriptions.card_brand),
    card_last4           = COALESCE(excluded.card_last4, subscriptions.card_last4),
    billing_name         = COALESCE(excluded.billing_name, subscriptions.billing_name),
    billing_email        = COALESCE(excluded.billing_email, subscriptions.billing_email),
    updated_at           = datetime('now')
`);

function upsertSubscription(sub) {
  _upsertSub.run({
    id: sub.id,
    user_id: sub.user_id || null,
    customer_id: sub.customer_id || null,
    status: sub.status || null,
    price_id: sub.price_id || null,
    current_period_end: sub.current_period_end || null,
    cancel_at_period_end: sub.cancel_at_period_end ? 1 : 0,
    card_brand: sub.card_brand || null,
    card_last4: sub.card_last4 || null,
    billing_name: sub.billing_name || null,
    billing_email: sub.billing_email || null,
  });
}

// Most recent subscription for a user (by period end / update time)
const _latestSubByUser = db.prepare(`
  SELECT * FROM subscriptions
  WHERE user_id = ?
  ORDER BY (current_period_end IS NULL), current_period_end DESC, updated_at DESC
  LIMIT 1
`);
function getLatestSubByUser(userId) { return userId ? _latestSubByUser.get(userId) : undefined; }

// An ACTIVE subscription for a user (used to block duplicate purchases)
const _activeSubByUser = db.prepare(`
  SELECT * FROM subscriptions
  WHERE user_id = ? AND status IN ('active','trialing','past_due')
  ORDER BY current_period_end DESC
  LIMIT 1
`);
function getActiveSubByUser(userId) { return userId ? _activeSubByUser.get(userId) : undefined; }

// ── Settings (key/value) ──────────────────────────────────────
const _setSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
function setSetting(key, value) { _setSetting.run(key, value); }

const _getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
function getSetting(key) { const r = _getSetting.get(key); return r ? r.value : null; }

module.exports = {
  db,
  upsertUser, getUserById, getUserByEmail, getUserByCustomer, setCustomerId, setManualElite,
  upsertSubscription, getLatestSubByUser, getActiveSubByUser,
  setSetting, getSetting,
};
