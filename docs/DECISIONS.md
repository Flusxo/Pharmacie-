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

## How it works walkthrough (add-on Part B)

- **One source of truth** (`frontend/src/lib/flow.ts`): for a scroll progress 0–5 it says which object travels on which link (patient → counter. → only the chosen pharmacy, answer back, payment after acceptance, delivery), the 30-minute countdown, the box being prepared and how far the status tracker is. The SVG diagram and the 3D scene both draw from it, so they cannot disagree.
- **3D with an exact overlay**: the 3D version uses an orthographic camera fitted to the SVG's 600 × 280 box (new `ortho` option of `Scene3D`), so the HTML/SVG labels and the tracker stay crisp and line up with the 3D nodes. The SVG drawing is the fallback and is what Graphics Off / Low / no WebGL users see.
- **Scroll mechanics**: framer-motion `useScroll` on the list of steps (trigger line at 60 % of the viewport); the steps stay a real `<ol>` for screen readers and keyboard users, the stage is `position: sticky` (pinned on phones under the top bar). Reduced motion: each step shows its end state, nothing travels.

## 3D on every public page (add-on Part C / C2)

- **Shared scene manager**: one canvas (`three/PageScene.tsx`) fixed behind the public site and kept mounted across client-side navigation; each route maps to a composition (`three/compositions.ts`: home, how, patients, pharmacies, doctors, about, contact, faq, legal, auth). On a page change the old composition shrinks away and the new one grows in — no WebGL re-initialisation. Shared procedural models and textures (`three/models.tsx`), so pages cost no downloads.
- **Interaction**: page scroll moves the camera down (items at the sides further down appear), spins / drifts items and pulls capsule halves apart over the first screen; pointer and phone tilt (deviceorientation where the browser allows it without a prompt; iOS keeps scroll + pointer) give eased parallax.
- **Login / sign-up**: richer composition (labelled amber and pill bottles, blister, split capsules, tablets, green cross) placed under the heading so text stays clear; forms are glass panels and usable before the 3D loads (tested).
- **After login**: the existing calmer background (`BackgroundScene`) stays.
- **Performance choices**: the full-screen layer never runs post-processing (ambient occlusion on a full viewport would cost the 60 fps target); High still gets glass transmission on the models; DPR ≤ 1.5; pauses off-screen; Auto keeps the existing frame-rate guard and software-GPU → Low rule. On phones only one canvas draws (the How it works diagram wins over the background there).
- **Fallbacks**: the page's still illustration (`HeroArt`) stays in place and fades out only once the 3D layer has drawn its first frame; Graphics Off / Low, no WebGL or a WebGL error keep the illustration (tested).
- **Not done here**: a pinned image scrollytelling section on the public Home comes with the rendered pictures (Part D).

## Pictures (add-on Part D renders)

- **Our own renders only**: a dev-only `/render` page (absent from production builds) draws one shot of `render/library.ts`; `npm run render` reads the canvas pixels (`preserveDrawingBuffer` + `toDataURL` — a page screenshot of a huge software canvas stalls the compositor), then sharp writes AVIF at 3–4 widths, one WebP fallback and a 24 px blur placeholder. Camera auto-framing (bounding box + `fit`) so every shot is framed consistently. Gradient backgrounds are drawn inside the scene so ambient occlusion and bloom keep them; cut-outs have no post-processing so their alpha stays clean.
- **GPU when available**: headless Chromium uses the GPU through ANGLE (Direct3D 11 here: 24 shots in ~9 min, ~11 s each); `RENDER_GL=swiftshader` renders the same in software (~10 min per 3840 px shot).
- **Weight**: the whole library is 1.5 MB (a 3840 px hero is 35 kB in AVIF): smooth gradients and clean 3D compress very well. Committed to git so a fresh clone shows them without rendering.
- **`<Picture>`**: AVIF srcset + WebP fallback, `loading="lazy"`, explicit width/height (no layout shift), blur-up placeholder, fade-in; effects with transform/opacity only (slow zoom, hover tilt, scroll parallax, float), all off with reduced motion; unknown/missing picture renders nothing.
- **Use**: a pinned picture story on the public Home (picture stays, captions scroll), captioned parallax bands and galleries on every public page, floating cut-outs (contact, FAQ, legal), cut-outs in two app empty states.
- **Known limit**: ACES tone mapping greys the gradient backgrounds a little (they look softer than their CSS colours).

## Persistent 3D stage and quality governor (task "3D appears and disappears", 2026-10-22)

