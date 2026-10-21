# counter. (PharmaLink) — find your medicine in a nearby pharmacy

> **Prototype only. Not for real medical use. Demo data.**

counter. connects patients, doctors, pharmacies and staff in France. A patient searches a medicine, sees which nearby pharmacies have it in stock (list and map), **chooses** a pharmacy, sends a request and follows the order. Only pharmacies sell: counter. is an intermediary, never a shop ("Request from a pharmacy", never "Buy").

## Quick start

Requirements: **Node.js 20 or newer** (`node -v`), npm, and a PostgreSQL 16 database. The app database is a hosted **Neon** database; tests use a PostgreSQL 16 bundled through npm (nothing to install).

```bash
cp .env.example .env
```

Edit `.env` (never commit it): paste your Neon connection string into `DATABASE_URL` (it must end with `?sslmode=require`; the app then connects over TLS with certificate checks), set a long random `JWT_SECRET`, and optionally `VITE_MAP_TILE_URL` (see "Map tiles" below).

```bash
npm install
npm run db:reset
npm run dev
```

Open http://localhost:5173. `npm run db:reset` drops, migrates and seeds `DATABASE_URL` (it waits up to 30 s for the database). `npm run dev` starts the API on :4000 and the web app on :5173; if a port is busy it tells you which program holds it instead of moving to another port.

Other commands:

```bash
npm test
npm run build
npm run lint
npm run e2e
```

- `npm test`: backend + frontend tests on the bundled local PostgreSQL (port 5433), **never** on Neon.
- `npm run e2e`: Playwright end-to-end tests (run `npx playwright install chromium` once first). They start their own database and servers (:4100, :5174, :5175) and stop them afterwards.

## Map tiles (MapTiler)

The map uses Leaflet. Tiles come **only** from `VITE_MAP_TILE_URL`; there is no default tile server. Without it the map shows "Map tiles are not configured…" with a Retry button, and pins, popups and the list still work.

1. Create a free account at https://cloud.maptiler.com and open **Account → API keys** (https://cloud.maptiler.com/account/keys/). Copy a key.
2. In the root `.env`, set either the full raster URL (recommended):
   `VITE_MAP_TILE_URL=https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=YOUR_KEY`
   or just the key itself (`VITE_MAP_TILE_URL=YOUR_KEY`); the app then builds the same MapTiler URL. Do not use `{s}` subdomains and do not paste a `style.json` link; the app tells you if you do.
3. **Restart `npm run dev`**: Vite reads `.env` only when it starts.
4. Attribution "© MapTiler © OpenStreetMap contributors" is always shown on the map.

If tiles do not appear:

- The map says **"MapTiler refuse la clé (403 Invalid key)"** / "MapTiler rejects the key": the key is wrong, deleted or restricted. Copy it again from the MapTiler account page, and if you restricted it, add `http://localhost:5173` to its **Allowed HTTP origins**.
- "Map tiles cannot be loaded": no network, or the provider is unreachable.
- Browser map keys are **public** (anyone can read them in the page). Before putting the app online, restrict the key's "Allowed HTTP origins" to your real domain in the MapTiler dashboard. Never commit the key: it lives only in the ignored `.env`.

No pins? Check that the API runs (http://localhost:5173/api/health says `"database":"ok"`), that the location used ("Position utilisée") is near the demo pharmacies (Tournon, Valence, Romans, Étoile, Lyon, Vienne), and the radius (the map offers "Élargir à 30 km" when nothing is in range). If the browser refuses geolocation, type a postcode or address (French BAN address API).

## Demo accounts

All demo accounts use the password `Password123!` (development data only; the login page has a demo panel in development).

| Role       | Accounts                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Patients   | `alice@`, `bruno@`, `camille@`, `david@`, `emma@pharmacie.test` (Alice and Bruno linked to Dr Martin; Camille's link not confirmed)                                                  |
| Doctors    | `dr.martin@pharmacie.test` (verified), `dr.bernard@` and `dr.petit@pharmacie.test` (pending)                                                                                         |
| Pharmacies | `pharmacie.tournon@` (Pharmacie du Rhône), `.valence@`, `.romans@`, `.etoile@`, `.lyon1@`, `.lyon3@`, `.vienne@pharmacie.test` (verified), `pharmacie.demo@pharmacie.test` (pending) |
| Staff      | `admin@`, `support@`, `moderator@pharmacie.test` (use the "Connexion équipe" link)                                                                                                   |
