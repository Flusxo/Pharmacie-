# Progress

Tick a phase only when its checks pass (run and seen). **New session: read `CLAUDE.md`, then continue at "Next step" below.**

## Next step (where the last session stopped)

Phases 1–6 are done and committed. Next: Phase 7 — the map (master prompt section 10, exactly): Leaflet + react-leaflet, tiles ONLY from `VITE_MAP_TILE_URL` (no OSM/CARTO default), in-map fallback message with Retry when empty or tiles fail, "© MapTiler © OpenStreetMap contributors" attribution, green/grey pins, pulsing patient dot, radius slider 1–30 km, list ↔ map sync, simulated delivery marker on the tracking page. Then re-add the "Carte" nav entry and the "Open the map" button on Home (removed for Phase 6 so nothing linked to a missing page). Then Phase 8 dashboards (doctor, pharmacy and staff currently land on `/doctor`, `/pharmacy`, `/admin`, which do not exist yet → 404 page).
The full API is listed at `/api/docs` (72 paths). Design notes are in `docs/DECISIONS.md`.

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
- [x] Phase 5 — Admin and staff (backend/src/routes/admin.ts)
  - Permissions: every staff role views; verify/reject, suspend/reactivate and medicines CRUD = admin + moderator; staff accounts only touched by admin; resolve reports = any staff; create staff = admin only. No impersonation route exists.
  - Verified by tests (backend/test/admin.test.ts, 19 tests): admin/support/moderator can read all 10 admin lists; user filters work and expose no password hashes; patients and pharmacies get 403; support cannot verify, suspend, create staff or edit medicines; moderator verifies the pending Pharmacie Démo → it can work and appears in nearby search; a newly registered doctor is blocked (403) until an admin approves, then works; rejecting needs a reason, which the doctor sees in /me; suspension needs a reason, blocks the token (401) and login (403 "suspended"), reactivation restores it; moderator cannot suspend staff; nobody can suspend themselves; admin creates a support account that can log in; medicines create (bad image URL rejected) / update / soft-delete with reason; reports filed by any user and resolved by support; every staff write leaves an audit row, with a reason where required; performance table.
  - Bug found and fixed by these tests: PATCH on a medicine used to blank `description` and `ageNote` (zod defaults kept by `.partial()`).
  - Verified by hand on Neon (curl, read-only): moderator stats and verification queue (Dr Bernard, Dr Petit, Pharmacie Démo); `/api/docs` returns 200; OpenAPI lists 72 paths; no error logs.
  - `npm audit`: 0 vulnerabilities.
- [x] Phase 6 — Frontend foundation and patient flow (`frontend/`, `scripts/dev.mjs`, `e2e/`)
  - Built: Vite 8 + React 18.3 + TS, React Router 7.18 (6.x has published advisories), `envDir: '..'`, `/api` proxy, strict ports; auth context + protected routes per role; settings (theme system/light/dark, reduce animations); location context (saved address → device geolocation → BAN address/postcode search, default Tournon; never blocks); i18n fr (default) / en; toasts; notifications bell (unread count, mark read); Login (Patient/Médecin/Pharmacie tabs, "Connexion équipe" link → /login/staff, dev-only demo panel), Register (patient/doctor/pharmacy, BAN address), forgot/reset password, Waiting-for-approval, Patient Home (greeting, search with keyboard suggestions, categories with counts, recent orders, around you, location control), Search (filters, availability "En stock dans N pharmacies proches", Rx badge, did-you-mean, pagination), Medicine Details (generated pack image, info, "Pourquoi faut-il une ordonnance ?", nearby pharmacies with stock/price/open state, generics), request flow sheet (pharmacy → confirm → sent; prescription checkbox; "counter. ne vend rien"), My requests + request details (choose pharmacy for doctor requests incl. partial with confirmation, waiting/refused, substitution approve/decline, cancel), Order tracking (6-step stepper, auto-refresh 10 s, toast on status change, "Suivi simulé", share link, cancel / ask to cancel), public shared tracking page, Profile/settings (language, theme, reduce animations, email notifications, doctor links, change password, report a problem, export data, delete account), Terms/Privacy placeholders ("bientôt disponible"), 404.
  - `npm run dev` starts API :4000 + frontend :5173 (and the bundled PG only if DATABASE_URL is local); refuses to start if a port is busy and names the process. Verified: web 200, `/api/health` through the proxy = ok on Neon; login page and Patient Home checked in the browser.
  - Verified by Playwright (`npm run e2e`, 4 tests, real API on :4100 + real frontend on :5174, own local DB `pharmalink_e2e`): Alice logs in via the demo panel → Home → search "para" (Paracétamol) and "dolliprane" (Doliprane 1000 mg) → details (Pharmacie du Rhône first) → request sheet → sent → request page "En attente…"; Tournon (via API) sees "Alice M." and accepts; tracking page shows "Acceptée" then updates by itself to "En préparation" and "Prête"; no buy/cart wording on visited pages. Prescription medicine: "Envoyer" disabled until the prescription checkbox is ticked. Wrong password → "Invalid email or password.". Staff link → admin logs in.
  - Verified by Vitest (frontend, 12 tests): no buy/cart wording and no hard-coded `localhost:4000` anywhere in `src`; prototype notice text fr/en; no placeholder code; fr/en keys and `{placeholders}` identical; `4,50 €`, DD/MM/YYYY in Europe/Paris; open/closed/on-duty logic; PackImage label + fallback when a real image fails; login tabs, staff link, demo panel fill; stepper mapping.
  - Production bundle checked: no API host, no secret names, no Neon host, no demo emails or demo password.
- [ ] Phase 7 — Map
- [ ] Phase 8 — Dashboards
- [ ] Phase 9 — Images and 3D (+ the separate 3D/animation brief: Scene3D, quality tiers, product viewer, hero, scenes, motion system)
- [ ] Phase 10 — Design and animation polish
- [ ] Phase 11 — Extras
- [ ] Phase 12 — Quality and documentation

## Last check results (2026-10-21, after Phase 6)

- `npm run build`: exit 0. `npm run lint`: exit 0.
- `npm test`: backend 6 files / 95 tests + frontend 1 file / 12 tests passed (backend on the bundled PG16 `localhost:5433/pharmalink_test`, never Neon).
- `npm run e2e`: 4 Playwright tests passed (own DB `pharmalink_e2e` on :5433).
- `npm audit`: 0 vulnerabilities.

## Simulated

- Delivery tracking (labelled "Simulated tracking"), emails (written to `logs/mail.log` in development).

## Optional

- Map tiles (`VITE_MAP_TILE_URL`, currently empty).

## Not done yet

- Phase 7 onward (see above). Doctor, pharmacy and staff dashboards do not exist yet (Phase 8).
- Optional TOTP for professionals (Phase 11) is not started.