- **Causes found in the code**: (1) in Auto, any canvas under 30 fps for just 2 s stepped the tier down; two dips (a route change, a heavy page load, a tab coming back from the background) reached Low, which switches every 3D element off until the setting changes — this is what made the 3D vanish on an integrated GPU; (2) the public site and the app each had their own background canvas, destroyed and rebuilt when crossing between them (blank flash, assets reloaded); (3) on phones the background canvas was unmounted (not paused) whenever a page viewer took the single slot, and rebuilt when leaving; (4) no WebGL context-loss handling; hidden-tab time counted as "slow".
- **One root stage** (`RootStage` in `components/three/ThreeVisuals.tsx`): mounted once in `App`, inside the router but outside the routes and layouts, so navigation never unmounts it. The route selects a composition (`compositionFor`, whole path segments: "/doctors" is not "/doctor"); the old composition shrinks away while the new one grows in. Public pages, login/sign-up and every app page (home, search, details, map, requests, tracking, account, pharmacy, doctor, admin) have their own composition; the patient home hero is now drawn by the root stage too (no second heavy canvas). Inline viewers (product viewer, How-it-works diagram, delivery, shelf, check, 404 capsule) keep their own small canvas: at most two canvases at once. On phones the root stage pauses (keeps its last frame) when a viewer takes the slot. While it draws, `<html data-stage="3d">` lets the pages hide their still pictures.
- **Tier governor with hysteresis** (`lib/tierGovernor.ts`, unit-tested): fed one frame-rate sample per second by the root canvas (frames longer than 250 ms reset the window, 3 s warm-up, nothing while the tab is hidden); High → Medium only after 6 s in a row under 24 fps; Medium → Low only when under 12 fps for 12 s (truly unusable); back up only after 90 s above 52 fps, never above the starting tier; at most one change per minute.
- **Context loss**: `webglcontextlost` is prevented (the canvas fades to its fallback), `webglcontextrestored` brings it back without a reload; hidden tab → the loop stops and resumes by itself.
- **Assets kept in memory**: the root canvas never unmounts, so the texture cache and the HDR stay loaded for the whole visit.
- **Detail and look**: procedural micro-surface normal + roughness maps on plastics, embossed brand names on cartons (normal map from the drawing), screw threads on bottle necks, 4096 px labels on High, a 1024 × 512 HDR with more softboxes, labels fitted on up to 3 lines with an Rx mark. High adds bloom on real highlights, a soft vignette and film grain; depth of field and ambient occlusion are not used on the full-screen layer (they blurred and greyed it, and cost too much). Medium uses tinted transparent glass instead of the transmission pass (which re-renders the scene) and renders the full-screen layer at 0.8× resolution (behind glass panels and fog the difference is not visible).
- **Set pieces**: pharmacy interior (baked lighting painted into the floor/wall textures + Lambert shelves with one instanced mesh for all boxes, lit cross sign with a green light), light beams with drifting dust, delivery route with light pulses and a riding scooter.
- **API docs**: `/api/docs` and `/api/openapi.json` exist only outside production (tested); the footer "API" links are removed.

## Performance, glass, lighter palette, live stories (2026-10-23)

**Why the hosted site was slow (measured on the production build, see docs/PERF.md).** One main-thread freeze of 4 to 9 seconds while the 3D started: three.js linked 27 different shader programs one after the other (about 100-150 ms each on an integrated GPU, and ANGLE/Direct3D compiles lazily at the first draw), plus 4096 px label textures, procedural normal maps rebuilt on every material, and a 551 KB main script holding every page. Nothing else was close.

