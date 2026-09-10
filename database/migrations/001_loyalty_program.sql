-- Run this once for an existing attendance database.
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  country VARCHAR(100) NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  last_earned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_last_earned_at ON customers(last_earned_at DESC);

CREATE TABLE IF NOT EXISTS loyalty_point_events (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 1,
  event_type VARCHAR(30) NOT NULL DEFAULT 'qr_scan',
  source_ip VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_events_customer ON loyalty_point_events(customer_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_customer_update ON customers;
CREATE TRIGGER trg_customer_update
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
