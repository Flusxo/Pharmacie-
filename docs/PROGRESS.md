# Progress

Tick a phase only when its checks pass (run and seen). **New session: read `CLAUDE.md`, then continue at "Next step" below.**

## Next step (where the last session stopped)

Phase 2 is done and committed. Next: Phase 3 — public routes (search, suggest, medicine details + generics, categories with counts, nearby pharmacies) + tests, then Phase 4 (rest of services/lifecycle.ts + patient/doctor/pharmacy routes), Phase 5 (admin).
Design notes for the missing parts are in `docs/DECISIONS.md`.

## Phases

- [x] Phase 1 — Foundation (workspaces, env, DB route, schema, deterministic seed, `db:reset`)
  - Verified on the bundled PG16 and **on Neon (2026-10-21)**: `npm run db:reset` → medicines 50, pharmacies 8, doctors 3, patients 5, staff 3, orders 11; extensions pgcrypto/unaccent/pg_trgm present; SQL typo search "dolliprane" → Doliprane, "PARA" → Paracétamol, "cetirizine" → Cétirizine.
  - Verified: `npm run db:test` starts the bundled PG16 and seeds `pharmalink_test`.
- [x] Phase 2 — Backend core (Express 5 app, config, pg pool + tx helper, JSON logs with request id, error handler, auth, roles, verified middleware, staff sub-roles, rate limits, health, OpenAPI at /api/docs)
  - Verified by tests (backend/test/auth.test.ts, health.test.ts — 23 passing): register patient (active) / doctor + pharmacy (pending); login for patient, doctor, pharmacy, admin, support, moderator through one endpoint; same generic message for wrong password and unknown email; lockout after 5 failures (correct password then refused); pending doctor and pharmacy get 403 "Waiting for staff approval"; role and staff sub-role protection; tampered token 401; short password → clear 400; password reset link single-use; change password needs the current one.
  - Verified by hand on Neon (curl): /api/health ok, alice login ok, wrong password generic 401, invalid body clear 400; request logs contain no email.
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

## Last check results (2026-10-21, after Phase 2)

- `npm run build`: exit 0. `npm run lint`: exit 0.
- `npm test`: 2 files, 23 tests passed, on the bundled PG16 `localhost:5433/pharmalink_test` (never Neon).

## Simulated

- Delivery tracking (labelled "Simulated tracking"), emails (written to `logs/mail.log` in development).

## Optional

- Map tiles (`VITE_MAP_TILE_URL`, currently empty).

## Not done yet

- Everything from Phase 2 onward (see above).
