-- 006: messages sent from the public Contact page, read by staff. Idempotent.
CREATE TABLE IF NOT EXISTS contact_messages (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  topic text NOT NULL CHECK (topic IN ('patient', 'pharmacy', 'doctor', 'press', 'other')),
  subject text NOT NULL,
  message text NOT NULL,
  language text NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'en')),
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz,
  handled_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS contact_messages_open ON contact_messages (created_at DESC) WHERE handled_at IS NULL;
