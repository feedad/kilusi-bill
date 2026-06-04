-- Create unified WhatsApp templates table
-- Supports both local and Meta template modes

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id SERIAL PRIMARY KEY,
  template_id VARCHAR(255) UNIQUE NOT NULL,  -- internal ID (e.g., invoice_reminder)
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,  -- pesan dengan {{variable}}
  category VARCHAR(100) DEFAULT 'billing',  -- billing, onboarding, notifications, marketing

  -- Variables extracted from content
  variables JSONB DEFAULT '[]'::JSONB,  -- ["customerName", "amount", "dueDate"]

  -- Meta Template fields
  meta_template_id VARCHAR(255),  -- ID dari Meta setelah approval (e.g., 123456789012345)
  meta_status VARCHAR(50) DEFAULT 'local',  -- local, pending_approval, approved, rejected
  meta_category VARCHAR(50),  -- MARKETING, UTILITY, AUTHENTICATION
  meta_language VARCHAR(10) DEFAULT 'id',  -- id, en

  -- Meta template structure (for submission)
  meta_components JSONB,  -- {header, body, footer, buttons}

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,

  -- Settings
  enabled BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES admins(id),

  -- Constraints
  CONSTRAINT chk_meta_status CHECK (meta_status IN ('local', 'pending_approval', 'approved', 'rejected'))
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_template_id ON whatsapp_templates(template_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_meta_status ON whatsapp_templates(meta_status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_category ON whatsapp_templates(category);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_enabled ON whatsapp_templates(enabled);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER whatsapp_templates_updated_at
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_templates_updated_at();

-- Add comment
COMMENT ON TABLE whatsapp_templates IS 'Unified WhatsApp templates - supports both local and Meta template modes';
COMMENT ON COLUMN whatsapp_templates.meta_status IS 'local: use directly, pending_approval: submitted to Meta, approved: ready to use via Meta, rejected: rejected by Meta';
COMMENT ON COLUMN whatsapp_templates.meta_components IS 'Meta template structure: {header: {type, text}, body: {text}, footer: {text}, buttons: [{type, text}]}';
