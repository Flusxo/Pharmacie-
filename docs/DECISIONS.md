# Decisions

Each entry: what was chosen and why.

## Infrastructure

- **2026-10-21: app database moved to hosted Neon** (user's choice). `pgConfig()` turns `sslmode=require|verify-ca|verify-full` into `ssl: { rejectUnauthorized: true }` and strips `sslmode`/`channel_binding` from the string so pg's own parsing does not override it. Hosted databases are never created or started by our scripts; we only wait up to 30 s and explain what to check.
- **Tests never use `DATABASE_URL`** (they wipe their DB). They use `TEST_DATABASE_URL`, default the bundled PostgreSQL 16 on `localhost:5433/pharmalink_test`; `testDatabaseUrl()` refuses to run if it equals `DATABASE_URL`.
- **Project moved** from the app's temporary folder to `C:\Users\Fujitsu\Documents\Pharmacie-app`: the temporary path was so long that git and PostgreSQL's `initdb.exe` hit the Windows 260-character limit.
- _(Superseded for the app DB by Neon, see above; still used for tests.)_ **Bundled PostgreSQL 16 via npm `embedded-postgres`**. The machine had neither Docker nor PostgreSQL; this package ships real PostgreSQL 16.14 binaries (with pgcrypto, unaccent, pg_trgm) so no system install is needed. It listens on **5433** (not 5432) so it never collides with a locally installed PostgreSQL. Routes A (Docker) and B (local install) still work by setting `EMBEDDED_PG=false`.
- `db:reset`, `dev` and `test` start the bundled server when nothing answers at `DATABASE_URL`; `db:reset` and `test` stop it again when they started it, `dev` keeps it for its lifetime.
- Backend tests use a separate database `pharmalink_test` on the same server, reset before the run.
- Deterministic seed: UUIDs derived from md5 of a key; bcrypt hash uses a fixed demo salt; inventory comes from a seeded PRNG. Timestamps are relative to "now" so expiry windows behave.
- Search normalisation via an IMMUTABLE `f_norm()` wrapper around `unaccent` so it can be indexed with trigram GIN.

## Domain

- **Doctor patient list**: confirmed links show name and birth date (never address/phone); pending links show only a masked email. A doctor's request history disappears from the doctor's view if the link is removed.
- **Pharmacy prescription confirmation** is an explicit `prescriptionChecked: true` flag, required to move an order containing a prescription item to "preparing".
- **Account deletion** is refused while an order is in progress; otherwise personal fields are anonymised, links and notifications removed, open requests cancelled, orders kept without personal data, share links disabled.
- **Concurrency**: accept locks the request row (`FOR UPDATE`), then each inventory row in medicine-id order (avoids deadlocks). Identical requests from one patient are serialised with `pg_advisory_xact_lock` before the 2-minute idempotency check.
- **CSV stock upload**: header `cip13,quantity,price_eur[,low_stock_threshold]`, comma or semicolon (semicolon allows decimal commas, as French Excel exports). Applying is all-or-nothing and refused while any row has an error.
- **Login lockout** returns the same generic "Invalid email or password." message as any other failure, so the response never reveals whether an account exists or is locked.

- **Substitution** happens at the request stage: while a request is `sent_to_pharmacy`, the chosen pharmacy may propose a generic for one item; the request moves to `awaiting_patient_approval`. Approving swaps the item and returns the request to `sent_to_pharmacy` (same pharmacy); declining keeps the original item.
- **Partial stock**: the options endpoint returns full-stock pharmacies first plus "partially available" ones with the missing items listed. Choosing a partial pharmacy requires `acceptPartial: true`; the missing items are marked `excluded` and are never prepared.
- **Cancellation**: patient cancels directly while the request is `received`/`sent_to_pharmacy`, and while the order is still `accepted`. From `preparing` onward the patient files a cancellation request (`cancel_requested_at`) that the pharmacy approves; cancelling returns the stock.
- **"Mark all out of stock" switch** = `pharmacies.paused`; a paused pharmacy is never proposed and cannot accept. Quantities are kept so switching back is lossless.
- **Response window** 30 minutes (`PHARMACY_RESPONSE_MINUTES`), **request expiry** 24 hours; a scheduled job runs every 60 s.
- **Shareable tracking link** uses a random token; it shows only status, pharmacy name/city and step times, and stops working 2 hours after delivery (or on cancellation).
- **On-duty** (pharmacie de garde) is stored as weekday keys on which the pharmacy is open 24 h.
- Medicine brand names in the seed are French-realistic (e.g. Doliprane) because the acceptance demo requires them. 3D shelf/background props use fictional brand names only.

## Frontend (Phase 6)

- **React Router 7.18** instead of 6.x: 6.x has two published advisories (open redirect, SSR deserialisation); 7 still supports React 18.
- **One React copy**: React 18.3.1 is pinned at the workspace root as well, because peer dependencies had hoisted React 19 and the app crashed with "Invalid hook call".
- **Plain CSS variables** (allowed by the brief) rather than Tailwind: one stylesheet `frontend/src/styles/app.css` with the section-12 tokens, dark theme via `data-theme`.
- **Fonts bundled locally** (`@fontsource-variable/fraunces`, `inter`), never loaded from a CDN at runtime.
- **Location**: saved patient address first, then device geolocation (session only) or a BAN address/postcode; default Tournon-sur-Rhône so the app is never blocked.
- **Request flow** creates the request and immediately sends it to the chosen pharmacy (two API calls). If the second call fails (stock changed), the request stays "received" and the patient can choose another pharmacy from the request page.
- **Demo accounts panel** and the demo password exist only in development builds (`import.meta.env.DEV`); the production bundle is checked to contain neither.
- **E2E isolation**: Playwright starts its own API (:4100) and frontend (:5174) on a fresh local database `pharmalink_e2e`, so it never touches Neon or a running `npm run dev`.

## Map and test infrastructure (Phase 7)

- **Leaflet is lazy-loaded** (`LazyMap`), so the first page does not download it (separate ~158 kB chunk).
- **Fallback message at the bottom of the map** with `pointer-events: none` except on Retry, so it never blocks pins or popups. The attribution control is always added, even without tiles.
- **Tile test without a real key**: e2e runs a second frontend (:5175) with `VITE_MAP_TILE_URL=https://tiles.e2e.test/{z}/{x}/{y}.png`; Playwright answers that host with a PNG (200) or a 403. A real MapTiler key is not tested.
- **Simulated courier**: moves in a straight line from the pharmacy to the patient over 8 minutes after "out for delivery", stops at 95 % until "delivered". No real routing.
- **Test PostgreSQL via pg_ctl** in a separate process: embedded-postgres stops with `taskkill /f /t` on Windows (orphaned helpers kept port 5433 open) and registers exit hooks that delayed Vitest by 10 s.

## Map (user step 2)

- **Bare MapTiler key accepted** in `VITE_MAP_TILE_URL`: the user pasted only the key; expanding it to MapTiler's streets-v2 raster URL keeps "tiles only from VITE_MAP_TILE_URL" and "MapTiler only", and avoids a confusing failure.
- **Tile status probe**: one `fetch` of the tile under the map centre, because MapTiler answers a bad key with 403 + a PNG that Leaflet treats as loaded.
- **E2E env isolation** via `FRONTEND_ENV_DIR` (Windows drops empty env vars, so overriding with "" does not work).

## 3D layer (user step 3 / Phase 9)

- **Versions**: three 0.172 + @react-three/fiber 8.18 + drei 9.122 + @react-three/postprocessing 2.19 (the React-18 line; Fiber 9 needs React 19). `@types/three` pinned to 0.172 at the root because a drei dependency pulled 0.186 and the types clashed; Vite dedupes `three`.
- **Lazy loading**: all three.js code is in lazy chunks (`src/three/*`), loaded only when a 3D slot draws; the main bundle contains no three.js (checked: no `WebGLRenderer` string in `index-*.js`) and Playwright checks that the login page requests no scene chunk.
- **No downloaded assets**: models are procedural (Lathe/Extrude/RoundedBox/Capsule/Tube), textures are drawn on canvas, the HDR is generated by `scripts/make-hdr.mjs`. See `docs/ASSETS.md`.
- **Quality tiers** (`src/lib/graphics.tsx`): Auto picks High / Medium / Low from WebGL2, device memory, CPU cores and mobile; a **software rasteriser** (SwiftShader, llvmpipe) counts as Low in Auto, because it made pages unresponsive in tests. In Auto, a canvas under 30 fps for 2 s steps the tier down; an explicit choice in "Mon compte → Qualité graphique" is never overridden. Low/Off = no canvas (static gradient, poster, SVG pack images).
- **Reduced motion** (OS or the "Reduce animations" switch) keeps 3D but renders ONE still frame (`frameloop="demand"`), no auto-rotation, no float, no confetti, no 360° hint.
- **Background** is deliberately cheap: DPR 1, no shadows, no post-processing, no transmission pass (glass look from clearcoat + transparency), capped at 30 fps, paused while the full-screen home hero is visible, objects kept to the sides so content stays readable, plus a CSS readability veil.
- **One heavy canvas on mobile**: canvases claim a slot with a priority; on mobile only the highest-priority mounted one draws (viewer/hero > background).
- **Post-processing (High only)**: N8AO ambient occlusion, subtle bloom, vignette, ACES tone mapping in the composer; depth of field only in the hero (focus on the counter, shelf blurred).
- **Labels**: wrap labels are front arcs (~126°) so the 2:1 canvas keeps its proportions; canvas text waits for the Inter font; text auto-fits (never cropped).
- **Fonts before labels**: scenes mount only after `document.fonts` has loaded Inter (max 3 s wait), so labels never fall back to Arial.
- **3D map toggle (MapLibre)**: not added. It needs vector tiles with building heights from the tile provider; only a raster `VITE_MAP_TILE_URL` is configured, so the toggle is hidden and the Leaflet 2D map stays (as the brief allows).
- **Catalog-card hover previews**: not added (would mount many canvases on the search page); the product viewer on the details page is the 3D entry point.
- **Global loader**: a CSS capsule (2D) rather than a 3D one: loading a 1 MB 3D chunk just to show a loader would defeat its purpose. The 3D spinning capsule is used on the 404 page; the 3D drawn check (with SVG fallback) is used when a request is sent.

## Animations (user step 4 / Phase 10)

- **framer-motion 11 through `LazyMotion`** (`m` components, features loaded lazily, strict mode) so the main bundle stays small; shared tokens in `src/motion.ts`, mirrored as CSS variables.
- **Page transitions are entrance-only**: `AnimatePresence mode="wait"` around `useOutlet` re-rendered the leaving page with the new URL (empty search, lost clicks). An exit animation is not worth that bug.
- **Reveal stagger by column** (`index % 4`): on a one-column phone layout an index-based delay made the 10th card wait 0.6 s.

## Pack labels and design pass (user step 5)

- **Label fitting** (`lib/labelFit.ts`): explicit label box per pack form; greedy wrap (name ≤ 3 lines, dosage ≤ 2), shrink in 0.5 steps until width and height fit. Width = real canvas measurement (+4 %) once Inter is loaded, otherwise a conservative per-character estimate; never cut, never ellipsised.
- **Tab bar below 960 px** (was 768): the patient top nav does not fit at tablet width with the language, theme, bell and sign-out controls.
- **Design sweep script** (`scripts/design-sweep.mjs`): scrolled viewport frames instead of full-page captures, because full-page screenshots stretch `100vh` sticky sections and never trigger reveal-on-scroll.

## Extras (user step 6 / Phase 11)

- **Two-step verification (TOTP, RFC 6238)** for doctor, pharmacy and staff accounts only (optional; patients get 403). Implemented with Node `crypto` (HMAC-SHA1, 6 digits, 30 s, ±1 step); no backend dependency. The secret is stored AES-256-GCM encrypted with a key derived from `JWT_SECRET` (changing `JWT_SECRET` therefore invalidates enrolled apps; acceptable for a prototype, a production system would use a dedicated key / KMS). A code is accepted once (`totp_last_step`), wrong codes count towards the 5-failure lockout, a wrong password always gets the generic message. Disabling needs the password and a current code. No recovery codes (documented as not done): an admin cannot reset it yet either.
- **QR code**: `qrcode-generator` (MIT, no dependencies) loaded lazily only on the setup screen, drawn as SVG rectangles (no HTML injection). The key is also shown in groups of 4 and as an `otpauth://` link for phones.
- **Printable order slip** at `/orders/:id/print` for the patient (own order) and the pharmacy (`GET /api/pharmacy/orders/:id`, its own orders only, patient as "First L.", no address or coordinates). Print CSS hides the app chrome; the slip carries its own "prototype, no official value" line, so the printed page still says it is a demo.
- **Onboarding tour**: 3 non-blocking steps (no backdrop) pointing at the real search box, map and requests links (`data-tour` attributes, the visible one in top bar or tab bar). Shown once per browser (`localStorage`, a per-viewer convenience); "Replay the guided tour" in the account page. E2E fixtures mark it done; `extras.spec.ts` tests it on its own.

## Languages (add-on Part G, first half)

- **Order of the add-on**: the language work of Part G was done first, before Part A, because the public site adds hundreds of strings and they go straight into the new setup.
- **What was actually broken**: switching FR/EN did re-render the UI text, but everything that came from the server stayed in one language: notification texts (built in English), API error and validation messages (English), medicine descriptions and age notes (French only), doctor specialities, CSV row errors, 3D canvas labels (French aria labels, "démo" on labels). The choice was also only stored in the browser.
- **i18next + react-i18next** with flat `locales/fr.json` / `en.json` (531+ keys, dots are part of the key, `{name}` placeholders). One i18next instance per provider (tests can force a language); `useI18n()` keeps its old shape so components did not change. French is the default; the saved choice (browser) or the account language wins.
- **Account language** (`users.language`, migration 004): set at sign-up from the page language, changed by the top-bar switch or the account page (PATCH `/auth/me/preferences`), applied when a session starts. Emails use it.
- **API in the reader's language**: the web app sends `Accept-Language`; a middleware translates the `error` / `message` of every JSON answer, the error handler translates zod issues (our messages via the catalogue, zod's own via its French locale) and field names. Messages stay written in English in the code; `backend/src/i18n/messages.ts` holds the French templates, matched with their variable parts. API clients without the header get English (unchanged for curl and the tests). Notifications are stored in English and translated when read, so the bell follows the current UI language.
- **Completeness checks**: `backend/test/i18n.test.ts` scans the backend source for every user-facing message (errors, notifications, validation, row errors, email subjects) and fails if one has no French version or different placeholders. `frontend/src/test/i18n.test.tsx` fails on a key missing in one file, different placeholders, or literal text / labels in TSX (allow-list: brand, language names, codes such as Rx, CIP13).
- **Medicine data**: `description_en` / `age_note_en` (migration 004), seeded for the 50 demo medicines; migration 005 fills them on databases seeded earlier (only empty values). Names are brand names (same in both), categories and forms are codes translated by the app. Staff can edit both languages.
- **3D labels**: the small print on pack labels comes from the language (module `three/labelFooter.ts`, kept apart from three.js so the main bundle stays three-free); labelled scenes remount on a language change so their textures are redrawn.

