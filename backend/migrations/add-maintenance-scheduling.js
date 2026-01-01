const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');

async function addMaintenanceScheduling() {
  try {
    console.log('Adding maintenance scheduling columns to broadcast_messages table...');

    // Add scheduling columns to broadcast_messages table
    const alterTableQuery = `
      ALTER TABLE broadcast_messages
      ADD COLUMN IF NOT EXISTS is_scheduled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS scheduled_end_time TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS auto_activate BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS auto_deactivate BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS maintenance_type VARCHAR(20) DEFAULT 'general' CHECK (maintenance_type IN ('general', 'emergency', 'planned', 'upgrade', 'network', 'power', 'system')),
      ADD COLUMN IF NOT EXISTS estimated_duration INTEGER, -- in minutes
      ADD COLUMN IF NOT EXISTS affected_services TEXT[], -- array of affected services
      ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255),
      ADD COLUMN IF NOT EXISTS backup_plan TEXT,
      ADD COLUMN IF NOT EXISTS status_after_maintenance VARCHAR(20) DEFAULT 'normal' CHECK (status_after_maintenance IN ('normal', 'improved', 'limited', 'changed'));

      -- Add indexes for scheduled messages
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_scheduled_start ON broadcast_messages(scheduled_start_time) WHERE is_scheduled = true;
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_scheduled_end ON broadcast_messages(scheduled_end_time) WHERE is_scheduled = true;
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_maintenance_type ON broadcast_messages(maintenance_type) WHERE is_scheduled = true;

      -- Add comments
      COMMENT ON COLUMN broadcast_messages.is_scheduled IS 'Whether this message is scheduled for automatic activation/deactivation';
      COMMENT ON COLUMN broadcast_messages.scheduled_start_time IS 'When to automatically activate this message';
      COMMENT ON COLUMN broadcast_messages.scheduled_end_time IS 'When to automatically deactivate this message';
      COMMENT ON COLUMN broadcast_messages.auto_activate IS 'Whether to automatically activate at start time';
      COMMENT ON COLUMN broadcast_messages.auto_deactivate IS 'Whether to automatically deactivate at end time';
      COMMENT ON COLUMN broadcast_messages.maintenance_type IS 'Type of maintenance: general, emergency, planned, upgrade, network, power, system';
      COMMENT ON COLUMN broadcast_messages.estimated_duration IS 'Estimated duration in minutes';
      COMMENT ON COLUMN broadcast_messages.affected_services IS 'List of affected services';
      COMMENT ON COLUMN broadcast_messages.contact_person IS 'Contact person for this maintenance';
      COMMENT ON COLUMN broadcast_messages.backup_plan IS 'Backup plan description';
      COMMENT ON COLUMN broadcast_messages.status_after_maintenance IS 'Expected status after maintenance: normal, improved, limited, changed';
    `;

    await query(alterTableQuery);

    console.log('✅ Maintenance scheduling columns added successfully');
  } catch (error) {
    console.error('❌ Error adding maintenance scheduling columns:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addMaintenanceScheduling()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addMaintenanceScheduling;