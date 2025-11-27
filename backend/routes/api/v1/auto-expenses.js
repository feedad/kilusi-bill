const express = require('express')
const router = express.Router()
const { logger } = require('../../../config/logger')
const { query } = require('../../../config/database')

// GET /api/v1/auto-expenses/settings - Get all auto expense settings
router.get('/settings', async (req, res) => {
  try {
    const result = await query(`
      SELECT setting_key, setting_value, description, is_active
      FROM auto_expense_settings
      ORDER BY setting_key
    `)

    const settings = {}
    result.rows.forEach(row => {
      settings[row.setting_key] = {
        value: row.setting_value,
        description: row.description,
        isActive: row.is_active
      }
    })

    res.json({
      success: true,
      data: settings
    })
  } catch (error) {
    logger.error('Error fetching auto expense settings:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch auto expense settings'
    })
  }
})

// PUT /api/v1/auto-expenses/settings/:key - Update auto expense setting
router.put('/settings/:key', async (req, res) => {
  try {
    const { key } = req.params
    const { value, isActive } = req.body

    const result = await query(`
      UPDATE auto_expense_settings
      SET setting_value = $1, is_active = $2, updated_at = CURRENT_TIMESTAMP
      WHERE setting_key = $3
      RETURNING *
    `, [value, isActive !== undefined ? isActive : true, key])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      })
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Setting updated successfully'
    })
  } catch (error) {
    logger.error('Error updating auto expense setting:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update auto expense setting'
    })
  }
})

// GET /api/v1/auto-expenses/recurring - Get all recurring expenses
router.get('/recurring', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        re.id,
        re.name,
        re.amount,
        re.frequency,
        re.next_date,
        re.is_active,
        re.description,
        re.created_at,
        ac.name as category_name,
        ac.color as category_color
      FROM recurring_expenses re
      LEFT JOIN accounting_categories ac ON re.category_id = ac.id
      ORDER BY re.next_date ASC
    `)

    res.json({
      success: true,
      data: result.rows
    })
  } catch (error) {
    logger.error('Error fetching recurring expenses:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recurring expenses'
    })
  }
})

// POST /api/v1/auto-expenses/recurring - Create new recurring expense
router.post('/recurring', async (req, res) => {
  try {
    const {
      name,
      amount,
      categoryId,
      frequency,
      nextDate,
      description
    } = req.body

    if (!name || !amount || !frequency || !nextDate) {
      return res.status(400).json({
        success: false,
        message: 'Name, amount, frequency, and next date are required'
      })
    }

    if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({
        success: false,
        message: 'Frequency must be daily, weekly, or monthly'
      })
    }

    const result = await query(`
      INSERT INTO recurring_expenses (
        name, amount, category_id, frequency, next_date, description
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, parseFloat(amount), categoryId || null, frequency, nextDate, description])

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Recurring expense created successfully'
    })
  } catch (error) {
    logger.error('Error creating recurring expense:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create recurring expense'
    })
  }
})

// PUT /api/v1/auto-expenses/recurring/:id - Update recurring expense
router.put('/recurring/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      name,
      amount,
      categoryId,
      frequency,
      nextDate,
      description,
      isActive
    } = req.body

    const result = await query(`
      UPDATE recurring_expenses
      SET
        name = COALESCE($1, name),
        amount = COALESCE($2, amount),
        category_id = COALESCE($3, category_id),
        frequency = COALESCE($4, frequency),
        next_date = COALESCE($5, next_date),
        description = COALESCE($6, description),
        is_active = COALESCE($7, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [name, amount ? parseFloat(amount) : null, categoryId, frequency, nextDate, description, isActive, id])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring expense not found'
      })
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Recurring expense updated successfully'
    })
  } catch (error) {
    logger.error('Error updating recurring expense:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update recurring expense'
    })
  }
})

// DELETE /api/v1/auto-expenses/recurring/:id - Delete recurring expense
router.delete('/recurring/:id', async (req, res) => {
  try {
    const { id } = req.params

    const result = await query(`
      DELETE FROM recurring_expenses WHERE id = $1 RETURNING *
    `, [id])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring expense not found'
      })
    }

    res.json({
      success: true,
      message: 'Recurring expense deleted successfully'
    })
  } catch (error) {
    logger.error('Error deleting recurring expense:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete recurring expense'
    })
  }
})

// POST /api/v1/auto-expenses/trigger-technician-fee - Manually trigger technician fee
router.post('/trigger-technician-fee', async (req, res) => {
  try {
    const { technicianId, customerId, amount } = req.body

    if (!technicianId || !customerId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Technician ID, customer ID, and amount are required'
      })
    }

    // Get auto expense settings
    const settingResult = await query(`
      SELECT setting_value FROM auto_expense_settings
      WHERE setting_key = 'technician_fee_enabled' AND is_active = true
    `)

    if (settingResult.rows.length === 0 || settingResult.rows[0].setting_value !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Technician fee is disabled'
      })
    }

    // Get default expense category
    const categoryResult = await query(`
      SELECT id FROM accounting_categories
      WHERE type = 'expense' AND is_active = true
      ORDER BY name LIMIT 1
    `)

    if (categoryResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'No default expense category found'
      })
    }

    const categoryId = categoryResult.rows[0].id

    // Create accounting transaction
    await query(`
      INSERT INTO accounting_transactions (
        category_id, type, amount, description, reference_type, reference_id, date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_TIMESTAMP)
    `, [categoryId, 'expense', parseFloat(amount), `Fee Teknisi - Instalasi Pelanggan #${customerId}`, 'technician_fee', technicianId])

    res.json({
      success: true,
      message: 'Technician fee recorded successfully'
    })
  } catch (error) {
    logger.error('Error triggering technician fee:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to record technician fee'
    })
  }
})

// POST /api/v1/auto-expenses/trigger-marketing-fee - Manually trigger marketing fee
router.post('/trigger-marketing-fee', async (req, res) => {
  try {
    const { marketerId, customerId, amount } = req.body

    if (!marketerId || !customerId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Marketer ID, customer ID, and amount are required'
      })
    }

    // Get auto expense settings
    const settingResult = await query(`
      SELECT setting_value FROM auto_expense_settings
      WHERE setting_key = 'marketing_fee_enabled' AND is_active = true
    `)

    if (settingResult.rows.length === 0 || settingResult.rows[0].setting_value !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Marketing fee is disabled'
      })
    }

    // Get default expense category
    const categoryResult = await query(`
      SELECT id FROM accounting_categories
      WHERE type = 'expense' AND is_active = true
      ORDER BY name LIMIT 1
    `)

    if (categoryResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'No default expense category found'
      })
    }

    const categoryId = categoryResult.rows[0].id

    // Create accounting transaction
    await query(`
      INSERT INTO accounting_transactions (
        category_id, type, amount, description, reference_type, reference_id, date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_TIMESTAMP)
    `, [categoryId, 'expense', parseFloat(amount), `Fee Marketing - Referral Pelanggan #${customerId}`, 'marketing_fee', marketerId])

    res.json({
      success: true,
      message: 'Marketing fee recorded successfully'
    })
  } catch (error) {
    logger.error('Error triggering marketing fee:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to record marketing fee'
    })
  }
})

module.exports = router