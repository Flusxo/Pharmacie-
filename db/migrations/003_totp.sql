-- 003: optional two-step verification (TOTP, RFC 6238) for professional accounts. Idempotent.
-- The secret is stored encrypted (AES-256-GCM, key derived from JWT_SECRET by the API), never in clear.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;
-- Last accepted 30-second step: a code can be used only once.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step bigint;
