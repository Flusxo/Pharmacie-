# Deploying counter. for free (beginner guide, Windows)

Three free services work together:

| Part               | Service               | Free plan                                                                           |
| ------------------ | --------------------- | ----------------------------------------------------------------------------------- |
| Database           | Neon (already in use) | yes                                                                                 |
| Backend (API)      | Render, "Web Service" | yes, **falls asleep after ~15 min without visits** and takes up to a minute to wake |
| Frontend (website) | Cloudflare Pages      | yes                                                                                 |

> Prototype only. Not for real medical use. Demo data. Never put real patient data on this deployment.

Never type a real secret into this file, into the code or into GitHub. Secrets go only into the forms of Render / Cloudflare / your local `.env`.

## 1. GitHub

The project lives in the repository `https://github.com/Flusxo/Pharmacie-` (branch **main**; Render and Cloudflare both use `main`).
Your local `.env` is ignored by git (see `.gitignore`) and is never uploaded.

```bash
git remote add origin https://github.com/Flusxo/Pharmacie-.git
git push -u origin main
```

## 2. Database (Neon)

You already have it. Migrations are applied and the demo data is loaded (`npm run db:reset` on your PC, which uses the `DATABASE_URL` of your local `.env`).
You only need the connection string again for step 3 (Neon console → your project → **Connect** → copy the string that ends with `?sslmode=require`).

## 3. Backend on Render

Render dashboard → **New +** → **Web Service** → connect GitHub → choose `Flusxo/Pharmacie-`. Then fill the form:

| Field                        | Value                                                                   |
| ---------------------------- | ----------------------------------------------------------------------- |
| Name                         | `counter-api` (any name; it becomes `https://counter-api.onrender.com`) |
| Language                     | `Node`                                                                  |
| Branch                       | `main`                                                                  |
| Region                       | `Frankfurt (EU Central)`                                                |
| Root Directory               | _(leave empty — the project is one workspace at the repository root)_   |
| Build Command                | `npm ci --include=dev && npm run build -w backend`                      |
| Start Command                | `npm run start -w backend`                                              |
| Instance Type                | `Free`                                                                  |
| Health Check Path (Advanced) | `/api/health`                                                           |

The server listens on the `PORT` that Render provides (do **not** create a `PORT` variable).

### Environment variables on Render (Environment section)