## Public website (add-on Part A) and palette (Part D, colours)

- **Palette**: lighter aqua / teal / mint page gradient (`--page-bg`), teal-green brand `#0b6b5d`, green accent; dark theme in deep teal-navy. `frontend/src/test/contrast.test.ts` computes WCAG contrast from the CSS tokens: text, muted text and links ≥ 4.5:1 on page, cards and tinted surfaces in both themes, and button text on the brand colour.
- **Routes**: `/` is now the public home for everyone (it used to redirect to /login); logged-in visitors see "My space" instead of "Log in". Public pages, login, sign-up and password reset share `PublicLayout` (prototype notice, top bar with the big "Log in" button and "Create account", footer). The app after login keeps its own layout.
- **Navigation**: full links from 1180 px; below, a menu button opens a panel (Escape closes it, it closes on navigation). On phones the "Log in" button always stays in the bar; language and theme move into the menu.
- **Copy**: honest prototype copy in both languages under `pub.*` (generated together so fr/en never diverge). Contact details are explicitly fictional (`.example` domain, "adresse fictive"). No invented team members. The hard-rule test forbids "panier" / "acheter" / "buy now" anywhere, so the copy says "nothing to order online" instead.
- **Contact form**: validated in the browser and by the API (zod), honeypot field, must confirm "no health data", rate limited (10 / hour / network), stored in `contact_messages` (migration 006, applied to Neon) with the page language; logs keep only a masked email. Staff see the messages in a new "Messages" tab (filter open / handled / all, "Mark as handled", audited) and an "open messages" KPI. No email is sent (prototype).
- **Still illustrations** (`components/public/HeroArt.tsx`, our own SVG): one per page; they are the hero visual until Part C adds the 3D scenes, and stay as the fallback afterwards.
