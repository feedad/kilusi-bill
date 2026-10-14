const express = require('express')
const router = express.Router()
const { logger } = require('../../../config/logger')
const { query, transaction } = require('../../../config/database')

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

// GET /api/v1/accounting/report/mitra-settlement - Simplified mitra reconciliation & debt tracking
router.get('/report/mitra-settlement', async (req, res) => {
  try {
    const { start_date, end_date, mitra_id } = req.query;

    // 1. Auto-detect Talaga Sunda as Pusat (HQ)
    const pusatRes = await query(`SELECT id, name FROM mitra WHERE UPPER(name) LIKE '%TALAGA SUNDA%' LIMIT 1`);
    const pusatMitraId = pusatRes.rows[0]?.id || 'b2aaaeaf-89ef-449a-99a0-39f13270a057';
    const pusatMitraName = pusatRes.rows[0]?.name || 'TALAGA SUNDA';

    // 2. Cycle schedule & presets in WIB
    const now = new Date();
    const wibTime = new Date(now.getTime() + (7 * 3600000) + (now.getTimezoneOffset() * 60000));
    const curY = wibTime.getFullYear();
    const curM = wibTime.getMonth(); // 0-based
    const curD = wibTime.getDate();

    const pad = (n) => String(n).padStart(2, '0');
    const formatYMD = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

    const cycle1Start = formatYMD(curY, curM + 1, 1);
    const cycle1End = formatYMD(curY, curM + 1, 15);
    const cycle1Settlement = formatYMD(curY, curM + 1, 15);

    const lastDayCurMonth = new Date(curY, curM + 1, 0).getDate();
    const cycle2Start = formatYMD(curY, curM + 1, 16);
    const cycle2End = formatYMD(curY, curM + 1, lastDayCurMonth);

    const nextMonthD = new Date(curY, curM + 1, 1);
    const cycle2Settlement = formatYMD(nextMonthD.getFullYear(), nextMonthD.getMonth() + 1, 1);

    const currentCycle = curD <= 15 ? 'cycle_1' : 'cycle_2';
    const nextSettlementDate = curD <= 15 ? cycle1Settlement : cycle2Settlement;

    const thisMonthStart = formatYMD(curY, curM + 1, 1);
    const thisMonthEnd = formatYMD(curY, curM + 1, lastDayCurMonth);

    const lastMonthD = new Date(curY, curM, 0);
    const lastMonthStart = formatYMD(lastMonthD.getFullYear(), lastMonthD.getMonth() + 1, 1);
    const lastMonthEnd = formatYMD(lastMonthD.getFullYear(), lastMonthD.getMonth() + 1, lastMonthD.getDate());

    const startDateToUse = start_date || (curD <= 15 ? cycle1Start : cycle2Start);
    const endDateToUse = end_date || (curD <= 15 ? cycle1End : cycle2End);

    // 3. Payment settings for account classification
    const { getSetting } = require('../../../config/settingsManager');
    const rawPS = getSetting('payment_settings');
    let paymentSettings = {};
    try { paymentSettings = typeof rawPS === 'string' ? JSON.parse(rawPS) : (rawPS || {}); } catch (e) {}

    const bankAccounts = paymentSettings.bank_accounts || [];
    const ewallets = paymentSettings.ewallets || [];

    const getDestinationCategory = (method) => {
      if (!method) return { type: 'company', name: 'Unknown (Pusat)' };
      const m = String(method).toLowerCase().trim();
      if (m === 'cash' || m === 'tunai') return { type: 'cash', name: 'Kas Tunai' };
      if (m.startsWith('autopay')) return { type: 'company', name: 'Autopay (Pusat)' };
      if (m.startsWith('tripay') || m === 'qris') return { type: 'company', name: 'QRIS / Tripay (Pusat)' };
      if (m.includes('ocbc')) return { type: 'company', name: 'OCBC (Perusahaan)' };

      if (method.startsWith('bank_')) {
        const id = method.replace('bank_', '');
        const acc = bankAccounts.find(b => String(b.id) === String(id));
        if (acc) {
          const mIds = Array.isArray(acc.mitra_ids) ? acc.mitra_ids.map(String) : (acc.mitra_id ? [String(acc.mitra_id)] : []);
          if (acc.is_company === true || mIds.includes(String(pusatMitraId))) {
            return { type: 'company', name: `${acc.bankName} (Perusahaan / Pusat)` };
          }
          return { type: 'mitra', mitra_ids: mIds, name: `${acc.bankName} (${acc.accountNumber})` };
        }
      }

      if (method.startsWith('ewallet_')) {
        const id = method.replace('ewallet_', '');
        const w = ewallets.find(e => String(e.id) === String(id));
        if (w) {
          const mIds = Array.isArray(w.mitra_ids) ? w.mitra_ids.map(String) : (w.mitra_id ? [String(w.mitra_id)] : []);
          if (w.is_company === true || mIds.includes(String(pusatMitraId))) {
            return { type: 'company', name: `${w.provider} (Perusahaan / Pusat)` };
          }
          return { type: 'mitra', mitra_ids: mIds, name: `${w.provider} (${w.phoneNumber})` };
        }
      }

      const matchedBank = bankAccounts.find(b => b.bankName && m.includes(b.bankName.toLowerCase()));
      if (matchedBank) {
        const mIds = Array.isArray(matchedBank.mitra_ids) ? matchedBank.mitra_ids.map(String) : (matchedBank.mitra_id ? [String(matchedBank.mitra_id)] : []);
        if (matchedBank.is_company === true || mIds.includes(String(pusatMitraId))) {
          return { type: 'company', name: `${matchedBank.bankName} (Perusahaan / Pusat)` };
        }
        return { type: 'mitra', mitra_ids: mIds, name: `${matchedBank.bankName} (${matchedBank.accountNumber})` };
      }

      return { type: 'company', name: `${method} (Pusat)` };
    };

    // 4. Initialize summaries for active non-Pusat mitras
    let mitraListQuery = `SELECT id, name FROM mitra WHERE (disabled_at IS NULL) AND id != $1::uuid`;
    const mitraListParams = [pusatMitraId];
    if (mitra_id) {
      mitraListQuery += ` AND id = $2::uuid`;
      mitraListParams.push(mitra_id);
    }
    mitraListQuery += ` ORDER BY name ASC`;
    const activeMitrasRes = await query(mitraListQuery, mitraListParams);

    const mitraSummaries = new Map();
    activeMitrasRes.rows.forEach(m => {
      mitraSummaries.set(String(m.id), {
        mitra_id: m.id,
        mitra_name: m.name,
        total_revenue: 0,
        received_in_mitra_account: 0,
        received_in_company_account: 0, // Pusat owes to Mitra
        received_in_cash: 0,
        settled_amount: 0,              // Already paid out by Pusat
        remaining_debt: 0,              // Still owed by Pusat
        settlement_status: 'no_debt',    // 'no_debt' | 'settled' | 'partial' | 'unsettled'
        transactions: []
      });
    });

    // 5. Query customer payments excluding Talaga Sunda and customers without mitra
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
        r.name as region_name,
        st.settlement_id,
        st.settlement_number,
        st.settlement_date
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      LEFT JOIN services s ON s.service_number = i.service_number
      LEFT JOIN regions r ON r.id = s.region_id
      LEFT JOIN mitra m ON r.mitra_id = m.id
      LEFT JOIN (
        SELECT msi.payment_id, msi.settlement_id, ms.settlement_number, ms.settlement_date
        FROM mitra_settlement_items msi
        JOIN mitra_settlements ms ON msi.settlement_id = ms.id
        WHERE ms.status = 'completed'
      ) st ON st.payment_id = p.id
      WHERE p.is_rolled_back = FALSE
        AND m.id IS NOT NULL
        AND m.id != $1::uuid
    `;
    const params = [pusatMitraId];
    let idx = 2;

    if (startDateToUse) {
      queryText += ` AND p.payment_date::date >= $${idx++}::date`;
      params.push(startDateToUse);
    }
    if (endDateToUse) {
      queryText += ` AND p.payment_date::date <= $${idx++}::date`;
      params.push(endDateToUse);
    }
    if (mitra_id) {
      queryText += ` AND m.id = $${idx++}::uuid`;
      params.push(mitra_id);
    }

    queryText += ` ORDER BY p.payment_date DESC, p.created_at DESC`;

    const result = await query(queryText, params);
    const payments = result.rows;

    payments.forEach(p => {
      const mitraKey = String(p.customer_mitra_id);
      if (!mitraSummaries.has(mitraKey)) {
        mitraSummaries.set(mitraKey, {
          mitra_id: p.customer_mitra_id,
          mitra_name: p.customer_mitra_name || 'Mitra',
          total_revenue: 0,
          received_in_mitra_account: 0,
          received_in_company_account: 0,
          received_in_cash: 0,
          settled_amount: 0,
          remaining_debt: 0,
          settlement_status: 'no_debt',
          transactions: []
        });
      }

      const summaryObj = mitraSummaries.get(mitraKey);
      const amt = parseFloat(p.amount) || 0;
      summaryObj.total_revenue += amt;

      const dest = getDestinationCategory(p.payment_method);
      let classification = 'company_account';
      const isSettled = Boolean(p.settlement_id);

      if (dest.type === 'cash') {
        summaryObj.received_in_cash += amt;
        classification = 'cash';
      } else if (dest.type === 'mitra') {
        const matchesCustomerMitra = p.customer_mitra_id && dest.mitra_ids?.map(String).includes(String(p.customer_mitra_id));
        if (matchesCustomerMitra) {
          summaryObj.received_in_mitra_account += amt;
          classification = 'own_mitra_account';
        } else {
          summaryObj.received_in_company_account += amt;
          classification = 'company_account';
          if (isSettled) summaryObj.settled_amount += amt;
        }
      } else {
        // dest.type === 'company'
        summaryObj.received_in_company_account += amt;
        classification = 'company_account';
        if (isSettled) summaryObj.settled_amount += amt;
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
        classification,
        is_settled: isSettled,
        settlement_id: p.settlement_id || null,
        settlement_number: p.settlement_number || null,
        settlement_date: p.settlement_date || null
      });
    });

    // 6. Calculate remaining debt and final status per mitra
    mitraSummaries.forEach(s => {
      s.remaining_debt = Math.max(0, s.received_in_company_account - s.settled_amount);
      if (s.received_in_company_account === 0) {
        s.settlement_status = 'no_debt';
      } else if (s.remaining_debt <= 0) {
        s.settlement_status = 'settled';
      } else if (s.settled_amount > 0) {
        s.settlement_status = 'partial';
      } else {
        s.settlement_status = 'unsettled';
      }
    });

    res.json({
      success: true,
      data: {
        mitras: Array.from(mitraSummaries.values()),
        total_payments_count: payments.length,
        period: { start_date: startDateToUse, end_date: endDateToUse },
        pusat: { id: pusatMitraId, name: pusatMitraName },
        cycle_info: {
          next_settlement_date: nextSettlementDate,
          current_cycle: currentCycle,
          presets: {
            cycle_1: { start_date: cycle1Start, end_date: cycle1End, settlement_date: cycle1Settlement, label: `Siklus 1 (1 - 15 ${new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(wibTime)})` },
            cycle_2: { start_date: cycle2Start, end_date: cycle2End, settlement_date: cycle2Settlement, label: `Siklus 2 (16 - ${lastDayCurMonth} ${new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(wibTime)})` },
            this_month: { start_date: thisMonthStart, end_date: thisMonthEnd, label: 'Bulan Ini' },
            last_month: { start_date: lastMonthStart, end_date: lastMonthEnd, label: 'Bulan Lalu' }
          }
        }
      }
    });
  } catch (error) {
    logger.error('Error in mitra settlement report:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat laporan rekonsiliasi mitra' });
  }
});

// POST /api/v1/accounting/mitra-settlement/process - Process settlement payout with double-entry accounting
router.post('/mitra-settlement/process', async (req, res) => {
  try {
    const {
      mitra_id,
      period_start,
      period_end,
      settlement_date,
      amount,
      payment_method = 'transfer',
      bank_account_source,
      notes
    } = req.body;

    if (!mitra_id || !period_start || !period_end || !settlement_date || !amount) {
      return res.status(400).json({
        success: false,
        message: 'mitra_id, period_start, period_end, settlement_date, dan amount wajib diisi'
      });
    }

    const settleAmount = parseFloat(amount);
    if (isNaN(settleAmount) || settleAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah penyetoran harus lebih dari 0' });
    }

    // Verify mitra exists and is not Pusat
    const pusatRes = await query(`SELECT id, name FROM mitra WHERE UPPER(name) LIKE '%TALAGA SUNDA%' LIMIT 1`);
    const pusatMitraId = pusatRes.rows[0]?.id || 'b2aaaeaf-89ef-449a-99a0-39f13270a057';
    const pusatMitraName = pusatRes.rows[0]?.name || 'TALAGA SUNDA';

    if (String(mitra_id) === String(pusatMitraId)) {
      return res.status(400).json({ success: false, message: 'Pusat (Talaga Sunda) tidak dapat disetor ke diri sendiri' });
    }

    const mitraRes = await query(`SELECT id, name FROM mitra WHERE id = $1::uuid`, [mitra_id]);
    if (mitraRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mitra tidak ditemukan' });
    }
    const targetMitra = mitraRes.rows[0];

    // Generate official settlement number: SETTLE-[MITRA]-[YYYYMMDD]-[SEQ]
    const mitraCode = (targetMitra.name || 'MITRA').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
    const dateClean = settlement_date.replace(/[^0-9]/g, '').slice(0, 8);
    const prefix = `SETTLE-${mitraCode}-${dateClean}-`;

    const lastNumRes = await query(
      `SELECT settlement_number FROM mitra_settlements WHERE settlement_number LIKE $1 ORDER BY id DESC LIMIT 1`,
      [`${prefix}%`]
    );
    let seqNum = 1;
    if (lastNumRes.rows.length > 0) {
      const parts = lastNumRes.rows[0].settlement_number.split('-');
      const parsed = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(parsed)) seqNum = parsed + 1;
    }
    const settlementNumber = `${prefix}${String(seqNum).padStart(3, '0')}`;

    // Payment settings for classifying payments to link
    const { getSetting } = require('../../../config/settingsManager');
    const rawPS = getSetting('payment_settings');
    let paymentSettings = {};
    try { paymentSettings = typeof rawPS === 'string' ? JSON.parse(rawPS) : (rawPS || {}); } catch (e) {}
    const bankAccounts = paymentSettings.bank_accounts || [];
    const ewallets = paymentSettings.ewallets || [];

    const isCompanyAccount = (method) => {
      if (!method) return true;
      const m = String(method).toLowerCase().trim();
      if (m === 'cash' || m === 'tunai') return false;
      if (m.startsWith('autopay') || m.startsWith('tripay') || m === 'qris' || m.includes('ocbc')) return true;

      if (method.startsWith('bank_')) {
        const id = method.replace('bank_', '');
        const acc = bankAccounts.find(b => String(b.id) === String(id));
        if (acc) {
          const mIds = Array.isArray(acc.mitra_ids) ? acc.mitra_ids.map(String) : (acc.mitra_id ? [String(acc.mitra_id)] : []);
          return acc.is_company === true || mIds.includes(String(pusatMitraId)) || !mIds.includes(String(mitra_id));
        }
      }
      if (method.startsWith('ewallet_')) {
        const id = method.replace('ewallet_', '');
        const w = ewallets.find(e => String(e.id) === String(id));
        if (w) {
          const mIds = Array.isArray(w.mitra_ids) ? w.mitra_ids.map(String) : (w.mitra_id ? [String(w.mitra_id)] : []);
          return w.is_company === true || mIds.includes(String(pusatMitraId)) || !mIds.includes(String(mitra_id));
        }
      }
      return true;
    };

    // Execute in transaction
    const settlementResult = await transaction(async (client) => {
      // 1. Insert header
      const insertHeaderQuery = `
        INSERT INTO mitra_settlements (
          settlement_number, mitra_id, period_start, period_end,
          settlement_date, amount, payment_method, bank_account_source,
          notes, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10)
        RETURNING id
      `;
      const headerRes = await client.query(insertHeaderQuery, [
        settlementNumber,
        mitra_id,
        period_start,
        period_end,
        settlement_date,
        settleAmount,
        payment_method,
        bank_account_source || null,
        notes || null,
        req.user?.id || null
      ]);
      const settlementId = headerRes.rows[0].id;

      // 2. Find unsettled payments in this period for this mitra
      const candidatePaymentsQuery = `
        SELECT
          p.id as payment_id,
          p.amount,
          p.payment_method
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        JOIN customers c ON i.customer_id = c.id
        LEFT JOIN services s ON s.service_number = i.service_number
        LEFT JOIN regions r ON r.id = s.region_id
        WHERE p.is_rolled_back = FALSE
          AND r.mitra_id = $1::uuid
          AND p.payment_date::date >= $2::date AND p.payment_date::date <= $3::date
          AND p.id NOT IN (
            SELECT msi.payment_id FROM mitra_settlement_items msi
            JOIN mitra_settlements ms ON msi.settlement_id = ms.id
            WHERE ms.status = 'completed'
          )
        ORDER BY p.payment_date ASC, p.id ASC
      `;
      const candRes = await client.query(candidatePaymentsQuery, [mitra_id, period_start, period_end]);

      let linkedCount = 0;
      for (const p of candRes.rows) {
        if (isCompanyAccount(p.payment_method)) {
          await client.query(
            `INSERT INTO mitra_settlement_items (settlement_id, payment_id, amount) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [settlementId, p.payment_id, parseFloat(p.amount)]
          );
          linkedCount++;
        }
      }

      // 3. Ensure accounting categories exist
      let pusatCatRes = await client.query(
        `SELECT id FROM accounting_categories WHERE name = 'Penyetoran Mitra' AND type = 'expense' LIMIT 1`
      );
      let pusatCatId = pusatCatRes.rows[0]?.id;
      if (!pusatCatId) {
        const newCat = await client.query(
          `INSERT INTO accounting_categories (name, type, description, color, icon, is_active)
           VALUES ('Penyetoran Mitra', 'expense', 'Pengeluaran Pusat untuk penyetoran bagi hasil ke Mitra', '#ef4444', 'arrow-up-right', true)
           RETURNING id`
        );
        pusatCatId = newCat.rows[0].id;
      }

      let mitraCatRes = await client.query(
        `SELECT id FROM accounting_categories WHERE name = 'Penyetoran dari Pusat' AND type = 'revenue' LIMIT 1`
      );
      let mitraCatId = mitraCatRes.rows[0]?.id;
      if (!mitraCatId) {
        const newCat = await client.query(
          `INSERT INTO accounting_categories (name, type, description, color, icon, is_active)
           VALUES ('Penyetoran dari Pusat', 'revenue', 'Pemasukan Mitra dari hasil penyetoran Pusat', '#10b981', 'arrow-down-left', true)
           RETURNING id`
        );
        mitraCatId = newCat.rows[0].id;
      }

      // 4. Double Entry Accounting
      // 4a. Pusat Expense
      const pusatDesc = `Penyetoran bagi hasil ke Mitra ${targetMitra.name} periode ${period_start} s/d ${period_end}`;
      const pusatTxRes = await client.query(
        `INSERT INTO accounting_transactions (
           category_id, type, amount, description, reference_type,
           reference_id, mitra_id, date, notes, created_by
         ) VALUES ($1, 'expense', $2, $3, 'mitra_settlement', $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          pusatCatId,
          settleAmount,
          pusatDesc,
          String(settlementId),
          pusatMitraId,
          settlement_date,
          notes || null,
          req.user?.id || null
        ]
      );
      const pusatTxId = pusatTxRes.rows[0].id;

      // 4b. Mitra Revenue
      const mitraDesc = `Penerimaan penyetoran bagi hasil dari Pusat periode ${period_start} s/d ${period_end}`;
      const mitraTxRes = await client.query(
        `INSERT INTO accounting_transactions (
           category_id, type, amount, description, reference_type,
           reference_id, mitra_id, date, notes, created_by
         ) VALUES ($1, 'revenue', $2, $3, 'mitra_settlement', $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          mitraCatId,
          settleAmount,
          mitraDesc,
          String(settlementId),
          mitra_id,
          settlement_date,
          notes || null,
          req.user?.id || null
        ]
      );
      const mitraTxId = mitraTxRes.rows[0].id;

      // 5. Update settlement header with transaction IDs
      await client.query(
        `UPDATE mitra_settlements SET pusat_transaction_id = $1, mitra_transaction_id = $2 WHERE id = $3`,
        [pusatTxId, mitraTxId, settlementId]
      );

      return {
        id: settlementId,
        settlement_number: settlementNumber,
        mitra_id,
        mitra_name: targetMitra.name,
        amount: settleAmount,
        period_start,
        period_end,
        settlement_date,
        pusat_transaction_id: pusatTxId,
        mitra_transaction_id: mitraTxId,
        linked_items_count: linkedCount
      };
    });

    res.json({
      success: true,
      message: `Penyetoran ke Mitra ${targetMitra.name} berhasil diproses (${settlementNumber})`,
      data: settlementResult
    });
  } catch (error) {
    logger.error('Error processing mitra settlement:', error);
    res.status(500).json({ success: false, message: 'Gagal memproses penyetoran mitra: ' + error.message });
  }
});

