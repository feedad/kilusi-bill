const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');

async function createBroadcastMessagesTable() {
  try {
    console.log('Creating broadcast_messages table...');

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS broadcast_messages (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error', 'maintenance')),
        priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        target_areas JSONB,
        target_all BOOLEAN NOT NULL DEFAULT true,
        is_active BOOLEAN NOT NULL DEFAULT true,
        send_push_notification BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_is_active ON broadcast_messages(is_active);
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_type ON broadcast_messages(type);
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_priority ON broadcast_messages(priority);
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_created_at ON broadcast_messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_expires_at ON broadcast_messages(expires_at) WHERE expires_at IS NOT NULL;

      -- Create GIN index for JSONB target_areas
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_target_areas ON broadcast_messages USING GIN(target_areas);

      -- Add comments
      COMMENT ON TABLE broadcast_messages IS 'Table for storing broadcast messages sent to customers';
      COMMENT ON COLUMN broadcast_messages.title IS 'Title of the broadcast message';
      COMMENT ON COLUMN broadcast_messages.message IS 'Content of the broadcast message';
      COMMENT ON COLUMN broadcast_messages.type IS 'Type of message: info, warning, success, error, maintenance';
      COMMENT ON COLUMN broadcast_messages.priority IS 'Priority level: low, medium, high, urgent';
      COMMENT ON COLUMN broadcast_messages.target_areas IS 'JSON array of region names to target';
      COMMENT ON COLUMN broadcast_messages.target_all IS 'Whether to target all customers regardless of region';
      COMMENT ON COLUMN broadcast_messages.is_active IS 'Whether the message is currently active';
      COMMENT ON COLUMN broadcast_messages.send_push_notification IS 'Whether to send browser push notifications';
      COMMENT ON COLUMN broadcast_messages.expires_at IS 'When the message should expire (optional)';
      COMMENT ON COLUMN broadcast_messages.created_by IS 'User ID who created the message';
    `;

    await query(createTableQuery);

    // Create updated_at trigger function if it doesn't exist
    const createTriggerFunctionQuery = `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `;

    await query(createTriggerFunctionQuery);

    // Create trigger for broadcast_messages table
    const createTriggerQuery = `
      DROP TRIGGER IF EXISTS update_broadcast_messages_updated_at ON broadcast_messages;
      CREATE TRIGGER update_broadcast_messages_updated_at
          BEFORE UPDATE ON broadcast_messages
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `;

    await query(createTriggerQuery);

    console.log('✅ broadcast_messages table created successfully');
  } catch (error) {
    console.error('❌ Error creating broadcast_messages table:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  createBroadcastMessagesTable()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = createBroadcastMessagesTable;