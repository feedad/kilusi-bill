const { logger } = require('../config/logger')
const { query } = require('../config/database')

class ReferralService {
  /**
   * Generate unique referral code
   */
  static async generateReferralCode() {
    let code
    let attempts = 0
    const maxAttempts = 100

    do {
      // Generate 6 digit random code
      code = 'REF' + Math.random().toString(36).substring(2, 8).toUpperCase()
      attempts++

      // Check if code already exists
      const result = await query(
        'SELECT id FROM referral_codes WHERE code = $1',
        [code]
      )

      if (result.rows.length === 0) {
        return code
      }
    } while (attempts < maxAttempts)

    throw new Error('Failed to generate unique referral code')
  }

  /**
   * Create referral code for customer
   */
  static async createReferralCode(customerId, options = {}) {
    try {
      const { maxUses = 50, expiryDays = 365 } = options

      // Check if customer already has active referral code
      const existing = await query(
        'SELECT id FROM referral_codes WHERE customer_id = $1 AND is_active = true',
        [customerId]
      )

      if (existing.rows.length > 0) {
        throw new Error('Customer already has an active referral code')
      }

      const code = await this.generateReferralCode()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expiryDays)

      const result = await query(`
        INSERT INTO referral_codes (customer_id, code, max_uses, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [customerId, code, maxUses, expiresAt])

      return result.rows[0]
    } catch (error) {
      logger.error('Error creating referral code:', error)
      throw error
    }
  }

  /**
   * Validate referral code
   */
  static async validateReferralCode(code, newCustomerId = null) {
    try {
      const result = await query(`
        SELECT rc.*, c.name as referrer_name, c.customer_id as referrer_customer_id
        FROM referral_codes rc
        LEFT JOIN customers c ON rc.customer_id = c.id
        WHERE rc.code = $1 AND rc.is_active = true
          AND (rc.expires_at IS NULL OR rc.expires_at > NOW())
          AND rc.usage_count < rc.max_uses
      `, [code])

      if (result.rows.length === 0) {
        return { valid: false, reason: 'Referral code not found or expired' }
      }

      const referral = result.rows[0]

      // Check if new customer is trying to refer themselves
      if (newCustomerId && referral.customer_id === newCustomerId) {
        return { valid: false, reason: 'Cannot use your own referral code' }
      }

      return { valid: true, referral }
    } catch (error) {
      logger.error('Error validating referral code:', error)
      throw error
    }
  }

  /**
   * Apply referral to new customer
   */
  static async applyReferral(code, referredCustomerId, benefitType = 'discount') {
    try {
      const validation = await this.validateReferralCode(code, referredCustomerId)

      if (!validation.valid) {
        throw new Error(validation.reason)
      }

      const referral = validation.referral

      // Get system settings
      const settings = await this.getReferralSettings()

      // Check if this is a fixed marketing code (no customer_id)
      let isFixedMarketingCode = false
      let marketerName = 'Marketing'

      if (!referral.customer_id) {
        isFixedMarketingCode = true
        // Get marketer info for fixed marketing codes
        const marketingInfo = await this.isFixedMarketingCode(code)
        if (marketingInfo) {
          marketerName = marketingInfo.marketer_name || 'Marketing Campaign'
        }
      }

      // Check if referrer is an active customer (has portal access = already subscribed)
      let isReferrerActiveCustomer = false
      let referrerStatus = null

      if (!isFixedMarketingCode) {
        const referrerResult = await query(`
          SELECT status
          FROM customers
          WHERE id = $1
        `, [referral.customer_id])

        referrerStatus = referrerResult.rows[0]?.status
        isReferrerActiveCustomer = referrerStatus === 'active'
      }

      // NEW BUSINESS LOGIC:
      // - If referrer is active customer: ONLY discount benefit (potongan tagihan)
      // - If referrer is fixed marketing code: CASH benefit (marketing referral)
      // - If referrer is non-active customer: CASH benefit (marketing referral)
      let finalBenefitType
      let benefitAmount = 0

      if (isFixedMarketingCode) {
        // Fixed marketing codes get CASH REWARD
        finalBenefitType = 'cash'
        benefitAmount = parseFloat(settings.referrer_cash_amount) // Rp 30.000
      } else if (isReferrerActiveCustomer) {
        // Active customer gets BILLING DISCOUNT only
        finalBenefitType = 'discount'
        benefitAmount = parseFloat(settings.referrer_discount_fixed) // Rp 25.000
      } else {
        // Non-active customer referrer gets CASH REWARD only
        finalBenefitType = 'cash'
        benefitAmount = parseFloat(settings.referrer_cash_amount) // Rp 30.000
      }

      // Start transaction
      await query('BEGIN')

      try {
        // Update referral code usage
        await query(`
          UPDATE referral_codes
          SET usage_count = usage_count + 1
          WHERE id = $1
        `, [referral.id])

        // Update customer referral info
        await query(`
          UPDATE customers
          SET referral_code_used = $1, referred_by = $2
          WHERE id = $3
        `, [code, referral.customer_id, referredCustomerId])

        // Create referral transaction with determined benefit type
        const transactionResult = await query(`
          INSERT INTO referral_transactions
          (referrer_id, referred_id, referral_code_id, benefit_type, benefit_amount, status)
          VALUES ($1, $2, $3, $4, $5, 'pending')
          RETURNING *
        `, [referral.customer_id, referredCustomerId, referral.id, finalBenefitType, benefitAmount])

        const newTransaction = transactionResult.rows[0]

        // Create accounting transaction for referred customer discount (installation or service)
        await this.createReferralAccountingTransaction({
          type: 'installation_discount',
          amount: 25000, // Fixed installation discount for referred customer
          description: `Diskon instalasi referral untuk pelanggan ${referredCustomerId}`,
          referenceType: 'referral_transaction',
          referenceId: newTransaction.id,
          customerId: referredCustomerId,
          referrerId: referral.customer_id
        })

        await query('COMMIT')

        const displayReferrerName = isFixedMarketingCode ? marketerName : referral.referrer_name

        return {
          success: true,
          benefitType: finalBenefitType,
          benefitAmount,
          referrerName: displayReferrerName,
          isReferrerActiveCustomer,
          isFixedMarketingCode,
          message: isReferrerActiveCustomer
            ? `Referral berhasil! ${displayReferrerName} akan mendapatkan potongan tagihan Rp ${benefitAmount.toLocaleString('id-ID')}`
            : `Referral berhasil! ${displayReferrerName} akan mendapatkan cash reward Rp ${benefitAmount.toLocaleString('id-ID')}`
        }
      } catch (error) {
        await query('ROLLBACK')
        throw error
      }
    } catch (error) {
      logger.error('Error applying referral:', error)
      throw error
    }
  }

  /**
   * Get customer's referral code
   */
  static async getCustomerReferralCode(customerId) {
    try {
      const result = await query(`
        SELECT *
        FROM referral_codes
        WHERE customer_id = $1 AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `, [customerId])

      return result.rows[0] || null
    } catch (error) {
      logger.error('Error getting customer referral code:', error)
      throw error
    }
  }

  /**
   * Get customer's referral history
   */
  static async getCustomerReferralHistory(customerId) {
    try {
      const result = await query(`
        SELECT
          rt.*,
          c_referrer.name as referrer_name,
          c_referred.name as referred_name,
          rc.code
        FROM referral_transactions rt
        LEFT JOIN customers c_referrer ON rt.referrer_id = c_referrer.id
        LEFT JOIN customers c_referred ON rt.referred_id = c_referred.id
        LEFT JOIN referral_codes rc ON rt.referral_code_id = rc.id
        WHERE rt.referrer_id = $1 OR rt.referred_id = $1
        ORDER BY rt.created_at DESC
      `, [customerId])

      return result.rows
    } catch (error) {
      logger.error('Error getting customer referral history:', error)
      throw error
    }
  }

  /**
   * Create marketing referral
   */
  static async createMarketingReferral(marketerData, customerId) {
    try {
      const { marketerName, marketerPhone, marketerEmail, feeAmount } = marketerData

      const code = await this.generateReferralCode()

      const result = await query(`
        INSERT INTO marketing_referrals
        (marketer_name, marketer_phone, marketer_email, referral_code, customer_id, fee_amount)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [marketerName, marketerPhone, marketerEmail, code, customerId, feeAmount])

      return result.rows[0]
    } catch (error) {
      logger.error('Error creating marketing referral:', error)
      throw error
    }
  }

  /**
   * Create fixed marketing referral code (for campaigns)
   */
  static async createFixedMarketingCode(code, marketerName, maxUses = 1000, expiryDays = 365) {
    try {
      // Check if code already exists
      const existing = await query(
        'SELECT id FROM referral_codes WHERE code = $1',
        [code]
      )

      if (existing.rows.length > 0) {
        throw new Error('Referral code already exists')
      }

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expiryDays)

      const result = await query(`
        INSERT INTO referral_codes (customer_id, code, max_uses, expires_at, is_active)
        VALUES (NULL, $1, $2, $3, true)
        RETURNING *
      `, [code, maxUses, expiresAt])

      // Also create marketing referral record
      const marketingResult = await query(`
        INSERT INTO marketing_referrals
        (marketer_name, referral_code, customer_id, fee_amount)
        VALUES ($1, $2, NULL, 0)
        RETURNING *
      `, [marketerName, code])

      return {
        referralCode: result.rows[0],
        marketingReferral: marketingResult.rows[0]
      }
    } catch (error) {
      logger.error('Error creating fixed marketing code:', error)
      throw error
    }
  }

  /**
   * Validate if referral code is fixed marketing code
   */
  static async isFixedMarketingCode(code) {
    try {
      const result = await query(`
        SELECT rc.*, mr.marketer_name, mr.marketer_phone, mr.marketer_email
        FROM referral_codes rc
        LEFT JOIN marketing_referrals mr ON rc.code = mr.referral_code
        WHERE rc.code = $1 AND rc.customer_id IS NULL AND rc.is_active = true
          AND (rc.expires_at IS NULL OR rc.expires_at > NOW())
          AND rc.usage_count < rc.max_uses
      `, [code])

      return result.rows.length > 0 ? result.rows[0] : null
    } catch (error) {
      logger.error('Error checking fixed marketing code:', error)
      throw error
    }
  }

  /**
   * Apply referral benefits (to be called from billing system)
   */
  static async applyReferralBenefits(customerId, billingAmount) {
    try {
      // Find pending referral benefits for this customer
      const result = await query(`
        SELECT *
        FROM referral_transactions
        WHERE referred_id = $1 AND status = 'pending'
      `, [customerId])

      const transactions = result.rows
      let totalDiscount = 0

      for (const transaction of transactions) {
        let benefitAmount = transaction.benefit_amount

        // For discount type, use the fixed amount directly
        if (transaction.benefit_type === 'discount') {
          benefitAmount = transaction.benefit_amount
        }

        totalDiscount += benefitAmount

        // Mark transaction as applied
        await query(`
          UPDATE referral_transactions
          SET status = 'applied', applied_date = NOW()
          WHERE id = $1
        `, [transaction.id])

        // Create accounting transaction for referral discount
        await this.createReferralAccountingTransaction({
          type: 'referral_discount',
          amount: benefitAmount,
          description: `Diskon referral untuk pelanggan ${customerId}`,
          referenceType: 'referral_transaction',
          referenceId: transaction.id,
          customerId: customerId,
          referrerId: transaction.referrer_id
        })
      }

      return totalDiscount
    } catch (error) {
      logger.error('Error applying referral benefits:', error)
      throw error
    }
  }

  /**
   * Get referral statistics
   */
  static async getReferralStats() {
    try {
      const result = await query(`
        SELECT
          COUNT(*) as total_referrals,
          COUNT(CASE WHEN status = 'applied' THEN 1 END) as applied_referrals,
          SUM(benefit_amount) as total_benefits,
          AVG(benefit_amount) as avg_benefit_amount
        FROM referral_transactions
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `)

      return result.rows[0]
    } catch (error) {
      logger.error('Error getting referral stats:', error)
      throw error
    }
  }

  /**
   * Get all referral codes (admin)
   */
  static async getAllReferralCodes(page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit

      const countResult = await query('SELECT COUNT(*) as total FROM referral_codes')
      const total = parseInt(countResult.rows[0].total)

      const result = await query(`
        SELECT
          rc.*,
          c.name as customer_name,
          c.customer_id as customer_code
        FROM referral_codes rc
        LEFT JOIN customers c ON rc.customer_id = c.id
        ORDER BY rc.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset])

      return {
        data: result.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    } catch (error) {
      logger.error('Error getting referral codes:', error)
      throw error
    }
  }

  /**
   * Get referral system settings
   */
  static async getReferralSettings() {
    try {
      const result = await query(`
        SELECT setting_key, setting_value
        FROM auto_expense_settings
        WHERE setting_key LIKE 'referral%'
      `)

      const settings = {}
      result.rows.forEach(row => {
        settings[row.setting_key] = row.setting_value
      })

      // Set default values including the new boolean flags
      return {
        referral_enabled: settings.referral_enabled || 'true',
        referrer_discount_enabled: settings.referrer_discount_enabled || 'true',
        referrer_cash_enabled: settings.referrer_cash_enabled || 'true',
        referred_installation_discount_enabled: settings.referred_installation_discount_enabled || 'true',
        referred_service_discount_enabled: settings.referred_service_discount_enabled || 'true',
        referrer_discount_fixed: settings.referrer_discount_fixed || '25000',
        referrer_cash_amount: settings.referrer_cash_amount || '30000',
        referred_installation_discount_fixed: settings.referred_installation_discount_fixed || '50000',
        referred_service_discount_fixed: settings.referred_service_discount_fixed || '25000',
        marketing_min_fee: settings.marketing_min_fee || '100000',
        marketing_max_fee: settings.marketing_max_fee || '500000',
        referral_code_expiry_days: settings.referral_code_expiry_days || '365',
        referral_max_uses: settings.referral_max_uses || '50',
        referral_benefit_type: settings.referral_benefit_type || 'discount',
        referral_cash_enabled: settings.referral_cash_enabled || 'true'
      }
    } catch (error) {
      logger.error('Error getting referral settings:', error)
      throw error
    }
  }

  /**
   * Create accounting transaction for referral
   */
  static async createReferralAccountingTransaction(transactionData) {
    try {
      const { type, amount, description, referenceType, referenceId, customerId, referrerId } = transactionData

      // Get appropriate category
      let categoryName
      if (type === 'referral_discount') {
        categoryName = 'Diskon Referral'
      } else if (type === 'referral_cash') {
        categoryName = 'Cash Reward Referral'
      } else if (type === 'marketing_fee') {
        categoryName = 'Fee Marketing Referral'
      } else if (type === 'installation_discount') {
        categoryName = 'Diskon Instalasi Referral'
      } else {
        logger.warn('Unknown referral transaction type:', type)
        return null
      }

      // Get category ID
      const categoryResult = await query(`
        SELECT id FROM accounting_categories
        WHERE name = $1 AND is_active = true
      `, [categoryName])

      if (categoryResult.rows.length === 0) {
        logger.warn(`Category not found: ${categoryName}`)
        return null
      }

      const categoryId = categoryResult.rows[0].id

      // Create accounting transaction
      const result = await query(`
        INSERT INTO accounting_transactions (
          category_id, type, amount, description,
          reference_type, reference_id, date, notes, created_at
        ) VALUES (
          $1, 'expense', $2, $3, $4, $5, CURRENT_DATE, $6, CURRENT_TIMESTAMP
        ) RETURNING *
      `, [
        categoryId,
        amount,
        description,
        referenceType,
        referenceId,
        `Customer ID: ${customerId}${referrerId ? `, Referrer ID: ${referrerId}` : ''}`
      ])

      logger.info(`✅ Referral accounting transaction created: ${categoryName} ${amount}`)
      return result.rows[0]
    } catch (error) {
      logger.error('Error creating referral accounting transaction:', error)
      return null
    }
  }

  /**
   * Process referral cash payout to referrer
   */
  static async processReferralCashPayout(referrerId, amount, transactionId) {
    try {
      // Create expense transaction for cash payout
      await this.createReferralAccountingTransaction({
        type: 'referral_cash',
        amount: amount,
        description: `Cash reward referral untuk pelanggan`,
        referenceType: 'referral_transaction',
        referenceId: transactionId,
        customerId: referrerId
      })

      logger.info(`Cash payout processed for referrer ${referrerId}: Rp ${amount}`)
      return true
    } catch (error) {
      logger.error('Error processing referral cash payout:', error)
      return false
    }
  }

  /**
   * Process marketing fee payment
   */
  static async processMarketingFeePayment(marketerName, amount, marketingReferralId) {
    try {
      // Create expense transaction for marketing fee
      await this.createReferralAccountingTransaction({
        type: 'marketing_fee',
        amount: amount,
        description: `Fee marketing untuk ${marketerName}`,
        referenceType: 'marketing_referral',
        referenceId: marketingReferralId,
        customerId: null
      })

      logger.info(`Marketing fee processed for ${marketerName}: Rp ${amount}`)
      return true
    } catch (error) {
      logger.error('Error processing marketing fee payment:', error)
      return false
    }
  }

  /**
   * Get referral accounting summary
   */
  static async getReferralAccountingSummary(startDate = null, endDate = null) {
    try {
      let dateFilter = ''
      const params = []
      let paramIndex = 1

      if (startDate) {
        dateFilter += ` AND at.date >= $${paramIndex++}`
        params.push(startDate)
      }

      if (endDate) {
        dateFilter += ` AND at.date <= $${paramIndex++}`
        params.push(endDate)
      }

      const result = await query(`
        SELECT
          ac.name as category_name,
          ac.type,
          COUNT(*) as transaction_count,
          COALESCE(SUM(at.amount), 0) as total_amount
        FROM accounting_transactions at
        LEFT JOIN accounting_categories ac ON at.category_id = ac.id
        WHERE ac.name IN (
          'Diskon Referral',
          'Cash Reward Referral',
          'Fee Marketing Referral',
          'Diskon Instalasi Referral'
        )
        ${dateFilter}
        GROUP BY ac.name, ac.type
        ORDER BY ac.type, ac.name
      `, params)

      return {
        summary: result.rows,
        totalExpenses: result.rows.reduce((sum, row) => sum + parseFloat(row.total_amount), 0),
        totalTransactions: result.rows.reduce((sum, row) => sum + parseInt(row.transaction_count), 0)
      }
    } catch (error) {
      logger.error('Error getting referral accounting summary:', error)
      throw error
    }
  }

  /**
   * Update referral settings
   */
  static async updateReferralSettings(settings) {
    try {
      logger.info('🔧 Updating referral settings:', {
        keys: Object.keys(settings),
        values: settings,
        totalSettings: Object.keys(settings).length
      })

      // Create individual value placeholders for each setting
      const valuePlaceholders = []
      const values = []
      let paramIndex = 1

      Object.entries(settings).forEach(([key, value]) => {
        valuePlaceholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`)
        values.push(key, value, `Update setting ${key}`)
        paramIndex += 3
        logger.info(`  - ${key}: ${value}`)
      })

      const sql = `
        INSERT INTO auto_expense_settings (setting_key, setting_value, description)
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
      `

      logger.info('🔧 Executing SQL with placeholders:', {
        placeholderCount: valuePlaceholders.length,
        totalValues: values.length,
        sql: sql
      })

      await query(sql, values)

      logger.info('✅ Referral settings updated successfully')
      return true
    } catch (error) {
      logger.error('❌ Error updating referral settings:', {
        error: error.message,
        stack: error.stack,
        settings: settings
      })
      throw error
    }
  }
}

module.exports = ReferralService