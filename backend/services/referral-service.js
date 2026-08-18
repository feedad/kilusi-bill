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
        benefitAmount = parseFloat(settings.referrer_cash_amount)
      } else if (isReferrerActiveCustomer) {
        // Active customer gets BILLING DISCOUNT only
        finalBenefitType = 'discount'
        benefitAmount = parseFloat(settings.referrer_discount_fixed)
      } else {
        // Non-active customer referrer gets CASH REWARD only
        finalBenefitType = 'cash'
        benefitAmount = parseFloat(settings.referrer_cash_amount)
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
  // Used by billing-discount-integration — referral discounts no longer apply here
  static async applyReferralBenefits(customerId, billingAmount) {
    return 0
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

      return {
        referral_enabled: settings.referral_enabled || 'true',
        referrer_discount_fixed: settings.referrer_discount_fixed || '50000',
        referrer_cash_amount: settings.referrer_cash_amount || '50000',
        referred_reward_enabled: settings.referred_reward_enabled || 'true',
        referred_reward_fixed: settings.referred_reward_fixed || '25000',
        referral_code_expiry_days: settings.referral_code_expiry_days || '365',
        referral_max_uses: settings.referral_max_uses || '50'
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

      let categoryName
      if (type === 'referral_discount') {
        categoryName = 'Diskon Referral'
      } else if (type === 'referral_cash') {
        categoryName = 'Fee Marketing'
      } else if (type === 'marketing_fee') {
        categoryName = 'Fee Marketing'
      } else if (type === 'service_discount') {
        categoryName = 'Diskon Layanan Referral'
      } else {
        logger.warn('Unknown referral transaction type:', type)
        return null
      }

      const categoryResult = await query(`
        SELECT id FROM accounting_categories
        WHERE name = $1 AND is_active = true
      `, [categoryName])

      if (categoryResult.rows.length === 0) {
        logger.warn(`Category not found: ${categoryName}`)
        return null
      }

      const categoryId = categoryResult.rows[0].id

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
          'Fee Marketing',
          'Diskon Layanan Referral'
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

      const valuePlaceholders = []
      const values = []
      let paramIndex = 1

      Object.entries(settings).forEach(([key, value]) => {
        valuePlaceholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`)
        values.push(key, value, `Update setting ${key}`)
        paramIndex += 3
      })

      const sql = `
        INSERT INTO auto_expense_settings (setting_key, setting_value, description)
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
      `

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

  // ============================================
  // MARKETING BALANCE (Saldo Marketing)
  // ============================================

  /**
   * Get marketing balance for a customer
   */
  static async getMarketingBalance(customerId) {
    try {
      const result = await query(`
        SELECT * FROM marketing_balance WHERE customer_id = $1
      `, [customerId])

      if (result.rows.length === 0) {
        return { customer_id: customerId, total_credit: 0, used_credit: 0, available: 0 }
      }

      const balance = result.rows[0]
      balance.available = parseFloat(balance.total_credit) - parseFloat(balance.used_credit)
      return balance
    } catch (error) {
      logger.error('Error getting marketing balance:', error)
      return { customer_id: customerId, total_credit: 0, used_credit: 0, available: 0 }
    }
  }

  /**
   * Get marketing balance transaction history
   */
  static async getMarketingBalanceHistory(customerId, limit = 50) {
    try {
      const result = await query(`
        SELECT * FROM marketing_balance_transactions
        WHERE customer_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [customerId, limit])

      return result.rows
    } catch (error) {
      logger.error('Error getting marketing balance history:', error)
      return []
    }
  }

  /**
   * Apply referred customer's first invoice discount
   * Called from activation-service.js after invoice is created
   */
  static async applyReferredFirstInvoiceDiscount(invoiceId, customerId) {
    try {
      // Check if customer used a referral code
      const custResult = await query(`
        SELECT referral_code_used FROM customers WHERE id = $1
      `, [customerId])

      if (!custResult.rows[0]?.referral_code_used) return false

      const settings = await this.getReferralSettings()
      if (settings.referred_reward_enabled !== 'true') return false

      const discountAmount = parseFloat(settings.referred_reward_fixed || '0')
      if (discountAmount <= 0) return false

      // Apply discount to invoice
      const updateResult = await query(`
        UPDATE invoices SET
          discount_amount = COALESCE(discount_amount, 0) + $1,
          final_amount = amount - (COALESCE(discount_amount, 0) + $1)
        WHERE id = $2 AND status IN ('draft', 'unpaid')
      `, [discountAmount, invoiceId])

      if (updateResult.rowCount === 0) {
        logger.warn(`Invoice ${invoiceId} not draft or not found, skipping referred discount`)
        return false
      }

      // Get transaction info for description
      const invoiceResult = await query(`
        SELECT invoice_number FROM invoices WHERE id = $1
      `, [invoiceId])

      const invNumber = invoiceResult.rows[0]?.invoice_number || `#${invoiceId}`

      // Create accounting transaction
      await this.createReferralAccountingTransaction({
        type: 'service_discount',
        amount: discountAmount,
        description: `Diskon referral - Invoice ${invNumber} untuk pelanggan ${customerId}`,
        referenceType: 'invoice',
        referenceId: invoiceId,
        customerId: customerId
      })

      logger.info(`✅ Referred discount applied: Rp ${discountAmount} to invoice ${invNumber}`)
      return true
    } catch (error) {
      logger.error('Error applying referred first invoice discount:', error)
      return false
    }
  }

  /**
   * Add marketing credit to referrer when referred customer pays
   * Called from billing.js & payments.js after payment success
   */
  static async addReferrerMarketingCredit(referredCustomerId) {
    try {
      // Find pending referral transactions of type 'discount' for this referred customer
      const txResult = await query(`
        SELECT * FROM referral_transactions
        WHERE referred_id = $1 AND status = 'pending' AND benefit_type = 'discount'
      `, [referredCustomerId])

      if (txResult.rows.length === 0) return false

      const settings = await this.getReferralSettings()
      const creditAmount = parseFloat(settings.referrer_discount_fixed || '50000')
      if (creditAmount <= 0) return false

      for (const tx of txResult.rows) {
        const referrerId = tx.referrer_id
        if (!referrerId) continue

        await query('BEGIN')
        try {
          // Get current balance
          const balanceBefore = await this.getMarketingBalance(referrerId)
          const beforeVal = parseFloat(balanceBefore.total_credit || 0)

          // Upsert marketing_balance
          await query(`
            INSERT INTO marketing_balance (customer_id, total_credit)
            VALUES ($1, $2)
            ON CONFLICT (customer_id)
            DO UPDATE SET
              total_credit = marketing_balance.total_credit + $2,
              updated_at = CURRENT_TIMESTAMP
          `, [referrerId, creditAmount])

          const afterVal = beforeVal + creditAmount

          // Record transaction
          await query(`
            INSERT INTO marketing_balance_transactions
            (customer_id, amount, type, balance_before, balance_after, reference_type, reference_id, description)
            VALUES ($1, $2, 'credit', $3, $4, 'referral_transaction', $5, $6)
          `, [
            referrerId, creditAmount, beforeVal, afterVal,
            tx.id,
            `Saldo marketing dari referral pelanggan #${referredCustomerId}`
          ])

          // Mark referral transaction as applied
          await query(`
            UPDATE referral_transactions
            SET status = 'applied', applied_date = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [tx.id])

          await query('COMMIT')

          logger.info(`✅ Referrer ${referrerId} credited Rp ${creditAmount} from referral #${referredCustomerId}`)

          // Auto-apply balance to referrer's unpaid invoices (non-blocking)
          this.autoApplyMarketingBalance(referrerId)
            .catch(e => logger.warn(`Auto-apply balance for ${referrerId} failed: ${e.message}`))

        } catch (err) {
          await query('ROLLBACK')
          throw err
        }
      }

      return true
    } catch (error) {
      logger.error('Error adding referrer marketing credit:', error)
      return false
    }
  }

  /**
   * Add marketing credit to referred customer when they pay their first invoice
   * Called from billing.js & payments.js after payment success
   */
  static async addReferredMarketingCredit(referredCustomerId) {
    try {
      const settings = await this.getReferralSettings()
      if (settings.referred_reward_enabled !== 'true') return false

      const creditAmount = parseFloat(settings.referred_reward_fixed || '25000')
      if (creditAmount <= 0) return false

      // Get current balance
      const balanceBefore = await this.getMarketingBalance(referredCustomerId)
      const beforeVal = parseFloat(balanceBefore.total_credit || 0)

      // Upsert marketing_balance
      await query(`
        INSERT INTO marketing_balance (customer_id, total_credit)
        VALUES ($1, $2)
        ON CONFLICT (customer_id)
        DO UPDATE SET
          total_credit = marketing_balance.total_credit + $2,
          updated_at = CURRENT_TIMESTAMP
      `, [referredCustomerId, creditAmount])

      const afterVal = beforeVal + creditAmount

      await query(`
        INSERT INTO marketing_balance_transactions
        (customer_id, amount, type, balance_before, balance_after, reference_type, reference_id, description)
        VALUES ($1, $2, 'credit', $3, $4, 'first_payment', $5, $6)
      `, [
        referredCustomerId, creditAmount, beforeVal, afterVal,
        referredCustomerId,
        `Saldo reward pendaftaran referral`
      ])

      logger.info(`✅ Referred ${referredCustomerId} credited Rp ${creditAmount} as signup reward`)

      // Auto-apply to their unpaid invoices
      this.autoApplyMarketingBalance(referredCustomerId)
        .catch(e => logger.warn(`Auto-apply for referred ${referredCustomerId} failed: ${e.message}`))

      return true
    } catch (error) {
      logger.error('Error adding referred marketing credit:', error)
      return false
    }
  }

  /**
   * Auto-apply marketing balance to customer's unpaid invoices
   * Handles both full auto-pay and partial discount
   */
  static async autoApplyMarketingBalance(customerId) {
    try {
      const balance = await this.getMarketingBalance(customerId)
      let available = balance.available
      if (available <= 0) return { applied: false, reason: 'no_balance' }

      // Get unpaid invoices ordered by due date
      const invoices = await query(`
        SELECT id, invoice_number, amount, final_amount, discount_amount
        FROM invoices
        WHERE customer_id = $1 AND status IN ('unpaid', 'draft', 'sent')
        ORDER BY due_date ASC
      `, [customerId])

      if (invoices.rows.length === 0) return { applied: false, reason: 'no_unpaid_invoices' }

      let totalUsed = 0
      const results = []

      for (const invoice of invoices.rows) {
        if (available <= 0) break

        const invoiceFinalAmount = parseFloat(invoice.final_amount || invoice.amount)
        const useAmount = Math.min(available, invoiceFinalAmount)
        if (useAmount <= 0) continue

        // Record debit transaction first
        const balanceBefore = await this.getMarketingBalance(customerId)
        const beforeVal = parseFloat(balanceBefore.total_credit) - parseFloat(balanceBefore.used_credit)

        await query(`
          INSERT INTO marketing_balance_transactions
          (customer_id, amount, type, balance_before, balance_after, reference_type, reference_id, description)
          VALUES ($1, $2, 'debit', $3, $4, 'invoice', $5, $6)
        `, [
          customerId, useAmount, beforeVal, beforeVal - useAmount,
          invoice.id,
          `Penggunaan saldo marketing - Invoice ${invoice.invoice_number}`
        ])

        if (useAmount >= invoiceFinalAmount) {
          // FULL AUTO-PAY
          await query(`
            UPDATE invoices SET
              status = 'paid',
              paid_at = CURRENT_TIMESTAMP,
              discount_amount = COALESCE(discount_amount, 0) + $1,
              final_amount = 0
            WHERE id = $2
          `, [invoiceFinalAmount, invoice.id])

          // Create payment record
          const payResult = await query(`
            INSERT INTO payments
            (invoice_id, amount, payment_method, payment_date, notes, created_at)
            VALUES ($1, $2, 'Diskon Marketing', CURRENT_TIMESTAMP, $3, CURRENT_TIMESTAMP)
            RETURNING id
          `, [
            invoice.id, invoiceFinalAmount,
            `Pembayaran otomatis dari Saldo Marketing`
          ])

          // Revenue entry
          await query(`
            INSERT INTO accounting_transactions
            (category_id, type, amount, description, reference_type, reference_id, date, created_at)
            VALUES (
              (SELECT id FROM accounting_categories WHERE name = 'Internet Service' AND is_active = true),
              'revenue', $1, $2, 'invoice', $3, CURRENT_DATE, CURRENT_TIMESTAMP
            )
          `, [
            invoiceFinalAmount,
            `Pembayaran via Saldo Marketing - Invoice ${invoice.invoice_number}`,
            invoice.id
          ])

          // Expense entry (marketing cost)
          await this.createReferralAccountingTransaction({
            type: 'referral_discount',
            amount: invoiceFinalAmount,
            description: `Saldo Marketing - Invoice ${invoice.invoice_number}`,
            referenceType: 'invoice',
            referenceId: invoice.id,
            customerId: customerId
          })

          results.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            action: 'auto_pay',
            amount: invoiceFinalAmount
          })

          available -= invoiceFinalAmount
          totalUsed += invoiceFinalAmount

        } else {
          // PARTIAL DISCOUNT
          await query(`
            UPDATE invoices SET
              discount_amount = COALESCE(discount_amount, 0) + $1,
              final_amount = amount - discount_amount
            WHERE id = $2
          `, [useAmount, invoice.id])

          // Expense entry only (partial discount)
          await this.createReferralAccountingTransaction({
            type: 'referral_discount',
            amount: useAmount,
            description: `Saldo Marketing (sebagian) - Invoice ${invoice.invoice_number}`,
            referenceType: 'invoice',
            referenceId: invoice.id,
            customerId: customerId
          })

          results.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            action: 'partial_discount',
            amount: useAmount
          })

          available -= useAmount
          totalUsed += useAmount
        }
      }

      // Update used_credit on marketing_balance
      const currentBalance = await this.getMarketingBalance(customerId)
      const newUsed = parseFloat(currentBalance.used_credit) + totalUsed
      await query(`
        UPDATE marketing_balance SET used_credit = $1, updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = $2
      `, [newUsed, customerId])

      logger.info(`✅ Auto-applied Rp ${totalUsed} marketing balance for customer ${customerId}`)
      return { applied: true, totalUsed, results }

    } catch (error) {
      logger.error('Error auto-applying marketing balance:', error)
      return { applied: false, reason: error.message }
    }
  }

  /**
   * Process cash reward for fixed marketing code activation
   * Called from activation-service.js after customer activation
   */
  static async processFixedCodeCashReward(customerId) {
    try {
      const custResult = await query(`
        SELECT referral_code_used FROM customers WHERE id = $1
      `, [customerId])

      const code = custResult.rows[0]?.referral_code_used
      if (!code) return false

      const isFixed = await this.isFixedMarketingCode(code)
      if (!isFixed) return false

      const settings = await this.getReferralSettings()
      const cashAmount = parseFloat(settings.referrer_cash_amount || '50000')
      if (cashAmount <= 0) return false

      // Update marketing_referrals record
      await query(`
        UPDATE marketing_referrals
        SET customer_id = $1, fee_amount = $2, status = 'paid', paid_date = CURRENT_TIMESTAMP
        WHERE referral_code = $3 AND status = 'pending'
      `, [customerId, cashAmount, code])

      // Get customer name for description
      const nameResult = await query('SELECT name FROM customers WHERE id = $1', [customerId])
      const customerName = nameResult.rows[0]?.name || `Customer #${customerId}`
      const marketerName = isFixed.marketer_name || 'Marketing Campaign'

      // Create expense entry
      await this.createReferralAccountingTransaction({
        type: 'marketing_fee',
        amount: cashAmount,
        description: `Fee Marketing - Aktivasi ${customerName} oleh ${marketerName}`,
        referenceType: 'marketing_fee_fixed_code',
        referenceId: customerId,
        customerId: customerId
      })

      logger.info(`✅ Cash reward Rp ${cashAmount} processed for fixed code ${code} (${marketerName})`)
      return true
    } catch (error) {
      logger.error('Error processing fixed code cash reward:', error)
      return false
    }
  }
}

module.exports = ReferralService