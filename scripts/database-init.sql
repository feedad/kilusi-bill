-- =====================================================================
-- Kilusi Bill ISP Billing System - Database Initialization Script
-- =====================================================================
--
-- This script creates a complete database schema for a fresh installation
-- of the Kilusi Bill ISP billing and management system.
--
-- Usage:
--   psql -U postgres -d kilusi_bill -f scripts/database-init.sql
--
-- Prerequisites:
--   - PostgreSQL 13+ installed
--   - Database 'kilusi_bill' created
--   - User 'kilusi_user' created with appropriate privileges
--
-- Author: Kilusi Development Team
-- Version: 1.0.0
-- Last Updated: November 2024
-- =====================================================================

-- Enable UUID extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. CORE BUSINESS TABLES
-- =====================================================================

-- Packages table for ISP service packages
CREATE TABLE IF NOT EXISTS packages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    speed VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    tax_rate DECIMAL(5,2) DEFAULT 11.00,
    description TEXT,
    pppoe_profile VARCHAR(100) DEFAULT 'default',
    is_active BOOLEAN DEFAULT true,
    billing_cycle_compatible BOOLEAN DEFAULT true,
    installation_fee DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for packages
CREATE INDEX IF NOT EXISTS idx_packages_active ON packages(is_active) WHERE is_active = true;

-- Customers table with comprehensive information
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255),
    address TEXT,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
    pppoe_username VARCHAR(255),
    pppoe_password VARCHAR(255),
    cable_type VARCHAR(50),
    cable_length INTEGER,
    port_number INTEGER,
    cable_status VARCHAR(50) DEFAULT 'connected',
    cable_notes TEXT,
    device_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    siklus VARCHAR(20) DEFAULT 'profile',
    portal_access_token VARCHAR(255),
    token_expires_at TIMESTAMP,
    join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_customer_status CHECK (status IN ('active', 'inactive', 'suspended', 'isolir', 'terminated'))
);

-- Indexes for customers
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_package ON customers(package_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_pppoe ON customers(pppoe_username);
CREATE INDEX IF NOT EXISTS idx_customers_location ON customers(latitude, longitude);

-- Invoices table for billing
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    tax DECIMAL(10,2) DEFAULT 0,
    discount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
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
    CONSTRAINT chk_invoice_status CHECK (status IN ('unpaid', 'paid', 'pending', 'cancelled', 'overdue'))
);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50),
    reference_number VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

-- =====================================================================
-- 2. NETWORK INFRASTRUCTURE TABLES
-- =====================================================================

-- NAS Servers table for RADIUS integration
CREATE TABLE IF NOT EXISTS nas_servers (
    id SERIAL PRIMARY KEY,
    nas_name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100) NOT NULL,
    ip_address VARCHAR(50) NOT NULL,
    secret VARCHAR(255) NOT NULL,
    ports INTEGER DEFAULT 1812,
    type VARCHAR(50) DEFAULT 'other',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mikrotik servers table
CREATE TABLE IF NOT EXISTS mikrotik_servers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INTEGER DEFAULT 8728,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    main_interface VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ODPs (Optical Distribution Points) table
CREATE TABLE IF NOT EXISTS odps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    capacity INTEGER DEFAULT 64,
    used_ports INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    parent_odp_id INTEGER NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_odp_status CHECK (status IN ('active', 'maintenance', 'inactive')),
    FOREIGN KEY (parent_odp_id) REFERENCES odps(id) ON DELETE SET NULL
);

-- Indexes for ODPs
CREATE INDEX IF NOT EXISTS idx_odps_code ON odps(code);
CREATE INDEX IF NOT EXISTS idx_odps_status ON odps(status);
CREATE INDEX IF NOT EXISTS idx_odps_parent ON odps(parent_odp_id);
CREATE INDEX IF NOT EXISTS idx_odps_location ON odps(latitude, longitude);

