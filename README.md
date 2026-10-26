# counter. (PharmaLink) — find your medicine in a nearby pharmacy

> **Prototype only. Not for real medical use. Demo data.**

counter. connects patients, doctors, pharmacies and staff in France. A patient searches a medicine, sees which nearby pharmacies have it in stock (list and map), **chooses** a pharmacy, sends a request and follows the order. Doctors can prepare a request for a confirmed patient; pharmacies manage their stock and orders; staff verify professionals and moderate. It feels like a delivery app, but it is **not an online medicine shop**: only pharmacies sell.

## The rules the code enforces (and tests check)

1. Only pharmacies sell. There is no "Buy now" or "Add to cart" anywhere: the action is "Request from a pharmacy".
2. Free choice: the app proposes pharmacies that have every item in stock; the **patient chooses**. A doctor's request never reaches a pharmacy until the patient picks one.
3. Prescription medicines need the patient's prescription statement or a confirmed doctor link, and the pharmacy must tick "prescription checked" before preparing.
4. A pharmacy is proposed only if it is verified, active, not paused and has every item in stock. Two pharmacies can never both accept the same request.
5. Privacy: a doctor sees only confirmed patients and never their address; a pharmacy sees only requests it was chosen for, with the patient shown as "First L."; a patient sees only their own data; staff can view but never impersonate.
6. Not built (shown as "Coming soon" / "Simulated"): real couriers, real money (payments are Stripe TEST MODE only), HDS-certified hosting, real prescription verification, legal review. Delivery tracking is labelled "Simulated tracking".
7. The notice "Prototype only. Not for real medical use. Demo data." is on every page.
8. No secret in the code or in git: the database URL, JWT secret and map key live only in the ignored root `.env`.

## Setup

Requirements: **Node.js 20 or newer** (`node -v`) and npm. Nothing else to install for the local database route.

```bash
cp .env.example .env
npm install
```

Then choose **one** database route in `.env` (never commit `.env`):

**A. Hosted Neon (what this project uses).** Paste your Neon connection string into `DATABASE_URL`. It must end with `?sslmode=require`: the app then connects over TLS and checks the certificate.

**B. Local, offline.** Comment out the Neon line and uncomment `DATABASE_URL=postgres://pharmalink:pharmalink@localhost:5433/pharmalink`. A PostgreSQL 16 bundled through npm (`embedded-postgres`) starts automatically on port 5433 (data in `db/.pgdata`). Docker (`docker-compose.yml`) or your own PostgreSQL 16 also work with a localhost URL.

