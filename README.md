# counter. (PharmaLink) — find your medicine in a nearby pharmacy

> **Prototype only. Not for real medical use. Demo data.**

counter. connects patients, doctors, pharmacies and staff in France. A patient searches a medicine, sees which nearby pharmacies have it in stock (list and map), **chooses** a pharmacy, sends a request and follows the order. Doctors can prepare a request for a confirmed patient; pharmacies manage their stock and orders; staff verify professionals and moderate. It feels like a delivery app, but it is **not an online medicine shop**: only pharmacies sell.

## The rules the code enforces (and tests check)

1. Only pharmacies sell. There is no "Buy now" or "Add to cart" anywhere: the action is "Request from a pharmacy".
2. Free choice: the app proposes pharmacies that have every item in stock; the **patient chooses**. A doctor's request never reaches a pharmacy until the patient picks one.
3. Prescription medicines need the patient's prescription statement or a confirmed doctor link, and the pharmacy must tick "prescription checked" before preparing.
4. A pharmacy is proposed only if it is verified, active, not paused and has every item in stock. Two pharmacies can never both accept the same request.
5. Privacy: a doctor sees only confirmed patients and never their address; a pharmacy sees only requests it was chosen for, with the patient shown as "First L."; a patient sees only their own data; staff can view but never impersonate.
6. Not built (shown as "Coming soon" / "Simulated"): real couriers, payments, HDS-certified hosting, real prescription verification, legal review. Delivery tracking is labelled "Simulated tracking".
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
- **Not built**: real couriers, online payments, HDS-certified hosting, real prescription verification, legal review of the terms and privacy texts ("Coming soon").
- Progress, known issues and every design decision: `docs/PROGRESS.md`, `docs/DECISIONS.md`. 3D asset sources and licences: `docs/ASSETS.md`.

## Project layout

- `db/`: SQL migrations, deterministic seed, PostgreSQL bootstrap (Neon, local, bundled test server).
- `backend/`: Express 5 API (TypeScript, zod validation, JWT auth, JSON logs with request id, no medicine names, addresses or full emails in logs).
- `frontend/`: React 18 + Vite app (React Router, Leaflet, framer-motion, lazy-loaded three.js scenes), French by default, English available.
- `e2e/`: Playwright tests. `scripts/`: dev runner, e2e runner, design sweep tools.
