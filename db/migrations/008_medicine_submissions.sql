-- Pharmacies can propose medicines that are not in the catalogue yet. A proposal is "pending" (visible to the
-- pharmacy that made it and to staff only) until staff approve it. Additive only: existing rows stay "approved".
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES pharmacies(user_id);
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id);
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS review_note text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medicines_status_check') THEN
    ALTER TABLE medicines ADD CONSTRAINT medicines_status_check CHECK (status IN ('approved', 'pending', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS medicines_review_queue ON medicines (submitted_at) WHERE status = 'pending';
