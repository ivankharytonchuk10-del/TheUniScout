# UniScout — Elite Subscription (Stripe) Backend

Production-ready Stripe **subscription** system for the UniScout site.

- **Plan:** Elite
- **Price:** €15.00 / **year** (recurring)
- **Checkout:** Stripe Checkout (hosted, PCI-compliant — we never touch raw card data)
- **Webhooks:** signature-verified, the **single source of truth** for subscription state
- **DB:** SQLite (file-based, zero-config), auto-migrated on boot
- **Customer Portal:** Stripe-hosted (cancel / update card / view invoices)

The backend also **serves the existing static site** in `../design`, so one process runs the whole app.

---

## 1. Architecture & how it maps to the existing app

The original app had **no backend and no real database** — users and sessions lived in
browser `localStorage` (`uniscout_users`, `uniscout_session`). Secure payments are
impossible in that model (Stripe webhooks call a *server*, not a browser), so this adds
a minimal Node/Express + SQLite backend.

```
Browser (design/*.html, mainPage.js)
   │  POST /api/checkout {userId,email,username}
   ▼
Express server (server/server.js)
   │  Stripe Checkout Session ── redirect ──► Stripe hosted checkout page
   │                                                  │ pays €15
   │  ◄── webhook (signed) ── checkout.session.completed / customer.subscription.*
   ▼
SQLite (server/uniscout.db)  ← source of truth for "is this user Elite?"
   ▲
   │  GET /api/subscription/status?userId=…  → { elite:true/false, … }
Browser paints the glow / "Manage subscription"
```

> **Security note (important):** the app's login is still 100% client-side, so the
> server identifies a user only by the `userId` the browser sends — exactly as trusting
> as the existing app. The **payment** itself is fully secure (verified webhooks, no
> client-trusted payment state). To make *access* truly tamper-proof, add real
> server-side auth (sessions/JWT) and derive `userId` from the session instead of the
> request body. See “Hardening” at the bottom.

---

## 2. Files

### Created (`server/`)
| File | Purpose |
|------|---------|
| `package.json` | Dependencies & scripts |
| `.env.example` | Documented env vars (copy to `.env`) |
| `.gitignore` | Ignores `node_modules`, `.env`, `*.db` |
| `db.js` | SQLite connection, **migrations**, and all queries |
| `server.js` | Express app: Checkout, Portal, status, webhook, static hosting |
| `README.md` | This document |

### Modified (frontend)
| File | Change |
|------|--------|
| `design/mainPage.html` | Elite price → **€15/year**; removed the old fake card-entry modal (Checkout is hosted) |
| `design/mainPage.js` | Replaced the demo payment with Stripe Checkout/Portal/status calls + success/cancel banner |
| `design/mainPage.css` | (earlier) Elite glow + crown; `.pay__*` styles now unused but harmless |

### Database changes
SQLite file `server/uniscout.db`, created automatically. Tables:

- **users**: `id` (app user id), `email`, `username`, `stripe_customer_id`, timestamps
- **subscriptions**: `id` (Stripe sub id), `user_id`, `customer_id`, `status`,
  `price_id`, `current_period_end`, `cancel_at_period_end`, `card_brand`, `card_last4`,
  `billing_name`, `billing_email`, `updated_at`
- **settings**: `key`/`value` (stores the auto-created Price ID)

---

## 3. Environment variables

Copy `.env.example` → `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | ✅ | `sk_test_…` / `sk_live_…` (server-only secret) |
| `STRIPE_PUBLISHABLE_KEY` | ✅ | `pk_test_…` / `pk_live_…` (exposed to frontend via `/api/config`) |
| `STRIPE_WEBHOOK_SECRET` | ✅ | `whsec_…` from `stripe listen` or a Dashboard endpoint |
| `STRIPE_PRICE_ID` | optional | A `price_…`. If empty, the server auto-creates a €15/year price and remembers it |
| `APP_URL` | optional | Base URL for redirects (default `http://localhost:4242`) |
| `PORT` | optional | Listen port (default `4242`) |
| `DB_PATH` | optional | SQLite file path (default `./uniscout.db`) |

Keys are **never hardcoded** — everything reads from `process.env`.

---

## 4. Stripe Dashboard configuration

1. **Get your API keys**: Dashboard → *Developers → API keys*. Put the secret +
   publishable keys in `.env`. (Use **test mode** while developing.)
