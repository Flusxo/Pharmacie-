# Progress

Tick a phase only when its checks pass (run and seen). **New session: read `CLAUDE.md`, then continue at "Next step" below.**

## Next step (where the last session stopped)

Tooling is in place (`npm run build`, `npm run lint`, `npm test`). Next: finish Phase 2 (auth tests: register per role, login, generic error, lockout, pending doctor/pharmacy blocked, role protection), then Phases 3–5.
Still missing in the backend: the rest of `services/lifecycle.ts` (only `runExpiryJob` exists), and routes for public search, patient, doctor, pharmacy, admin, notifications, reports, share link.
Design notes for the missing parts are in `docs/DECISIONS.md`.

## Phases

- [x] Phase 1 — Foundation (workspaces, env, DB route, schema, deterministic seed, `db:reset`)
  - Verified on the bundled PG16 and **on Neon (2026-10-21)**: `npm run db:reset` → medicines 50, pharmacies 8, doctors 3, patients 5, staff 3, orders 11; extensions pgcrypto/unaccent/pg_trgm present; SQL typo search "dolliprane" → Doliprane, "PARA" → Paracétamol, "cetirizine" → Cétirizine.
  - Verified: `npm run db:test` starts the bundled PG16 and seeds `pharmalink_test`.
- [ ] Phase 2 — Backend core (code written; tests in progress)
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

## Last check results (2026-10-21)

- `npm run build` (db typecheck + backend typecheck incl. tests + compile): exit 0.
- `npm run lint` (ESLint 9 + typescript-eslint, Prettier config): exit 0.
- `npm test`: 1 file, 3 tests passed (health, 404 message, OpenAPI) on the bundled PG16 `localhost:5433/pharmalink_test`. Tests refuse to run on a non-local DB.

## Simulated

- Delivery tracking (labelled "Simulated tracking"), emails (written to `logs/mail.log` in development).

## Optional

- Map tiles (`VITE_MAP_TILE_URL`, currently empty).

## Not done yet

- Everything from Phase 2 onward (see above).