-- Cable routes table
CREATE TABLE IF NOT EXISTS cable_routes (
    id SERIAL PRIMARY KEY,
    odp_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    cable_length INTEGER, -- in meters
    port_number INTEGER,
    status VARCHAR(20) DEFAULT 'connected',
    installation_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_cable_status CHECK (status IN ('connected', 'disconnected', 'maintenance', 'damaged')),
    FOREIGN KEY (odp_id) REFERENCES odps(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Indexes for cable routes
CREATE INDEX IF NOT EXISTS idx_cable_routes_odp ON cable_routes(odp_id);
CREATE INDEX IF NOT EXISTS idx_cable_routes_customer ON cable_routes(customer_id);
CREATE INDEX IF NOT EXISTS idx_cable_routes_status ON cable_routes(status);

-- =====================================================================
-- 3. RADIUS AUTHENTICATION TABLES
-- =====================================================================

-- RADIUS groups table
CREATE TABLE IF NOT EXISTS radgroup (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) UNIQUE NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RADIUS group check attributes
CREATE TABLE IF NOT EXISTS radgroupcheck (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL REFERENCES radgroup(groupname) ON DELETE CASCADE,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL
);

-- RADIUS group reply attributes
CREATE TABLE IF NOT EXISTS radgroupreply (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL REFERENCES radgroup(groupname) ON DELETE CASCADE,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL
);

-- RADIUS user check attributes
CREATE TABLE IF NOT EXISTS radcheck (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, attribute, op, value)
);

-- RADIUS user reply attributes
CREATE TABLE IF NOT EXISTS radreply (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RADIUS accounting table
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

-- Indexes for RADIUS tables
CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_acctstarttime ON radacct(acctstarttime);
CREATE INDEX IF NOT EXISTS idx_radacct_nasipaddress ON radacct(nasipaddress);
CREATE INDEX IF NOT EXISTS idx_radcheck_username ON radcheck(username);
CREATE INDEX IF NOT EXISTS idx_radreply_username ON radreply(username);

-- =====================================================================
-- 4. BILLING AND FINANCIAL MANAGEMENT TABLES
-- =====================================================================

-- Billing settings table
CREATE TABLE IF NOT EXISTS billing_settings (
    id SERIAL PRIMARY KEY,
    billing_cycle_type VARCHAR(20) NOT NULL DEFAULT 'profile',
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

-- Ensure only one row in billing_settings
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_settings_single ON billing_settings ((1));

-- Billing discounts table
CREATE TABLE IF NOT EXISTS billing_discounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL,
    discount_value DECIMAL(12,2) NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_ids TEXT[], -- Array of customer IDs, area names, or package IDs
    compensation_reason VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    max_discount_amount DECIMAL(12,2),
    apply_to_existing_invoices BOOLEAN DEFAULT false,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_billing_discount_type CHECK (discount_type IN ('percentage', 'fixed')),
    CONSTRAINT chk_billing_discount_target_type CHECK (target_type IN ('all', 'area', 'package', 'customer'))
);

-- Indexes for billing discounts
CREATE INDEX IF NOT EXISTS idx_billing_discounts_active ON billing_discounts(is_active);
CREATE INDEX IF NOT EXISTS idx_billing_discounts_date_range ON billing_discounts(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_billing_discounts_target_type ON billing_discounts(target_type);

-- Installation fee settings table
CREATE TABLE IF NOT EXISTS installation_fee_settings (
    id SERIAL PRIMARY KEY,
    billing_type VARCHAR(20) NOT NULL, -- prepaid, postpaid
    package_id INTEGER REFERENCES packages(id),
    fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_installation_billing_type CHECK (billing_type IN ('prepaid', 'postpaid')),
    UNIQUE(billing_type, package_id)
);

-- Indexes for installation fee settings
CREATE INDEX IF NOT EXISTS idx_installation_fee_settings_billing_type ON installation_fee_settings(billing_type);
CREATE INDEX IF NOT EXISTS idx_installation_fee_settings_package_id ON installation_fee_settings(package_id);
CREATE INDEX IF NOT EXISTS idx_installation_fee_settings_active ON installation_fee_settings(is_active);

-- Bulk payment settings table
CREATE TABLE IF NOT EXISTS bulk_payment_settings (
    id SERIAL PRIMARY KEY,
    enabled BOOLEAN DEFAULT true,
    discount_1_month_type VARCHAR(20) DEFAULT 'percentage',
    discount_1_month_value INTEGER DEFAULT 0,
    discount_2_months_type VARCHAR(20) DEFAULT 'percentage',
    discount_2_months_value INTEGER DEFAULT 0,
    discount_3_months_type VARCHAR(20) DEFAULT 'percentage',
    discount_3_months_value INTEGER DEFAULT 5,
    discount_6_months_type VARCHAR(20) DEFAULT 'percentage',
    discount_6_months_value INTEGER DEFAULT 10,
    discount_12_months_type VARCHAR(20) DEFAULT 'percentage',
    discount_12_months_value INTEGER DEFAULT 15,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_bulk_discount_type CHECK (discount_1_month_type IN ('percentage', 'fixed_amount', 'free_months'))
);

-- Index for bulk payment settings
CREATE INDEX IF NOT EXISTS idx_bulk_payment_settings_enabled ON bulk_payment_settings(enabled);

-- Financial transactions table
CREATE TABLE IF NOT EXISTS financial_transactions (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL, -- income, expense
    category VARCHAR(100) NOT NULL, -- installation, subscription, equipment, salary, operational
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    customer_id INTEGER REFERENCES customers(id),
    transaction_date DATE NOT NULL,
    payment_method VARCHAR(50), -- cash, transfer, edc
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_financial_type CHECK (type IN ('income', 'expense'))
);

-- Indexes for financial transactions
CREATE INDEX IF NOT EXISTS idx_financial_transactions_type ON financial_transactions(type);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_category ON financial_transactions(category);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_date ON financial_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_customer_id ON financial_transactions(customer_id);

-- =====================================================================
-- 5. SUPPORT AND CUSTOMER SERVICE TABLES
-- =====================================================================

-- Trouble reports table
CREATE TABLE IF NOT EXISTS trouble_reports (
    id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(100) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    problem_description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'open',
    priority VARCHAR(50) DEFAULT 'normal',
    category VARCHAR(50) DEFAULT 'general',
    assigned_to INTEGER,
    first_response_at TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_rating INTEGER CHECK (resolution_rating >= 1 AND resolution_rating <= 5),
    resolution TEXT,
    customer_feedback TEXT,
    internal_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_trouble_status CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled')),
    CONSTRAINT chk_trouble_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    CONSTRAINT chk_trouble_category CHECK (category IN ('internet', 'speed', 'billing', 'equipment', 'installation', 'other'))
);

-- Indexes for trouble reports
CREATE INDEX IF NOT EXISTS idx_trouble_status ON trouble_reports(status);
CREATE INDEX IF NOT EXISTS idx_trouble_customer ON trouble_reports(customer_id);
CREATE INDEX IF NOT EXISTS idx_trouble_ticket ON trouble_reports(ticket_number);
CREATE INDEX IF NOT EXISTS idx_trouble_created_at ON trouble_reports(created_at DESC);

-- Support tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id),
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'open',
    assigned_agent VARCHAR(255),
    resolution_time INTEGER,
    customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_support_status CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'))
);

-- Indexes for support tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);

