const express = require('express')
const router = express.Router()
const { logger } = require('../../../config/logger')
const { query } = require('../../../config/database')

// GET /api/v1/accounting/categories - Get all accounting categories
router.get('/categories', async (req, res) => {
  try {
    const { type } = req.query

    let queryText = `
      SELECT
        id,
        name,
        type,
        description,
        color,
        icon,
        is_active,
        created_at,
        updated_at
      FROM accounting_categories
      WHERE is_active = true
    `

    const queryParams = []
    if (type && ['revenue', 'expense'].includes(type)) {
      queryText += ' AND type = $1'
      queryParams.push(type)
    }

    queryText += " AND name NOT IN ('Fee Teknisi', 'Fee Marketing') ORDER BY type, name"

    const result = await query(queryText, queryParams)

    const categories = result.rows.map(cat => ({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      description: cat.description,
      color: cat.color,
      icon: cat.icon,
      is_active: cat.is_active,
      created_at: cat.created_at,
      updated_at: cat.updated_at
    }))

    res.json({
      success: true,
      data: categories
    })

  } catch (error) {
    logger.error('Error fetching accounting categories:', error)
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil kategori akunting'
    })
  }
})

// GET /api/v1/accounting/transactions - Get all accounting transactions
router.get('/transactions', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      category_id,
      mitra_id,
      start_date,
      end_date,
      search
    } = req.query

    const offset = (page - 1) * limit
    let queryText = `
      SELECT
        at.id,
        at.type,
        at.amount,
        at.description,
        at.reference_type,
        at.reference_id,
        at.mitra_id,
        m.name as mitra_name,
        at.date,
        at.attachment_url,
        at.notes,
        at.created_at,
        at.updated_at,
        ac.name as category_name,
        ac.color as category_color,
        ac.icon as category_icon,
        u.username as created_by_name
      FROM accounting_transactions at
      LEFT JOIN accounting_categories ac ON at.category_id = ac.id
      LEFT JOIN users u ON at.created_by = u.id
      LEFT JOIN mitra m ON at.mitra_id = m.id
      WHERE 1=1
    `

    const queryParams = []
    let paramIndex = 1

    if (type && ['revenue', 'expense'].includes(type)) {
      queryText += ` AND at.type = $${paramIndex++}`
      queryParams.push(type)
    }

    if (category_id) {
      queryText += ` AND at.category_id = $${paramIndex++}`
      queryParams.push(category_id)
    }

    if (mitra_id) {
      queryText += ` AND at.mitra_id = $${paramIndex++}::uuid`
      queryParams.push(mitra_id)
    }

    if (start_date) {
      queryText += ` AND at.date >= $${paramIndex++}`
      queryParams.push(start_date)
    }

    if (end_date) {
      queryText += ` AND at.date <= $${paramIndex++}`
      queryParams.push(end_date)
    }

    if (search) {
      queryText += ` AND (at.description ILIKE $${paramIndex++} OR at.notes ILIKE $${paramIndex++})`
      queryParams.push(`%${search}%`, `%${search}%`)
    }

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as count
      FROM accounting_transactions at
      LEFT JOIN accounting_categories ac ON at.category_id = ac.id
      LEFT JOIN users u ON at.created_by = u.id
      WHERE 1=1
    `

    const countParams = []
    let countParamIndex = 1

    if (type && ['revenue', 'expense'].includes(type)) {
      countQuery += ` AND at.type = $${countParamIndex++}`
      countParams.push(type)
    }

    if (category_id) {
      countQuery += ` AND at.category_id = $${countParamIndex++}`
      countParams.push(category_id)
    }

    if (mitra_id) {
      countQuery += ` AND at.mitra_id = $${countParamIndex++}::uuid`
      countParams.push(mitra_id)
    }

    if (start_date) {
      countQuery += ` AND at.date >= $${countParamIndex++}`
      countParams.push(start_date)
    }

    if (end_date) {
      countQuery += ` AND at.date <= $${countParamIndex++}`
      countParams.push(end_date)
    }

    if (search) {
      countQuery += ` AND (at.description ILIKE $${countParamIndex++} OR at.notes ILIKE $${countParamIndex++})`
      countParams.push(`%${search}%`, `%${search}%`)
    }

    const countResult = await query(countQuery, countParams)
    const totalCount = parseInt(countResult.rows[0].count)

    // Get paginated results
    queryText += ` ORDER BY at.date DESC, at.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`
    queryParams.push(limit, offset)

    const result = await query(queryText, queryParams)

    const transactions = result.rows.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount),
      description: tx.description,
      reference_type: tx.reference_type,
      reference_id: tx.reference_id,
      mitra_id: tx.mitra_id,
      mitra_name: tx.mitra_name,
      date: tx.date,
      attachment_url: tx.attachment_url,
      notes: tx.notes,
      category: tx.category_name ? {
        name: tx.category_name,
        color: tx.category_color,
        icon: tx.category_icon
      } : null,
      created_by: tx.created_by_name,
      created_at: tx.created_at,
      updated_at: tx.updated_at
    }))

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      }
    })

  } catch (error) {
    logger.error('Error fetching accounting transactions:', error)
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil transaksi akunting'
    })
  }
})

// POST /api/v1/accounting/transactions - Create new transaction
router.post('/transactions', async (req, res) => {
  try {
    const {
      category_id,
      type,
      amount,
      description,
      reference_type,
      reference_id,
      date,
      attachment_url,
      notes
    } = req.body

    // Validation
    if (!type || !['revenue', 'expense'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Tipe transaksi harus revenue atau expense'
      })
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Jumlah harus lebih dari 0'
      })
    }

    if (!description || description.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Deskripsi wajib diisi'
      })
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Tanggal wajib diisi'
      })
    }

    // Validate category_id exists if provided
    if (category_id) {
      const catCheck = await query('SELECT id FROM accounting_categories WHERE id = $1', [category_id])
      if (catCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Kategori akunting tidak ditemukan'
        })
      }
    }

    const insertQuery = `
      INSERT INTO accounting_transactions (
        category_id, type, amount, description, reference_type,
        reference_id, date, attachment_url, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `

    // Parse user ID - handle both string and numeric IDs
    let userId = null
    if (req.user?.id) {
      const parsedId = parseInt(req.user.id)
      userId = isNaN(parsedId) ? null : parsedId
    }

    const result = await query(insertQuery, [
      category_id || null,
      type,
      parseFloat(amount),
      description.trim(),
      reference_type || null,
      reference_id || null,
      date,
      attachment_url || null,
      notes || null,
      userId
    ])

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Gagal membuat transaksi akunting'
      })
    }

    const transaction = result.rows[0]

    // Get category info
    let categoryInfo = null
    if (transaction.category_id) {
      const categoryQuery = 'SELECT name, color, icon FROM accounting_categories WHERE id = $1'
      const categoryResult = await query(categoryQuery, [transaction.category_id])
      if (categoryResult.rows.length > 0) {
        categoryInfo = {
          name: categoryResult.rows[0].name,
          color: categoryResult.rows[0].color,
          icon: categoryResult.rows[0].icon
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Transaksi akunting berhasil dibuat',
      data: {
        id: transaction.id,
        type: transaction.type,
        amount: parseFloat(transaction.amount),
        description: transaction.description,
        reference_type: transaction.reference_type,
        reference_id: transaction.reference_id,
        date: transaction.date,
        attachment_url: transaction.attachment_url,
        notes: transaction.notes,
        category: categoryInfo,
        created_at: transaction.created_at,
        updated_at: transaction.updated_at
      }
    })

  } catch (error) {
    console.error('Error creating accounting transaction:', error)
    console.error('Request body:', req.body)
    console.error('Request user:', req.user)
    logger.error('Error creating accounting transaction:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      user: req.user
    })

    // Handle foreign key violation
    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Kategori akunting tidak valid atau telah dihapus'
      })
    }

    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat transaksi akunting',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

// PUT /api/v1/accounting/transactions/:id - Update transaction
router.put('/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      category_id,
      amount,
      description,
      reference_type,
      reference_id,
      date,
      attachment_url,
      notes
    } = req.body

    // Validation
    if (amount && amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Jumlah harus lebih dari 0'
      })
    }

    if (description && description.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Deskripsi tidak boleh kosong'
      })
    }

    const updateQuery = `
      UPDATE accounting_transactions
      SET
        category_id = COALESCE($1, category_id),
        amount = COALESCE($2, amount),
        description = COALESCE($3, description),
        reference_type = COALESCE($4, reference_type),
        reference_id = COALESCE($5, reference_id),
        date = COALESCE($6, date),
        attachment_url = COALESCE($7, attachment_url),
        notes = COALESCE($8, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `

    const result = await query(updateQuery, [
      category_id,
      amount ? parseFloat(amount) : null,
      description ? description.trim() : null,
      reference_type,
      reference_id,
      date,
      attachment_url,
      notes,
      id
    ])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi akunting tidak ditemukan'
      })
    }

    const transaction = result.rows[0]

    // Get category info
    let categoryInfo = null
    if (transaction.category_id) {
      const categoryQuery = 'SELECT name, color, icon FROM accounting_categories WHERE id = $1'
      const categoryResult = await query(categoryQuery, [transaction.category_id])
      if (categoryResult.rows.length > 0) {
        categoryInfo = {
          name: categoryResult.rows[0].name,
          color: categoryResult.rows[0].color,
          icon: categoryResult.rows[0].icon
        }
      }
    }

    res.json({
      success: true,
      message: 'Transaksi akunting berhasil diperbarui',
      data: {
        id: transaction.id,
        type: transaction.type,
        amount: parseFloat(transaction.amount),
        description: transaction.description,
        reference_type: transaction.reference_type,
        reference_id: transaction.reference_id,
        date: transaction.date,
        attachment_url: transaction.attachment_url,
        notes: transaction.notes,
        category: categoryInfo,
        created_at: transaction.created_at,
        updated_at: transaction.updated_at
      }
    })

  } catch (error) {
    logger.error('Error updating accounting transaction:', error)
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui transaksi akunting'
    })
  }
})

// DELETE /api/v1/accounting/transactions/:id - Delete transaction
router.delete('/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params

    // Check if transaction exists
    const checkQuery = 'SELECT * FROM accounting_transactions WHERE id = $1'
    const checkResult = await query(checkQuery, [id])

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi akunting tidak ditemukan'
      })
    }

    const deleteQuery = 'DELETE FROM accounting_transactions WHERE id = $1 RETURNING *'
    const result = await query(deleteQuery, [id])

    const deletedTransaction = result.rows[0]

    res.json({
      success: true,
      message: 'Transaksi akunting berhasil dihapus',
      data: {
        id: deletedTransaction.id,
        type: deletedTransaction.type,
        amount: parseFloat(deletedTransaction.amount),
        description: deletedTransaction.description
      }
    })

  } catch (error) {
    logger.error('Error deleting accounting transaction:', error)
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus transaksi akunting'
    })
  }
})

// GET /api/v1/accounting/summary - Get accounting summary (defaults to current month)
router.get('/summary', async (req, res) => {
  try {
    const { start_date, end_date, mitra_id } = req.query

    // Default to current month if no date range provided
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const defaultStart = `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const defaultEnd = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(lastDay)}`;

    const startDateToUse = start_date || defaultStart;
    const endDateToUse = end_date || defaultEnd;

    let queryText = `
      SELECT
        type,
        SUM(amount) as total_amount,
        COUNT(*) as transaction_count
      FROM accounting_transactions
      WHERE 1=1
    `

    const queryParams = []
    let paramIndex = 1

    if (startDateToUse) {
      queryText += ` AND date >= $${paramIndex++}`
      queryParams.push(startDateToUse)
    }

    if (endDateToUse) {
      queryText += ` AND date <= $${paramIndex++}`
      queryParams.push(endDateToUse)
    }

    if (mitra_id) {
      queryText += ` AND mitra_id = $${paramIndex++}::uuid`
      queryParams.push(mitra_id)
    }

    queryText += ' GROUP BY type'

    const result = await query(queryText, queryParams)

    // Also get admin fee totals from invoices, split by fee_bearer
    // Only merchant-borne fees reduce our actual revenue
    let feeQuery = `
      SELECT
        COALESCE(SUM(payment_fee_amount) FILTER (WHERE fee_bearer = 'merchant'), 0) as merchant_borne_fee,
        COALESCE(SUM(payment_fee_amount) FILTER (WHERE fee_bearer = 'customer'), 0) as customer_borne_fee,
        COALESCE(SUM(payment_fee_amount), 0) as total_admin_fee
      FROM invoices WHERE status = 'paid' AND payment_fee_amount > 0
        AND payment_date >= $1 AND payment_date <= $2
    `
    const feeResult = await query(feeQuery, [startDateToUse, endDateToUse])
    const merchantFee = parseFloat(feeResult.rows[0].merchant_borne_fee) || 0
    const adminFee = parseFloat(feeResult.rows[0].total_admin_fee) || 0

    const summary = {
      revenue: 0,
      revenue_count: 0,
      expense: 0,
      expense_count: 0,
      admin_fee: adminFee,
      merchant_borne_fee: merchantFee,
      customer_borne_fee: adminFee - merchantFee,
      profit: 0,
      total_transactions: 0
    }

    result.rows.forEach(row => {
      if (row.type === 'revenue') {
        summary.revenue = parseFloat(row.total_amount)
        summary.revenue_count = parseInt(row.transaction_count)
      } else if (row.type === 'expense') {
        summary.expense = parseFloat(row.total_amount)
        summary.expense_count = parseInt(row.transaction_count)
      }
    })

    // Only merchant-borne fees reduce our actual profit
    // Customer-borne fees are paid by customers on top of our price, not our expense
    summary.profit = summary.revenue - summary.expense - merchantFee
    summary.total_transactions = summary.revenue_count + summary.expense_count

    res.json({
      success: true,
      data: { summary }
    })

  } catch (error) {
    logger.error('Error fetching accounting summary:', error)
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil ringkasan akunting'
    })
  }
})

// GET /api/v1/accounting/report/profit-loss - Generate profit & loss report
router.get('/report/profit-loss', async (req, res) => {
  try {
    const { start_date, end_date, mitra_id, group_by = 'month' } = req.query

    // Validate group_by
    const validGroups = ['day', 'week', 'month', 'quarter', 'year']
    if (!validGroups.includes(group_by)) {
      return res.status(400).json({
        success: false,
        message: 'group_by harus salah satu dari: day, week, month, quarter, year'
      })
    }

    let queryText = `
      SELECT
        DATE_TRUNC($1, at.date) as period,
        SUM(CASE WHEN at.type = 'revenue' THEN at.amount ELSE 0 END) as revenue,
        SUM(CASE WHEN at.type = 'expense' THEN at.amount ELSE 0 END) as expense,
        SUM(CASE WHEN at.type = 'revenue' THEN at.amount ELSE 0 END) -
        SUM(CASE WHEN at.type = 'expense' THEN at.amount ELSE 0 END) as profit,
        COUNT(*) as total_transactions
      FROM accounting_transactions at
      WHERE 1=1
    `

    const queryParams = [group_by]
    let paramIndex = 2

    if (start_date) {
      queryText += ` AND at.date >= $${paramIndex++}`
      queryParams.push(start_date)
    }

    if (end_date) {
      queryText += ` AND at.date <= $${paramIndex++}`
      queryParams.push(end_date)
    }

    if (mitra_id) {
      queryText += ` AND at.mitra_id = $${paramIndex++}::uuid`
      queryParams.push(mitra_id)
    }

    queryText += ` GROUP BY DATE_TRUNC($1, at.date) ORDER BY period DESC`

    const result = await query(queryText, queryParams)

    // Get admin fees grouped by same period, split by fee_bearer
    // Only merchant-borne fees reduce our profit
    let feeQuery = `SELECT DATE_TRUNC($1, i.payment_date) as period,
      COALESCE(SUM(i.payment_fee_amount) FILTER (WHERE i.fee_bearer = 'merchant'), 0) as merchant_fee,
      COALESCE(SUM(i.payment_fee_amount), 0) as total_fee
      FROM invoices i WHERE i.status = 'paid' AND i.payment_fee_amount > 0`
    const feeParams = [group_by]
    let feeIdx = 2
    if (start_date) {
      feeQuery += ` AND i.payment_date >= $${feeIdx++}`
      feeParams.push(start_date)
    }
    if (end_date) {
      feeQuery += ` AND i.payment_date <= $${feeIdx++}`
      feeParams.push(end_date)
    }
    feeQuery += ` GROUP BY DATE_TRUNC($1, i.payment_date)`

    const feeResult = await query(feeQuery, feeParams)

    // Build a map of period -> fees
    const feeMap = {}
    feeResult.rows.forEach(row => {
      const key = new Date(row.period).toISOString()
      feeMap[key] = {
        merchant_fee: parseFloat(row.merchant_fee) || 0,
        total_fee: parseFloat(row.total_fee) || 0
      }
    })

    const reportData = result.rows.map(row => {
      const fees = feeMap[new Date(row.period).toISOString()] || { merchant_fee: 0, total_fee: 0 }
      const revenue = parseFloat(row.revenue)
      const expense = parseFloat(row.expense)
      // Only merchant-borne fees reduce our actual profit
      const profit = revenue - expense - fees.merchant_fee

      return {
        period: row.period,
        revenue,
        expense,
        admin_fee: fees.total_fee,
        merchant_borne_fee: fees.merchant_fee,
        profit,
        total_transactions: parseInt(row.total_transactions),
        profit_margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : '0.00'
      }
    })

    res.json({
      success: true,
      data: {
        report_data: reportData,
        filters: {
          start_date,
          end_date,
          group_by
        }
      }
    })

  } catch (error) {
    logger.error('Error generating profit & loss report:', error)
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat laporan laba rugi'
    })
  }
})

// POST /api/v1/accounting/categories - Create new category
router.post('/categories', async (req, res) => {
  try {
    const {
      name,
      type,
      description,
      color,
      icon
    } = req.body

    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Nama kategori wajib diisi'
      })
    }

    if (!type || !['revenue', 'expense'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Tipe kategori harus revenue atau expense'
      })
    }

    const insertQuery = `
      INSERT INTO accounting_categories (
        name, type, description, color, icon
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `

    const result = await query(insertQuery, [
      name.trim(),
      type,
      description?.trim() || null,
      color || '#ef4444',
      icon || 'credit-card'
    ])

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Gagal membuat kategori akunting'
      })
    }

    const category = result.rows[0]

    res.status(201).json({
      success: true,
      message: 'Kategori akunting berhasil dibuat',
      data: {
        id: category.id,
        name: category.name,
        type: category.type,
        description: category.description,
        color: category.color,
        icon: category.icon,
        is_active: category.is_active,
        created_at: category.created_at,
        updated_at: category.updated_at
      }
    })

  } catch (error) {
    console.error('Error creating accounting category:', error)
    console.error('Request body:', req.body)
    logger.error('Error creating accounting category:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      user: req.user
    })

    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        message: 'Kategori dengan nama ini sudah ada',
        error: 'duplicate key value violates unique constraint'
      })
    }

    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat kategori akunting',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

// PUT /api/v1/accounting/categories/:id - Update category
router.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      name,
      type,
      description,
      color,
      icon
    } = req.body

    // Validation
    if (name && name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Nama kategori tidak boleh kosong'
      })
    }

    if (type && !['revenue', 'expense'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Tipe kategori harus revenue atau expense'
      })
    }

    const updateQuery = `
      UPDATE accounting_categories
      SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        description = COALESCE($3, description),
        color = COALESCE($4, color),
        icon = COALESCE($5, icon),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `

    const result = await query(updateQuery, [
      name ? name.trim() : null,
      type,
      description ? description.trim() : null,
      color,
      icon,
      id
    ])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kategori akunting tidak ditemukan'
      })
    }

    const category = result.rows[0]

    res.json({
      success: true,
      message: 'Kategori akunting berhasil diperbarui',
      data: {
        id: category.id,
        name: category.name,
        type: category.type,
        description: category.description,
        color: category.color,
        icon: category.icon,
        is_active: category.is_active,
        created_at: category.created_at,
        updated_at: category.updated_at
      }
    })

  } catch (error) {
    logger.error('Error updating accounting category:', error)
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui kategori akunting'
    })
  }
})

// DELETE /api/v1/accounting/categories/:id - Delete category
router.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params

    // Check if category is being used in transactions
    const checkQuery = 'SELECT COUNT(*) as count FROM accounting_transactions WHERE category_id = $1'
    const checkResult = await query(checkQuery, [id])
    const transactionCount = parseInt(checkResult.rows[0].count)

    if (transactionCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Kategori tidak dapat dihapus karena sudah digunakan dalam ${transactionCount} transaksi`
      })
    }

    const deleteQuery = 'DELETE FROM accounting_categories WHERE id = $1 RETURNING *'
    const result = await query(deleteQuery, [id])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kategori akunting tidak ditemukan'
      })
    }

    const deletedCategory = result.rows[0]

    res.json({
      success: true,
      message: 'Kategori akunting berhasil dihapus',
      data: {
        id: deletedCategory.id,
        name: deletedCategory.name,
        type: deletedCategory.type
      }
    })

  } catch (error) {
    logger.error('Error deleting accounting category:', error)
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus kategori akunting'
    })
  }
})

