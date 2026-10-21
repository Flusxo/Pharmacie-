# Progress

Tick a phase only when its checks pass (run and seen). **New session: read `CLAUDE.md`, then continue at "Next step" below.**

## Next step (where the last session stopped)

Working through the user's 7-step list (second session, 2026-10-21). Step 1 (Phase 8 dashboards + account pages) is done and committed.
Next, in order: **Step 2 map** (tiles from the user's `VITE_MAP_TILE_URL`, "no pharmacy in range" message, location fallback), **Step 3 site-wide 3D** (Phase 9), **Step 4 animations** (Phase 10), **Step 5 pack-label fix + design pass**, **Step 6 extras** (Phase 11), **Step 7 README + final checks** (Phase 12). Commit after each step only when build, lint and that step's tests pass.

How to run things: `npm run dev` (API :4000 + web :5173 on Neon), `npm test` (local PG :5433, never Neon), `npm run e2e` (own DB `pharmalink_e2e`, servers :4100/:5174/:5175, cleans up after itself).
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
- [x] Phase 7 — Map (`frontend/src/components/map/PharmacyMap.tsx`, lazy-loaded via `LazyMap.tsx`; `pages/patient/MapPage.tsx`)
  - Built per section 10: Leaflet 1.9 + react-leaflet 4; tiles ONLY from `VITE_MAP_TILE_URL` (no OSM/CARTO default anywhere); empty URL or failing tiles → in-map message "Map tiles are not configured. Set VITE_MAP_TILE_URL in .env. Pins still work." (French version in fr) with a Retry button, placed at the bottom of the map so it never blocks pins or popups; attribution "© MapTiler © OpenStreetMap contributors" always visible with links; green pins = in stock, grey = not; pulsing blue patient dot (not clickable, so it never hides a pin) + dashed radius ring; radius slider 1–30 km; list ↔ map sync (pin click highlights and scrolls the list item; list click flies the map and opens the popup); popup with name, address, distance, stock and "Choisir cette pharmacie" (opens the request sheet). Maps on: /map (with a medicine filter for stock mode), Medicine Details, Home "Autour de vous" mini map, Order tracking ("Suivi simulé": pharmacy, delivery address, simulated courier moving along the route while "out for delivery").
  - Verified by Playwright (`e2e/map.spec.ts`, 6 tests): no key → message + Retry + attribution, no request to any default tile server, radius 15 → 1 pharmacy / 30 → 4, pin ↔ list sync both ways; with a tile URL (stand-in host answered by Playwright) → tile requests return 200, tiles shown, no message; tiles failing with 403 ("invalid key") → message, pins still there; geolocation denied → explanation + address field, app keeps working; medicine details → green and grey pins, popup "Choisir" opens the request sheet; tracking page shows courier and delivery-address markers.
  - Verified by Vitest (`frontend/src/test/map.test.tsx`, 3 tests): exact fallback text, Retry, attribution text, pins rendered without tiles, no default tile server in the code.
  - Checked in the browser on the real dev server (Neon): /map shows the message, the radius ring, the pin and the list.
  - Fixes found while testing: the fallback message used to cover popups (clicks blocked); the patient dot used to sit on top of the nearest pharmacy pin; a sticky top bar could hide focused elements → `scroll-padding-top` added.
  - Test infrastructure: `npm run e2e` is now `scripts/e2e.ts` (starts DB + API + 2 frontends, runs Playwright, stops everything). The bundled PostgreSQL for tests is started/stopped with its own `pg_ctl` in a separate process (`db/scripts/test-pg.ts`, `db/src/pgctl.ts`), because the package's Windows stop force-kills and left an orphan holding port 5433.
  - NOT verified: a real MapTiler key (none available). Only a stand-in tile host was tested.
- [x] Phase 8 — Dashboards and account pages (user step 1)
  - Pharmacy `/pharmacy` (`pages/pharmacy/PharmacyDashboard.tsx`): Incoming requests (patient "First L.", stock per item, Rx and doctor badges, live countdown ring to the 30-min deadline, accept, refuse with optional reason, propose a generic), Current orders (only the valid next status is offered + cancel; "prescription checked" required before preparing an Rx order; approve/decline patient cancellation; show finished orders), Inventory (inline edit of quantity/price/threshold, add a medicine via search, low-stock filter, history per medicine, remove, CSV upload/paste with preview, per-row errors, apply only when error-free), Daily summary KPIs, "mark all out of stock" switch. Auto-refresh every 10–15 s.
  - Doctor `/doctor`: patients with confirmed/pending state (pending → masked email only; never an address), link by email, unlink, new request (confirmed patients only, medicine search, quantities, instructions, start from a template, save as template), templates list, request history.
  - Staff `/admin`: KPI cards, verification queue (approve / reject with required reason), users (search + role/status filters, suspend/reactivate with reason; staff accounts only for admins; never yourself), create staff (admin only), pharmacies, doctors, medicines (search, add/edit with image URL, soft-delete with reason), orders (status filter), reports (resolve with resolution), audit log, pharmacy performance. Buttons shown only when the staff role allows them (the API also enforces it).
  - Account page `/profile` ("Mon compte") for every role: identity (name, email, RPPS/speciality, pharmacy address, staff role, patient address), language, theme, Graphics quality (Auto/High/Medium/Low/Off, used by the 3D in step 3), Reduce animations, email notifications, change password, report a problem; patients also: doctor links, export my data, delete my account. Pending doctors/pharmacies see "En attente de validation". Notifications bell for every role. Real 404 page for unknown routes.
  - Verified by Playwright (`e2e/cycle.spec.ts`, 5 tests, real API + frontend): Alice requests Dafalgan → Pharmacie du Rhône (in a second browser window) sees "Alice M." with a countdown and accepts → Alice's request page shows "Voir la commande" → the pharmacy moves Preparing, Ready, Out for delivery, Delivered and Alice's tracking page updates to each status by itself; delivered orders have no more status buttons. Dr Martin sees Camille as "En attente de confirmation", no address on the page, only Alice and Bruno selectable, sends a request for Alice; the API refuses Camille (403). Support sees the queue but no "Valider" button. Pending Démo pharmacy sees the waiting screen → admin approves (audit row visible) → "Vérifier à nouveau" → its dashboard. Doctor and pharmacy have the bell and an account page with Graphics quality and Reduce animations; unknown route → "Page introuvable".
- [ ] Phase 9 — Images and 3D (+ the separate 3D/animation brief: Scene3D, quality tiers, product viewer, hero, scenes, motion system)
- [ ] Phase 10 — Design and animation polish
- [ ] Phase 11 — Extras
- [ ] Phase 12 — Quality and documentation

## Last check results (2026-10-21, after Phase 8 / step 1)

- `npm run build`: exit 0. `npm run lint`: exit 0.
- `npm test`: backend 95 + frontend 15 tests passed (local PG :5433, never Neon).
- `npm run e2e`: 15 Playwright tests passed (5 cycle + 6 map + 4 patient); test ports released afterwards.

## Known issues / To fix

Map (the user saw tiles or pins not showing):

- **Tiles**: with `VITE_MAP_TILE_URL` empty (current `.env`) there are NO tiles by design; the map shows a plain background plus the message "Le fond de carte n’est pas configuré… / Map tiles are not configured. Set VITE_MAP_TILE_URL in .env. Pins still work." To get tiles: put a MapTiler raster URL in the root `.env` (`https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=YOUR_KEY`, no `{s}`), then **restart `npm run dev`** (Vite reads `.env` only at startup). A real MapTiler key has never been tested (none available). If tiles still fail with a key, the same message appears after the first failed tile: check the key, its "Allowed HTTP origins" (must include `http://localhost:5173`), and the browser Network tab for 403/401.
- **Pins**: pins come from the API. If none show: (1) the API is not running or the database is unreachable (check `http://localhost:5173/api/health`); (2) the location used is far from the demo pharmacies (all near Tournon / Valence / Romans / Lyon / Vienne) — check "Position utilisée" and the radius (Home uses 25 km, /map starts at 15 km, max 30); (3) the user is not logged in as a patient. Not reproduced in my checks: pins showed on /map, details and home.
- The Home mini map has no list sync and no radius control (by design: it links to /map).

Other known issues:

- PackImage (generated pack drawings): some labels overlap the green cross (syrup/"Hélicidine") or are slightly clipped (inhaler dosage); the pen drawing is rough. To polish in Phase 9.
- Phases 9 (3D), 10 (animations: confetti on delivery, page transitions, etc.), 11 (printable order slip, onboarding tour, optional TOTP) and 12 (README, final docs, full acceptance checklist) are not done.
- No README yet (Phase 12) — setup instructions live in `CLAUDE.md` for now.
- The seeded incoming request (Bruno → Tournon) expires 30 minutes after `npm run db:reset` (the expiry job runs every minute while the API runs). Re-run `npm run db:reset` before a demo.
- Search: "para" also matches "paraffine" (Dexeryl) as a lower-ranked substring result. Paracetamol results come first; acceptable but could be tightened.
- The JWT is stored in `localStorage` (simple for a prototype; an httpOnly cookie would be safer against XSS).
- `npm run dev` port checks and process names were tested on Windows only.

### Reported by the user (to fill in next session)

Reported on 2026-10-21 (second session), to be fixed in this order:

1. Doctor, pharmacy and staff accounts log in but land on "page not found". There is no account page. → Step 1 (Phase 8 dashboards + Account page for every role).
2. The map has no tiles (`VITE_MAP_TILE_URL` is empty; the user will paste a MapTiler address into `.env` and restart). → Step 2.
3. There is no big 3D anywhere (not on the whole site background) and no animations. → Steps 3 and 4.
4. Some generated pack drawings have clipped labels. → Step 5.

Note: the user referred to "section 11b of claude_code_master_prompt.md"; that file is not in the repository, so the 3D work follows section 11 of the master prompt plus the separate 3D/animation brief (quality tiers, fallbacks, lazy loading, screenshots).

## Simulated

- Delivery tracking (labelled "Simulated tracking"), emails (written to `logs/mail.log` in development).

## Optional

- Map tiles (`VITE_MAP_TILE_URL`, currently empty).

## Not done yet

- Steps 2–7 of the user's list (see Next step).
- Optional TOTP for professionals (Phase 11) is not started.
