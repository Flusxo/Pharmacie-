# Progress

Tick a phase only when its checks pass (run and seen).

- [x] Phase 1 — Foundation (workspaces, env, DB route, schema, deterministic seed, `db:reset`)
  - Verified: `npm run db:reset` → medicines 50, pharmacies 8, doctors 3, patients 5, staff 3, orders 11; extensions pgcrypto/unaccent/pg_trgm present; SQL typo search "dolliprane" → Doliprane, "PARA" → Paracétamol.
- [ ] Phase 2 — Backend core
- [ ] Phase 3 — Medicines, search, nearby
- [ ] Phase 4 — Request lifecycle
- [ ] Phase 5 — Admin and staff
- [ ] Phase 6 — Frontend foundation and patient flow
- [ ] Phase 7 — Map
- [ ] Phase 8 — Dashboards
- [ ] Phase 9 — Images and 3D
- [ ] Phase 10 — Design and animation polish
- [ ] Phase 11 — Extras
- [ ] Phase 12 — Quality and documentation

## Simulated
- Delivery tracking (labelled "Simulated tracking"), emails (written to `logs/mail.log` in development).

## Optional
- Map tiles (`VITE_MAP_TILE_URL`).

## Not done yet
- (filled in as phases complete)
