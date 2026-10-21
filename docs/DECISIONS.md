# Decisions

Each entry: what was chosen and why.

## Infrastructure
- **Database route C (bundled PostgreSQL 16 via npm `embedded-postgres`)** is the default. The machine had neither Docker nor PostgreSQL; this package ships real PostgreSQL 16.14 binaries (with pgcrypto, unaccent, pg_trgm) so no system install is needed. It listens on **5433** (not 5432) so it never collides with a locally installed PostgreSQL. Routes A (Docker) and B (local install) still work by setting `EMBEDDED_PG=false`.
- `db:reset`, `dev` and `test` start the bundled server when nothing answers at `DATABASE_URL`; `db:reset` and `test` stop it again when they started it, `dev` keeps it for its lifetime.
- Backend tests use a separate database `pharmalink_test` on the same server, reset before the run.
- Deterministic seed: UUIDs derived from md5 of a key; bcrypt hash uses a fixed demo salt; inventory comes from a seeded PRNG. Timestamps are relative to "now" so expiry windows behave.
- Search normalisation via an IMMUTABLE `f_norm()` wrapper around `unaccent` so it can be indexed with trigram GIN.

## Domain
- **Substitution** happens at the request stage: while a request is `sent_to_pharmacy`, the chosen pharmacy may propose a generic for one item; the request moves to `awaiting_patient_approval`. Approving swaps the item and returns the request to `sent_to_pharmacy` (same pharmacy); declining keeps the original item.
- **Partial stock**: the options endpoint returns full-stock pharmacies first plus "partially available" ones with the missing items listed. Choosing a partial pharmacy requires `acceptPartial: true`; the missing items are marked `excluded` and are never prepared.
- **Cancellation**: patient cancels directly while the request is `received`/`sent_to_pharmacy`, and while the order is still `accepted`. From `preparing` onward the patient files a cancellation request (`cancel_requested_at`) that the pharmacy approves; cancelling returns the stock.
- **"Mark all out of stock" switch** = `pharmacies.paused`; a paused pharmacy is never proposed and cannot accept. Quantities are kept so switching back is lossless.
- **Response window** 30 minutes (`PHARMACY_RESPONSE_MINUTES`), **request expiry** 24 hours; a scheduled job runs every 60 s.
- **Shareable tracking link** uses a random token; it shows only status, pharmacy name/city and step times, and stops working 2 hours after delivery (or on cancellation).
- **On-duty** (pharmacie de garde) is stored as weekday keys on which the pharmacy is open 24 h.
- Medicine brand names in the seed are French-realistic (e.g. Doliprane) because the acceptance demo requires them. 3D shelf/background props use fictional brand names only.
