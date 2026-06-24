# UniScout News Agent

A backend AI agent that:

1. **Scrapes** the official websites of your **saved (favourite) universities** (HTTP + Cheerio — no browser UI).
2. **Falls back** to reputable web sources (via Claude's `web_search`) only when a university's official site has nothing — and **labels the source**.
3. Has **Claude** (reasoning/summarising/writing only) turn the *actually-extracted* evidence into a **structured JSON report** — `subject`, `summary`, `findings`, `warnings`, `next_steps`. It does **not** invent data.
4. **Emails** the report to your inbox via **SendGrid**.

No chat UI. Run it, get an email.

```
agent/
├── config/watchlist.json   ← your saved universities (the agent only looks at these)
├── src/
│   ├── index.js            ← orchestrator
│   ├── scrape.js           ← website step (HTTP scraping)
│   ├── analyze.js          ← Claude: report writing + web fallback
│   ├── email.js            ← SendGrid delivery + HTML/text
│   └── logger.js
├── output/                 ← saved JSON reports
├── .env.example
└── package.json
```

## 1. Install

```bash
cd agent
npm install            # installs @sendgrid/mail, @anthropic-ai/sdk, cheerio, dotenv
```

## 2. Environment

```bash
cp .env.example .env
```

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude key (`sk-ant-…`) from console.anthropic.com. Used only to write the report / web-fallback. |
| `ANTHROPIC_MODEL` | optional | default `claude-sonnet-4-6` |
| `SENDGRID_API_KEY` | ✅ (to send) | **Must start with `SG.`** — create at SendGrid → Settings → API Keys. |
| `EMAIL_FROM` | ✅ (to send) | `youruniversityscout@gmail.com` — **must be a verified sender** (below). |
| `EMAIL_TO` | ✅ (to send) | `ivan.kharytonchuk10@gmail.com` |
| `USE_WEB_FALLBACK` | optional | `true`/`false` — reputable-source fallback for unis with no official news |
| `DRY_RUN` | optional | `true` = build & print the report but **don't** send |

> ⚠️ The 32-char hex keys you had earlier are **not** SendGrid keys (SendGrid keys start with `SG.`). Create a real one. Never commit `.env`.

## 3. SendGrid sender verification (one-time, required)
SendGrid will reject mail from an unverified address. In SendGrid:
**Settings → Sender Authentication → Single Sender Verification → Create New Sender**, using
`youruniversityscout@gmail.com`, then click the confirmation link sent to that inbox.
(For production, verify a whole domain instead.)

## 4. Choose which universities (your favourites)
The agent only looks at universities in `config/watchlist.json`. Replace the sample list
with **your saved favourites**. To export them from the app, open UniScout while logged in,
open the browser console and run:

```js
// shows your saved university IDs
const s = JSON.parse(localStorage.getItem('uniscout_session'));
console.log(JSON.parse(localStorage.getItem('us_saved_' + s.id) || '[]'));
```

Then put each one in `watchlist.json` as `{ "name": "...", "website": "https://..." }`
(the official site is in the app's data, or just paste it). `news` is optional — the agent
probes common `/news` paths automatically.

## 5. Run

```bash
npm run dry      # build + print the JSON report, DON'T email (great for testing)
npm start        # build + email it via SendGrid
```

You'll get the structured JSON on stdout, a copy in `output/`, and (unless dry) an email
to `EMAIL_TO`.

## How "no invented data" is enforced
- The **website step is pure scraping** — Claude never fetches the primary site.
- Claude is given only the **extracted items** and is instructed to use *only* those, cite each
  source URL, mark it `official` vs `web`, and list universities with no news under `warnings`.
- The **fallback** uses Claude's `web_search` (real, cited results) and is labelled `web`.

## Troubleshooting
- `Missing env vars …` → fill `.env`.
- SendGrid `403 / does not match a verified Sender Identity` → verify `EMAIL_FROM` (step 3).
- `invalid x-api-key` from Claude → bad/empty `ANTHROPIC_API_KEY`.
- A university shows under warnings → its official site had no parseable news and the web
  fallback found nothing recent (or `USE_WEB_FALLBACK=false`).
- Run `npm run dry` first to confirm the report looks right before sending.
