-- Team accounts inside a pharmacy (the owner invites a pharmacist or an assistant) and a per-pharmacy activity log.
-- Additive only: no existing row or column changes. Members are ordinary users with role 'pharmacy' plus a row here.
CREATE TABLE IF NOT EXISTS pharmacy_members (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(user_id),
  member_role text NOT NULL CHECK (member_role IN ('pharmacist', 'assistant')),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pharmacy_members_pharmacy ON pharmacy_members (pharmacy_id);

CREATE TABLE IF NOT EXISTS pharmacy_activity (
  id bigserial PRIMARY KEY,
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(user_id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  target text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pharmacy_activity_recent ON pharmacy_activity (pharmacy_id, id DESC);
