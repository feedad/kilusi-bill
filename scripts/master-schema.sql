-- =====================================================================
-- Kilusi Bill ISP Billing System - Master Database Schema
-- =====================================================================
-- This is the master schema for fresh installations
-- Compatible with PostgreSQL 13+
--
-- This schema includes:
-- 1. Billing application tables (split architecture)
-- 2. FreeRADIUS integration tables
-- 3. Multi-NAS system with SNMP monitoring
-- 4. All necessary functions, triggers, and indexes
--
-- Usage:
--   createdb kilusi_bill
--   psql -U kilusi_user -d kilusi_bill -f scripts/master-schema.sql
--
-- Author: Kilusi Development Team
-- Version: 2.0.0
-- Last Updated: 2025-12-26
-- =====================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- For gen_random_uuid()

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- =====================================================================
-- SECTION 1: CORE FUNCTIONS
-- =====================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate customer_id (YYMMDD + 5-digit sequence)
CREATE OR REPLACE FUNCTION generate_customer_id()
RETURNS TEXT AS $$
DECLARE
    max_sequence INTEGER;
    next_sequence INTEGER;
BEGIN
    -- Get the highest 5-digit sequence from ALL existing customers
    SELECT COALESCE(MAX(CAST(RIGHT(customer_id, 5) AS INTEGER)), 0)
    INTO max_sequence
    FROM customers
    WHERE customer_id IS NOT NULL 
      AND customer_id ~ '^[0-9]+$'
      AND LENGTH(customer_id) = 11;
    
    -- Increment by 1
    next_sequence := max_sequence + 1;
    
    -- Use YYMMDD (6 digits) + 5-digit sequence
    RETURN TO_CHAR(CURRENT_DATE, 'YYMMDD') || LPAD(next_sequence::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to get billing settings
CREATE OR REPLACE FUNCTION get_billing_settings()
RETURNS TABLE(
    billing_cycle_type VARCHAR,
    invoice_advance_days INTEGER,
    profile_default_period INTEGER,
    fixed_day INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT bs.billing_cycle_type, bs.invoice_advance_days, 
           bs.profile_default_period, bs.fixed_day
    FROM billing_settings bs
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get customer billing cycle
CREATE OR REPLACE FUNCTION get_customer_billing_cycle(customer_id_param VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    service_siklus VARCHAR(20);
    system_billing_cycle VARCHAR(20);
BEGIN
    -- Get service's siklus setting
    SELECT s.siklus INTO service_siklus
    FROM services s
    WHERE s.customer_id = customer_id_param
    LIMIT 1;

    -- If service has siklus setting, use it
    IF service_siklus IS NOT NULL THEN
        RETURN service_siklus;
    END IF;

    -- Otherwise use system default
    SELECT billing_cycle_type INTO system_billing_cycle
    FROM billing_settings
    LIMIT 1;

    RETURN COALESCE(system_billing_cycle, 'profile');
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- SECTION 2: USER MANAGEMENT
-- =====================================================================

-- Admin users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- =====================================================================
-- SECTION 3: MASTER DATA (Regions, Packages, ODPs)
-- =====================================================================

-- Regions table (for customer geographical organization)
CREATE TABLE IF NOT EXISTS regions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    regency VARCHAR(100),
    province VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    disabled_at TIMESTAMP
);

COMMENT ON COLUMN regions.disabled_at IS 'Timestamp when region was disabled (soft delete). NULL means active.';

CREATE INDEX IF NOT EXISTS idx_regions_name ON regions(name);
CREATE INDEX IF NOT EXISTS idx_regions_active ON regions(disabled_at) WHERE disabled_at IS NULL;

-- Packages table (service packages/plans)
CREATE TABLE IF NOT EXISTS packages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    speed VARCHAR(100) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    tax_rate NUMERIC(5,2) DEFAULT 11.00,
    description TEXT,
    pppoe_profile VARCHAR(100) DEFAULT 'default',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "group" VARCHAR(100),
    rate_limit VARCHAR(50),
    shared INTEGER DEFAULT 0,
    hpp NUMERIC(10,2) DEFAULT 0,
    commission NUMERIC(10,2) DEFAULT 0,
    billing_cycle_compatible BOOLEAN DEFAULT true,
    installation_fee NUMERIC(15,2) DEFAULT 50000.00,
    installation_description TEXT DEFAULT 'Standard installation'
);

CREATE INDEX IF NOT EXISTS idx_packages_active ON packages(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_packages_name ON packages(name);

-- ODPs (Optical Distribution Points) - network infrastructure
CREATE TABLE IF NOT EXISTS odps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    address TEXT,
    latitude NUMERIC(10,8),
    longitude NUMERIC(11,8),
    capacity INTEGER DEFAULT 64,
    used_ports INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    parent_odp_id INTEGER REFERENCES odps(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT odps_status_check CHECK (status IN ('active', 'maintenance', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_odps_code ON odps(code);
CREATE INDEX IF NOT EXISTS idx_odps_status ON odps(status);
CREATE INDEX IF NOT EXISTS idx_odps_parent ON odps(parent_odp_id);

-- =====================================================================
-- SECTION 4: CUSTOMER DATA (Split Architecture)
-- =====================================================================

-- Customers table (Identity only - no service duplication)
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(255) PRIMARY KEY,
    customer_id VARCHAR(255) UNIQUE,  -- Auto-generated display ID
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    nik VARCHAR(50) UNIQUE,
    latitude NUMERIC(10,8),
    longitude NUMERIC(11,8),
    region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    area VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_region ON customers(region_id);
CREATE INDEX IF NOT EXISTS idx_customers_nik ON customers(nik);

-- Services table (Subscriptions - one customer can have multiple services)
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(255) REFERENCES customers(id) ON DELETE CASCADE,
    package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
    service_number VARCHAR(20) UNIQUE,  -- YYMMDDnnnn format
    service_identifier VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    billing_type VARCHAR(50) DEFAULT 'postpaid',
    siklus VARCHAR(50) DEFAULT 'profile',
    active_date TIMESTAMP,
    isolir_date TIMESTAMP,
    enable_isolir BOOLEAN DEFAULT true,
    installation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    address_installation TEXT,  -- Service-specific address (can differ from customer address)
    latitude NUMERIC(10,8),
    longitude NUMERIC(11,8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT services_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'isolir', 'terminated'))
);

CREATE INDEX IF NOT EXISTS idx_services_customer ON services(customer_id);
CREATE INDEX IF NOT EXISTS idx_services_package ON services(package_id);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_service_number ON services(service_number);

-- Technical Details table (Authentication/PPPoE credentials per service)
CREATE TABLE IF NOT EXISTS technical_details (
    id SERIAL PRIMARY KEY,
    service_id INTEGER UNIQUE REFERENCES services(id) ON DELETE CASCADE,
    pppoe_username VARCHAR(255) UNIQUE,
    pppoe_password VARCHAR(255),
    pppoe_profile VARCHAR(100),
    ip_address_static VARCHAR(50),
    mac_address VARCHAR(50),
    device_model VARCHAR(100),
    device_serial_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_technical_pppoe_username ON technical_details(pppoe_username);
CREATE INDEX IF NOT EXISTS idx_technical_service ON technical_details(service_id);

-- Network Infrastructure table (Physical layer per service)
CREATE TABLE IF NOT EXISTS network_infrastructure (
    id SERIAL PRIMARY KEY,
    service_id INTEGER UNIQUE REFERENCES services(id) ON DELETE CASCADE,
    odp_code VARCHAR(100),  -- Can reference odps.code
    port_number INTEGER,
    cable_type VARCHAR(50),
    cable_length_meters INTEGER,
    onu_signal_dbm VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_network_service ON network_infrastructure(service_id);
CREATE INDEX IF NOT EXISTS idx_network_odp ON network_infrastructure(odp_code);

-- Cable Routes table (ODP to Customer mapping)
CREATE TABLE IF NOT EXISTS cable_routes (
    id SERIAL PRIMARY KEY,
    odp_id INTEGER NOT NULL REFERENCES odps(id) ON DELETE CASCADE,
    customer_id VARCHAR REFERENCES customers(id) ON DELETE CASCADE,
    cable_length INTEGER,
    port_number INTEGER,
    status VARCHAR(20) DEFAULT 'connected',
    installation_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cable_routes_status_check CHECK (status IN ('connected', 'disconnected', 'maintenance', 'damaged'))
);

CREATE INDEX IF NOT EXISTS idx_cable_routes_odp ON cable_routes(odp_id);
CREATE INDEX IF NOT EXISTS idx_cable_routes_customer ON cable_routes(customer_id);

-- Trigger to update ODP used_ports
CREATE OR REPLACE FUNCTION update_odp_used_ports()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE odps
        SET used_ports = (
            SELECT COUNT(*)
            FROM cable_routes
            WHERE odp_id = NEW.odp_id AND status = 'connected'
        )
        WHERE id = NEW.odp_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE odps
        SET used_ports = (
            SELECT COUNT(*)
            FROM cable_routes
            WHERE odp_id = OLD.odp_id AND status = 'connected'
        )
        WHERE id = OLD.odp_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_odp_used_ports
AFTER INSERT OR UPDATE OR DELETE ON cable_routes
FOR EACH ROW EXECUTE FUNCTION update_odp_used_ports();

-- =====================================================================
-- SECTION 5: FREERADIUS INTEGRATION (Multi-NAS with SNMP)
-- =====================================================================

-- NAS table - Network Access Servers
-- This table combines FreeRADIUS standard fields with SNMP monitoring
CREATE TABLE IF NOT EXISTS nas (
    id SERIAL PRIMARY KEY,
    
    -- FreeRADIUS standard fields
    nasname VARCHAR(128) NOT NULL UNIQUE,  -- Usually IP address
    shortname VARCHAR(32),
    type VARCHAR(30) DEFAULT 'other',
    ports INTEGER DEFAULT 1812,
    secret VARCHAR(60) DEFAULT 'secret',
    server VARCHAR(64),
    community VARCHAR(50),
    description TEXT,
    
    -- Billing app extensions
    ip_address VARCHAR(50) NOT NULL,  -- Explicit IP field
    is_active BOOLEAN DEFAULT true,
    
    -- SNMP Monitoring for Multi-NAS System
    snmp_enabled BOOLEAN DEFAULT false,
    snmp_version VARCHAR(10) DEFAULT '2c',
    snmp_community VARCHAR(255),
    snmp_port INTEGER DEFAULT 161,
    snmp_username TEXT,
    snmp_auth_protocol TEXT DEFAULT 'SHA',
    snmp_auth_password TEXT,
    snmp_priv_protocol TEXT DEFAULT 'AES',
    snmp_priv_password TEXT,
    snmp_security_level TEXT DEFAULT 'authPriv',
    snmp_community_trap TEXT DEFAULT 'public',
    
    -- SNMP Monitoring Data
    snmp_cpu_usage INTEGER DEFAULT 0,
    snmp_memory_usage INTEGER DEFAULT 0,
    snmp_interface_count INTEGER DEFAULT 0,
    snmp_active_connections INTEGER DEFAULT 0,
    snmp_uptime BIGINT DEFAULT 0,
    snmp_system_description TEXT,
    snmp_contact TEXT,
    snmp_location TEXT,
    snmp_status TEXT DEFAULT 'unknown',
    snmp_last_checked TIMESTAMP WITH TIME ZONE,
    snmp_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE nas IS 'Network Access Servers for FreeRADIUS with SNMP monitoring support for multi-NAS system';
COMMENT ON COLUMN nas.nasname IS 'NAS identifier (usually IP address) - FreeRADIUS standard';
COMMENT ON COLUMN nas.shortname IS 'Short name for the NAS - FreeRADIUS standard';
COMMENT ON COLUMN nas.secret IS 'RADIUS shared secret for this NAS';
COMMENT ON COLUMN nas.snmp_enabled IS 'Whether SNMP monitoring is enabled for this NAS';
COMMENT ON COLUMN nas.snmp_cpu_usage IS 'Last recorded CPU usage percentage';
COMMENT ON COLUMN nas.snmp_memory_usage IS 'Last recorded memory usage percentage';

CREATE INDEX IF NOT EXISTS idx_nas_nasname ON nas(nasname);
CREATE INDEX IF NOT EXISTS idx_nas_ip_address ON nas(ip_address);
CREATE INDEX IF NOT EXISTS idx_nas_shortname ON nas(shortname);
CREATE INDEX IF NOT EXISTS idx_nas_is_active ON nas(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nas_snmp_enabled ON nas(snmp_enabled) WHERE snmp_enabled = true;

-- RADIUS Check Attributes (user authentication)
CREATE TABLE IF NOT EXISTS radcheck (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radcheck_username ON radcheck(username);
CREATE INDEX IF NOT EXISTS idx_radcheck_attribute ON radcheck(attribute);

-- RADIUS Reply Attributes (user response)
CREATE TABLE IF NOT EXISTS radreply (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radreply_username ON radreply(username);
CREATE INDEX IF NOT EXISTS idx_radreply_attribute ON radreply(attribute);

-- RADIUS Group Definitions
CREATE TABLE IF NOT EXISTS radgroup (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) UNIQUE NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radgroup_groupname ON radgroup(groupname);

-- RADIUS Group Check Attributes
CREATE TABLE IF NOT EXISTS radgroupcheck (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radgroupcheck_groupname ON radgroupcheck(groupname);
CREATE INDEX IF NOT EXISTS idx_radgroupcheck_attribute ON radgroupcheck(attribute);

-- RADIUS Group Reply Attributes
CREATE TABLE IF NOT EXISTS radgroupreply (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radgroupreply_groupname ON radgroupreply(groupname);
CREATE INDEX IF NOT EXISTS idx_radgroupreply_attribute ON radgroupreply(attribute);

-- RADIUS User Group Membership
CREATE TABLE IF NOT EXISTS radusergroup (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    groupname VARCHAR(64) NOT NULL,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radusergroup_username ON radusergroup(username);
CREATE INDEX IF NOT EXISTS idx_radusergroup_groupname ON radusergroup(groupname);

-- RADIUS Accounting
CREATE TABLE IF NOT EXISTS radacct (
    radacctid BIGSERIAL PRIMARY KEY,
    acctsessionid VARCHAR(32) NOT NULL,
    acctuniqueid VARCHAR(32) NOT NULL UNIQUE,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_acctsessionid ON radacct(acctsessionid);
CREATE INDEX IF NOT EXISTS idx_radacct_acctuniqueid ON radacct(acctuniqueid);
CREATE INDEX IF NOT EXISTS idx_radacct_nasipaddress ON radacct(nasipaddress);
CREATE INDEX IF NOT EXISTS idx_radacct_acctstarttime ON radacct(acctstarttime);
CREATE INDEX IF NOT EXISTS idx_radacct_acctstoptime ON radacct(acctstoptime);

-- RADIUS Post Authentication Logging
CREATE TABLE IF NOT EXISTS radpostauth (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    pass VARCHAR(64),
    reply VARCHAR(32) NOT NULL,
    authdate TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radpostauth_username ON radpostauth(username);
CREATE INDEX IF NOT EXISTS idx_radpostauth_authdate ON radpostauth(authdate);

-- =====================================================================
-- SECTION 6: BILLING AND INVOICING
-- =====================================================================

-- Billing Settings
CREATE TABLE IF NOT EXISTS billing_settings (
    id SERIAL PRIMARY KEY,
    billing_cycle_type VARCHAR(20) DEFAULT 'profile' NOT NULL,
    invoice_advance_days INTEGER DEFAULT 5,
    profile_default_period INTEGER DEFAULT 30,
    fixed_day INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_billing_cycle_type CHECK (billing_cycle_type IN ('profile', 'fixed', 'monthly')),
    CONSTRAINT chk_invoice_advance_days CHECK (invoice_advance_days > 0),
    CONSTRAINT chk_profile_default_period CHECK (profile_default_period > 0),
    CONSTRAINT chk_fixed_day CHECK (fixed_day >= 1 AND fixed_day <= 28)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_settings_single ON billing_settings ((1));

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    package_id INTEGER REFERENCES packages(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    tax NUMERIC(10,2) DEFAULT 0,
    discount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL,
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
    CONSTRAINT invoices_status_check CHECK (status IN ('unpaid', 'paid', 'pending', 'cancelled', 'overdue'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50),
    reference_number VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

-- =====================================================================
-- SECTION 7: SYSTEM CONFIGURATION
-- =====================================================================

-- Application Configuration
CREATE TABLE IF NOT EXISTS app_config (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT,
    type VARCHAR(20) DEFAULT 'string',
    category VARCHAR(50) DEFAULT 'general',
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT app_config_type_check CHECK (type IN ('string', 'boolean', 'number', 'json'))
);

-- Customer Tokens (for customer portal)
CREATE TABLE IF NOT EXISTS customer_tokens (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR REFERENCES customers(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    token_type VARCHAR(50) DEFAULT 'portal_access',
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    created_by INTEGER,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_customer_tokens_customer ON customer_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tokens_token ON customer_tokens(token);
CREATE INDEX IF NOT EXISTS idx_customer_tokens_active ON customer_tokens(is_active, expires_at);

-- WhatsApp Messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    CONSTRAINT whatsapp_status_check CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_recipient ON whatsapp_messages(recipient);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at DESC);

-- System Logs
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    meta JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT log_level_check CHECK (level IN ('info', 'warn', 'error', 'debug'))
);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);

-- =====================================================================
-- SECTION 8: TRIGGERS FOR UPDATED_AT
-- =====================================================================

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_regions_updated_at BEFORE UPDATE ON regions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_odps_updated_at BEFORE UPDATE ON odps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_technical_details_updated_at BEFORE UPDATE ON technical_details
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_network_infrastructure_updated_at BEFORE UPDATE ON network_infrastructure
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nas_updated_at BEFORE UPDATE ON nas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_radcheck_updated_at BEFORE UPDATE ON radcheck
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_radreply_updated_at BEFORE UPDATE ON radreply
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_radusergroup_updated_at BEFORE UPDATE ON radusergroup
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_settings_updated_at BEFORE UPDATE ON billing_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- SECTION 9: DEFAULT DATA / SEED DATA
-- =====================================================================

-- Insert default billing settings
INSERT INTO billing_settings (billing_cycle_type, invoice_advance_days, profile_default_period, fixed_day)
VALUES ('profile', 5, 30, 1)
ON CONFLICT DO NOTHING;

-- Insert default NAS (localhost for testing)
INSERT INTO nas (nasname, shortname, type, secret, description, ip_address, is_active)
VALUES ('127.0.0.1', 'localhost', 'other', 'testing123', 'Localhost NAS for testing', '127.0.0.1', true)
ON CONFLICT (nasname) DO NOTHING;

-- Insert default RADIUS group
INSERT INTO radgroup (groupname, description, priority)
VALUES ('active', 'Active users group', 1)
ON CONFLICT (groupname) DO NOTHING;

-- Insert default group check attributes
INSERT INTO radgroupcheck (groupname, attribute, op, value)
VALUES ('active', 'Auth-Type', ':=', 'Accept')
ON CONFLICT DO NOTHING;

-- Insert default group reply attributes
INSERT INTO radgroupreply (groupname, attribute, op, value)
VALUES 
    ('active', 'Service-Type', ':=', 'Framed-User'),
    ('active', 'Framed-Protocol', ':=', 'PPP')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- COMPLETION MESSAGE
-- =====================================================================

DO $$
BEGIN
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'Kilusi Bill Master Database Schema Created Successfully!';
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'Schema Version: 2.0.0';
    RAISE NOTICE 'Created: %', CURRENT_TIMESTAMP;
    RAISE NOTICE '';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - Customer management (split architecture)';
    RAISE NOTICE '  - FreeRADIUS integration (with multi-NAS SNMP support)';
    RAISE NOTICE '  - Billing and invoicing';
    RAISE NOTICE '  - System configuration';
    RAISE NOTICE '';
    RAISE NOTICE 'Default data inserted:';
    RAISE NOTICE '  - Billing settings';
    RAISE NOTICE '  - Localhost NAS (127.0.0.1)';
    RAISE NOTICE '  - Active user group';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Create admin user';
    RAISE NOTICE '  2. Configure FreeRADIUS to use this database';
    RAISE NOTICE '  3. Add your NAS servers to the nas table';
    RAISE NOTICE '  4. Start the billing application';
    RAISE NOTICE '====================================================================';
END $$;