| Name                    | Value                           | Where the value comes from                                                                                                                                           | Secret? |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `NODE_VERSION`          | `22`                            | type it (Render's Node version setting)                                                                                                                              | no      |
| `NODE_ENV`              | `production`                    | type it                                                                                                                                                              | no      |
| `DATABASE_URL`          | `<your Neon connection string>` | Neon console → Connect → connection string, must end with `?sslmode=require` (same value as in your local `.env`)                                                    | **yes** |
| `JWT_SECRET`            | `<long random text>`            | click Render's **Generate** button (or run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and paste the result)                          | **yes** |
| `JWT_EXPIRES_IN`        | `8h`                            | type it (optional)                                                                                                                                                   | no      |
| `STRIPE_SECRET_KEY`     | `sk_test_...`                   | Stripe dashboard (Test mode) → Developers → API keys → Secret key. Optional: without it the site says "Payments not configured". A `sk_live_` key is refused.        | **yes** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...`                     | Stripe dashboard (Test mode) → Developers → Webhooks → your endpoint → Signing secret (see below).                                                                   | **yes** |
| `FRONTEND_URL`          | `https://<your-site>.pages.dev` | the address Cloudflare gives you in step 4, **no trailing slash**. Several addresses are allowed, separated by commas. Only these addresses may call the API (CORS). | no      |

Because the free backend does not know the final site address until step 4, deploy once, then come back and set `FRONTEND_URL`, then **Save** (Render restarts the service).

Stripe webhook (only if you use payments): Stripe dashboard in **Test mode** → Developers → Webhooks → **Add endpoint** → URL `https://<your-service>.onrender.com/api/webhooks/stripe` → events `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded` → copy its **Signing secret** into `STRIPE_WEBHOOK_SECRET` on Render.

Check it: open `https://<your-service>.onrender.com/api/health`. It must show `"status":"ok"`. (The first visit after a pause takes up to a minute.) `/api/docs` is intentionally not available in production.

## 4. Frontend on Cloudflare Pages

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → `Flusxo/Pharmacie-`.

| Field                     | Value                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| Production branch         | `main`                                                                    |
| Framework preset          | `None` (React (Vite) also works if you set the two fields below yourself) |
| Root directory (advanced) | _(leave empty)_                                                           |
| Build command             | `npm ci && npm run build -w frontend`                                     |
| Build output directory    | `frontend/dist`                                                           |

### Environment variables on Cloudflare (Settings → Variables and Secrets, "Production")

| Name                | Value                                                                                  | Where the value comes from                                                                                            | Secret?                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NODE_VERSION`      | `22`                                                                                   | type it                                                                                                               | no                                                                                                                   |
| `VITE_API_URL`      | `https://<your-service>.onrender.com`                                                  | the address of your Render service (step 3), **no trailing slash, no `/api`**                                         | no (public, it is in the website code)                                                                               |
| `VITE_MAP_TILE_URL` | `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=<your-maptiler-key>` | your local `.env` (same line) — optional; without it the map shows "Map tiles are not configured" but pins still work | the key is **visible in the browser** whatever you do: restrict it to your site address in the MapTiler account page |

Everything starting with `VITE_` is baked into the website at build time: change it, then **Retry deployment**.
Page refresh on any address (e.g. `/search`) works thanks to `frontend/public/_redirects`.

After the first deployment, copy your site address (`https://<project>.pages.dev`) into `FRONTEND_URL` on Render (step 3).

## 5. Check that it works

1. Open your `.pages.dev` address. If the backend was asleep, a banner says **"Waking up the server…"** (up to a minute), then the site works.
2. Log in with a demo account (see the README demo script).
3. If login shows "The server cannot be reached": `VITE_API_URL` is wrong, or `FRONTEND_URL` on Render is not exactly your site address (CORS).

## Payments with Stripe, step by step (optional, TEST MODE only)

Without keys everything works and the order page says **"Payments not configured"**. To try payments:

1. **Create the account.** Go to https://dashboard.stripe.com/register, sign up with your e-mail and confirm it. You do **not** need to activate your account or give bank details to use test mode.
2. **Stay in Test mode.** At the top of the Stripe dashboard make sure the **Test mode** switch is on (orange "Test mode" label).
3. **Copy the test secret key.** Developers → **API keys** → "Secret key" → **Reveal test key**. It starts with `sk_test_`. (A key starting with `sk_live_` is refused by the app, on purpose.)
4. **Put it in your local `.env`** (the file at the project root, never committed): add the line `STRIPE_SECRET_KEY=sk_test_...` (paste your real key after the `=`).
5. **Local webhook secret.** Install the Stripe CLI (https://docs.stripe.com/stripe-cli), run `stripe login`, then in a second terminal `stripe listen --forward-to localhost:4000/api/webhooks/stripe`. It prints `whsec_...`: add it to `.env` as `STRIPE_WEBHOOK_SECRET=whsec_...`, then restart `npm run dev`.
6. **On Render** (hosted site, https://pharmacie-mb83.onrender.com): Dashboard → your service → **Environment** → **Add Environment Variable**: `STRIPE_SECRET_KEY` = your `sk_test_...` key (secret). Then in Stripe (Test mode) → Developers → **Webhooks** → **Add endpoint**:
   - Endpoint URL: `https://pharmacie-mb83.onrender.com/api/webhooks/stripe`
   - Events to select (exactly these five): `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`.
   - Open the endpoint, **Reveal** its **Signing secret** (`whsec_...`) and add it on Render as `STRIPE_WEBHOOK_SECRET` (secret). Save: Render restarts (the first request after that can take a minute).
   - **Cloudflare Pages needs nothing for payments.** The patient is sent to Stripe's own hosted payment page by the server, so there is **no publishable key (`pk_test_...`) and no `VITE_` variable to add**. Keeping the card form on Stripe's page is what guarantees that card numbers never touch our site.
   - Make sure `FRONTEND_URL` on Render is your Cloudflare Pages address (`https://pharmacie-58e.pages.dev`): Stripe sends the patient back there after paying.
7. **Test the webhook locally with the Stripe CLI** (optional, for development): `stripe login`, then `stripe listen --forward-to localhost:4000/api/webhooks/stripe` (keep it running), put the `whsec_...` it prints in `.env` as `STRIPE_WEBHOOK_SECRET`, restart `npm run dev`, pay once through the app: the terminal shows each event and our answer (`200`). To replay an event: `stripe events resend <evt_id>` (it is ignored the second time: webhooks are idempotent).
8. **Try it.** Log in as a patient, send a request, accept it as the pharmacy, open the order as the patient and press **Pay (test)**. On Stripe's page use card `4242 4242 4242 4242` (any future date, any CVC) to succeed, or `4000 0000 0000 0002` to see a declined card. The amount is held; mark the order **Ready** as the pharmacy to capture it; cancel the order to see it released or refunded.

## Optional services (each one is off until you add its keys)

Nothing below is needed to run the site. Without a key, the matching feature shows "not configured" (staff: **Statistiques**, "Optional services") and everything else keeps working. Never put a key in the code or in git: keys go only in the Render "Environment" page (backend) as secrets.

### Email (Resend, free plan)

Without it, nobody is emailed: every message stays an in-app notification (verification, status changes, password reset, stock alerts).

1. Create an account at https://resend.com (free).
2. "Domains" > "Add domain": enter a domain you own and add the DNS records Resend shows. Wait until it says "Verified". (Without your own domain, Resend only lets you send to your own email: fine for a test.)
3. "API Keys" > "Create API key" (sending access). Copy it once (it starts with `re_`).
4. On Render > your service > Environment, add: `RESEND_API_KEY` = the key, and `MAIL_FROM` = for example `counter. <no-reply@your-domain.com>`. Render redeploys.
5. Check: the staff panel shows "Email: Configured". Make a patient request and look at the inbox (or the Resend "Emails" page). Subjects never contain a medicine name; each email follows the account's language.

### Error alerts (optional, free)

1. In Discord (Server settings > Integrations > Webhooks > New webhook) or Slack (an "Incoming Webhook" app), create a webhook and copy its URL.
2. On Render, add `ERROR_WEBHOOK_URL` = that URL. The backend posts one short line for an unexpected server error (path and request id only, never a body, email or medicine), at most once a minute.

### Uptime alert (optional, free)

1. Create a free account at https://uptimerobot.com.
2. "Add New Monitor": type HTTP(s), URL `https://pharmacie-mb83.onrender.com/api/health`, interval 5 minutes, add your email as the alert contact. As a bonus this request keeps the free Render service awake during the day (it still sleeps if you stop it; a paid plan removes sleep).

### Private files: prescriptions and verification documents (built, stored in Neon)

You chose Neon (the database itself) for private files, so there is **no new account and no key**. What it does:

- A patient can attach up to 3 photos or PDFs to a request; a doctor or pharmacy applicant can send up to 5 documents for verification. JPEG, PNG, WebP or PDF only, 2 MB each. The server checks the real content of the file (not the name or the declared type).
- Access: a prescription opens only for the patient and for the pharmacy that patient chose (team members act as their pharmacy). Doctors, other pharmacies and staff cannot open it. A verification document opens only for the applicant and staff, and every opening by staff is written to the audit log. Downloads are never cached and never run as a page.
- Deletion is automatic: a prescription is removed 48 hours after its request or order ends, and 30 days after upload at the latest; a verification document after 30 days; everything goes with an account deletion. A job runs every 10 minutes.
- Limits to know: the free Neon database holds 0.5 GB, so about 250 files of 2 MB at the most at one time; the backup script saves only the file list (names, sizes, dates), never the contents, so prescriptions are not copied into `backups/`; Neon's own restore does include them; this is not a certified health-data host (HDS): use fake documents only.
- If you outgrow this, the code that reads and writes files is one file (`backend/src/services/files.ts`); moving to Cloudflare R2, Supabase or Backblaze means replacing its insert and read functions.

### Push notifications (NOT built yet)

Web push needs a service worker, a subscription per device and VAPID keys. The site deliberately has no service worker today (so a new build can never be served stale). It is shown as "Not built yet" in the staff panel. If you want it, ask: the keys are free (generated locally with `npx web-push generate-vapid-keys`).

## Staging (a safe copy to try changes)

1. Neon: create a second project (or a branch of the project) named `counter-staging`; copy its connection string.
2. Render: "New +" > Web Service from the same repo, name it `pharmacie-staging`, same build and start commands, and environment variables with the **staging** `DATABASE_URL`, its own `JWT_SECRET`, and `FRONTEND_URL` = the staging site address. Run `npm run db:reset` once from your PC with the staging `DATABASE_URL` in a separate `.env` copy (never the production one).
3. Cloudflare Pages: a second project (or use a branch preview) with `VITE_API_URL` = the staging backend address.
4. Try changes there first; merge to `main` only when it works.

## Database backup and recovery

- **Backup before every migration:** `npx tsx db/scripts/backup.ts` writes a read-only JSON export of every table to `backups/<date>/` (git-ignored, never committed). It also lists pending migrations. After a migration, `npx tsx db/scripts/verify-after-migrate.ts` compares row counts with the last backup: only `schema_migrations` should differ.
- **Neon's own history:** the free plan keeps a short restore window (check "Backup & Restore" in the Neon console); use "Restore" to rewind the project to a time before a mistake. Migrations here only add tables and columns, so a rewind is rarely needed.
- **Recovery from the JSON export:** every file in `backups/<date>/` is one table as a JSON array. To restore one table, create it with the migrations (`npm run db:migrate` on an empty database), then insert the rows (a small script reading the JSON and running INSERT ... ON CONFLICT DO NOTHING). Rehearse this once on the staging database, not on production.
- **Never** run `npm run db:reset` against the production `DATABASE_URL`: it drops everything.

## Local development is unchanged

Without `VITE_API_URL` the website calls the relative `/api` path and the Vite proxy forwards it to `localhost:4000`: `npm run dev` works as before.

## What these steps cannot guarantee

- They were written and tested locally (production build, compiled server started with `PORT`/`NODE_ENV=production`, CORS tests, wake-up unit tests). They were **not** run on the real Render / Cloudflare services.
- Free Render limits: 512 MB RAM, sleeps when idle; the first request after sleep is slow. The in-app jobs (request expiry) only run while the service is awake.
- Payments, couriers, real prescription checks are out of scope (prototype).