- **Shader programs 27 → 11.** On Medium the background uses plain standard materials (`setMaterialDetail('lite')`); the product viewers and High keep the full physical materials (clear coat, sheen, transmission). Identical plastics share one material (cache); procedural textures are generated once (the cache was checked after the random arrays were built).
- **Shaders compile before the first frame and without blocking:** `compileAsync` (parallel shader compile), after the environment map is applied (compiling before it would have compiled everything twice). `checkShaderErrors` is off in production.
- **The page first, the 3D after:** the 3D chunk starts only when the page has loaded and the browser is idle (`useAfterIdle`). Route-level code splitting: main script 551 → 272 KB; post-processing (High only) is its own chunk. Pages wait inside the layout (header and footer stay), with a skeleton: no flash, no layout shift.
- **Start tier is Medium on every device** (it was High on a strong desktop). The governor may climb to High only on a strong desktop GPU (not mobile, not integrated, 8 GB+, 6+ cores) after 90 s above 52 fps; it falls to Low (still images) only under 18 fps for 10 s. Phones start on Medium with a lower resolution: **not** Low, because Low means no 3D at all and the site is meant to have 3D on phones too; if a phone cannot sustain it, the governor takes it to Low by itself.
- **Dynamic resolution** (drei PerformanceMonitor on the root canvas): 0.6 to 1.0 of the screen ratio on Medium (0.8 max on touch screens), 1 to 1.5 on High, up to 2 only on "High (4K)". It lowers when frames fall under 42 fps and rises again with headroom.
- **Instancing:** the decorative capsules and tablets of a page are one `field` item: three draw calls whatever their number. Story objects are hidden (not drawn) until their step is read.
- **Network:** `_headers` (Cloudflare Pages): hashed files cached for a year, rendered pictures and the HDR a week. The backend is woken as the site opens (`warmUp`); the "waking up" banner shows after 1.5 s (was 4 s); public catalogue GETs are cached for 20 s and shared when identical; GETs are retried quietly on 502/503/504.

**4K / 8K, honestly.** Live 3D at true 8K is not possible on normal devices and is not offered. What exists: the render resolution follows the screen's pixel ratio (so a 4K screen is sharp) and drops dynamically when the GPU is late; the single hero object (the product viewer) uses 4096 px label textures on High, everything else 2048 px; pre-rendered hero pictures stay at 3840 px with a responsive srcset (7680 px came back blank on an integrated GPU and is not produced; the render script now refuses blank pictures); an account option "High (4K)" lets a strong GPU use a pixel ratio up to 2.

**Frosted glass for every panel** (`styles/glass.css`, loaded last): one set of tokens and one rule for top bar, tab bar, cards, forms, sheets, menus, toasts, in both themes: translucent tint, blur 18 px with saturation 1.6 (12 px on touch screens), light edge, soft top highlight, gentle shadow. A panel inside a panel is a tint without blur (one blur layer is enough); wide tables have none. `html[data-glass="flat"]` (Low/Off tier, or the render resolution had to drop twice, or the OS asks for less transparency) turns every panel into a nearly opaque tint with no blur. Contrast test unchanged and green.

**Colours, slightly lighter (dark theme only; the light theme is unchanged).** The same teal and green identity, one notch up: page `#061a1f → #0b2a31`, panels `#0b252b → #123740`, second surface `#10323a → #19464f`, glass tint from 72 % to 56 to 74 % of a lighter teal, lines `#1c434b → #2a5961`, muted text `#92b3b2 → #a1c1c0`, glow blobs a little stronger. 3D: fog `#0b2a31`, dark exposure 0.85 → 0.95, environment 0.6 → 0.75, ambient 0.3 → 0.4, so the objects still stand out. Before/after screenshots: docs/screenshots/design/.

**One soft light instead of cones.** The separate cone shapes with dust looked stuck on. They are replaced by ONE large glow glued to the camera (teal-white from above, two big blurred colour blobs, fine dust across the whole view); it fades in per page (`light` in the composition): home, login, sign-up, password pages, pharmacies, pharmacy dashboard.

**Live scroll stories replace the framed pictures.** The steps of each explanation (home 3, patients 4, pharmacies 4, doctors 4) are text cards with one 3D object (or a small group) per step on the persistent canvas: it flies in, turns and its capsule halves close while the step crosses the middle of the screen, then flies out as the next arrives. Scroll position is read from the DOM with IntersectionObserver into a plain object, not React state. Without live 3D each step shows a transparent cut-out beside its card. The "all shapes, all colours" gallery, the captioned bands and every opaque (framed) picture were deleted with their translations, CSS, render shots and files; a test fails if they come back.

**The hero is the real scene from the first frame.** The flat icon art (a plain sphere) is gone. A still of the same objects with the stage's own camera is rendered per page (`hero-<page>`, landscape and portrait) and shown from the first frame, also when the 3D is off; the live canvas fades in over it.

**Counters** show the real number from the start and replay a short count-up when scrolled into view (never a stuck 0; a timer snaps to the final value if frames are late).

