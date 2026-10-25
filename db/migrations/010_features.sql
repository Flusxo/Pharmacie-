-- Additive only: new columns with defaults and new tables. No existing row, column or table is changed or removed.

-- Pharmacy profile page: services, languages spoken, accessibility (lists of short codes, shown translated),
-- and a break: "paused_until" pauses the pharmacy until that time without a manual switch back.
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS services jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS languages jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS accessibility jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS paused_until timestamptz;

-- Pickup: a short code (and its QR code) the patient shows at the counter; the pharmacist confirms in one tap.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_confirmed_at timestamptz;

-- "Notify me when it is back in stock": a patient follows a medicine; one row per patient and medicine.
CREATE TABLE IF NOT EXISTS stock_watches (
  patient_id uuid NOT NULL REFERENCES patients(user_id),
  medicine_id uuid NOT NULL REFERENCES medicines(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_notified_at timestamptz,
  PRIMARY KEY (patient_id, medicine_id)
);
CREATE INDEX IF NOT EXISTS stock_watches_medicine ON stock_watches (medicine_id);

-- Sessions: one row per login, so a person can see their devices and sign out of one or all of them.
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS user_sessions_user ON user_sessions (user_id) WHERE revoked_at IS NULL;