Set a long random `JWT_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Optional: `VITE_MAP_TILE_URL` (see "Map tiles").

```bash
npm run db:reset
npm run dev
```

Open http://localhost:5173. `npm run db:reset` drops, migrates and seeds `DATABASE_URL` (it waits up to 30 s for the database). `npm run db:migrate` only applies new migrations and keeps the data. `npm run dev` starts the API on :4000 and the web app on :5173; if a port is busy it names the program holding it instead of moving to another port.

### Other commands

```bash
npm test
npm run build
npm run lint
npm run format
npm run e2e
```

- `npm test`: backend (Vitest + Supertest) and frontend (Vitest + Testing Library) tests. They use `TEST_DATABASE_URL`, by default the bundled PostgreSQL on localhost:5433, **never** `DATABASE_URL`, and refuse to wipe a non-local database.
- `npm run build`: typecheck everything and build the frontend for production.
- `npm run e2e`: Playwright tests in a real browser (run `npx playwright install chromium` once first). They start their own database and servers (:4100, :5174, :5175) and stop them afterwards.
- `node scripts/design-sweep.mjs <outDir> 360,768,1440 light fr` takes screenshots of the main pages from a running `npm run dev`; `node scripts/overflow-probe.mjs home 360` lists elements wider than the screen.

## Map tiles (MapTiler)

The map uses Leaflet. Tiles come **only** from `VITE_MAP_TILE_URL`; there is no default tile server. Without it the map shows "Map tiles are not configured…" with a Retry button, and pins, popups and the list still work.

1. Create a free account at https://cloud.maptiler.com and open **Account → API keys** (https://cloud.maptiler.com/account/keys/). Copy a key.
2. In the root `.env`, set either the full raster URL (recommended):
   `VITE_MAP_TILE_URL=https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=YOUR_KEY`
   or just the key itself (`VITE_MAP_TILE_URL=YOUR_KEY`); the app then builds the same MapTiler URL. Do not use `{s}` subdomains and do not paste a `style.json` link; the app tells you if you do.
3. **Restart `npm run dev`**: Vite reads `.env` only when it starts.
4. Attribution "© MapTiler © OpenStreetMap contributors" is always shown on the map.

Browser map keys are **public** (anyone can read them in the page). Before putting the app online, restrict the key's "Allowed HTTP origins" to your real domain in the MapTiler dashboard. Never commit the key.

## Demo accounts

All demo accounts use the password `Password123!` (fake demo data; in development the login page has a demo panel that fills the form).

| Role       | Accounts                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Patients   | `alice@`, `bruno@`, `camille@`, `david@`, `emma@pharmacie.test` (Alice and Bruno linked to Dr Martin; Camille's link not confirmed; David not linked)                                |
| Doctors    | `dr.martin@pharmacie.test` (verified), `dr.bernard@` and `dr.petit@pharmacie.test` (pending)                                                                                         |
| Pharmacies | `pharmacie.tournon@` (Pharmacie du Rhône), `.valence@`, `.romans@`, `.etoile@`, `.lyon1@`, `.lyon3@`, `.vienne@pharmacie.test` (verified), `pharmacie.demo@pharmacie.test` (pending) |
| Staff      | `admin@`, `support@`, `moderator@pharmacie.test` (use the "Connexion équipe" link)                                                                                                   |

Doctor, pharmacy and staff accounts can turn on **two-step verification** in "Mon compte" (scan the QR code with Google Authenticator, Microsoft Authenticator, Aegis…). The login page then asks for the 6-digit code.

## API

The API is an Express app under `/api`. The full list (80 routes, with who may call them) is served as OpenAPI at http://localhost:4000/api/docs in development (never in production). Groups:

- `/api/auth/*`: register (patient active; doctor and pharmacy pending), login, me, password reset and change, two-step verification.
- `/api/medicines/*`, `/api/pharmacies/nearby`: search (accents and typos tolerated), suggestions, details, generics, nearby pharmacies with stock.
- `/api/patient/*`: requests (choose a pharmacy, prescription statement), orders, cancel, doctor links, export my data, delete my account.
- `/api/doctor/*`: patient links, requests for confirmed patients, templates.
- `/api/pharmacy/*`: incoming requests (accept, refuse, propose a generic), orders and status moves, printable slip, inventory and CSV upload, daily summary, pause.
- `/api/admin/*`: verification queue, users, suspensions, staff accounts, medicines, orders, reports, audit log, performance.
- `/api/share/:token`: public shared tracking (status only, expires 2 h after delivery). `/api/health`: API and database status.

## 5-minute demo script

1. `npm run db:reset`, then `npm run dev`, open http://localhost:5173.
2. On the login page, click **Alice — Tournon** in the demo panel, then **Se connecter**. The short guided tour appears once; click through it.
3. Search **"dolliprane"** (typo on purpose) and open **Doliprane 1000 mg**: turn the 3D pack, switch to **Photo**, look at the nearby pharmacies on the map.
4. Click **Demander à une pharmacie**, choose **Pharmacie du Rhône**, send. Note there is no "Buy" button anywhere.
5. Search a prescription medicine (e.g. **Amoxicilline**): the request cannot be sent until the prescription statement is ticked.
6. In a private window, log in as **Pharmacie du Rhône — Tournon** (Pharmacie tab): the request shows "Alice M." with a 30-minute countdown. **Accept** it.
7. Move the order to **En préparation**, **Prête**, **En livraison**, **Livrée**. Alice's tracking page updates by itself, the simulated courier moves on the map, and confetti plays on delivery. Print the slip with **Imprimer le bon**.
8. Log in as **Dr Martin**: Alice and Bruno can be selected, Camille shows "En attente de confirmation"; send a request for Alice (Alice then chooses the pharmacy).
9. Log in as **admin** (Connexion équipe): approve **Pharmacie Démo** in the verification queue; the audit log shows it. Log in as **support**: there is no approve button.
10. In "Mon compte", switch to English, dark theme, "Reduce animations" and Graphics quality "Off": the app keeps working with static visuals.

## Troubleshooting

- **"Port 4000 (or 5173) is already in use"**: `npm run dev` names the program holding the port and the command to stop it (on Windows `taskkill /PID <pid> /F`). Usually an older `npm run dev` is still running.
- **`vite` (or `tsx`) "not found" after install**: the install did not finish or `node_modules` is from another machine. Run `npm ci` from the project root (do not delete `package-lock.json`).
- **The map says "API key required", "Invalid key" or "MapTiler refuse la clé (403)"**: the key is missing, wrong or restricted. Copy it again from https://cloud.maptiler.com/account/keys/, add `http://localhost:5173` to its Allowed HTTP origins if you restricted it, and restart `npm run dev`.
- **"Internal server error" or "Service unavailable" when logging in**: the API cannot reach the database. Check http://localhost:5173/api/health. With Neon, check `DATABASE_URL` and that it ends with `?sslmode=require` (a sleeping Neon project wakes up within a few seconds; retry). With the local route, run `npm run db:reset` once.
- **Node version mismatch** (syntax errors at startup, `engines` warning): use Node 20 or newer (`node -v`); then `npm ci`.
- **No pins on the map**: check `/api/health`, that "Position utilisée" is near the demo pharmacies (Tournon, Valence, Romans, Étoile, Lyon, Vienne) and the radius (the map offers "Élargir à 30 km").
- **The seeded incoming request disappeared**: it expires 30 minutes after `npm run db:reset` (the 30-minute pharmacy window). Run `npm run db:reset` again before a demo.

## What is simulated or not built

- **Simulated**: delivery tracking (courier position, labelled "Simulated tracking"), emails (written to `logs/mail.log` in development).
- **Not built**: real couriers, real-money payments (Stripe test mode only), HDS-certified hosting, real prescription verification, legal review of the terms and privacy texts ("Coming soon").
- Progress, known issues and every design decision: `docs/PROGRESS.md`, `docs/DECISIONS.md`. 3D asset sources and licences: `docs/ASSETS.md`.

## Project layout

- `db/`: SQL migrations, deterministic seed, PostgreSQL bootstrap (Neon, local, bundled test server).
- `backend/`: Express 5 API (TypeScript, zod validation, JWT auth, JSON logs with request id, no medicine names, addresses or full emails in logs).
- `frontend/`: React 18 + Vite app (React Router, Leaflet, framer-motion, lazy-loaded three.js scenes), French by default, English available.
- `e2e/`: Playwright tests. `scripts/`: dev runner, e2e runner, design sweep tools.

## Performance and graphics

- **Quality** (Profile → Graphics): Automatic (recommended), High (4K), High, Medium, Low (still pictures) and Off. Every device starts on Medium; Automatic raises it to High only on a strong desktop GPU after a long smooth stretch, and lowers it again if frames stay late. The render resolution adapts by itself (never above the screen's pixel ratio; up to 2 only on "High (4K)").
- **Glass panels**: every panel is frosted glass; on Low/Off, when the resolution had to drop, or when the system asks for less transparency, they become plain tinted panels with no blur.
- **Measure it yourself** (production build, this machine's GPU): `npm run build`, `node scripts/serve-prod.mjs`, then `node scripts/perf-median.mjs mytag laptop` or `phone` (phone = CPU 4x slower and slow 4G, emulated). Results and method: `docs/PERF.md`.
- **Medicine pictures and heroes** are rendered from our own 3D models: `npm run render` (with `npm run dev` running); `-- --meds` for the medicines.

## More for patients, pharmacies and staff (2026-10-25)

- **Patients:** pharmacy profile pages (hours, services, languages, accessibility), filters (open now, in stock, distance, saved, sort by price), a "cheapest nearby" badge, saved pharmacies, a straight-line route and a directions link on the map, clustered pins, "notify me when it is back in stock", a pickup code and QR code on every accepted order, recent searches, barcode scan (browsers that support it), a command palette (Ctrl+K), "my devices" with sign-out everywhere.
- **Pharmacies:** team accounts (owner, pharmacist, assistant) with an activity log, a "Today" board (drag or button, valid steps only), pickup confirmation by QR link or code, breaks that end by themselves, a profile page editor, a low-stock list with a CSV reorder export.
- **Staff:** a style guide page (`/admin/design`), an "Optional services" panel (what is configured), a CSV download of the aggregated analytics.
- **Files, messages, reviews, time slots:** prescription photos or PDFs attached to a request (private, only the chosen pharmacy opens them, deleted automatically), verification documents with a staff checklist, text messages on an order, reviews of delivered orders with staff moderation, and a pickup or simulated delivery time chosen inside the pharmacy's opening hours.
- **Family, reminders, switches:** requests for a child or parent (first name and relation only), renewal reminders (a date, never a dose) and a "request again" button, staff feature switches with a reason, and a weekly summary for staff.
- **Access log and review replies:** a patient sees in plain language who opened their data (pharmacy, doctor, staff; once an hour per item, kept 12 months); a pharmacy can reply once to a review, the patient can report the reply and staff can hide it. Web push is shown as "not configured" with the exact steps in DEPLOY.md (sending is not built).
- **Optional services** (email, error alerts, uptime, storage choices, staging, backup and recovery): see **DEPLOY.md**. Without keys each one shows "not configured" and everything else works.
- **Speed budget:** `npm run budget` and `.github/workflows/ci.yml` fail the build when the bundles grow (docs/PERF.md).

## Pharmacies add medicines, staff review, analytics

- A pharmacy can propose a medicine that is not in the catalogue (Stock tab → "Medicine not in the list? Propose it"): same-code and look-alike detection first, an audit-log entry, and it stays invisible to patients until a moderator or admin approves it (Staff → Proposals). The stock CSV also accepts new medicines (extra columns, see the hint on the page).
- Staff → Statistics: aggregated numbers only (requests, orders, acceptance, response time, top medicines and categories, payments in test mode). No names, e-mails or addresses; groups smaller than three are folded into "Other".

## Payments (Stripe test mode)

Payment is optional and **test mode only**: no real money, and a live key (`sk_live_…`) is refused. Card data is typed on Stripe's own page; counter. never sees it and the database only stores Stripe ids, the amount and a status.

How it works: the patient chooses a pharmacy → the pharmacy accepts (the order exists) → only then the patient can pay → Stripe **authorises** the amount (held, not taken) → when the pharmacy marks the order **ready**, the amount is **captured** → if the order is cancelled, the authorisation is released (or the capture refunded). The amount is always computed on the server from the pharmacy's prices. A receipt page is available after payment.

Set it up:

1. Create a free account at https://dashboard.stripe.com/register and stay in **Test mode** (switch at the top of the dashboard).
2. Developers → API keys → copy the **Secret key** (`sk_test_…`) into the root `.env` as `STRIPE_SECRET_KEY`. Never commit `.env`.
3. Install the Stripe CLI (https://docs.stripe.com/stripe-cli), run `stripe login`, then forward webhooks to your local API:

   ```bash
   stripe listen --forward-to localhost:4000/api/webhooks/stripe
   ```

   It prints a signing secret (`whsec_…`): put it in `.env` as `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.

4. Log in as a patient, send a request, log in as the pharmacy to accept it, then open the order as the patient and press **Pay (test)**.
5. Test cards: `4242 4242 4242 4242` succeeds; `4000 0000 0000 0002` is declined (any future date, any CVC). Move the order to **Ready** as the pharmacy to see the capture; cancel to see the refund.

### Try the payment flow without Stripe keys

For development and the e2e tests only, `STRIPE_FAKE=1` (in `.env`) replaces Stripe by a simulated checkout page (`/dev/fake-stripe/...`; card `4242 4242 4242 4242` pays, any other number is declined). The server refuses to start with it in production and the route does not exist in the production build. It exercises our whole side of the flow (authorise, capture when ready, release or refund on cancel); only the real Stripe pages and signatures need your test keys.

Without keys the order page says **"Payments not configured"** and everything else still works. Hosted: add the same two variables on Render and create a webhook endpoint `https://<your-service>.onrender.com/api/webhooks/stripe` (events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`); see `DEPLOY.md`.
