/**
 * Direct PostgreSQL Database Configuration for Frontend
 * Menghubungkan frontend langsung ke database untuk performa terbaik
 */

import { Pool } from 'pg'

// Database configuration - disesuaikan dengan settings.json
const dbConfig = {
  host: '172.22.10.28',
  port: 5432,
  database: 'kilusi_bill',
  user: 'kilusi_user',
  password: 'kilusi1234',
  // Konfigurasi pool untuk koneksi efisien
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
}

// Create connection pool
const pool = new Pool(dbConfig)

// Helper functions untuk query database
export class Database {
  static async query(text: string, params: any[] = []) {
    const start = Date.now()
    try {
      const result = await pool.query(text, params)
      const duration = Date.now() - start

      if (duration > 1000) {
        console.warn(`Slow query detected (${duration}ms):`, text.substring(0, 100))
      }

      return result
    } catch (error) {
      console.error('Database query error:', error)
      console.error('Query:', text.substring(0, 200))
      console.error('Params:', JSON.stringify(params))
      throw error
    }
  }

  static async getOne(text: string, params: any[] = []) {
    const result = await this.query(text, params)
    return result.rows[0] || null
  }

  static async getAll(text: string, params: any[] = []) {
    const result = await this.query(text, params)
    return result.rows
  }

  static async isConnected() {
    try {
      await this.query('SELECT 1')
      return true
    } catch (error) {
      console.error('Database connection check failed:', error)
      return false
    }
  }

  // Specific queries untuk dashboard
  static async getDashboardStats() {
    const queries = [
      'SELECT COUNT(*) as count FROM customers',
      "SELECT COUNT(*) as count FROM customers WHERE status = 'active'",
      "SELECT COUNT(*) as count FROM customers WHERE status = 'inactive'",
      'SELECT COUNT(*) as count FROM packages',
      `SELECT COALESCE(SUM(amount), 0) as revenue
       FROM invoices
       WHERE status = 'paid'
       AND paid_at IS NOT NULL
       AND EXTRACT(MONTH FROM paid_at) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(YEAR FROM paid_at) = EXTRACT(YEAR FROM CURRENT_DATE)`,
      "SELECT COUNT(*) as count FROM invoices WHERE status = 'unpaid'",
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
       FROM invoices
       WHERE status = 'unpaid' AND due_date < CURRENT_DATE`
    ]

    const results = await Promise.all(queries.map(q => this.getOne(q)))

    return {
      totalCustomers: parseInt(results[0]?.count || 0),
      activeCustomers: parseInt(results[1]?.count || 0),
      inactiveCustomers: parseInt(results[2]?.count || 0),
      totalPackages: parseInt(results[3]?.count || 0),
      monthlyRevenue: parseFloat(results[4]?.revenue || 0),
      pendingInvoices: parseInt(results[5]?.count || 0),
      overdueInvoices: parseInt(results[6]?.count || 0),
      overdueAmount: parseFloat(results[6]?.total_amount || 0),
      onlineCustomers: 0, // Akan diupdate nanti
      customerGrowth: {
        percentage: results[0]?.count > 0 ? ((parseInt(results[1]?.count || 0) / parseInt(results[0]?.count)) * 100).toFixed(1) : 0
      },
      revenueMetrics: {
        averagePerCustomer: results[1]?.count > 0 ? (parseFloat(results[4]?.revenue || 0) / parseInt(results[1]?.count)).toFixed(2) : 0
      }
    }
  }

  static async getRecentActivities(limit = 10) {
    const newCustomers = await this.getAll(`
      SELECT 'new_customer' as type, name, created_at as date,
             'Pelanggan baru ditambahkan' as description
      FROM customers
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit])

    const paidInvoices = await this.getAll(`
      SELECT 'payment' as type, c.name, i.paid_at as date,
             CONCAT('Pembayaran tagihan #', i.invoice_number) as description
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
      ORDER BY i.paid_at DESC
      LIMIT $1
    `, [limit])

    const newInvoices = await this.getAll(`
      SELECT 'invoice' as type, c.name, i.created_at as date,
             CONCAT('Tagihan #', i.invoice_number, ' dibuat') as description
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      ORDER BY i.created_at DESC
      LIMIT $1
    `, [limit])

    // Gabungkan dan urutkan semua aktivitas
    const allActivities = [...newCustomers, ...paidInvoices, ...newInvoices]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit)

    return allActivities
  }

  static async getCustomers(page = 1, limit = 50, search = '', status = '') {
    let whereClause = 'WHERE 1=1'
    const queryParams: any[] = []
    let paramIndex = 1

    if (search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`
      queryParams.push(`%${search}%`)
      paramIndex++
    }

    if (status) {
      whereClause += ` AND status = $${paramIndex}`
      queryParams.push(status)
      paramIndex++
    }

    const offset = (page - 1) * limit

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM customers ${whereClause}`
    const countResult = await this.getOne(countQuery, queryParams)
    const total = parseInt(countResult?.total || 0)

    // Get data
    const dataQuery = `
      SELECT id, name, phone, email, address, package_name, status,
             package_id, created_at, updated_at
      FROM customers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    queryParams.push(limit, offset)

    const customers = await this.getAll(dataQuery, queryParams)

    return {
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  static async getPackages() {
    return await this.getAll(`
      SELECT p.*, COUNT(c.id) as customer_count
      FROM packages p
      LEFT JOIN customers c ON p.id = c.package_id
      WHERE 1=1
      GROUP BY p.id
      ORDER BY p.price ASC
    `)
  }

  static async getInvoices(page = 1, limit = 10, status = '', customerId = '') {
    let whereClause = 'WHERE i.deleted_at IS NULL'
    const queryParams: any[] = []
    let paramIndex = 1

    if (status) {
      whereClause += ` AND i.status = $${paramIndex}`
      queryParams.push(status)
      paramIndex++
    }

    if (customerId) {
      whereClause += ` AND i.customer_id = $${paramIndex}`
      queryParams.push(customerId)
      paramIndex++
    }

    const offset = (page - 1) * limit

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM invoices i ${whereClause}`
    const countResult = await this.getOne(countQuery, queryParams)
    const total = parseInt(countResult?.total || 0)

    // Data query
    const dataQuery = `
      SELECT i.*, c.name as customer_name, c.phone as customer_phone,
             p.name as package_name, p.price as package_price
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      LEFT JOIN packages p ON i.package_id = p.id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    queryParams.push(limit, offset)

    const invoices = await this.getAll(dataQuery, queryParams)

    return {
      invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }
}

// Test koneksi database
export async function testDatabaseConnection() {
  try {
    const isConnected = await Database.isConnected()
    if (isConnected) {
      console.log('✅ Database connection successful')
      return true
    } else {
      console.error('❌ Database connection failed')
      return false
    }
  } catch (error) {
    console.error('❌ Database connection error:', error)
    return false
  }
}

// Close pool saat aplikasi关闭
export async function closeDatabaseConnection() {
  await pool.end()
  console.log('Database connection closed')
}

export default Database