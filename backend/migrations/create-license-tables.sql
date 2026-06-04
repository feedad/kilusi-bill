-- License System Database Migration
-- This migration creates all tables needed for the SaaS multi-tenant license system

-- ============================================
-- 1. LICENSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS licenses (
    id SERIAL PRIMARY KEY,
    license_key VARCHAR(255) UNIQUE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    tier VARCHAR(50) NOT NULL CHECK (tier IN ('starter', 'professional', 'enterprise')),
    max_customers INTEGER NOT NULL CHECK (max_customers > 0),
    max_users INTEGER DEFAULT 5 CHECK (max_users > 0),
    max_concurrent_sessions INTEGER DEFAULT 50 CHECK (max_concurrent_sessions >= 0),
    features JSONB DEFAULT '{
        "billing": true,
        "invoices": true,
        "reports": true,
        "whatsapp": false,
        "radius": false,
        "customer_portal": false,
        "genieacs": false,
        "white_label": false,
        "priority_support": false
    }',
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired', 'revoked')),
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_verified_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for licenses table
CREATE INDEX idx_licenses_license_key ON licenses(license_key);
CREATE INDEX idx_licenses_tier ON licenses(tier);
CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_licenses_customer_email ON licenses(customer_email);
CREATE INDEX idx_licenses_expires_at ON licenses(expires_at);

-- ============================================
-- 2. LICENSE_USAGE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS license_usage (
    id SERIAL PRIMARY KEY,
    license_id INTEGER REFERENCES licenses(id) ON DELETE CASCADE,
    metric VARCHAR(100) NOT NULL CHECK (metric IN (
        'active_customers',
        'total_customers',
        'concurrent_sessions',
        'total_auths',
        'api_calls',
        'whatsapp_sent',
        'invoices_generated'
    )),
    current_value INTEGER DEFAULT 0,
    max_value INTEGER,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(license_id, metric)
);

-- Indexes for license_usage table
CREATE INDEX idx_license_usage_license_id ON license_usage(license_id);
CREATE INDEX idx_license_usage_metric ON license_usage(metric);
CREATE INDEX idx_license_usage_recorded_at ON license_usage(recorded_at);

-- ============================================
-- 3. LICENSE_ACTIVATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS license_activations (
    id SERIAL PRIMARY KEY,
    license_id INTEGER REFERENCES licenses(id) ON DELETE CASCADE,
    user_id INTEGER,
    session_token VARCHAR(255),
    ip_address VARCHAR(50),
    user_agent TEXT,
    device_info JSONB DEFAULT '{}',
    logged_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logged_out_at TIMESTAMP,
    logout_reason VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'logged_out')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for license_activations table
CREATE INDEX idx_license_activations_license_id ON license_activations(license_id);
CREATE INDEX idx_license_activations_user_id ON license_activations(user_id);
CREATE INDEX idx_license_activations_status ON license_activations(status);
CREATE INDEX idx_license_activations_last_activity ON license_activations(last_activity_at);

-- ============================================
-- 4. LICENSE_TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS license_transactions (
    id SERIAL PRIMARY KEY,
    license_id INTEGER REFERENCES licenses(id) ON DELETE CASCADE,
    transaction_id VARCHAR(255) UNIQUE,
    invoice_number VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) DEFAULT 'IDR',
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending', 'completed', 'failed', 'refunded', 'cancelled'
    )),
    payment_method VARCHAR(100),
    payment_date TIMESTAMP,
    billing_period_start DATE,
    billing_period_end DATE,
    metadata JSONB DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for license_transactions table
CREATE INDEX idx_license_transactions_license_id ON license_transactions(license_id);
CREATE INDEX idx_license_transactions_transaction_id ON license_transactions(transaction_id);
CREATE INDEX idx_license_transactions_status ON license_transactions(status);
CREATE INDEX idx_license_transactions_payment_date ON license_transactions(payment_date);
CREATE INDEX idx_license_transactions_invoice_number ON license_transactions(invoice_number);

