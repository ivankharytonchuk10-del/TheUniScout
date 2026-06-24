'use strict';
/* ────────────────────────────────────────────────────────────────────────────
   Standalone daily-digest runner — decoupled from the web server.

   Run it from ANY scheduler (a cloud cron, GitHub Actions, a VPS crontab, macOS
   launchd, or a Claude scheduled routine):

       node digest-cron.js

   It needs:
     • SMTP_USER + SMTP_PASS in the environment (.env or host secrets) to send.
     • Subscribers. It uses the SQLite subscribers the app synced AND, for hosts
       that don't share that DB, an optional committed `digest-targets.json`:
           [ { "email": "you@gmail.com",
               "universities": ["Harvard University", "University of Oxford"] } ]
   ──────────────────────────────────────────────────────────────────────────── */
require('dotenv').config();
const nodemailer = require('nodemailer');
const digest = require('./digest');
const synthesize = require('./synthesize');

let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

(async () => {
  const seeded = digest.seedFromTargetsFile();
  const results = await digest.runDigest(mailer, synthesize);
  console.log(JSON.stringify({
    ranAt: new Date().toISOString(),
    smtp: !!mailer,
    seededFromFile: seeded,
    sent: results.map(r => ({ to: r.email, sent: !!r.sent, headlines: r.headlines, reason: r.reason || r.skipped || null })),
  }, null, 2));
  if (!mailer) console.error('\n[!] No SMTP configured — set SMTP_USER + SMTP_PASS to actually send.');
  process.exit(0);
})().catch(e => { console.error('digest-cron failed:', e); process.exit(1); });
