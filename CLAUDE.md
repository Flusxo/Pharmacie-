# PharmaLink — "counter." (France) — prototype

Read this file and `docs/PROGRESS.md` first. Record every choice in `docs/DECISIONS.md`.

## Product

PharmaLink (brand **counter.**) connects patients, doctors, pharmacies and staff.

- Patient searches a medicine, sees nearby pharmacies that have it (list + map), chooses one, sends a request, follows the order.
- Doctor (verified by staff) links to patients (patient must confirm), sends a request for a confirmed patient; the patient then chooses the pharmacy.
- Pharmacy (verified) manages stock, accepts/refuses requests it was chosen for, moves orders through statuses.
- Staff (admin / support / moderator) verify doctors & pharmacies, manage users, medicines, orders, reports.
  Feels like a modern delivery app, but it is NOT an online medicine shop.

## Hard rules (in code AND tests)

1. Only pharmacies sell. Never "Buy now" / "Add to cart". Use "Request from a pharmacy".
2. Free choice: the system proposes pharmacies with stock; the patient chooses. Doctor requests never reach a pharmacy until the patient chooses.
3. `requires_prescription` items need a prescription note from the patient OR a confirmed doctor link. Pharmacy confirms before preparing.
4. A pharmacy is proposed only if verified, active, not paused, and has every item in stock. Never first-click wins.
5. Privacy: doctor sees only confirmed patients, never their address. Pharmacy sees only requests it was chosen for, patient as "First L.". Patient sees only own data. Staff view, never impersonate.
6. Out of scope ("Coming soon" + TODO): real couriers, payments, HDS hosting, real prescription verification, legal review. Tracking is "Simulated tracking".
7. Permanent notice: "Prototype only. Not for real medical use. Demo data."
8. No secret in source or git. Map key + JWT secret only in the ignored root `.env`.

## Stack

- npm workspaces: `db/` (migrations, seed, Postgres bootstrap), `backend/` (Express API), `frontend/` (React app). `e2e/` Playwright.
- PostgreSQL 16 + pgcrypto, unaccent, pg_trgm.
  - **App database = hosted Neon** (`DATABASE_URL` in root `.env`, with `sslmode=require` → TLS, cert verified; see `db/src/pgconfig.ts` + `backend/src/pgconfig.ts`, keep in sync).
  - **Never read, print or commit `.env`.** Only print key names / "hosted vs local" if you must check it.
  - **Tests never use DATABASE_URL**: they use `TEST_DATABASE_URL`, default bundled PG16 (`embedded-postgres`) on `localhost:5433/pharmalink_test` (data `db/.pgdata`). The bundled server is only started for localhost URLs.
  - Docker (`docker-compose.yml`) or a local PG also work via a localhost `DATABASE_URL`.
- Project lives in `C:\Users\Fujitsu\Documents\Pharmacie-app` (moved from a temp folder whose long path broke git and initdb).
- Backend: Node 20+, TypeScript, Express 5, pg, zod 4, bcryptjs, jsonwebtoken, cors, helmet, express-rate-limit, dotenv. Tests: Vitest + Supertest.
- Frontend: React 18 + TS + Vite, React Router, plain CSS variables, Leaflet/react-leaflet, framer-motion, three + @react-three/fiber + drei + postprocessing (lazy). Tests: Vitest + Testing Library.
- ONE root `.env`; Vite `envDir: '..'`. Frontend calls relative `/api` (Vite proxy). Never hard-code `localhost:4000` in frontend code.

## Commands

```
cp .env.example .env
npm install
npm run db:reset      # drop, migrate, seed DATABASE_URL (Neon; waits up to 30 s)
npx tsx db/scripts/test-db.ts   # seed the test DB (bundled PG on :5433) — never Neon
npm run dev           # backend :4000 + frontend :5173
npm test              # backend + frontend tests
npm run build         # typecheck + production build
npm run lint
npm run e2e           # Playwright (needs `npx playwright install chromium` once)
```

## Working agreements

- Work in phases; commit after each phase whose checks pass. `npm run dev` must never be broken.
- No destructive git (`stash -u`, `reset --hard`, `clean -fd`) without telling the user. Never delete node_modules + lockfile together; use `npm ci`.
- No placeholder code (`...`, `TODO: implement`) in UI/logic. Unfinished = removed or "Coming soon".
- Don't install unused packages. 3D/animation libraries are lazy-loaded.
- Fix root causes; never hide errors. Validation errors return clear 400 messages.
- Test the real thing (curl / Playwright). Never claim something works without running it.
- Keep `docs/PROGRESS.md` current (what's simulated / optional / not done).
- Logs: JSON with request id; never log medicine names, addresses or full emails.
- New UI text goes through `frontend/src/i18n/fr.ts` and `en.ts` (French default).
