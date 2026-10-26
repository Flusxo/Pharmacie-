-- Short messages on an order, reviews from delivered orders, pickup time slots, and a link from a report to what it
-- reports. Additive only: new tables and nullable columns.

-- Text-only thread between the patient and the pharmacy of one order. "hidden_at" is set by staff moderation.
CREATE TABLE IF NOT EXISTS order_messages (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id),
  sender_role text NOT NULL CHECK (sender_role IN ('patient', 'pharmacy')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden_at timestamptz
);
CREATE INDEX IF NOT EXISTS order_messages_order ON order_messages (order_id, id);

-- One review per delivered order. "status" is visible or hidden (staff moderation).
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(user_id),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(user_id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 300),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_pharmacy ON reviews (pharmacy_id, created_at DESC) WHERE status = 'visible';

-- The pickup (or simulated delivery) time the patient chose once the order was accepted.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS slot_start timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS slot_mode text CHECK (slot_mode IS NULL OR slot_mode IN ('pickup', 'delivery'));

-- A report can point at a message or a review.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_type text CHECK (target_type IS NULL OR target_type IN ('message', 'review'));
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_id text;
