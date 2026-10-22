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

## Local development is unchanged

Without `VITE_API_URL` the website calls the relative `/api` path and the Vite proxy forwards it to `localhost:4000`: `npm run dev` works as before.

## What these steps cannot guarantee

- They were written and tested locally (production build, compiled server started with `PORT`/`NODE_ENV=production`, CORS tests, wake-up unit tests). They were **not** run on the real Render / Cloudflare services.
- Free Render limits: 512 MB RAM, sleeps when idle; the first request after sleep is slow. The in-app jobs (request expiry) only run while the service is awake.
- Payments, couriers, real prescription checks are out of scope (prototype).
