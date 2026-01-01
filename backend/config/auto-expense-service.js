const { logger } = require('./logger')
const { query } = require('./database')

class AutoExpenseService {
  constructor() {
    this.initScheduler()
  }

  initScheduler() {
    const cron = require('node-cron')

    // Schedule recurring expense processing daily at 08:00
    cron.schedule('0 8 * * *', async () => {
      try {
        logger.info('Starting daily recurring expense processing...')
        await this.processRecurringExpenses()
        logger.info('Daily recurring expense processing completed')
      } catch (error) {
        logger.error('Error in daily recurring expense processing:', error)
      }
    }, {
      scheduled: true,
      timezone: "Asia/Jakarta"
    })

    logger.info('Auto expense scheduler initialized - will run daily at 08:00')
  }

  async processRecurringExpenses() {
    try {
      const today = new Date().toISOString().split('T')[0]

      // Get all active recurring expenses that are due today or overdue
      const result = await query(`
        SELECT * FROM recurring_expenses
        WHERE is_active = true AND next_date <= $1
        ORDER BY next_date ASC
      `, [today])

      logger.info(`Found ${result.rows.length} recurring expenses to process`)

      for (const expense of result.rows) {
        try {
          await this.createExpenseTransaction(expense)
          await this.updateNextDate(expense)
          logger.info(`Processed recurring expense: ${expense.name} - Rp ${expense.amount}`)
        } catch (error) {
          logger.error(`Error processing recurring expense ${expense.name}:`, error)
        }
      }
    } catch (error) {
      logger.error('Error in processRecurringExpenses:', error)
      throw error
    }
  }

  async createExpenseTransaction(expense) {
    // Get default expense category if none specified
    let categoryId = expense.category_id
    if (!categoryId) {
      const categoryResult = await query(`
        SELECT id FROM accounting_categories
        WHERE type = 'expense' AND is_active = true
        ORDER BY name LIMIT 1
      `)

      if (categoryResult.rows.length > 0) {
        categoryId = categoryResult.rows[0].id
      } else {
        throw new Error('No default expense category found')
      }
    }

    await query(`
      INSERT INTO accounting_transactions (
        category_id, type, amount, description, reference_type, reference_id, date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_TIMESTAMP)
    `, [
      categoryId,
      'expense',
      expense.amount,
      `Pengeluaran Rutin: ${expense.name}${expense.description ? ` - ${expense.description}` : ''}`,
      'recurring_expense',
      expense.id
    ])
  }

