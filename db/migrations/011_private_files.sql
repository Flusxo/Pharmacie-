-- Private files kept in the database (no outside storage account): prescription photos or PDFs a patient attaches to a
-- request, and documents an applicant (doctor or pharmacy) sends for verification. Additive only.
-- Access is decided by the API (never by a public link): see backend/src/services/files.ts.
CREATE TABLE IF NOT EXISTS private_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('prescription', 'verification')),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  request_id uuid REFERENCES requests(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes int NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS private_files_owner ON private_files (owner_user_id, purpose);
CREATE INDEX IF NOT EXISTS private_files_request ON private_files (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS private_files_expiry ON private_files (expires_at);