// GET /api/v1/accounting/mitra-settlements - History of official mitra settlements
router.get('/mitra-settlements', async (req, res) => {
  try {
    const { mitra_id, status = 'completed', start_date, end_date } = req.query;

    let queryText = `
      SELECT
        ms.id,
        ms.settlement_number,
        ms.mitra_id,
        m.name as mitra_name,
        TO_CHAR(ms.period_start, 'YYYY-MM-DD') as period_start,
        TO_CHAR(ms.period_end, 'YYYY-MM-DD') as period_end,
        TO_CHAR(ms.settlement_date, 'YYYY-MM-DD') as settlement_date,
        ms.amount::numeric as amount,
        ms.payment_method,
        ms.bank_account_source,
        ms.notes,
        ms.status,
        ms.pusat_transaction_id,
        ms.mitra_transaction_id,
        ms.created_by,
        u.username as created_by_name,
        TO_CHAR(ms.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
        COUNT(msi.id)::int as items_count
      FROM mitra_settlements ms
      JOIN mitra m ON ms.mitra_id = m.id
      LEFT JOIN users u ON ms.created_by = u.id
      LEFT JOIN mitra_settlement_items msi ON msi.settlement_id = ms.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (mitra_id) {
      queryText += ` AND ms.mitra_id = $${idx++}::uuid`;
      params.push(mitra_id);
    }
    if (status && status !== 'all') {
      queryText += ` AND ms.status = $${idx++}`;
      params.push(status);
    }
    if (start_date) {
      queryText += ` AND ms.settlement_date >= $${idx++}::date`;
      params.push(start_date);
    }
    if (end_date) {
      queryText += ` AND ms.settlement_date <= $${idx++}::date`;
      params.push(end_date);
    }

    queryText += `
      GROUP BY ms.id, m.name, u.username
      ORDER BY ms.settlement_date DESC, ms.created_at DESC
    `;

    const result = await query(queryText, params);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Error fetching mitra settlements:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat riwayat penyetoran mitra' });
  }
});

// DELETE /api/v1/accounting/mitra-settlement/:id - Rollback settlement and its accounting transactions
router.delete('/mitra-settlement/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rollbackResult = await transaction(async (client) => {
      const checkRes = await client.query('SELECT * FROM mitra_settlements WHERE id = $1', [id]);
      if (checkRes.rows.length === 0) {
        throw new Error('NOT_FOUND');
      }
      const st = checkRes.rows[0];

      // Delete linked accounting transactions
      if (st.pusat_transaction_id) {
        await client.query('DELETE FROM accounting_transactions WHERE id = $1', [st.pusat_transaction_id]);
      }
      if (st.mitra_transaction_id) {
        await client.query('DELETE FROM accounting_transactions WHERE id = $1', [st.mitra_transaction_id]);
      }

      // Delete settlement items & header
      await client.query('DELETE FROM mitra_settlement_items WHERE settlement_id = $1', [id]);
      await client.query('DELETE FROM mitra_settlements WHERE id = $1', [id]);
      return st;
    });

    res.json({
      success: true,
      message: `Penyetoran ${rollbackResult.settlement_number} berhasil dibatalkan dan transaksi akunting dihapus`
    });
  } catch (error) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Data penyetoran tidak ditemukan' });
    }
    logger.error('Error rolling back mitra settlement:', error);
    res.status(500).json({ success: false, message: 'Gagal membatalkan penyetoran mitra: ' + error.message });
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