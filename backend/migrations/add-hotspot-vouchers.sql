-- Hotspot Voucher System Migration
-- This migration adds tables for hotspot voucher management

-- 1. Vouchers table
CREATE TABLE IF NOT EXISTS vouchers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    username VARCHAR(64),
    password VARCHAR(64),
    profile VARCHAR(64) DEFAULT 'default',
    package_id INTEGER REFERENCES packages(id),
    amount DECIMAL(10,2) NOT NULL,
    duration_hours INTEGER NOT NULL,
    speed_limit VARCHAR(32),

    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending', -- pending, active, used, expired
    payment_status VARCHAR(20) DEFAULT 'unpaid', -- unpaid, paid, failed

    -- Customer info
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    customer_email VARCHAR(100),

    -- Payment tracking
    payment_transaction_id BIGINT REFERENCES payment_transactions(id),
    merchant_ref VARCHAR(100) UNIQUE,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP,
    activated_at TIMESTAMP,
    expires_at TIMESTAMP,
    used_at TIMESTAMP,

    -- Metadata
    metadata JSONB DEFAULT '{}',
    notes TEXT
);

-- Indexes for vouchers
CREATE INDEX idx_vouchers_code ON vouchers(code);
CREATE INDEX idx_vouchers_status ON vouchers(status, payment_status);
CREATE INDEX idx_vouchers_customer_phone ON vouchers(customer_phone);
CREATE INDEX idx_vouchers_merchant_ref ON vouchers(merchant_ref);

-- 2. Voucher usage tracking
CREATE TABLE IF NOT EXISTS voucher_usage (
    id SERIAL PRIMARY KEY,
    voucher_code VARCHAR(64) REFERENCES vouchers(code),
    username VARCHAR(64),
    login_time TIMESTAMP,
    logout_time TIMESTAMP,
    data_usage_mb BIGINT DEFAULT 0,
    duration_minutes INTEGER DEFAULT 0,
    ip_address INET,
    mac_address VARCHAR(17),
    session_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_voucher_usage_code ON voucher_usage(voucher_code);
CREATE INDEX idx_voucher_usage_username ON voucher_usage(username);

-- 3. Hotspot packages configuration
CREATE TABLE IF NOT EXISTS hotspot_packages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_display VARCHAR(100),
    description TEXT,

    -- Pricing
    price DECIMAL(10,2) NOT NULL,
    duration_hours INTEGER NOT NULL,
    speed_limit VARCHAR(32), -- e.g., "10M/10M"

    -- Mikrotik profile
    mikrotik_profile VARCHAR(64) DEFAULT 'default',

    -- Display order
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default hotspot packages
INSERT INTO hotspot_packages (name, name_display, description, price, duration_hours, speed_limit, display_order) VALUES
    ('1JAM', '1 Jam', 'Akses hotspot 1 jam', 3000, 1, '5M/5M', 1),
    ('3JAM', '3 Jam', 'Akses hotspot 3 jam', 7000, 3, '5M/5M', 2),
    ('HARIAN', 'Harian', 'Akses hotspot 24 jam', 15000, 24, '10M/10M', 3),
    ('MINGGUAN', 'Mingguan', 'Akses hotspot 7 hari', 50000, 168, '10M/10M', 4),
    ('BULANAN', 'Bulanan', 'Akses hotspot 30 hari', 150000, 720, '15M/15M', 5)
ON CONFLICT DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE vouchers IS 'Hotspot voucher management table';
COMMENT ON TABLE voucher_usage IS 'Hotspot voucher usage tracking';
COMMENT ON TABLE hotspot_packages IS 'Hotspot package configuration';

COMMENT ON COLUMN vouchers.status IS 'pending, active, used, expired';
COMMENT ON COLUMN vouchers.payment_status IS 'unpaid, paid, failed';
COMMENT ON COLUMN vouchers.expires_at IS 'Auto-calculated based on duration_hours from activated_at';
