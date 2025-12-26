-- Create WhatsApp messages table for persistent message history
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, sent, failed, scheduled
    message_type VARCHAR(50) DEFAULT 'Direct Message', -- Direct Message, Broadcast Message, Template Message
    broadcast_id UUID,
    template_id VARCHAR(100),
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_recipient ON whatsapp_messages(recipient);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_broadcast_id ON whatsapp_messages(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_scheduled_at ON whatsapp_messages(scheduled_at) WHERE status = 'scheduled';

-- Add comments
COMMENT ON TABLE whatsapp_messages IS 'History of all WhatsApp messages sent through the system';
COMMENT ON COLUMN whatsapp_messages.broadcast_id IS 'Associated broadcast campaign if this message was part of a broadcast';
COMMENT ON COLUMN whatsapp_messages.template_id IS 'Template identifier if this message was sent from a template';
COMMENT ON COLUMN whatsapp_messages.status IS 'Current status of the message: pending, processing, sent, failed, or scheduled';