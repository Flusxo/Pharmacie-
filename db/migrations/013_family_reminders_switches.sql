-- Family profiles, refill reminders and feature switches. Additive only: new tables and one nullable column.

-- People an account can make requests for (a child, a parent). Only a first name and the relation are kept: no last name,
-- no birth date, no address. "deleted_at" hides a person from the lists; past requests keep their label.
CREATE TABLE IF NOT EXISTS family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES patients(user_id),
  first_name text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 40),
  relation text NOT NULL CHECK (relation IN ('child', 'parent', 'partner', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS family_members_account ON family_members (account_id) WHERE deleted_at IS NULL;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS for_member_id uuid REFERENCES family_members(id);

-- "Remind me to renew this medicine": one notice at the chosen date (a date, never a dose or a schedule).
CREATE TABLE IF NOT EXISTS refill_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(user_id),
  medicine_id uuid NOT NULL REFERENCES medicines(id),
  for_member_id uuid REFERENCES family_members(id),
  remind_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS refill_reminders_due ON refill_reminders (remind_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS refill_reminders_patient ON refill_reminders (patient_id) WHERE sent_at IS NULL;

-- Settings staff can change without a new deployment (feature switches, the last weekly summary sent).
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
