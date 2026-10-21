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
