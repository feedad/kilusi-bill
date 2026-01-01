-- ============================================================
-- Kilusi Bill ISP Billing System
-- Master Schema
-- Updated: 2025-12-27
-- ============================================================

-- Drop existing views first
DROP VIEW IF EXISTS customers_view CASCADE;

-- Drop existing tables (in correct order due to dependencies)
DROP TABLE IF EXISTS billing_discount_applications CASCADE;
DROP TABLE IF EXISTS billing_discounts CASCADE;
DROP TABLE IF EXISTS broadcast_messages CASCADE;
DROP TABLE IF EXISTS bulk_payment_settings CASCADE;
DROP TABLE IF EXISTS accounting_transactions CASCADE;
DROP TABLE IF EXISTS accounting_categories CASCADE;
DROP TABLE IF EXISTS auto_expense_settings CASCADE;
DROP TABLE IF EXISTS support_ticket_messages CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;
DROP TABLE IF EXISTS network_infrastructure CASCADE;
DROP TABLE IF EXISTS cable_routes CASCADE;
DROP TABLE IF EXISTS customer_tokens CASCADE;
DROP TABLE IF EXISTS customer_sessions CASCADE;
DROP TABLE IF EXISTS customer_default_settings CASCADE;
DROP TABLE IF EXISTS technical_details CASCADE;
DROP TABLE IF EXISTS installation_fee_settings CASCADE;
DROP TABLE IF EXISTS billing_settings CASCADE;
DROP TABLE IF EXISTS app_config CASCADE;
DROP TABLE IF EXISTS whatsapp_messages CASCADE;
DROP TABLE IF EXISTS system_logs CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS packages CASCADE;
DROP TABLE IF EXISTS regions CASCADE;
DROP TABLE IF EXISTS odps CASCADE;
DROP TABLE IF EXISTS nas CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop legacy tables
DROP TABLE IF EXISTS customers_legacy_backup CASCADE;
DROP TABLE IF EXISTS nas_servers CASCADE;

-- ============================================================
-- TABLES
-- ============================================================


