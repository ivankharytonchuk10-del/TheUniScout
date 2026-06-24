# Daily university-news email — always-on (free) deploy

This runs your daily digest in the cloud, independent of your Mac. Two parts:
**(1)** deploy the backend to a free host, **(2)** ping it once a day with a free cron.

Everything is already coded — you just deploy and paste a few secrets.

---

## What you'll set (secrets)

| Env var | What it is |
|---|---|
| `SMTP_USER` | your Gmail address, e.g. `ivan.kharytonchuk10@gmail.com` |
| `SMTP_PASS` | a Gmail **App Password** (Google Account → Security → 2-Step Verification → App passwords) |
| `SMTP_FROM` | e.g. `UniScout <ivan.kharytonchuk10@gmail.com>` |
| `DIGEST_CRON_TOKEN` | any long random string — protects the trigger URL |
| `OPENAI_API_KEY` | (optional) your Groq/OpenAI key for the friendly intro line |

Who/what it emails = [`server/digest-targets.json`](digest-targets.json). Edit that file to your
saved universities (name them the human way — "Harvard", "TU Delft", etc.).

---

## Option A — Render (free) + cron-job.org  ← recommended

1. Push this project to a Git repo (GitHub/GitLab) and connect it on https://render.com.
   Render will detect [`render.yaml`](../render.yaml) and create the web service.
2. In the Render dashboard → your service → **Environment**, fill in `SMTP_USER`,
   `SMTP_PASS`, `SMTP_FROM`, `OPENAI_API_KEY`. `DIGEST_CRON_TOKEN` is auto-generated —
   copy its value.
3. Your service gets a URL like `https://uniscout.onrender.com`. Test the digest now:
   ```
   curl "https://uniscout.onrender.com/api/digest/cron?token=YOUR_DIGEST_CRON_TOKEN"
   ```
   You should get an email within a minute.
4. Free daily trigger: create a free job at https://cron-job.org →
   URL `https://uniscout.onrender.com/api/digest/cron?token=YOUR_DIGEST_CRON_TOKEN`,
   schedule **08:00 daily**. (This also wakes the free service, which sleeps when idle.)

Done — you get a daily email regardless of whether your Mac is on.

> Free Render web services sleep after ~15 min idle, which is why we trigger via an
> external cron ping instead of an in-process timer. The ping wakes it and sends.

---

## Option B — Fly.io (stays awake, in-process timer)

1. `flyctl launch` from the repo root (uses [`server/Dockerfile`](Dockerfile)). Keep 1 machine
   always running (Fly's small machines have a free allowance).
2. `flyctl secrets set SMTP_USER=… SMTP_PASS=… SMTP_FROM=… OPENAI_API_KEY=… DIGEST_HOUR=8`
3. The built-in scheduler in `server.js` fires daily at `DIGEST_HOUR` (UTC on the host).
   No external cron needed. You can still hit `/api/digest/cron?token=…` to test.

---

## Option C — GitHub Actions (no server, pure cron)

If you'd rather not host a server, run just the mailer daily in GitHub's cloud.
Add repo **Secrets** (`SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `OPENAI_API_KEY`) and this workflow:

```yaml
# .github/workflows/daily-digest.yml
name: Daily university digest
on:
  schedule: [{ cron: "0 8 * * *" }]   # 08:00 UTC daily
  workflow_dispatch: {}
jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: cd server && npm install --omit=dev
      - run: cd server && node digest-cron.js
        env:
          SMTP_HOST: smtp.gmail.com
          SMTP_PORT: "587"
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASS: ${{ secrets.SMTP_PASS }}
          SMTP_FROM: ${{ secrets.SMTP_FROM }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Targets come from the committed `digest-targets.json`.

---

## Test locally any time

```
cd server
DIGEST_CRON_TOKEN=test node server.js   # then, in another terminal:
curl "http://localhost:4242/api/digest/cron?token=test"
# or, fully standalone:
node digest-cron.js
```