// GET /api/v1/accounting/report/daily - Get daily breakdown report
router.get('/report/daily', async (req, res) => {
  try {
    const { start_date, end_date, mitra_id, type } = req.query;

    let queryText = `
      SELECT
        at.id,
        at.date,
        at.type,
        at.amount,
        at.description,
        at.reference_type,
        at.reference_id,
        at.mitra_id,
        m.name as mitra_name,
        ac.name as category_name,
        ac.color as category_color,
        at.created_at
      FROM accounting_transactions at
      LEFT JOIN accounting_categories ac ON at.category_id = ac.id
      LEFT JOIN mitra m ON at.mitra_id = m.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (start_date) {
      queryText += ` AND at.date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      queryText += ` AND at.date <= $${idx++}`;
      params.push(end_date);
    }
    if (mitra_id) {
      queryText += ` AND at.mitra_id = $${idx++}::uuid`;
      params.push(mitra_id);
    }
    if (type && ['revenue', 'expense'].includes(type)) {
      queryText += ` AND at.type = $${idx++}`;
      params.push(type);
    }

    queryText += ` ORDER BY at.date ASC, at.created_at ASC`;

    const result = await query(queryText, params);
    const rows = result.rows;

    // Group by date
    const daysMap = new Map();
    let grandRevenue = 0;
    let grandExpense = 0;

    rows.forEach(r => {
      const dateKey = r.date ? new Date(r.date).toISOString().split('T')[0] : 'Tanpa Tanggal';
      if (!daysMap.has(dateKey)) {
        daysMap.set(dateKey, {
          date: dateKey,
          transactions: [],
          totalRevenue: 0,
          totalExpense: 0,
          netBalance: 0
        });
      }
      const dayObj = daysMap.get(dateKey);
      const amt = parseFloat(r.amount) || 0;
      if (r.type === 'revenue') {
        dayObj.totalRevenue += amt;
        grandRevenue += amt;
      } else {
        dayObj.totalExpense += amt;
        grandExpense += amt;
      }
      dayObj.netBalance = dayObj.totalRevenue - dayObj.totalExpense;
      dayObj.transactions.push({
        id: r.id,
        type: r.type,
        amount: amt,
        description: r.description,
        category_name: r.category_name || '-',
        mitra_name: r.mitra_name || '-',
        created_at: r.created_at
      });
    });

    const dailyData = Array.from(daysMap.values());

    res.json({
      success: true,
      data: {
        daily: dailyData,
        summary: {
          totalRevenue: grandRevenue,
          totalExpense: grandExpense,
          netProfit: grandRevenue - grandExpense,
          totalTransactions: rows.length,
          daysCount: dailyData.length
        }
      }
    });
  } catch (error) {
    logger.error('Error in daily accounting report:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil laporan harian' });
  }
});

