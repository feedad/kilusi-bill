-- Voucher Format Settings Table
CREATE TABLE IF NOT EXISTS voucher_format_settings (
    id SERIAL PRIMARY KEY,
    username_prefix VARCHAR(20) DEFAULT 'HS',
    username_length INTEGER DEFAULT 12,
    username_use_numbers BOOLEAN DEFAULT true,
    username_use_uppercase BOOLEAN DEFAULT true,
    username_use_lowercase BOOLEAN DEFAULT false,
    password_same_as_username BOOLEAN DEFAULT true,
    password_length INTEGER DEFAULT 8,
    password_use_numbers BOOLEAN DEFAULT true,
    password_use_uppercase BOOLEAN DEFAULT true,
    password_use_lowercase BOOLEAN DEFAULT false,
    code_template VARCHAR(100) DEFAULT '{PREFIX}-{RANDOM}',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO voucher_format_settings (
    username_prefix,
    username_length,
    username_use_numbers,
    username_use_uppercase,
    username_use_lowercase,
    password_same_as_username,
    password_length,
    code_template,
    description,
    is_active
) VALUES (
    'HS',
    12,
    true,
    true,
    false,
    true,
    8,
    '{PREFIX}-{RANDOM}',
    'Default format: HS-XXXXX (5 karakter random, username=password)',
    true
) ON CONFLICT DO NOTHING;

-- Verify
SELECT * FROM voucher_format_settings WHERE is_active = true;