-- ============================================
-- 5. TENTANT_ISPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tenant_isps (
    id SERIAL PRIMARY KEY,
    license_id INTEGER REFERENCES licenses(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE NOT NULL CHECK (subdomain ~ '^[a-z0-9-]+$'),
    database_name VARCHAR(255) UNIQUE NOT NULL,
    database_host VARCHAR(255) DEFAULT 'localhost',
    database_port INTEGER DEFAULT 5432,
    admin_email VARCHAR(255) NOT NULL,
    admin_phone VARCHAR(50),
    realm VARCHAR(255) UNIQUE, -- RADIUS realm (e.g., 'isp-a.com')
    radius_secret VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for tenant_isps table
CREATE INDEX idx_tenant_isps_license_id ON tenant_isps(license_id);
CREATE INDEX idx_tenant_isps_subdomain ON tenant_isps(subdomain);
CREATE INDEX idx_tenant_isps_database_name ON tenant_isps(database_name);
CREATE INDEX idx_tenant_isps_realm ON tenant_isps(realm);
CREATE INDEX idx_tenant_isps_status ON tenant_isps(status);

-- ============================================
-- 6. LICENSE_ACTIVITY_LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS license_activity_log (
    id SERIAL PRIMARY KEY,
    license_id INTEGER REFERENCES licenses(id) ON DELETE CASCADE,
    tenant_id INTEGER REFERENCES tenant_isps(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    actor_id INTEGER,
    actor_email VARCHAR(255),
    actor_type VARCHAR(50) DEFAULT 'admin', -- 'admin', 'system', 'superadmin'
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for license_activity_log table
CREATE INDEX idx_license_activity_log_license_id ON license_activity_log(license_id);
CREATE INDEX idx_license_activity_log_tenant_id ON license_activity_log(tenant_id);
CREATE INDEX idx_license_activity_log_action ON license_activity_log(action);
CREATE INDEX idx_license_activity_log_created_at ON license_activity_log(created_at);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_licenses_updated_at BEFORE UPDATE ON licenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_license_usage_updated_at BEFORE UPDATE ON license_usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_license_transactions_updated_at BEFORE UPDATE ON license_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_isps_updated_at BEFORE UPDATE ON tenant_isps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check if customer limit is reached
CREATE OR REPLACE FUNCTION check_customer_limit(p_license_id INTEGER, p_new_customers INTEGER DEFAULT 1)
RETURNS TABLE(
    allowed BOOLEAN,
    current_customers INTEGER,
    max_customers INTEGER,
    remaining INTEGER
) AS $$
DECLARE
    v_max_customers INTEGER;
    v_current_customers INTEGER;
BEGIN
    -- Get max_customers from license
    SELECT l.max_customers, COALESCE(lu.current_value, 0)
    INTO v_max_customers, v_current_customers
    FROM licenses l
    LEFT JOIN license_usage lu ON lu.license_id = l.id AND lu.metric = 'active_customers'
    WHERE l.id = p_license_id;

    RETURN QUERY SELECT
        (v_current_customers + p_new_customers) <= v_max_customers AS allowed,
        v_current_customers AS current_customers,
        v_max_customers AS max_customers,
        GREATEST(0, v_max_customers - v_current_customers) AS remaining;
END;
$$ LANGUAGE plpgsql;

-- Function to record license usage
CREATE OR REPLACE FUNCTION record_license_usage(
    p_license_id INTEGER,
    p_metric VARCHAR(100),
    p_value INTEGER
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO license_usage (license_id, metric, current_value)
    VALUES (p_license_id, p_metric, p_value)
    ON CONFLICT (license_id, metric)
    DO UPDATE SET
        current_value = EXCLUDED.current_value,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED DATA
-- ============================================

-- Insert superadmin license (for Kilusi internal use)
INSERT INTO licenses (
    license_key,
    customer_name,
    customer_email,
    tier,
    max_customers,
    max_users,
    max_concurrent_sessions,
    features,
    status,
    expires_at,
    metadata
) VALUES (
    'KIL-SUPER-ADMIN-INTERNAL-0000',
    'Kilusi Superadmin',
    'superadmin@kilusi.id',
    'enterprise',
    999999,
    999,
    999999,
    '{
        "billing": true,
        "invoices": true,
        "reports": true,
        "whatsapp": true,
        "radius": true,
        "customer_portal": true,
        "genieacs": true,
        "white_label": true,
        "priority_support": true,
        "superadmin": true
    }'::jsonb,
    'active',
    NULL,
    '{
        "internal": true,
        "auto_renew": true,
        "note": "Superadmin license for Kilusi internal use"
    }'::jsonb
) ON CONFLICT (license_key) DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE licenses IS 'Stores all ISP license information';
COMMENT ON TABLE license_usage IS 'Tracks usage metrics per license (customers, sessions, etc.)';
COMMENT ON TABLE license_activations IS 'Tracks user sessions/logins for license auditing';
COMMENT ON TABLE license_transactions IS 'Stores payment/transaction history for licenses';
COMMENT ON TABLE tenant_isps IS 'Stores ISP tenant information for multi-tenant setup';
COMMENT ON TABLE license_activity_log IS 'Audit log for all license-related activities';

COMMENT ON COLUMN licenses.features IS 'JSONB object containing available features per tier';
COMMENT ON COLUMN tenant_isps.realm IS 'RADIUS realm for this tenant (e.g., isp-a.com)';
COMMENT ON COLUMN tenant_isps.subdomain IS 'Subdomain for this tenant (e.g., isp-a for isp-a.kilusi.id)';