-- Ticket responses table
CREATE TABLE IF NOT EXISTS ticket_responses (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES trouble_reports(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    responder_type VARCHAR(20) CHECK (responder_type IN ('customer', 'admin', 'technician')),
    responder_id INTEGER,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for ticket responses
CREATE INDEX IF NOT EXISTS idx_ticket_responses_ticket ON ticket_responses(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_responder ON ticket_responses(responder_type, responder_id);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_created ON ticket_responses(created_at DESC);

-- =====================================================================
-- 6. REFERRAL AND MARKETING TABLES
-- =====================================================================

-- Referral codes table
CREATE TABLE IF NOT EXISTS referral_codes (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    code VARCHAR(10) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 50
);

-- Indexes for referral codes
CREATE INDEX IF NOT EXISTS idx_referral_codes_customer ON referral_codes(customer_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_active ON referral_codes(is_active);

-- Referral transactions table
CREATE TABLE IF NOT EXISTS referral_transactions (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    referred_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    referral_code_id INTEGER REFERENCES referral_codes(id) ON DELETE SET NULL,
    benefit_type VARCHAR(20) CHECK (benefit_type IN ('discount', 'cash', 'fee_deduction')),
    benefit_amount DECIMAL(12,2),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'expired')),
    applied_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for referral transactions
CREATE INDEX IF NOT EXISTS idx_referral_transactions_referrer ON referral_transactions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_transactions_referred ON referral_transactions(referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_transactions_status ON referral_transactions(status);

-- =====================================================================
-- 7. ACCOUNTING TABLES
-- =====================================================================

-- Accounting categories table
CREATE TABLE IF NOT EXISTS accounting_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('revenue', 'expense')),
    description TEXT,
    color VARCHAR(7) DEFAULT '#6366f1',
    icon VARCHAR(50) DEFAULT 'circle',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Accounting transactions table
CREATE TABLE IF NOT EXISTS accounting_transactions (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES accounting_categories(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('revenue', 'expense')),
    amount DECIMAL(12,2) NOT NULL,
    description TEXT NOT NULL,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    date DATE NOT NULL,
    attachment_url VARCHAR(255),
    notes TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for accounting transactions
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_type ON accounting_transactions(type);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_date ON accounting_transactions(date);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_category ON accounting_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_reference ON accounting_transactions(reference_type, reference_id);

-- =====================================================================
-- 8. CUSTOMER PORTAL TABLES
-- =====================================================================

-- Customer tokens table
CREATE TABLE IF NOT EXISTS customer_tokens (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
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

-- Indexes for customer tokens
CREATE INDEX IF NOT EXISTS idx_customer_tokens_customer ON customer_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tokens_token ON customer_tokens(token);
CREATE INDEX IF NOT EXISTS idx_customer_tokens_active ON customer_tokens(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_customer_tokens_type ON customer_tokens(token_type);

-- Announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    priority VARCHAR(20) DEFAULT 'normal',
    target_type VARCHAR(50) DEFAULT 'all',
    target_customers TEXT[],
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_announcement_type CHECK (type IN ('maintenance', 'outage', 'promo', 'info', 'warning')),
    CONSTRAINT chk_announcement_priority CHECK (priority IN ('critical', 'high', 'normal', 'low')),
    CONSTRAINT chk_announcement_target CHECK (target_type IN ('all', 'active', 'overdue', 'suspended', 'specific'))
);

-- Indexes for announcements
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcements_priority ON announcements(priority DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_target ON announcements(target_type);

-- Customer announcement reads table
CREATE TABLE IF NOT EXISTS customer_announcement_reads (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, announcement_id)
);

-- Indexes for customer announcement reads
CREATE INDEX IF NOT EXISTS idx_customer_reads_customer ON customer_announcement_reads(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_reads_announcement ON customer_announcement_reads(announcement_id);
CREATE INDEX IF NOT EXISTS idx_customer_reads_read_at ON customer_announcement_reads(read_at);

-- =====================================================================
-- 9. SYSTEM MANAGEMENT TABLES
-- =====================================================================

-- System logs table
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    meta JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_log_level CHECK (level IN ('info', 'warn', 'error', 'debug'))
);

-- Indexes for system logs
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);

-- Installations table
CREATE TABLE IF NOT EXISTS installations (
    id SERIAL PRIMARY KEY,
    job_number VARCHAR(100) UNIQUE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    package_id INTEGER REFERENCES packages(id),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    status VARCHAR(50) DEFAULT 'pending',
    technician_id INTEGER,
    technician_name VARCHAR(255),
    scheduled_date TIMESTAMP,
    completed_date TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_install_status CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled'))
);

-- Indexes for installations
CREATE INDEX IF NOT EXISTS idx_installations_status ON installations(status);
CREATE INDEX IF NOT EXISTS idx_installations_job ON installations(job_number);

-- Customer default settings table
CREATE TABLE IF NOT EXISTS customer_default_settings (
    id SERIAL PRIMARY KEY,
    field_name VARCHAR(100) UNIQUE NOT NULL,
    default_value TEXT NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp messages table
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    CONSTRAINT chk_whatsapp_status CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'cancelled'))
);

-- Indexes for WhatsApp messages
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_recipient ON whatsapp_messages(recipient);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_broadcast_id ON whatsapp_messages(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_scheduled_at ON whatsapp_messages(scheduled_at) WHERE status = 'scheduled';

-- =====================================================================
-- 10. TRIGGERS AND FUNCTIONS
-- =====================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_settings_updated_at BEFORE UPDATE ON billing_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_discounts_updated_at BEFORE UPDATE ON billing_discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_installation_fee_settings_updated_at BEFORE UPDATE ON installation_fee_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bulk_payment_settings_updated_at BEFORE UPDATE ON bulk_payment_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_financial_transactions_updated_at BEFORE UPDATE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trouble_reports_updated_at BEFORE UPDATE ON trouble_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounting_transactions_updated_at BEFORE UPDATE ON accounting_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_default_settings_updated_at BEFORE UPDATE ON customer_default_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_messages_updated_at BEFORE UPDATE ON whatsapp_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
    year_part TEXT;
    month_part TEXT;
    sequence_num TEXT;
BEGIN
    year_part := EXTRACT(year FROM CURRENT_DATE)::TEXT;
    month_part := LPAD(EXTRACT(month FROM CURRENT_DATE)::TEXT, 2, '0');

    -- Get next sequence for this month
    SELECT LPAD(COUNT(*) + 1::TEXT, 4, '0')
    INTO sequence_num
    FROM invoices
    WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE);

    RETURN 'INV-' || year_part || month_part || '-' || COALESCE(sequence_num, '0001');
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 11. DEFAULT DATA INSERTION
-- =====================================================================

-- Insert default billing settings
INSERT INTO billing_settings (billing_cycle_type, invoice_advance_days, profile_default_period, fixed_day)
VALUES ('profile', 5, 30, 1)
ON CONFLICT DO NOTHING;

-- Insert default bulk payment settings
INSERT INTO bulk_payment_settings (enabled, discount_1_month_value, discount_2_months_value, discount_3_months_value, discount_6_months_value, discount_12_months_value)
VALUES (true, 0, 0, 5, 10, 15)
ON CONFLICT DO NOTHING;

-- Insert default accounting categories
INSERT INTO accounting_categories (name, type, description, color) VALUES
    ('Installation Fees', 'revenue', 'Revenue from new customer installations', '#10b981'),
    ('Subscription Fees', 'revenue', 'Monthly subscription revenue', '#3b82f6'),
    ('Equipment Sales', 'revenue', 'Revenue from equipment sales', '#8b5cf6'),
    ('Late Payment Fees', 'revenue', 'Fees from late payments', '#f59e0b'),
    ('Salary', 'expense', 'Employee salaries and wages', '#ef4444'),
    ('Equipment', 'expense', 'Network equipment purchases', '#f97316'),
    ('Operational', 'expense', 'Daily operational expenses', '#06b6d4'),
    ('Marketing', 'expense', 'Marketing and advertising expenses', '#ec4899'),
    ('Utilities', 'expense', 'Electricity, internet, and other utilities', '#6366f1')
ON CONFLICT (name) DO NOTHING;

-- Insert default RADIUS groups
INSERT INTO radgroup (groupname, description, priority) VALUES
    ('active', 'Active customers with full internet access', 1),
    ('suspended', 'Suspended customers - no internet access', 2),
    ('isolir', 'Temporarily isolated customers', 3),
    ('default', 'Default customer group', 4)
ON CONFLICT (groupname) DO NOTHING;

-- Insert default RADIUS group attributes
INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
    ('active', 'Service-Type', '=', 'Framed-User'),
    ('active', 'Framed-Protocol', '=', 'PPP'),
    ('active', 'Framed-Compression', '=', 'Van-Jacobson-TCP-IP')
ON CONFLICT DO NOTHING;

-- Insert default customer settings
INSERT INTO customer_default_settings (field_name, default_value, field_type, description) VALUES
    ('auto_renewal', 'true', 'boolean', 'Enable automatic service renewal'),
    ('billing_notifications', 'true', 'boolean', 'Enable billing notifications'),
    ('maintenance_notifications', 'true', 'boolean', 'Enable maintenance notifications'),
    ('marketing_notifications', 'false', 'boolean', 'Enable marketing notifications'),
    ('default_payment_method', 'transfer', 'string', 'Default payment method')
ON CONFLICT (field_name) DO NOTHING;

-- =====================================================================
-- 12. VIEWS FOR COMMON QUERIES
-- =====================================================================

-- View for customer summary with package info
CREATE OR REPLACE VIEW customer_summary AS
SELECT
    c.id,
    c.username,
    c.name,
    c.phone,
    c.email,
    c.status,
    c.join_date,
    c.latitude,
    c.longitude,
    p.name as package_name,
    p.speed as package_speed,
    p.price as package_price,
    COALESCE(i.unpaid_count, 0) as unpaid_invoices,
    COALESCE(i.last_invoice_date, NULL) as last_invoice_date
FROM customers c
LEFT JOIN packages p ON c.package_id = p.id
LEFT JOIN (
    SELECT
        customer_id,
        COUNT(*) as unpaid_count,
        MAX(created_at) as last_invoice_date
    FROM invoices
    WHERE status = 'unpaid'
    GROUP BY customer_id
) i ON c.id = i.customer_id;

-- View for financial summary
CREATE OR REPLACE VIEW financial_summary AS
SELECT
    DATE_TRUNC('month', transaction_date) as month,
    type,
    category,
    SUM(amount) as total_amount,
    COUNT(*) as transaction_count
FROM financial_transactions
WHERE transaction_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', transaction_date), type, category
ORDER BY month DESC, type, category;

-- View for active RADIUS sessions
CREATE OR REPLACE VIEW active_radius_sessions AS
SELECT
    r.acctsessionid,
    r.username,
    r.acctstarttime,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - r.acctstarttime))/3600 as session_hours,
    r.acctinputoctets,
    r.acctoutputoctets,
    r.framedipaddress,
    r.nasipaddress,
    c.name as customer_name
