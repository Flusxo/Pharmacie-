# Progress

Tick a phase only when its checks pass (run and seen). **New session: read `CLAUDE.md`, then continue at "Next step" below.**

## Next step (where the last session stopped)

Phases 2–4 are done and committed. Next: Phase 5 — admin routes (stats, users with filters, verification queue approve/reject with reason, suspend/reactivate with reason, create staff (admin only), medicines CRUD, orders, reports list/resolve, audit log, pharmacy performance) with sub-role enforcement and an audit row for every staff action, plus tests (moderator verifies but cannot create staff; support reads but cannot suspend or verify).
Design notes for the missing parts are in `docs/DECISIONS.md`.

## Phases

- [x] Phase 1 — Foundation (workspaces, env, DB route, schema, deterministic seed, `db:reset`)
  - Verified on the bundled PG16 and **on Neon (2026-10-21)**: `npm run db:reset` → medicines 50, pharmacies 8, doctors 3, patients 5, staff 3, orders 11; extensions pgcrypto/unaccent/pg_trgm present; SQL typo search "dolliprane" → Doliprane, "PARA" → Paracétamol, "cetirizine" → Cétirizine.
  - Verified: `npm run db:test` starts the bundled PG16 and seeds `pharmalink_test`.
- [x] Phase 2 — Backend core (Express 5 app, config, pg pool + tx helper, JSON logs with request id, error handler, auth, roles, verified middleware, staff sub-roles, rate limits, health, OpenAPI at /api/docs)
  - Verified by tests (backend/test/auth.test.ts, health.test.ts — 23 passing): register patient (active) / doctor + pharmacy (pending); login for patient, doctor, pharmacy, admin, support, moderator through one endpoint; same generic message for wrong password and unknown email; lockout after 5 failures (correct password then refused); pending doctor and pharmacy get 403 "Waiting for staff approval"; role and staff sub-role protection; tampered token 401; short password → clear 400; password reset link single-use; change password needs the current one.
  - Verified by hand on Neon (curl): /api/health ok, alice login ok, wrong password generic 401, invalid body clear 400; request logs contain no email.
- [x] Phase 3 — Medicines, search, nearby (routes in backend/src/routes/public.ts)
  - Verified by tests (backend/test/search.test.ts, 18 tests): "para" and "PARA" → Paracétamol Biogaran first, then other paracetamol; "cetirizine" = "cétirizine"; "dolliprane" → Doliprane first; "ventoline" prefix first; French category word "douleur" → pain medicines; "zirtecc" → no results + didYouMean "Zyrtec 10 mg"; 20 per page (50 → 3 pages, last has 10); availability count within 30 km of Tournon = 3; generics of Doliprane 1000 include Paracétamol Biogaran 1000 and not Dafalgan 500; categories sum to 50; nearby sorted by distance with distance/quantity/price/inStock; pending Pharmacie Démo never proposed even though closest; radius respected; paused pharmacy hidden; invalid coordinates/page → clear 400.
  - Verified by hand on Neon (curl): "dolliprane" → Doliprane 1000 mg (available at 6); request logs contain no medicine names.
- [x] Phase 4 — Request lifecycle (services/requests.ts, services/orders.ts, services/lifecycle.ts; routes patient.ts, doctor.ts, pharmacy.ts, common.ts)
  - Verified by tests (backend/test/lifecycle.test.ts 25 tests, pharmacy.test.ts 8 tests):
    - Free choice: options list only eligible pharmacies with full stock (pending Démo and 0-stock Étoile excluded); nothing reaches a pharmacy before the patient chooses; the chosen pharmacy sees "Alice M." and no surname/address/email; other pharmacies see nothing. Accept creates the order, decreases stock, writes the first history row.
    - Prescription rule: no statement → 400 `prescription_required`; with statement → OK, and the pharmacy must send `prescriptionChecked` before "preparing"; a request from a doctor with a confirmed link needs no statement.
    - Concurrency: two pharmacies accepting the same request at once → one 200, one 409, one order; triple-click accept → one order; two requests for the last box → one 409 `insufficient_stock`, stock ends at 0 (never negative); negative stock edit → clear 400.
    - Refusal returns the request to "received"; the refusing pharmacy is excluded and can no longer accept. No answer in 30 min → back to the patient; after 24 h → expired (`runExpiryJob`).
    - Doctor: requests for Alice and Bruno OK; Camille (unconfirmed) and David (not linked) 403; patient list has no address and no details for unconfirmed links (masked email); the doctor cannot choose the pharmacy; link request answers the same for unknown emails; after David confirms, the doctor can create.
    - Status machine: accepted→ready and accepted→delivered 409; forward steps OK; delivered→preparing and delivered→cancelled 409; history rows in order; another pharmacy gets 404.
    - Cancel at "accepted" returns stock; after "preparing" the patient can only ask, the pharmacy approves → stock returned.
    - Partial stock needs `acceptPartial`; missing items are excluded and not taken from stock. Substitution (same substance + dosage only) → patient approves → item swapped → accept OK.
    - Idempotency: the same request twice within 2 min → same id (200, `duplicate: true`).
    - Privacy: a patient cannot read another patient's request/order (404); the share link shows status only and returns 410 after delivery + 2 h.
    - Email subjects never contain medicine names. Inventory CSV preview with per-row errors; apply refused while errors exist; valid CSV applied with history; low-stock filter; pause switch hides the pharmacy; daily summary; export my data; delete account (anonymised, login refused), refused while an order is in progress.
  - Verified by hand on Neon (curl, then `npm run db:reset` to restore demo data): Alice → Zyrtec request → options (Pharmacie du Rhône 0.3 km first) → choose → Tournon incoming shows "Alice M." → accept → accepted→ready refused (409) → preparing OK. Logs contain no medicine names, emails or addresses.
- [ ] Phase 5 — Admin and staff
- [ ] Phase 6 — Frontend foundation and patient flow
- [ ] Phase 7 — Map
- [ ] Phase 8 — Dashboards
- [ ] Phase 9 — Images and 3D (+ the separate 3D/animation brief: Scene3D, quality tiers, product viewer, hero, scenes, motion system)
- [ ] Phase 10 — Design and animation polish
- [ ] Phase 11 — Extras
- [ ] Phase 12 — Quality and documentation

## Last check results (2026-10-21, after Phase 4)

- `npm run build`: exit 0. `npm run lint`: exit 0.
- `npm test`: 6 files, 76 tests passed, on the bundled PG16 `localhost:5433/pharmalink_test` (never Neon).

## Simulated

- Delivery tracking (labelled "Simulated tracking"), emails (written to `logs/mail.log` in development).

## Optional

- Map tiles (`VITE_MAP_TILE_URL`, currently empty).

## Not done yet

- Phase 5 onward (see above). The frontend does not exist yet.