-- Table: accounting_categories
CREATE TABLE accounting_categories (
  id SERIAL NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6366f1',
  icon VARCHAR(50) DEFAULT 'circle',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_accounting_categories_type ON accounting_categories USING btree (type);


-- Table: accounting_transactions
CREATE TABLE accounting_transactions (
  id SERIAL NOT NULL,
  category_id INTEGER,
  type VARCHAR(20) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  description TEXT NOT NULL,
  reference_type VARCHAR(50),
  reference_id INTEGER,
  date DATE NOT NULL,
  attachment_url VARCHAR(255),
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_accounting_transactions_date ON accounting_transactions USING btree (date);
CREATE INDEX idx_accounting_transactions_type ON accounting_transactions USING btree (type);
CREATE INDEX idx_accounting_transactions_category ON accounting_transactions USING btree (category_id);


-- Table: app_config
CREATE TABLE app_config (
  key VARCHAR(255) NOT NULL,
  value TEXT,
  type VARCHAR(20) DEFAULT 'string',
  category VARCHAR(50) DEFAULT 'general',
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key)
);


-- Table: auto_expense_settings
CREATE TABLE auto_expense_settings (
  id SERIAL NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX auto_expense_settings_setting_key_key ON auto_expense_settings USING btree (setting_key);


-- Table: billing_discount_applications
CREATE TABLE billing_discount_applications (
  id SERIAL NOT NULL,
  discount_id INTEGER,
  customer_id INTEGER,
  invoice_id INTEGER,
  original_amount NUMERIC(12, 2) NOT NULL,
  discount_amount NUMERIC(12, 2) NOT NULL,
  final_amount NUMERIC(12, 2) NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  applied_by INTEGER,
  notes TEXT,
  PRIMARY KEY (id)
);
CREATE INDEX idx_billing_discount_applications_discount_id ON billing_discount_applications USING btree (discount_id);
CREATE INDEX idx_billing_discount_applications_customer_id ON billing_discount_applications USING btree (customer_id);
CREATE INDEX idx_billing_discount_applications_invoice_id ON billing_discount_applications USING btree (invoice_id);


-- Table: billing_discounts
CREATE TABLE billing_discounts (
  id SERIAL NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL,
  discount_value NUMERIC(10, 2) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_ids TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_billing_discounts_is_active ON billing_discounts USING btree (is_active);
CREATE INDEX idx_billing_discounts_end_date ON billing_discounts USING btree (end_date);
CREATE INDEX idx_billing_discounts_target_type ON billing_discounts USING btree (target_type);


-- Table: billing_settings
CREATE TABLE billing_settings (
  id SERIAL NOT NULL,
  billing_cycle_type VARCHAR(20) NOT NULL DEFAULT 'profile',
  invoice_advance_days INTEGER DEFAULT 5,
  profile_default_period INTEGER DEFAULT 30,
  fixed_day INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX idx_billing_settings_single ON billing_settings USING btree ((1));


-- Table: broadcast_messages
CREATE TABLE broadcast_messages (
  id SERIAL NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  target_type VARCHAR(50) DEFAULT 'all',
  status VARCHAR(50) DEFAULT 'scheduled',
  scheduled_for TIMESTAMP,
  sent_at TIMESTAMP,
  created_by VARCHAR(100),
  is_scheduled BOOLEAN DEFAULT true,
  auto_activate BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  type VARCHAR(50) DEFAULT 'broadcast',
  priority VARCHAR(20) DEFAULT 'normal',
  target_areas TEXT,
  target_all BOOLEAN DEFAULT false,
  scheduled_start_time TIMESTAMP,
  scheduled_end_time TIMESTAMP,
  auto_deactivate BOOLEAN DEFAULT false,
  expires_at TIMESTAMP,
  send_push_notification BOOLEAN DEFAULT false,
  maintenance_type VARCHAR(50),
  estimated_duration INTEGER,
  affected_services TEXT,
  contact_person VARCHAR(100),
  backup_plan TEXT,
  PRIMARY KEY (id)
);
CREATE INDEX idx_broadcast_messages_is_active ON broadcast_messages USING btree (is_active);
CREATE INDEX idx_broadcast_messages_priority ON broadcast_messages USING btree (priority);
CREATE INDEX idx_broadcast_messages_expires_at ON broadcast_messages USING btree (expires_at);
CREATE INDEX idx_broadcast_messages_type ON broadcast_messages USING btree (type);


-- Table: bulk_payment_settings
CREATE TABLE bulk_payment_settings (
  id INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN DEFAULT true,
  discount_1_month_type VARCHAR(50) DEFAULT 'percentage',
  discount_1_month_value NUMERIC(15, 2) DEFAULT 0,
  discount_2_months_type VARCHAR(50) DEFAULT 'percentage',
  discount_2_months_value NUMERIC(15, 2) DEFAULT 0,
  discount_3_months_type VARCHAR(50) DEFAULT 'percentage',
  discount_3_months_value NUMERIC(15, 2) DEFAULT 5,
  discount_6_months_type VARCHAR(50) DEFAULT 'percentage',
  discount_6_months_value NUMERIC(15, 2) DEFAULT 10,
  discount_12_months_type VARCHAR(50) DEFAULT 'percentage',
  discount_12_months_value NUMERIC(15, 2) DEFAULT 15,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);


-- Table: cable_routes
CREATE TABLE cable_routes (
  id SERIAL NOT NULL,
  odp_id INTEGER NOT NULL,
  customer_id TEXT,
  cable_length INTEGER,
  port_number INTEGER,
  status VARCHAR(20) DEFAULT 'connected',
  installation_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_cable_routes_odp ON cable_routes USING btree (odp_id);
CREATE INDEX idx_cable_routes_customer ON cable_routes USING btree (customer_id);


-- Table: customer_default_settings
CREATE TABLE customer_default_settings (
  id SERIAL NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  default_value TEXT,
  field_type VARCHAR(50) DEFAULT 'text',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX customer_default_settings_field_name_key ON customer_default_settings USING btree (field_name);


-- Table: customer_sessions
CREATE TABLE customer_sessions (
  id SERIAL NOT NULL,
  customer_id VARCHAR(50),
  username VARCHAR(100),
  nas_ip VARCHAR(50),
  framing VARCHAR(50),
  ip_address VARCHAR(50),
  mac_address VARCHAR(50),
  session_start TIMESTAMP,
  session_stop TIMESTAMP,
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  upload_bytes BIGINT DEFAULT 0,
  download_bytes BIGINT DEFAULT 0,
  session_time INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX customer_sessions_customer_id_key ON customer_sessions USING btree (customer_id);


-- Table: customer_tokens
CREATE TABLE customer_tokens (
  id SERIAL NOT NULL,
  customer_id TEXT,
  token VARCHAR(255) NOT NULL,
  token_type VARCHAR(50) DEFAULT 'portal_access',
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  created_by INTEGER,
  metadata JSONB,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX customer_tokens_token_key ON customer_tokens USING btree (token);
CREATE INDEX idx_customer_tokens_customer ON customer_tokens USING btree (customer_id);
CREATE INDEX idx_customer_tokens_token ON customer_tokens USING btree (token);
CREATE INDEX idx_customer_tokens_active ON customer_tokens USING btree (is_active, expires_at);


-- Table: customers (cleaned - no duplicate coordinates)
CREATE TABLE customers (
  id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  customer_id VARCHAR(255),
  nik VARCHAR(50),
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX customers_customer_id_key ON customers USING btree (customer_id);
CREATE INDEX idx_customers_phone ON customers USING btree (phone);
CREATE INDEX idx_customers_customer_id ON customers USING btree (customer_id);
CREATE INDEX idx_customers_nik ON customers USING btree (nik);


-- Table: installation_fee_settings
CREATE TABLE installation_fee_settings (
  id SERIAL NOT NULL,
  fee_type VARCHAR(50) NOT NULL,
  fee_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  billing_type VARCHAR(50),
  package_id INTEGER,
  PRIMARY KEY (id)
);


-- Table: invoices
CREATE TABLE invoices (
  id SERIAL NOT NULL,
  customer_id TEXT NOT NULL,
  package_id INTEGER,
  invoice_number VARCHAR(100) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  tax NUMERIC(10, 2) DEFAULT 0,
  discount NUMERIC(12, 2) DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'unpaid',
  payment_date TIMESTAMP,
  payment_method VARCHAR(50),
  payment_gateway VARCHAR(100),
  payment_token VARCHAR(255),
  payment_url TEXT,
  notes TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX invoices_invoice_number_key ON invoices USING btree (invoice_number);
CREATE INDEX idx_invoices_customer ON invoices USING btree (customer_id);
CREATE INDEX idx_invoices_status ON invoices USING btree (status);
CREATE INDEX idx_invoices_due_date ON invoices USING btree (due_date);
CREATE INDEX idx_invoices_invoice_number ON invoices USING btree (invoice_number);


-- Table: nas (FreeRADIUS compatible with SNMP monitoring)
CREATE TABLE nas (
  id SERIAL NOT NULL,
  nasname VARCHAR(255) NOT NULL,
  shortname VARCHAR(100) NOT NULL,
  ip_address VARCHAR(50) NOT NULL,
  secret VARCHAR(255) NOT NULL,
  ports INTEGER DEFAULT 1812,
  type VARCHAR(50) DEFAULT 'other',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  snmp_community VARCHAR(255),
  snmp_version VARCHAR(10) DEFAULT '2c',
  snmp_port INTEGER DEFAULT 161,
  snmp_enabled BOOLEAN DEFAULT false,
  snmp_cpu_usage INTEGER DEFAULT 0,
  snmp_memory_usage INTEGER DEFAULT 0,
  snmp_interface_count INTEGER DEFAULT 0,
  snmp_active_connections INTEGER DEFAULT 0,
  snmp_last_checked TIMESTAMP WITH TIME ZONE,
  snmp_status TEXT DEFAULT 'unknown',
  snmp_username TEXT,
  snmp_auth_protocol TEXT DEFAULT 'SHA',
  snmp_auth_password TEXT,
  snmp_priv_protocol TEXT DEFAULT 'AES',
  snmp_priv_password TEXT,
  snmp_security_level TEXT DEFAULT 'authPriv',
  snmp_community_trap TEXT DEFAULT 'public',
  snmp_system_description TEXT,
  snmp_contact TEXT,
  snmp_location TEXT,
  snmp_uptime BIGINT DEFAULT 0,
  snmp_error TEXT,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX nas_nasname_key ON nas USING btree (nasname);
CREATE INDEX idx_nas_nasname ON nas USING btree (nasname);
CREATE INDEX idx_nas_ip_address ON nas USING btree (ip_address);
CREATE INDEX idx_nas_shortname ON nas USING btree (shortname);
CREATE INDEX idx_nas_is_active ON nas USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_nas_snmp_enabled ON nas USING btree (snmp_enabled) WHERE (snmp_enabled = true);

-- Comments for NAS table
COMMENT ON COLUMN nas.ports IS 'Number of ports/connections on the NAS';
COMMENT ON COLUMN nas.snmp_community IS 'SNMP community string';
COMMENT ON COLUMN nas.snmp_version IS 'SNMP version (1, 2c, or 3)';
COMMENT ON COLUMN nas.snmp_port IS 'SNMP port number';
COMMENT ON COLUMN nas.snmp_enabled IS 'Whether SNMP monitoring is enabled for this NAS';
COMMENT ON TABLE nas IS 'Network Access Servers (NAS) for RADIUS with SNMP monitoring support';


-- Table: network_infrastructure
CREATE TABLE network_infrastructure (
  id SERIAL NOT NULL,
  service_id INTEGER,
  odp_code VARCHAR(100),
  port_number INTEGER,
  cable_type VARCHAR(50),
  cable_length_meters INTEGER,
  onu_signal_dbm VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX network_infrastructure_service_id_key ON network_infrastructure USING btree (service_id);
CREATE INDEX idx_network_service ON network_infrastructure USING btree (service_id);
CREATE INDEX idx_network_odp ON network_infrastructure USING btree (odp_code);


-- Table: odps
CREATE TABLE odps (
  id SERIAL NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  address TEXT,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  capacity INTEGER DEFAULT 64,
  used_ports INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  parent_odp_id INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX odps_code_key ON odps USING btree (code);
CREATE INDEX idx_odps_code ON odps USING btree (code);
CREATE INDEX idx_odps_status ON odps USING btree (status);
CREATE INDEX idx_odps_parent ON odps USING btree (parent_odp_id);


-- Table: packages
CREATE TABLE packages (
  id SERIAL NOT NULL,
  name VARCHAR(255) NOT NULL,
  speed VARCHAR(100) NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  tax_rate NUMERIC(5, 2) DEFAULT 11.00,
  description TEXT,
  pppoe_profile VARCHAR(100) DEFAULT 'default',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "group" VARCHAR(100),
  rate_limit VARCHAR(50),
  shared INTEGER DEFAULT 0,
  hpp NUMERIC(10, 2) DEFAULT 0,
  commission NUMERIC(10, 2) DEFAULT 0,
  billing_cycle_compatible BOOLEAN DEFAULT true,
  installation_fee NUMERIC(15, 2) DEFAULT 50000.00,
  installation_description TEXT DEFAULT 'Standard installation',
  PRIMARY KEY (id)
);
CREATE INDEX idx_packages_active ON packages USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_packages_name ON packages USING btree (name);


-- Table: payments
CREATE TABLE payments (
  id SERIAL NOT NULL,
  invoice_id INTEGER NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payment_method VARCHAR(50),
  reference_number VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_payments_invoice ON payments USING btree (invoice_id);
CREATE INDEX idx_payments_date ON payments USING btree (payment_date);


-- Table: radacct
CREATE TABLE radacct (
  radacctid BIGSERIAL NOT NULL,
  acctsessionid VARCHAR(32) NOT NULL,
  acctuniqueid VARCHAR(32) NOT NULL,
  username VARCHAR(64),
  groupname VARCHAR(64),
  realm VARCHAR(64),
  nasipaddress INET NOT NULL,
  nasportid VARCHAR(15),
  nasporttype VARCHAR(32),
  acctstarttime TIMESTAMP WITH TIME ZONE,
  acctstoptime TIMESTAMP WITH TIME ZONE,
  acctsessiontime BIGINT DEFAULT 0,
  acctauthentic VARCHAR(32),
  connectinfo_start VARCHAR(50),
  connectinfo_stop VARCHAR(50),
  acctinputoctets BIGINT DEFAULT 0,
  acctoutputoctets BIGINT DEFAULT 0,
  calledstationid VARCHAR(50),
  callingstationid VARCHAR(50),
  acctterminatecause VARCHAR(32),
  servicetype VARCHAR(32),
  framedprotocol VARCHAR(32),
  framedipaddress INET,
  framedipv6address INET,
  framedipv6prefix INET,
  framedinterfaceid VARCHAR(44),
  delegatedipv6prefix INET,
  acctupdatetime TIMESTAMP WITH TIME ZONE,
  acctinterval INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (radacctid)
);
CREATE UNIQUE INDEX radacct_acctuniqueid_key ON radacct USING btree (acctuniqueid);
CREATE INDEX idx_radacct_username ON radacct USING btree (username);
CREATE INDEX idx_radacct_acctsessionid ON radacct USING btree (acctsessionid);
CREATE INDEX idx_radacct_acctuniqueid ON radacct USING btree (acctuniqueid);
CREATE INDEX idx_radacct_nasipaddress ON radacct USING btree (nasipaddress);
CREATE INDEX idx_radacct_acctstarttime ON radacct USING btree (acctstarttime);
CREATE INDEX idx_radacct_acctstoptime ON radacct USING btree (acctstoptime);


-- Table: radcheck
CREATE TABLE radcheck (
  id SERIAL NOT NULL,
  username VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op VARCHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(username, attribute, op, value),
  PRIMARY KEY (id)
);
CREATE INDEX idx_radcheck_username ON radcheck USING btree (username);
CREATE INDEX idx_radcheck_attribute ON radcheck USING btree (attribute);


-- Table: radgroup
CREATE TABLE radgroup (
  id SERIAL NOT NULL,
  groupname VARCHAR(64) NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX radgroup_groupname_key ON radgroup USING btree (groupname);
CREATE INDEX idx_radgroup_groupname ON radgroup USING btree (groupname);


-- Table: radgroupcheck
CREATE TABLE radgroupcheck (
  id SERIAL NOT NULL,
  groupname VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op VARCHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_radgroupcheck_groupname ON radgroupcheck USING btree (groupname);
CREATE INDEX idx_radgroupcheck_attribute ON radgroupcheck USING btree (attribute);


-- Table: radgroupreply
CREATE TABLE radgroupreply (
  id SERIAL NOT NULL,
  groupname VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op VARCHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_radgroupreply_groupname ON radgroupreply USING btree (groupname);
CREATE INDEX idx_radgroupreply_attribute ON radgroupreply USING btree (attribute);


-- Table: radpostauth
CREATE TABLE radpostauth (
  id BIGSERIAL NOT NULL,
  username VARCHAR(64) NOT NULL,
  pass VARCHAR(64),
  reply VARCHAR(32) NOT NULL,
  authdate TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_radpostauth_username ON radpostauth USING btree (username);
CREATE INDEX idx_radpostauth_authdate ON radpostauth USING btree (authdate);


-- Table: radreply
CREATE TABLE radreply (
  id SERIAL NOT NULL,
  username VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op VARCHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_radreply_username ON radreply USING btree (username);
CREATE INDEX idx_radreply_attribute ON radreply USING btree (attribute);


-- Table: radusergroup
CREATE TABLE radusergroup (
  id SERIAL NOT NULL,
  username VARCHAR(64) NOT NULL,
  groupname VARCHAR(64) NOT NULL,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(username, groupname),
  PRIMARY KEY (id)
);
CREATE INDEX idx_radusergroup_username ON radusergroup USING btree (username);
CREATE INDEX idx_radusergroup_groupname ON radusergroup USING btree (groupname);


-- Table: regions
CREATE TABLE regions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  district VARCHAR(100),
  regency VARCHAR(100),
  province VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  disabled_at TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_regions_name ON regions USING btree (name);
CREATE INDEX idx_regions_active ON regions USING btree (disabled_at) WHERE (disabled_at IS NULL);


-- Table: services (with coordinates - single source of location data)
CREATE TABLE services (
  id SERIAL NOT NULL,
  customer_id VARCHAR(255),
  package_id INTEGER,
  service_identifier VARCHAR(100),
  address_installation TEXT,
  status VARCHAR(50) DEFAULT 'active',
  installation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  service_number VARCHAR(20),
  active_date TIMESTAMP,
  isolir_date TIMESTAMP,
  siklus VARCHAR(50) DEFAULT 'profile',
  billing_type VARCHAR(50) DEFAULT 'postpaid',
  enable_isolir BOOLEAN DEFAULT true,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  region_id UUID,
  area VARCHAR(100),
  nas_id VARCHAR(50) DEFAULT 'all',
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX services_service_number_key ON services USING btree (service_number);
CREATE INDEX idx_services_customer ON services USING btree (customer_id);
CREATE INDEX idx_services_package ON services USING btree (package_id);
CREATE INDEX idx_services_status ON services USING btree (status);
CREATE INDEX idx_services_service_number ON services USING btree (service_number);
CREATE INDEX idx_services_region ON services USING btree (region_id);


-- Table: support_ticket_messages
CREATE TABLE support_ticket_messages (
  id SERIAL NOT NULL,
  ticket_id INTEGER,
  sender_type VARCHAR(20) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  attachments TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_support_messages_ticket_id ON support_ticket_messages USING btree (ticket_id);
CREATE INDEX idx_support_messages_created_at ON support_ticket_messages USING btree (created_at);


-- Table: support_tickets
CREATE TABLE support_tickets (
  id SERIAL NOT NULL,
  ticket_number VARCHAR(50),
  customer_id VARCHAR(50),
  customer_name VARCHAR(200),
  customer_phone VARCHAR(50),
  customer_email VARCHAR(100),
  subject VARCHAR(500) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  priority VARCHAR(50) DEFAULT 'normal',
  status VARCHAR(50) DEFAULT 'open',
  assigned_to VARCHAR(100),
  resolution TEXT,
  resolved_at TIMESTAMP,
  first_response_time TIMESTAMP,
  resolution_time TIMESTAMP,
  closed_at TIMESTAMP,
  last_response_at TIMESTAMP,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX support_tickets_ticket_number_key ON support_tickets USING btree (ticket_number);
CREATE INDEX idx_support_tickets_customer ON support_tickets USING btree (customer_id);
CREATE INDEX idx_support_tickets_status ON support_tickets USING btree (status);


-- Table: system_logs
CREATE TABLE system_logs (
  id SERIAL NOT NULL,
  level VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  meta JSONB,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_logs_timestamp ON system_logs USING btree (timestamp DESC);
CREATE INDEX idx_logs_level ON system_logs USING btree (level);


-- Table: technical_details
CREATE TABLE technical_details (
  id SERIAL NOT NULL,
  service_id INTEGER,
  pppoe_username VARCHAR(255),
  pppoe_password VARCHAR(255),
  pppoe_profile VARCHAR(100),
  ip_address_static VARCHAR(50),
  mac_address VARCHAR(50),
  device_model VARCHAR(100),
  device_serial_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX technical_details_service_id_key ON technical_details USING btree (service_id);
CREATE UNIQUE INDEX technical_details_pppoe_username_key ON technical_details USING btree (pppoe_username);
CREATE INDEX idx_technical_pppoe_username ON technical_details USING btree (pppoe_username);
CREATE INDEX idx_technical_service ON technical_details USING btree (service_id);


-- Table: users
CREATE TABLE users (
  id SERIAL NOT NULL,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin',
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX users_username_key ON users USING btree (username);
CREATE INDEX idx_users_username ON users USING btree (username);
CREATE INDEX idx_users_role ON users USING btree (role);


-- Table: whatsapp_messages
CREATE TABLE whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  recipient VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  message_type VARCHAR(50) DEFAULT 'Direct Message',
  broadcast_id UUID,
  template_id VARCHAR(100),
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX idx_whatsapp_messages_status ON whatsapp_messages USING btree (status);
CREATE INDEX idx_whatsapp_messages_recipient ON whatsapp_messages USING btree (recipient);
CREATE INDEX idx_whatsapp_messages_created_at ON whatsapp_messages USING btree (created_at DESC);


-- ============================================================
-- VIEWS
-- ============================================================

-- customers_view: Combines customer, service, technical, and network data
CREATE OR REPLACE VIEW customers_view AS
SELECT
    c.id,
    c.id AS customer_id,
    c.name,
    c.phone,
    c.email,
    c.address AS billing_address,
    COALESCE(s.address_installation, c.address) AS address,
    s.address_installation AS installation_address,
    s.latitude,
    s.longitude,
    c.created_at,
    c.updated_at,
    s.region_id,
    s.area,
    c.nik,
    s.id AS service_id,
    s.package_id,
    s.service_number,
    COALESCE(s.status, 'no_service') AS status,
    s.installation_date,
    s.active_date,
    s.isolir_date,
    s.siklus,
    s.billing_type,
    s.enable_isolir,
    s.nas_id AS router,
    t.pppoe_username,
    t.pppoe_password,
    t.pppoe_profile,
    t.ip_address_static,
    t.mac_address,
    t.device_model,
    t.device_serial_number,
    n.odp_code,
    n.port_number,
    n.cable_type,
    n.cable_length_meters,
    n.cable_length_meters AS cable_length,
    n.onu_signal_dbm
FROM customers c
LEFT JOIN services s ON c.id::text = s.customer_id::text
LEFT JOIN technical_details t ON s.id = t.service_id
LEFT JOIN network_infrastructure n ON s.id = n.service_id;


-- ============================================================
-- TRIGGERS
-- ============================================================

-- Function for auto-updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to relevant tables
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nas_updated_at BEFORE UPDATE ON nas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_technical_details_updated_at BEFORE UPDATE ON technical_details
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- DEFAULT DATA
-- ============================================================

-- Default Accounting Categories
INSERT INTO accounting_categories (name, type, color, icon, is_active) VALUES
  ('Electricity', 'expense', '#F97316', 'zap', true),
  ('Equipment', 'expense', '#6366F1', 'server', true),
  ('Equipment Sales', 'revenue', '#8B5CF6', 'shopping-cart', true),
  ('Installation Fee', 'revenue', '#3B82F6', 'tool', true),
  ('Internet Backbone', 'expense', '#EC4899', 'globe', true),
  ('Internet Service', 'revenue', '#10B981', 'wifi', true),
  ('Late Payment Fee', 'revenue', '#F59E0B', 'clock', true),
  ('Maintenance', 'expense', '#84CC16', 'wrench', true),
  ('Office Rent', 'expense', '#14B8A6', 'home', true),
  ('Salary', 'expense', '#EF4444', 'users', true);

-- Default Bulk Payment Settings
INSERT INTO bulk_payment_settings (id, enabled,
  discount_1_month_type, discount_1_month_value,
  discount_2_months_type, discount_2_months_value,
  discount_3_months_type, discount_3_months_value,
  discount_6_months_type, discount_6_months_value,
  discount_12_months_type, discount_12_months_value)
VALUES (1, true,
  'percentage', 0.00,
  'percentage', 0.00,
  'percentage', 5.00,
  'percentage', 10.00,
  'percentage', 15.00);

-- Default Billing Settings
INSERT INTO billing_settings (id, billing_cycle_type, invoice_advance_days, profile_default_period, fixed_day)
VALUES (1, 'profile', 5, 30, 1);

-- Default Superadmin User (username: admin, password: admin)
-- superadmin = full access to frontend + API dashboard
-- admin = frontend access only
INSERT INTO users (username, password, role, email, created_at, updated_at)
VALUES ('admin', '$2b$10$gqU9GPZVPpsGbhVUpW/6dOYVaBWgUDUf5a7.RfGn.6rhIQLVvATIm', 'superadmin', 'admin@kilusi.id', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (username) DO NOTHING;