FROM radacct r
LEFT JOIN customers c ON r.username = c.pppoe_username
WHERE r.acctstarttime IS NOT NULL
  AND r.acctstoptime IS NULL;

-- =====================================================================
-- 13. ADMIN USERS TABLE (For both frontend and dashboard authentication)
-- =====================================================================

-- Admin users table
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_admins_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION update_admins_updated_at();

-- Insert default superadmin user (username: admin, password: admin)
-- The password 'admin' is hashed with bcrypt (10 rounds)
INSERT INTO admins (username, email, password_hash, role, is_active)
VALUES ('admin', 'admin@kilusi.id', '$2b$10$.5ri6gvBZCNWjM1JcWRw7OD0RtwYzUXb6iS8xZURw6saIYFxok9Za', 'superadmin', true)
ON CONFLICT (username) DO NOTHING;

-- =====================================================================
-- COMPLETION MESSAGE
-- =====================================================================

DO $$
BEGIN
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'Kilusi Bill Database Initialization Complete!';
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'Database schema created successfully with:';
    RAISE NOTICE '- Core business tables (customers, packages, invoices, payments)';
    RAISE NOTICE '- Network infrastructure tables (NAS, ODPs, cable routes)';
    RAISE NOTICE '- RADIUS authentication tables';
    RAISE NOTICE '- Billing and financial management tables';
    RAISE NOTICE '- Support and customer service tables';
    RAISE NOTICE '- Referral and marketing tables';
    RAISE NOTICE '- Accounting tables';
    RAISE NOTICE '- Customer portal tables';
    RAISE NOTICE '- Admin users table';
    RAISE NOTICE '- System management tables';
    RAISE NOTICE '';
    RAISE NOTICE 'Default data inserted:';
    RAISE NOTICE '- Billing settings and bulk payment discounts';
    RAISE NOTICE '- Accounting categories';
    RAISE NOTICE '- RADIUS groups and attributes';
    RAISE NOTICE '- Customer default settings';
    RAISE NOTICE '- Superadmin user (username: admin, password: admin)';
    RAISE NOTICE '';
    RAISE NOTICE 'Views created for:';
    RAISE NOTICE '- Customer summary with package information';
    RAISE NOTICE '- Financial summary reports';
    RAISE NOTICE '- Active RADIUS sessions';
    RAISE NOTICE '';
    RAISE NOTICE 'Database is ready for use with Kilusi Bill application!';
    RAISE NOTICE '====================================================================';
END $$;