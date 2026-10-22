-- Payments (Stripe TEST MODE only). Card data never reaches this database: only Stripe ids, amount and status.
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  amount_cents int NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'captured', 'cancelled', 'refunded', 'failed', 'capture_failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Webhook events already handled (a Stripe event may be delivered more than once).
CREATE TABLE IF NOT EXISTS stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