// GET /api/v1/accounting/report/mitra-settlement - Cross-settlement report between company and mitras
router.get('/report/mitra-settlement', async (req, res) => {
  try {
    const { start_date, end_date, mitra_id } = req.query;

    const { getSetting } = require('../../../config/settingsManager');
    const rawPS = getSetting('payment_settings');
    let paymentSettings = {};
    try { paymentSettings = typeof rawPS === 'string' ? JSON.parse(rawPS) : (rawPS || {}); } catch (e) {}

    const bankAccounts = paymentSettings.bank_accounts || [];
    const ewallets = paymentSettings.ewallets || [];

    // Helper: determine destination category of payment_method
    const getDestinationCategory = (method) => {
      if (!method) return { type: 'unknown', name: 'Unknown' };
      const m = String(method).toLowerCase();
      if (m === 'cash' || m === 'tunai') return { type: 'cash', name: 'Kas Tunai' };
      if (m.startsWith('autopay')) return { type: 'company', name: 'Autopay (Pusat)' };
      if (m.startsWith('tripay') || m === 'qris') return { type: 'company', name: 'QRIS / Tripay (Pusat)' };

      if (method.startsWith('bank_')) {
        const id = method.replace('bank_', '');
        const acc = bankAccounts.find(b => String(b.id) === String(id));
        if (acc) {
          if (acc.is_company === true) return { type: 'company', name: `${acc.bankName} (Perusahaan)` };
          const mIds = Array.isArray(acc.mitra_ids) ? acc.mitra_ids : (acc.mitra_id ? [acc.mitra_id] : []);
          return { type: 'mitra', mitra_ids: mIds, name: `${acc.bankName} (${acc.accountNumber})` };
        }
      }

      if (method.startsWith('ewallet_')) {
        const id = method.replace('ewallet_', '');
        const w = ewallets.find(e => String(e.id) === String(id));
        if (w) {
          if (w.is_company === true) return { type: 'company', name: `${w.provider} (Perusahaan)` };
          const mIds = Array.isArray(w.mitra_ids) ? w.mitra_ids : (w.mitra_id ? [w.mitra_id] : []);
          return { type: 'mitra', mitra_ids: mIds, name: `${w.provider} (${w.phoneNumber})` };
        }
      }

      return { type: 'other', name: method };
    };

    let queryText = `
      SELECT
        p.id as payment_id,
        p.amount,
        p.payment_date,
        p.payment_method,
        p.notes,
        i.invoice_number,
        c.name as customer_name,
        m.id as customer_mitra_id,
        m.name as customer_mitra_name,
        r.name as region_name
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      LEFT JOIN services s ON s.service_number = i.service_number
      LEFT JOIN regions r ON r.id = s.region_id
      LEFT JOIN mitra m ON r.mitra_id = m.id
      WHERE p.is_rolled_back = FALSE
    `;
    const params = [];
    let idx = 1;

    if (start_date) {
      queryText += ` AND p.payment_date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      queryText += ` AND p.payment_date <= $${idx++}`;
      params.push(end_date);
    }
    if (mitra_id) {
      queryText += ` AND m.id = $${idx++}::uuid`;
      params.push(mitra_id);
    }

    queryText += ` ORDER BY p.payment_date DESC, p.created_at DESC`;

    const result = await query(queryText, params);
    const payments = result.rows;

    // Build Mitra settlement summary
    const mitraSummaries = new Map();

    payments.forEach(p => {
      const mitraKey = p.customer_mitra_id || 'pusat_direct';
      const mitraName = p.customer_mitra_name || 'Pelanggan Pusat (Tanpa Mitra)';

      if (!mitraSummaries.has(mitraKey)) {
        mitraSummaries.set(mitraKey, {
          mitra_id: p.customer_mitra_id || null,
          mitra_name: mitraName,
          total_revenue: 0,
          received_in_mitra_account: 0,
          received_in_company_account: 0, // Pusat owes to Mitra
          received_in_other_mitra: 0,
          received_in_cash: 0,
          transactions: []
        });
      }

      const summaryObj = mitraSummaries.get(mitraKey);
      const amt = parseFloat(p.amount) || 0;
      summaryObj.total_revenue += amt;

      const dest = getDestinationCategory(p.payment_method);
      let classification = 'other';

      if (dest.type === 'cash') {
        summaryObj.received_in_cash += amt;
        classification = 'cash';
      } else if (dest.type === 'company') {
        summaryObj.received_in_company_account += amt;
        classification = 'company_account';
      } else if (dest.type === 'mitra') {
        const matchesCustomerMitra = p.customer_mitra_id && dest.mitra_ids?.map(String).includes(String(p.customer_mitra_id));
        if (matchesCustomerMitra) {
          summaryObj.received_in_mitra_account += amt;
          classification = 'own_mitra_account';
        } else {
          summaryObj.received_in_other_mitra += amt;
          classification = 'other_mitra_account';
        }
      } else {
        summaryObj.received_in_company_account += amt;
        classification = 'company_account';
      }

      summaryObj.transactions.push({
        payment_id: p.payment_id,
        invoice_number: p.invoice_number,
        customer_name: p.customer_name,
        region_name: p.region_name || '-',
        amount: amt,
        payment_date: p.payment_date,
        payment_method: p.payment_method,
        destination_name: dest.name,
        classification
      });
    });

    res.json({
      success: true,
      data: {
        mitras: Array.from(mitraSummaries.values()),
        total_payments_count: payments.length,
        period: { start_date: start_date || null, end_date: end_date || null }
      }
    });
  } catch (error) {
    logger.error('Error in mitra settlement report:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat laporan rekonsiliasi mitra' });
  }
});

// GET /api/v1/accounting/export/excel - Export transactions to true .xlsx workbook
router.get('/export/excel', async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { start_date, end_date, mitra_id, type } = req.query;

    let queryText = `
      SELECT
        at.id,
        at.date,
        at.description,
        ac.name as category_name,
        at.type,
        at.amount,
        m.name as mitra_name,
        u.username as created_by_name
      FROM accounting_transactions at
      LEFT JOIN accounting_categories ac ON at.category_id = ac.id
      LEFT JOIN mitra m ON at.mitra_id = m.id
      LEFT JOIN users u ON at.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (start_date) {
      queryText += ` AND at.date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      queryText += ` AND at.date <= $${idx++}`;
      params.push(end_date);
    }
    if (mitra_id) {
      queryText += ` AND at.mitra_id = $${idx++}::uuid`;
      params.push(mitra_id);
    }
    if (type && ['revenue', 'expense'].includes(type)) {
      queryText += ` AND at.type = $${idx++}`;
      params.push(type);
    }

    queryText += ` ORDER BY at.date ASC, at.created_at ASC`;

    const result = await query(queryText, params);
    const rows = result.rows;

    let runningBalance = 0;
    const excelData = rows.map((r, i) => {
      const amt = parseFloat(r.amount) || 0;
      const isRev = r.type === 'revenue';
      if (isRev) runningBalance += amt;
      else runningBalance -= amt;

      return {
        'No': i + 1,
        'Tanggal': r.date ? new Date(r.date).toISOString().split('T')[0] : '-',
        'Keterangan': r.description,
        'Kategori': r.category_name || '-',
        'Mitra': r.mitra_name || '-',
        'Pemasukan (Debet)': isRev ? amt : 0,
        'Pengeluaran (Kredit)': !isRev ? amt : 0,
        'Saldo': runningBalance,
        'Admin/User': r.created_by_name || '-'
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Auto-width columns
    ws['!cols'] = [
      { wch: 6 },  // No
      { wch: 12 }, // Tanggal
      { wch: 40 }, // Keterangan
      { wch: 18 }, // Kategori
      { wch: 18 }, // Mitra
      { wch: 18 }, // Debet
      { wch: 18 }, // Kredit
      { wch: 20 }, // Saldo
      { wch: 15 }  // Admin
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Buku Kas Harian');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Laporan_Keuangan_${start_date || 'Awal'}_sd_${end_date || 'Akhir'}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    logger.error('Error generating Excel report:', error);
    res.status(500).json({ success: false, message: 'Gagal membuat file Excel' });
  }
});

module.exports = router