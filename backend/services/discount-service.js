const { logger } = require('../config/logger')
const { query, transaction } = require('../config/database')

class DiscountService {
  /**
   * Create a new billing discount
   */
  static async createDiscount(discountData) {
    try {
      const {
        name,
        description,
        discountType,
        discountValue,
        targetType,
        targetIds,
        compensationReason,
        startDate,
        endDate,
        maxDiscountAmount,
        applyToExistingInvoices,
        createdBy
      } = discountData

      const result = await query(`
        INSERT INTO billing_discounts (
          name, description, discount_type, discount_value, target_type,
          target_ids, compensation_reason, start_date, end_date,
          max_discount_amount, apply_to_existing_invoices, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        name, description, discountType, discountValue, targetType,
        targetIds, compensationReason, startDate, endDate,
        maxDiscountAmount, applyToExistingInvoices, createdBy
      ])

      const discount = result.rows[0]

      // Apply to existing invoices if requested
      if (applyToExistingInvoices) {
        await this.applyDiscountToExistingInvoices(discount.id)
      }

      logger.info(`✅ Billing discount created: ${name} (${discountType})`)
      return discount
    } catch (error) {
      logger.error('Error creating billing discount:', error)
      throw error
    }
  }

  /**
   * Get all billing discounts
   */
  static async getAllDiscounts(page = 1, limit = 10, filters = {}) {
    try {
      const offset = (page - 1) * limit
      let whereClause = 'WHERE 1=1'
      let queryParams = []
      let paramIndex = 1

      if (filters.status === 'active') {
        whereClause += ` AND bd.is_active = true AND bd.end_date >= CURRENT_DATE`
      } else if (filters.status === 'inactive') {
        whereClause += ` AND (bd.is_active = false OR bd.end_date < CURRENT_DATE)`
      }

      if (filters.targetType) {
        whereClause += ` AND bd.target_type = $${paramIndex++}`
        queryParams.push(filters.targetType)
      }

      const countResult = await query(`
        SELECT COUNT(*) as total
        FROM billing_discounts bd
        ${whereClause}
      `, queryParams)

      const total = parseInt(countResult.rows[0].total)

      const result = await query(`
        SELECT
          bd.*,
          CASE
            WHEN bd.is_active AND bd.end_date >= CURRENT_DATE THEN 'Active'
            WHEN bd.end_date < CURRENT_DATE THEN 'Expired'
            ELSE 'Inactive'
          END as status_text,
          (SELECT COUNT(*) FROM billing_discount_applications bda WHERE bda.discount_id = bd.id) as application_count
        FROM billing_discounts bd
        ${whereClause}
        ORDER BY bd.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `, [...queryParams, limit, offset])

      return {
        data: result.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    } catch (error) {
      logger.error('Error getting billing discounts:', error)
      throw error
    }
  }

  /**
   * Get discount by ID
   */
  static async getDiscountById(discountId) {
    try {
      const result = await query(`
        SELECT
          bd.*,
          CASE
            WHEN bd.is_active AND bd.end_date >= CURRENT_DATE THEN 'Active'
            WHEN bd.end_date < CURRENT_DATE THEN 'Expired'
            ELSE 'Inactive'
          END as status_text,
          (SELECT COUNT(*) FROM billing_discount_applications bda WHERE bda.discount_id = bd.id) as application_count,
          COALESCE(SUM(bda.discount_amount), 0) as total_discount_applied
        FROM billing_discounts bd
        LEFT JOIN billing_discount_applications bda ON bd.id = bda.discount_id
        WHERE bd.id = $1
        GROUP BY bd.id
      `, [discountId])

      return result.rows[0] || null
    } catch (error) {
      logger.error('Error getting discount by ID:', error)
      throw error
    }
  }

  /**
   * Update billing discount
   */
  static async updateDiscount(discountId, updateData) {
    try {
      const fields = []
      const values = []
      let paramIndex = 1

      Object.entries(updateData).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          fields.push(`${key} = $${paramIndex++}`)
          values.push(value)
        }
      })

      if (fields.length === 0) {
        throw new Error('No fields to update')
      }

      values.push(discountId)

      const result = await query(`
        UPDATE billing_discounts
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *
      `, values)

      if (result.rows.length === 0) {
        throw new Error('Discount not found')
      }

      logger.info(`✅ Billing discount updated: ${discountId}`)
      return result.rows[0]
    } catch (error) {
      logger.error('Error updating billing discount:', error)
      throw error
    }
  }

  /**
   * Delete billing discount
   */
  static async deleteDiscount(discountId) {
    try {
      await transaction(async (client) => {
        // Check if discount has applications
        const applicationResult = await client.query(
          'SELECT COUNT(*) as count FROM billing_discount_applications WHERE discount_id = $1',
          [discountId]
        )

        const applicationCount = parseInt(applicationResult.rows[0].count)

        if (applicationCount > 0) {
          // Soft delete by marking as inactive
          await client.query(
            'UPDATE billing_discounts SET is_active = false WHERE id = $1',
            [discountId]
          )
          logger.info(`✅ Billing discount soft deleted (marked inactive): ${discountId}`)
        } else {
          // Hard delete if no applications
          await client.query('DELETE FROM billing_discounts WHERE id = $1', [discountId])
          logger.info(`✅ Billing discount permanently deleted: ${discountId}`)
        }
      })

      return true
    } catch (error) {
      logger.error('Error deleting billing discount:', error)
      throw error
    }
  }

  /**
   * Apply discount to existing invoices
   */
  static async applyDiscountToExistingInvoices(discountId) {
    try {
      const discount = await this.getDiscountById(discountId)
      if (!discount || !discount.is_active) {
        throw new Error('Discount not found or inactive')
      }

      // Build target query based on target_type
      let targetCondition = ''
      let queryParams = [discountId]

      switch (discount.target_type) {
        case 'all':
          targetCondition = 'WHERE i.status = $2'
          queryParams.push('unpaid')
          break
        case 'customer':
          targetCondition = `WHERE i.customer_id = ANY($2) AND i.status = $3`
          queryParams.splice(1, 0, discount.target_ids, 'unpaid')
          break
        case 'area':
          targetCondition = `
            JOIN customers c ON i.customer_id = c.id
            WHERE c.address ILIKE ANY($2) AND i.status = $3
          `
          queryParams.splice(1, 0, discount.target_ids.map(area => `%${area}%`), 'unpaid')
          break
        case 'package':
          targetCondition = `
            JOIN customers c ON i.customer_id = c.id
            WHERE c.package_id = ANY($2) AND i.status = $3
          `
          queryParams.splice(1, 0, discount.target_ids, 'unpaid')
          break
      }

      // Get applicable invoices
      const invoicesResult = await query(`
        SELECT
          i.id, i.customer_id, i.amount as original_amount,
          CASE
            WHEN $4 = 'percentage' THEN i.amount * ($5::decimal / 100)
            ELSE $5
          END as discount_amount,
          LEAST(
            CASE
              WHEN $4 = 'percentage' THEN i.amount * ($5::decimal / 100)
              ELSE $5
            END,
            COALESCE($6, 999999999)
          ) as final_discount_amount
        FROM invoices i
        ${targetCondition}
        AND i.due_date >= $7 AND i.due_date <= $8
        AND i.id NOT IN (
          SELECT invoice_id FROM billing_discount_applications WHERE discount_id = $1
        )
      `, [
        ...queryParams,
        discount.discount_type,
        discount.discount_value,
        discount.max_discount_amount,
        discount.start_date,
        discount.end_date
      ])

      let appliedCount = 0

      // Apply discounts in transaction
      await transaction(async (client) => {
        for (const invoice of invoicesResult.rows) {
          const finalAmount = invoice.original_amount - invoice.final_discount_amount

          // Create discount application record
          await client.query(`
            INSERT INTO billing_discount_applications (
              discount_id, customer_id, invoice_id, original_amount,
              discount_amount, final_amount, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            discountId,
            invoice.customer_id,
            invoice.id,
            invoice.original_amount,
            invoice.final_discount_amount,
            finalAmount,
            `Applied from discount: ${discount.name}`
          ])

          // Update invoice
          await client.query(`
            UPDATE invoices
            SET discount_amount = discount_amount + $1,
                final_amount = amount - discount_amount - $1,
                discount_notes = COALESCE(discount_notes, '') || '; ' || $2
            WHERE id = $3
          `, [
            invoice.final_discount_amount,
            `Discount: ${discount.name}`,
            invoice.id
          ])

          appliedCount++
        }
      })

      logger.info(`✅ Applied discount to ${appliedCount} existing invoices`)
      return appliedCount
    } catch (error) {
      logger.error('Error applying discount to existing invoices:', error)
      throw error
    }
  }

  /**
   * Get discount applications
   */
  static async getDiscountApplications(discountId, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit

      const countResult = await query(
        'SELECT COUNT(*) as total FROM billing_discount_applications WHERE discount_id = $1',
        [discountId]
      )

      const total = parseInt(countResult.rows[0].total)

      const result = await query(`
        SELECT
          bda.*,
          c.name as customer_name,
          c.phone as customer_phone,
          i.invoice_number,
          i.due_date,
          i.status as invoice_status
        FROM billing_discount_applications bda
        JOIN customers c ON bda.customer_id = c.id
        JOIN invoices i ON bda.invoice_id = i.id
        WHERE bda.discount_id = $1
        ORDER BY bda.applied_at DESC
        LIMIT $2 OFFSET $3
      `, [discountId, limit, offset])

      return {
        data: result.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    } catch (error) {
      logger.error('Error getting discount applications:', error)
      throw error
    }
  }

  /**
   * Get applicable discounts for a customer
   */
  static async getApplicableDiscounts(customerId, invoiceAmount = null) {
    try {
      // Get customer info
      const customerResult = await query(
        'SELECT c.*, p.name as package_name FROM customers c LEFT JOIN packages p ON c.package_id = p.id WHERE c.id = $1',
        [customerId]
      )

      if (customerResult.rows.length === 0) {
        return []
      }

      const customer = customerResult.rows[0]

      const result = await query(`
        SELECT
          bd.*,
          CASE
            WHEN bd.discount_type = 'percentage' AND $2::decimal > 0 THEN
              LEAST($2::decimal * (bd.discount_value / 100), COALESCE(bd.max_discount_amount, 999999999))
            ELSE bd.discount_value
          END as calculated_discount,
          CASE
            WHEN bd.discount_type = 'percentage' THEN bd.discount_value || '%'
            ELSE 'Rp ' || bd.discount_value
          END as discount_display
        FROM billing_discounts bd
        WHERE bd.is_active = true
        AND CURRENT_DATE BETWEEN bd.start_date AND bd.end_date
        AND (
          bd.target_type = 'all'
          OR (bd.target_type = 'customer' AND $1 = ANY(bd.target_ids))
          OR (bd.target_type = 'area' AND $3 ILIKE ANY(bd.target_ids))
          OR (bd.target_type = 'package' AND bd.package_id = ANY(bd.target_ids))
        )
        ORDER BY bd.created_at DESC
      `, [customerId, invoiceAmount || 0, customer.address || '', customer.package_id])

      return result.rows
    } catch (error) {
      logger.error('Error getting applicable discounts:', error)
      throw error
    }
  }

  /**
   * Get discount statistics
   */
  static async getDiscountStats() {
    try {
      const result = await query(`
        SELECT
          COUNT(*) as total_discounts,
          COUNT(CASE WHEN is_active AND end_date >= CURRENT_DATE THEN 1 END) as active_discounts,
          COUNT(CASE WHEN end_date < CURRENT_DATE THEN 1 END) as expired_discounts,
          COALESCE(SUM(bda.discount_amount), 0) as total_discount_applied,
          COUNT(DISTINCT bda.customer_id) as customers_affected,
          COUNT(DISTINCT bda.invoice_id) as invoices_affected
        FROM billing_discounts bd
        LEFT JOIN billing_discount_applications bda ON bd.id = bda.discount_id
      `)

      return result.rows[0]
    } catch (error) {
      logger.error('Error getting discount statistics:', error)
      throw error
    }
  }
}

module.exports = DiscountService