  async updateNextDate(expense) {
    const currentDate = new Date()
    let nextDate

    switch (expense.frequency) {
      case 'daily':
        nextDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000)
        break
      case 'weekly':
        nextDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000)
        break
      case 'monthly':
        nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate())
        break
      default:
        throw new Error(`Invalid frequency: ${expense.frequency}`)
    }

    await query(`
      UPDATE recurring_expenses
      SET next_date = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [nextDate.toISOString().split('T')[0], expense.id])
  }

  async triggerTechnicianFee(customerId, technicianId) {
    try {
      // Check if technician fee is enabled
      const settingResult = await query(`
        SELECT setting_value FROM auto_expense_settings
        WHERE setting_key = 'technician_fee_enabled' AND is_active = true
      `)

      if (settingResult.rows.length === 0 || settingResult.rows[0].setting_value !== 'true') {
        return { success: false, message: 'Technician fee is disabled' }
      }

      // Get technician fee amount
      const amountResult = await query(`
        SELECT setting_value FROM auto_expense_settings
        WHERE setting_key = 'technician_fee_amount' AND is_active = true
      `)

      if (amountResult.rows.length === 0 || parseFloat(amountResult.rows[0].setting_value) <= 0) {
        return { success: false, message: 'Technician fee amount is not set or invalid' }
      }

      const amount = parseFloat(amountResult.rows[0].setting_value)

      // Get default expense category
      const categoryResult = await query(`
        SELECT id FROM accounting_categories
        WHERE type = 'expense' AND is_active = true
        ORDER BY name LIMIT 1
      `)

      if (categoryResult.rows.length === 0) {
        return { success: false, message: 'No default expense category found' }
      }

      const categoryId = categoryResult.rows[0].id

      // Get customer and technician details
      const customerResult = await query('SELECT name FROM customers WHERE id = $1', [customerId])
      const technicianResult = await query('SELECT name FROM technicians WHERE id = $1', [technicianId])

      const customerName = customerResult.rows[0]?.name || `Customer #${customerId}`
      const technicianName = technicianResult.rows[0]?.name || `Technician #${technicianId}`

      // Create accounting transaction
      await query(`
        INSERT INTO accounting_transactions (
          category_id, type, amount, description, reference_type, reference_id, date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_TIMESTAMP)
      `, [
        categoryId,
        'expense',
        amount,
        `Fee Teknisi - Instalasi ${customerName} oleh ${technicianName}`,
        'technician_fee',
        technicianId
      ])

      logger.info(`Technician fee recorded: Rp ${amount} for ${technicianName}`)
      return { success: true, message: 'Technician fee recorded successfully' }
    } catch (error) {
      logger.error('Error triggering technician fee:', error)
      return { success: false, message: 'Failed to record technician fee' }
    }
  }

  async triggerMarketingFee(customerId, marketerId) {
    try {
      // Check if marketing fee is enabled
      const settingResult = await query(`
        SELECT setting_value FROM auto_expense_settings
        WHERE setting_key = 'marketing_fee_enabled' AND is_active = true
      `)

      if (settingResult.rows.length === 0 || settingResult.rows[0].setting_value !== 'true') {
        return { success: false, message: 'Marketing fee is disabled' }
      }

      // Get marketing fee amount
      const amountResult = await query(`
        SELECT setting_value FROM auto_expense_settings
        WHERE setting_key = 'marketing_fee_amount' AND is_active = true
      `)

      if (amountResult.rows.length === 0 || parseFloat(amountResult.rows[0].setting_value) <= 0) {
        return { success: false, message: 'Marketing fee amount is not set or invalid' }
      }

      const amount = parseFloat(amountResult.rows[0].setting_value)

      // Get default expense category
      const categoryResult = await query(`
        SELECT id FROM accounting_categories
        WHERE type = 'expense' AND is_active = true
        ORDER BY name LIMIT 1
      `)

      if (categoryResult.rows.length === 0) {
        return { success: false, message: 'No default expense category found' }
      }

      const categoryId = categoryResult.rows[0].id

      // Get customer and marketer details
      const customerResult = await query('SELECT name FROM customers WHERE id = $1', [customerId])
      const marketerResult = await query('SELECT name FROM technicians WHERE id = $1', [marketerId])

      const customerName = customerResult.rows[0]?.name || `Customer #${customerId}`
      const marketerName = marketerResult.rows[0]?.name || `Marketer #${marketerId}`

      // Create accounting transaction
      await query(`
        INSERT INTO accounting_transactions (
          category_id, type, amount, description, reference_type, reference_id, date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_TIMESTAMP)
      `, [
        categoryId,
        'expense',
        amount,
        `Fee Marketing - Referral ${customerName} oleh ${marketerName}`,
        'marketing_fee',
        marketerId
      ])

      logger.info(`Marketing fee recorded: Rp ${amount} for ${marketerName}`)
      return { success: true, message: 'Marketing fee recorded successfully' }
    } catch (error) {
      logger.error('Error triggering marketing fee:', error)
      return { success: false, message: 'Failed to record marketing fee' }
    }
  }

  // Manual trigger for testing
  async triggerRecurringExpenses() {
    try {
      logger.info('Triggering recurring expense processing manually...')
      await this.processRecurringExpenses()
      logger.info('Manual recurring expense processing completed')
      return { success: true, message: 'Recurring expenses processed successfully' }
    } catch (error) {
      logger.error('Error in manual recurring expense processing:', error)
      throw error
    }
  }
}

module.exports = new AutoExpenseService()