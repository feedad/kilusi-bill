-- ============================================================
-- Create views after all tables are initialized
-- ============================================================

CREATE OR REPLACE VIEW customers_view AS
SELECT
  c.id,
  c.id AS customer_id,
  c.name,
  c.phone,
  c.email,
  c.address,
  c.nik,
  c.created_at,
  c.updated_at,
  -- Service related fields (picking first service if multiple)
  s.region_id,
  r.name as region_name,
  s.area,
  s.address_installation as installation_address,
  c.address as billing_address,
  s.installation_date,
  s.active_date,
  s.isolir_date,
  s.latitude,
  s.longitude,
  -- Network related
  (SELECT COUNT(*) FROM services s2 WHERE s2.customer_id = c.id) as service_count,
  COALESCE(s.status, 'inactive') as status
FROM customers c
LEFT JOIN services s ON s.customer_id = c.id
LEFT JOIN regions r ON s.region_id = r.id;
