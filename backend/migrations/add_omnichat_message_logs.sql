-- Migration: Add Omnichat Message Logs Table
-- Description: Log all WhatsApp messages sent via Omnichat
-- Date: 2026-03-03

-- Create table for logging WhatsApp messages
CREATE TABLE IF NOT EXISTS omnichat_message_logs (
    id BIGSERIAL PRIMARY KEY,
    message_id VARCHAR(255) UNIQUE,

    -- Recipient info
    phone_number VARCHAR(20) NOT NULL,
    customer_id INTEGER,
    customer_name VARCHAR(255),

    -- Message content
    message_type VARCHAR(50) NOT NULL DEFAULT 'text', -- text, template, image, document, etc.
    message_content TEXT,

    -- Template info (if applicable)
    template_name VARCHAR(255),
    template_parameters JSONB,

    -- Billing context (if applicable)
    billing_context JSONB, -- invoice_number, amount, due_date, etc.
    notification_type VARCHAR(100), -- invoice_created, payment_received, payment_reminder, etc.

    -- Provider info
    provider VARCHAR(50) NOT NULL DEFAULT 'omnichat',
    phone_number_id VARCHAR(100),

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, delivered, read, failed
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Omnichat response
    omnichat_response JSONB,

    -- Metadata
    sent_by INTEGER, -- admin/user ID who sent
    sent_via VARCHAR(50), -- api, dashboard, billing_system
    ip_address INET,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,

    -- Webhook tracking
    webhook_received_at TIMESTAMP WITH TIME ZONE,
    webhook_status VARCHAR(50),
    webhook_data JSONB
);

-- Create indexes for common queries
CREATE INDEX idx_omnichat_logs_phone ON omnichat_message_logs(phone_number);
CREATE INDEX idx_omnichat_logs_customer ON omnichat_message_logs(customer_id);
CREATE INDEX idx_omnichat_logs_status ON omnichat_message_logs(status);
CREATE INDEX idx_omnichat_logs_type ON omnichat_message_logs(notification_type);
CREATE INDEX idx_omnichat_logs_created ON omnichat_message_logs(created_at DESC);
CREATE INDEX idx_omnichat_logs_message_id ON omnichat_message_logs(message_id);
CREATE INDEX idx_omnichat_logs_template ON omnichat_message_logs(template_name);

-- Add comments for documentation
COMMENT ON TABLE omnichat_message_logs IS 'Log semua pesan WhatsApp yang dikirim via Omnichat';
COMMENT ON COLUMN omnichat_message_logs.message_id IS 'Message ID dari WhatsApp/Meta';
COMMENT ON COLUMN omnichat_message_logs.notification_type IS 'Tipe notifikasi: invoice_created, payment_received, dll';
COMMENT ON COLUMN omnichat_message_logs.billing_context IS 'Data terkait billing seperti invoice_number, amount, dll';
COMMENT ON COLUMN omnichat_message_logs.template_parameters IS 'Parameter yang digunakan untuk template message';
COMMENT ON COLUMN omnichat_message_logs.status IS 'Status pesan: pending, sent, delivered, read, failed';
COMMENT ON COLUMN omnichat_message_logs.webhook_data IS 'Data webhook dari WhatsApp untuk update status';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON omnichat_message_logs TO kilusi_user;
GRANT USAGE, SELECT ON SEQUENCE omnichat_message_logs_id_seq TO kilusi_user;
