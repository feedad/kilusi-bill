-- Billing schema for PostgreSQL
-- Safe to run multiple times (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS packages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  speed_down_mbps INTEGER NOT NULL DEFAULT 0,
  speed_up_mbps INTEGER NOT NULL DEFAULT 0,
  price_idr NUMERIC(18,2) NOT NULL DEFAULT 0,
  radius_download_rate TEXT,
  radius_upload_rate TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nas_servers (
  id SERIAL PRIMARY KEY,
  shortname TEXT NOT NULL,
  nasname INET NOT NULL UNIQUE,
  secret TEXT NOT NULL,
  type TEXT DEFAULT 'other',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mikrotik_servers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  host INET NOT NULL UNIQUE,
  api_port INTEGER DEFAULT 8728,
  username TEXT,
  password TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT,
  phone TEXT,
  username TEXT UNIQUE,
  password TEXT,
  address TEXT,
  status TEXT DEFAULT 'active',
  package_id INTEGER REFERENCES packages(id) ON UPDATE CASCADE,
  nas_server_id INTEGER REFERENCES nas_servers(id) ON UPDATE CASCADE,
  mikrotik_server_id INTEGER REFERENCES mikrotik_servers(id) ON UPDATE CASCADE,
  static_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number TEXT UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL,
  method TEXT,
  reference TEXT,
  admin_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_customers_username ON customers(username);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- Simple view for dashboard revenue daily
CREATE OR REPLACE VIEW v_revenue_daily AS
SELECT 
  DATE_TRUNC('day', COALESCE(p.created_at, i.paid_at))::date AS day,
  SUM(p.amount)
FROM payments p
JOIN invoices i ON i.id = p.invoice_id
GROUP BY 1
ORDER BY 1;
