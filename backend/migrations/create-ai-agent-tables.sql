-- Migration: Create Internal WhatsApp AI Agent Tables & Settings
-- Specific to internal Baileys assistant (Superadmin, Admin, Mitra, Technician).
-- Does not touch Omnichat or customer chatbot tables.

CREATE TABLE IF NOT EXISTS ai_agent_members (
    id SERIAL PRIMARY KEY,
    member_type VARCHAR(30) NOT NULL CHECK (member_type IN ('superadmin', 'admin', 'mitra', 'technician')),
    ref_id VARCHAR(100),
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(30) NOT NULL UNIQUE,
    can_read BOOLEAN NOT NULL DEFAULT true,
    can_write BOOLEAN NOT NULL DEFAULT false,
    allowed_write_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_members_phone ON ai_agent_members(phone);
CREATE INDEX IF NOT EXISTS idx_ai_agent_members_type ON ai_agent_members(member_type);

CREATE TABLE IF NOT EXISTS ai_agent_conversations (
    phone VARCHAR(30) PRIMARY KEY,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_agent_pending_actions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    member_id INTEGER REFERENCES ai_agent_members(id) ON DELETE SET NULL,
    tool VARCHAR(100) NOT NULL,
    args JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'expired', 'failed')),
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    result JSONB,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_pending_phone_status ON ai_agent_pending_actions(phone, status);
CREATE INDEX IF NOT EXISTS idx_ai_agent_pending_code ON ai_agent_pending_actions(code, status);

CREATE TABLE IF NOT EXISTS ai_agent_audit_log (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(30) NOT NULL,
    member_id INTEGER,
    member_name VARCHAR(200),
    role VARCHAR(30),
    user_message TEXT,
    tool VARCHAR(100),
    args JSONB,
    result_status VARCHAR(40),
    result_summary TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_audit_created_at ON ai_agent_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_audit_phone ON ai_agent_audit_log(phone);

-- Seed default app_config keys (do not overwrite existing values)
INSERT INTO app_config (key, value, type, category, description)
VALUES
    ('ai_agent_enabled', 'false', 'boolean', 'ai_agent', 'Aktifkan Asisten AI Internal di WhatsApp Baileys'),
    ('ai_agent_llm_base_url', 'http://172.22.10.201:20128/v1', 'string', 'ai_agent', 'Base URL OpenAI-compatible LLM endpoint'),
    ('ai_agent_llm_api_key', '', 'string', 'ai_agent', 'API Key untuk LLM endpoint'),
    ('ai_agent_llm_model', 'Whatsapp', 'string', 'ai_agent', 'Model ID untuk Asisten AI Internal'),
    ('ai_agent_daily_token_budget', '2000000', 'number', 'ai_agent', 'Batas pemakaian token harian Asisten AI')
ON CONFLICT (key) DO NOTHING;

-- Seed initial internal members from users (superadmin, admin, technician) and active mitra
INSERT INTO ai_agent_members (member_type, ref_id, name, phone, can_read, can_write, allowed_write_tools, enabled)
SELECT
    CASE
        WHEN u.role = 'superadmin' THEN 'superadmin'
        WHEN u.role IN ('administrator', 'operator') THEN 'admin'
        ELSE 'technician'
    END AS member_type,
    u.id::text AS ref_id,
    u.username AS name,
    REGEXP_REPLACE(REGEXP_REPLACE(TRIM(u.phone), '[^0-9]', '', 'g'), '^0', '62') AS phone,
    true AS can_read,
    (u.role = 'superadmin') AS can_write,
    CASE
        WHEN u.role = 'superadmin' THEN '["record_payment","resend_invoice","update_ticket_status","suspend_service","restore_service"]'::jsonb
        ELSE '[]'::jsonb
    END AS allowed_write_tools,
    true AS enabled
FROM users u
WHERE u.phone IS NOT NULL AND TRIM(u.phone) <> ''
ORDER BY (u.role = 'superadmin') DESC, u.id ASC
ON CONFLICT (phone) DO NOTHING;

INSERT INTO ai_agent_members (member_type, ref_id, name, phone, can_read, can_write, allowed_write_tools, enabled)
SELECT DISTINCT ON (REGEXP_REPLACE(REGEXP_REPLACE(TRIM(m.phone), '[^0-9]', '', 'g'), '^0', '62'))
    'mitra' AS member_type,
    m.id::text AS ref_id,
    m.name AS name,
    REGEXP_REPLACE(REGEXP_REPLACE(TRIM(m.phone), '[^0-9]', '', 'g'), '^0', '62') AS phone,
    true AS can_read,
    false AS can_write,
    '[]'::jsonb AS allowed_write_tools,
    true AS enabled
FROM mitra m
WHERE m.disabled_at IS NULL AND m.phone IS NOT NULL AND TRIM(m.phone) <> ''
ORDER BY REGEXP_REPLACE(REGEXP_REPLACE(TRIM(m.phone), '[^0-9]', '', 'g'), '^0', '62'), m.name ASC
ON CONFLICT (phone) DO NOTHING;
