-- 001: core schema. Idempotent: safe to run twice.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() is STABLE; an IMMUTABLE wrapper lets us index it.
CREATE OR REPLACE FUNCTION f_norm(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, $1)) $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'pharmacy', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE staff_role AS ENUM ('admin', 'support', 'moderator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE request_status AS ENUM ('received', 'sent_to_pharmacy', 'awaiting_patient_approval', 'accepted', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE request_source AS ENUM ('patient', 'doctor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE pharmacy_response AS ENUM ('pending', 'accepted', 'refused', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  status user_status NOT NULL DEFAULT 'active',
  failed_logins int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  email_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS patients (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date,
  phone text,
  address text,
  latitude double precision,
  longitude double precision
);

CREATE TABLE IF NOT EXISTS doctors (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  rpps text NOT NULL UNIQUE,
  speciality text NOT NULL DEFAULT 'Médecine générale',
  verified boolean NOT NULL DEFAULT false,
  rejection_reason text
);

CREATE TABLE IF NOT EXISTS pharmacies (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  name text NOT NULL,
  finess text NOT NULL UNIQUE,
  address text NOT NULL,
  city text NOT NULL DEFAULT '',
  phone text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  paused boolean NOT NULL DEFAULT false,
  rejection_reason text,
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  on_duty jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS staff (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  full_name text NOT NULL,
  staff_role staff_role NOT NULL
);

CREATE TABLE IF NOT EXISTS doctor_patients (
  doctor_id uuid NOT NULL REFERENCES doctors(user_id),
  patient_id uuid NOT NULL REFERENCES patients(user_id),
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, patient_id)
);

CREATE TABLE IF NOT EXISTS medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cip13 text NOT NULL UNIQUE CHECK (cip13 ~ '^[0-9]{13}$'),
  name text NOT NULL,
  active_substance text NOT NULL,
  form text NOT NULL,
  dosage text NOT NULL,
  category text NOT NULL,
  requires_prescription boolean NOT NULL DEFAULT false,
  image_url text,
  description text NOT NULL DEFAULT '',
  age_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS pharmacy_inventory (
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(user_id),
  medicine_id uuid NOT NULL REFERENCES medicines(id),
  quantity int NOT NULL CHECK (quantity >= 0),
  price_eur numeric(8,2) NOT NULL CHECK (price_eur >= 0),
  low_stock_threshold int NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pharmacy_id, medicine_id)
);

CREATE TABLE IF NOT EXISTS inventory_history (
  id bigserial PRIMARY KEY,
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(user_id),
  medicine_id uuid NOT NULL REFERENCES medicines(id),
  old_qty int,
  new_qty int NOT NULL,
  reason text NOT NULL DEFAULT 'manual',
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(user_id),
  doctor_id uuid REFERENCES doctors(user_id),
  source request_source NOT NULL,
  status request_status NOT NULL DEFAULT 'received',
  prescription_note text,
  instructions text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES requests(id),
  medicine_id uuid NOT NULL REFERENCES medicines(id),
  quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  excluded boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS request_pharmacies (
  request_id uuid NOT NULL REFERENCES requests(id),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(user_id),
  chosen_by_patient boolean NOT NULL DEFAULT true,
  response pharmacy_response NOT NULL DEFAULT 'pending',
  sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  refusal_reason text,
  PRIMARY KEY (request_id, pharmacy_id)
);

-- Substitution proposals (pharmacy proposes a generic, patient approves).
CREATE TABLE IF NOT EXISTS substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES requests(id),
  request_item_id uuid NOT NULL REFERENCES request_items(id),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(user_id),
  original_medicine_id uuid NOT NULL REFERENCES medicines(id),
  proposed_medicine_id uuid NOT NULL REFERENCES medicines(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES requests(id),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(user_id),
  patient_id uuid NOT NULL REFERENCES patients(user_id),
  status order_status NOT NULL DEFAULT 'accepted',
  cancel_requested_at timestamptz,
  share_token text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  status order_status NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  body text NOT NULL,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id bigserial PRIMARY KEY,
  reporter_user_id uuid NOT NULL REFERENCES users(id),
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  target text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE IF NOT EXISTS doctor_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES doctors(user_id),
  name text NOT NULL,
  items jsonb NOT NULL,
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS medicines_name_trgm ON medicines USING gin (f_norm(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS medicines_substance_trgm ON medicines USING gin (f_norm(active_substance) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS medicines_category ON medicines (category);
CREATE INDEX IF NOT EXISTS pharmacies_location ON pharmacies (latitude, longitude);
CREATE INDEX IF NOT EXISTS requests_status ON requests (status);
CREATE INDEX IF NOT EXISTS requests_patient ON requests (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_idem ON requests (patient_id, idempotency_key, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS orders_pharmacy ON orders (pharmacy_id, status);
CREATE INDEX IF NOT EXISTS orders_patient ON orders (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS request_pharmacies_pharmacy ON request_pharmacies (pharmacy_id, response);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_history_ph ON inventory_history (pharmacy_id, changed_at DESC);
