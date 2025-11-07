const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

async function runExtendedNASMigration() {
  // Load settings to get database configuration
  const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'))

  // Create PostgreSQL connection pool using settings from settings.json
  const pool = new Pool({
    host: settings.postgres_host || '172.22.10.28',
    port: settings.postgres_port || 5432,
    database: settings.postgres_database || 'kilusi_bill',
    user: settings.postgres_user || 'kilusi_user',
    password: settings.postgres_password || 'kilusi1234',
    ssl: false,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
  })

  try {
    console.log('Starting extended NAS monitoring fields migration...')

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'postgres/add-extended-nas-fields.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    // Execute the migration
    const client = await pool.connect()
    try {
      await client.query(migrationSQL)
      console.log('✅ Extended NAS monitoring fields migration completed successfully!')

      // Verify the new columns were added
      const result = await client.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_name = 'nas_servers'
        AND table_schema = 'public'
        ORDER BY column_name
      `)

      console.log('\n📋 Current nas_servers columns:')
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}${row.column_default ? ` (default: ${row.column_default})` : ''}`)
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    throw error
  } finally {
    await pool.end()
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  runExtendedNASMigration()
    .then(() => {
      console.log('Migration process completed.')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Migration process failed:', error)
      process.exit(1)
    })
}

module.exports = { runExtendedNASMigration }