**Materials.** The pill bottle label and body lost the sheen and the strong grain (they read as felt): printed paper is a plain standard material, the micro-normal is 3 times weaker, label textures use 16x anisotropy. The pharmacy bag is a proper kraft bag (folded rim, gusset creases, twisted handles, a sharp printed cross and wordmark). The scooter is rebuilt: floorboard, leg shield, rear cowl, seat, fork and fender, handlebar with mirrors and lamp, real wheels (tyre, rim, hub, spokes), a rear rack and a delivery box with the green cross.

## 2026-10-23 — Frosted glass on phones (iOS Safari)
- Every `backdrop-filter` now has its `-webkit-` twin. The mobile menu (`.pub-menu`), tour card and mobile auth hero join the shared glass list in `glass.css`; menus use the denser tint so links stay readable over page text.
- The Low tier no longer flattens glass on phones (coarse pointer or width < 768 px): they keep the 12 px blur and lose it only when the measured frame rate stays low (`fps` reason). Off still flattens everywhere.
- `_headers`: `/` and `/index.html` are `no-cache` (revalidated); hashed assets stay immutable. No service worker exists.
- Checked with Playwright WebKit (`scripts/webkit-glass.mjs`, screenshots in `docs/screenshots/glass-mobile`). Not checked: real iPhone hardware.

## 2026-10-26 — Private files, messages, reviews, slots
- **Files in Neon (owner's choice).** Table `private_files` (bytea), 2 MB per file, magic-byte check (JPEG, PNG, WebP, PDF), name cleaned, never served from a public link: `GET /api/files/:id` checks access in one function (`readFile`). A person without access gets "not found". Staff do not read prescriptions; staff read verification documents and each opening is audited. Deletion: expiry job every 10 min (48 h after the request or order ends, 30 days at most, with the account).
- **Reviews are visible at once** and moderated after the fact (report or staff list), not held back: a pharmacy cannot be unfairly hidden by a queue, and staff can hide any review with a reason. Authors are never named.
- **Slots:** 30-minute steps, computed on the server from the opening hours in Europe/Paris (an on-duty day is open all day), from 30 minutes ahead to 48 hours; the chosen time must be one the server offers. Delivery stays labelled "Simulated".
- **Messages** are text only, 500 characters, 100 per order, 10 a minute per person; the other side gets a neutral notification without the text; a message removed by moderation is shown as removed to both sides.

## 2026-10-26 — Family profiles, refill reminders, feature switches, weekly summary
- **Family members are labels, not accounts.** A first name and a relation, nothing else, so the pharmacy gets what it needs ("for Léa, child") and the service stores as little as possible about someone who never agreed to an account. They never log in and no one but the account holder and the chosen pharmacy sees them.
- **A reminder is a date.** No dose, no frequency, no "how long": the notice only says it may be time to renew and sends the person to a pharmacist or doctor. Only for medicines the person already requested.
- **Switches live in the database** (`app_settings`, 5 s cache) so an admin can react without a deployment. Off means: hidden in the screens, new actions refused with 503 `feature_off`, existing data readable. Every change is audited with a reason.
- **The weekly summary has no personal data and is announced, not emailed in full:** a staff admin gets one neutral notice on Monday morning pointing to the Statistics tab; the numbers themselves never leave the app.

## 2026-10-26 — Open text, one glass form, cursor effects
- **Text sits on the background, glass only holds things.** Headline, tagline and the three points of the login, sign-up and public pages have no box: a soft scrim (radial, fading to nothing at its own edges, so no hard seam) and a faint text halo keep them readable on the 3D background. Glass stays on the forms, important cards, dashboards, menus, modals and the top bar.
- **One type system** (`styles/type.css`): serif headline 700 (about 2.5 to 4.5 rem, tight leading), calm sans body, two weights per area, one accent colour, a spacing scale. Points use small icons, not bullets.
- **3D objects keep clear of the text.** Wide screens: lower-left band under the text and the right margin beside the form. Portrait screens: a separate list placed by screen position (`Item.screen`, pixels from the top) in the gap above the headline, so the placement holds at 768 and 390 px. Nothing sits behind the form.
- **Cursor effects use one pointer listener and one animation-frame loop** that sleeps when idle. Glow 210 px with a three-dot trail, letter spotlight on headlines only (letters are split only there), magnetic pull of at most 7 px on buttons and links, transform and opacity only. Off on touch, on the Low and Off tiers, with reduced motion, in a hidden tab and inside form fields.
- Screenshots (login, sign-up, home, patient dashboard; 1440/768/390; light/dark; fr/en; cursor over a headline and a button) are in `docs/screenshots/design`, made by `scripts/shots-auth.mjs`.
