-- "Who looked at my data" log and the pharmacy's reply to a review.
-- New table, new nullable columns, and ONE existing check constraint on reports.target_type (added last week, no data
-- depends on it) is replaced by a wider one that also allows 'review_reply'. Nothing is dropped or rewritten.

-- Every time someone other than the patient opens the patient's data. One row per viewer, kind and item per hour
-- (a list that refreshes every 15 seconds does not fill the log). Kept 12 months, then deleted by a job.
CREATE TABLE IF NOT EXISTS access_log (
  id bigserial PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES patients(user_id),
  viewer_user_id uuid NOT NULL REFERENCES users(id),
  viewer_role text NOT NULL CHECK (viewer_role IN ('pharmacy', 'doctor', 'staff')),
  viewer_label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('request', 'order', 'prescription', 'doctor', 'staff')),
  ref text NOT NULL DEFAULT '',
  bucket timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS access_log_once_per_hour ON access_log (patient_id, viewer_user_id, kind, ref, bucket);
CREATE INDEX IF NOT EXISTS access_log_patient ON access_log (patient_id, id DESC);
CREATE INDEX IF NOT EXISTS access_log_age ON access_log (created_at);

-- The pharmacy's reply to a review (one per review). "reply_hidden" is set by staff moderation.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply text CHECK (reply IS NULL OR char_length(reply) BETWEEN 1 AND 300);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_at timestamptz;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_hidden boolean NOT NULL DEFAULT false;

-- A reply can be reported like a review or a message.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'reports'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%target_type%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE reports DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IS NULL OR target_type IN ('message', 'review', 'review_reply'));
END $$;
