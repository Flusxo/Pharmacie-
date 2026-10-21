# Progress

Tick a phase only when its checks pass (run and seen). **New session: read `CLAUDE.md`, then continue at "Next step" below.**

## Next step (where the last session stopped)
Phase 2 (backend core) is partly written and **not committed**. Already in `backend/src/`:
`config.ts`, `db.ts`, `pgconfig.ts`, `logger.ts`, `errors.ts`, `validate.ts`, `notify.ts`, `middleware/auth.ts`,
`services/profile.ts`, `services/search.ts` (Phase 3 search + nearby), `routes/auth.ts`, `app.ts`, `server.ts`, `jobs.ts`, `openapi.ts`.
Missing, in this order:
1. `backend/src/services/lifecycle.ts` (create request + idempotency, options incl. partial, choose, accept in one tx with `FOR UPDATE`,
   refuse, substitution, cancel / cancellation request, order status machine with stock return, `runExpiryJob`). `jobs.ts` already imports it, so the backend does not typecheck until it exists.
2. Routes: public (search, suggest, medicine details + generics, categories, nearby), patient, doctor, pharmacy (inventory + CSV + summary), admin (sub-roles + audit), notifications, reports, share link. Mount them in `app.ts` and add them to `openapi.ts` (`addRoutes`).
3. Root scripts `dev`, `build`, `test`, `lint`; `backend/vitest.config.ts` with a global setup that runs the test-DB reset (`db/scripts/test-db.ts` logic) and sets `DATABASE_URL` to `testDatabaseUrl()`.
4. Phase 2–5 tests, then commit each phase.
Design notes for the missing parts are in `docs/DECISIONS.md`.

## Phases
- [x] Phase 1 — Foundation (workspaces, env, DB route, schema, deterministic seed, `db:reset`)
  - Verified on the bundled PG16 and **on Neon (2026-10-21)**: `npm run db:reset` → medicines 50, pharmacies 8, doctors 3, patients 5, staff 3, orders 11; extensions pgcrypto/unaccent/pg_trgm present; SQL typo search "dolliprane" → Doliprane, "PARA" → Paracétamol, "cetirizine" → Cétirizine.
  - Verified: `npx tsx db/scripts/test-db.ts` starts the bundled PG16 in the new (short) folder and seeds `pharmalink_test`.
- [ ] Phase 2 — Backend core (in progress, see above)
- [ ] Phase 3 — Medicines, search, nearby (service written, routes + tests missing)
- [ ] Phase 4 — Request lifecycle
- [ ] Phase 5 — Admin and staff
- [ ] Phase 6 — Frontend foundation and patient flow
- [ ] Phase 7 — Map
- [ ] Phase 8 — Dashboards
- [ ] Phase 9 — Images and 3D (+ the separate 3D/animation brief: Scene3D, quality tiers, product viewer, hero, scenes, motion system)
- [ ] Phase 10 — Design and animation polish
- [ ] Phase 11 — Extras
- [ ] Phase 12 — Quality and documentation

## Last check results (2026-10-21, new folder)
- `npm install`: OK, 0 vulnerabilities.
- `npm run build`: no root build script yet (added in step 3 above).
- `db` typecheck: OK. `backend` typecheck: fails only because `services/lifecycle.ts` is not written yet.
- Tests: none written yet.

## Simulated
- Delivery tracking (labelled "Simulated tracking"), emails (written to `logs/mail.log` in development).

## Optional
- Map tiles (`VITE_MAP_TILE_URL`, currently empty).

## Not done yet
- Everything from Phase 2 onward (see above).