2. **Price**: nothing to do — the server auto-creates the *UniScout Elite* product and
   a €15/year recurring price on first boot. *(Optional:* create one yourself under
   *Product catalog* and set `STRIPE_PRICE_ID`.)*
3. **Customer Portal**: Dashboard → *Settings → Billing → Customer portal* → **Activate**.
   Enable “Cancel subscriptions” and “Update payment method”.
4. **Webhook** (production): *Developers → Webhooks → Add endpoint* →
   URL `https://YOUR_DOMAIN/webhook`, listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

   Copy the endpoint’s **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.

---

## 5. Local testing

**Prereqs:** Node ≥ 18, and the [Stripe CLI](https://stripe.com/docs/stripe-cli).

```bash
# 1. Install dependencies
cd server
npm install

# 2. Configure env
cp .env.example .env
#    → paste STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY (test mode)

# 3. Forward webhooks to the local server (prints a whsec_… — put it in .env)
stripe listen --forward-to localhost:4242/webhook

# 4. Start the server (in another terminal)
npm start
```

Now open **http://localhost:4242/mainPage.html** (serve through the server, not `file://`,
so the API calls resolve to the same origin).

- Log in / sign up as usual.
- Open the pricing modal (“Unlock Elite”) → **Get Elite — €15/yr** → redirected to Stripe.
- Pay with the **test card** `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
- You’ll return to `mainPage.html?checkout=success`; the webhook flips the DB and your
  avatar gets the **Elite glow**. The button becomes **Manage subscription** (Portal).
- Decline test card: `4000 0000 0000 0341` (attaches a card that fails on renewal).

Inspect data: `sqlite3 server/uniscout.db "select * from subscriptions;"`

---

## 6. Production deployment

1. Host the `server/` app on any Node host (Render, Railway, Fly.io, a VPS, etc.).
   Deploy the repo so `server/` can reach `../design`.
2. Set env vars in the host’s dashboard (use **live** keys): `STRIPE_SECRET_KEY`,
   `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL=https://yourdomain`.
3. Create the **live** webhook endpoint (step 4 above) at `https://yourdomain/webhook`
   and copy its signing secret to `STRIPE_WEBHOOK_SECRET`.
4. Activate the live **Customer Portal**.
5. Run behind HTTPS (required by Stripe). Persist the SQLite file on a durable volume,
   or point `DB_PATH` at managed storage / swap to Postgres for scale.
6. `npm start` (or a process manager like `pm2` / your platform’s runner).

---

## 7. API reference

| Method & path | Body / query | Returns |
|---|---|---|
| `GET /api/config` | — | `{ publishableKey }` |
| `POST /api/checkout` | `{ userId, email, username }` | `{ url }` (redirect to Stripe) · `409 already_subscribed` |
| `POST /api/portal` | `{ userId }` | `{ url }` (Stripe portal) · `404 no_customer` |
| `GET /api/subscription/status` | `?userId=` | `{ elite, status, currentPeriodEnd, cancelAtPeriodEnd, cardBrand, cardLast4, billingName }` |
| `GET /api/elite/content` | `?userId=` | `200 {secret}` if Elite, else `403 elite_required` (example protected route) |
| `POST /webhook` | Stripe event (raw) | `200 {received:true}` after signature verification |

---

## 8. Subscription lifecycle handling

The webhook keeps the DB in sync with Stripe:

| Event | Effect |
|---|---|
| `checkout.session.completed` | Link customer ↔ user, sync new subscription |
| `customer.subscription.created/updated` | Sync status, period end, cancel flag, card |
| `customer.subscription.deleted` | Mark `status = canceled` |
| `invoice.payment_succeeded` | Re-sync (renewal) |
| `invoice.payment_failed` | Logged; status becomes `past_due`/`unpaid` via the update event |

`elite = status ∈ {active, trialing}`. Canceled/expired/failed → not Elite. Duplicate
purchases are blocked in `/api/checkout` (`409` → routed to the Portal).

---

## 9. Hardening (recommended next steps)

- **Real server auth:** issue an httpOnly session cookie or JWT at login; derive
  `userId` from it instead of the request body, then protect routes with it.
- **Move users server-side:** migrate signup/login to the backend so `email`/`username`
  can’t be spoofed.
- **Rate-limit** `/api/checkout` & `/api/portal`.
- **Swap SQLite → Postgres** if you expect real scale.
