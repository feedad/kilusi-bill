/**
 * Test file untuk memverifikasi koneksi database langsung
 * Jalankan dengan: npx tsx src/test-db-connection.ts
 */

import Database, { testDatabaseConnection } from './lib/database'

async function testConnection() {
  console.log('🔍 Testing direct database connection from frontend...')

  try {
    // Test basic connection
    const isConnected = await testDatabaseConnection()

    if (isConnected) {
      console.log('✅ Direct database connection successful!')

      // Test dashboard stats
      console.log('📊 Testing dashboard stats query...')
      const stats = await Database.getDashboardStats()
      console.log('Dashboard Stats:', stats)

      // Test recent activities
      console.log('📋 Testing recent activities query...')
      const activities = await Database.getRecentActivities(5)
      console.log('Recent Activities:', activities)

      // Test customers query
      console.log('👥 Testing customers query...')
      const customers = await Database.getCustomers(1, 10)
      console.log('Customers:', customers.customers?.length, 'found')

      console.log('✅ All database tests passed!')
    } else {
      console.error('❌ Database connection failed')
    }
  } catch (error) {
    console.error('❌ Database test error:', error)
  }
}

// Run test if file is executed directly
if (require.main === module) {
  testConnection()
}

export default testConnection