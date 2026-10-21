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
- PostgreSQL 16 + pgcrypto, unaccent, pg_trgm. Default route C: bundled PG16 via `embedded-postgres` on port 5433 (data `db/.pgdata`). Route A Docker (`docker-compose.yml`), Route B local PG: set `EMBEDDED_PG=false`.
- Backend: Node 20+, TypeScript, Express, pg, zod, bcryptjs, jsonwebtoken, cors, helmet, express-rate-limit, dotenv. Tests: Vitest + Supertest (DB `pharmalink_test`).
- Frontend: React 18 + TS + Vite, React Router, plain CSS variables, Leaflet/react-leaflet, framer-motion, three + @react-three/fiber + drei + postprocessing (lazy). Tests: Vitest + Testing Library.
- ONE root `.env`; Vite `envDir: '..'`. Frontend calls relative `/api` (Vite proxy). Never hard-code `localhost:4000` in frontend code.

## Commands
```
cp .env.example .env
npm install
npm run db:reset      # drop, migrate, seed (starts bundled PG or waits 30 s)
npm run dev           # bundled PG + backend :4000 + frontend :5173
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
