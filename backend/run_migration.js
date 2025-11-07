const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Bismillah321@172.22.10.28:5432/kilusi_bill'
});

async function runMigration() {
  const migrationSQL = `
    -- Add disabled_at column to regions table
    -- This column will be used to soft delete/disable regions instead of permanent deletion

    ALTER TABLE regions ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP NULL DEFAULT NULL;

    -- Create index for better performance when filtering disabled regions
    CREATE INDEX IF NOT EXISTS idx_regions_disabled_at ON regions(disabled_at);

    -- Add comment to describe the column
    COMMENT ON COLUMN regions.disabled_at IS 'Timestamp when region was disabled (soft delete). NULL means active.';
  `;

  try {
    console.log('Running migration for disabled_at column...');
    await pool.query(migrationSQL);
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();