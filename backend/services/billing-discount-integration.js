const { query, transaction } = require('../config/database');
const { logger } = require('../config/logger');
const DiscountService = require('./discount-service');
const ReferralService = require('./referral-service');

class BillingDiscountIntegration {
  /**
   * Calculate and apply all applicable discounts for an invoice
   */
  static async calculateInvoiceDiscounts(customerId, originalAmount, invoiceData = {}) {
    try {
      let totalDiscount = 0;
      let appliedDiscounts = [];
      let finalAmount = originalAmount;

      // 1. Apply referral discounts
      const referralDiscount = await this.applyReferralDiscounts(customerId, originalAmount);
      if (referralDiscount.amount > 0) {
        totalDiscount += referralDiscount.amount;
        finalAmount -= referralDiscount.amount;
        appliedDiscounts.push(referralDiscount);
      }

      // 2. Apply compensation discounts
      const compensationDiscounts = await this.applyCompensationDiscounts(customerId, originalAmount, invoiceData);
      for (const discount of compensationDiscounts) {
        totalDiscount += discount.amount;
        finalAmount -= discount.amount;
        appliedDiscounts.push(discount);
      }

      // Ensure final amount doesn't go below zero
      finalAmount = Math.max(0, finalAmount);

      return {
        originalAmount,
        totalDiscount,
        finalAmount,
        appliedDiscounts,
        discountPercentage: originalAmount > 0 ? (totalDiscount / originalAmount * 100) : 0
      };
    } catch (error) {
      logger.error('Error calculating invoice discounts:', error);
      return {
        originalAmount,
        totalDiscount: 0,
        finalAmount: originalAmount,
        appliedDiscounts: [],
        discountPercentage: 0
      };
    }
  }

  /**
   * Apply referral discounts
   */
  static async applyReferralDiscounts(customerId, invoiceAmount) {
    try {
      const referralBenefits = await ReferralService.applyReferralBenefits(customerId, invoiceAmount);

      if (referralBenefits > 0) {
        return {
          type: 'referral',
          amount: referralBenefits,
          description: 'Diskon Referral',
          source: 'referral_system'
        };
      }

      return { type: 'referral', amount: 0, description: '', source: 'referral_system' };
    } catch (error) {
      logger.error('Error applying referral discounts:', error);
      return { type: 'referral', amount: 0, description: '', source: 'referral_system' };
    }
  }

  /**
   * Apply compensation discounts
   */
  static async applyCompensationDiscounts(customerId, invoiceAmount, invoiceData = {}) {
    try {
      const applicableDiscounts = await DiscountService.getApplicableDiscounts(customerId, invoiceAmount);
      let appliedDiscounts = [];

      for (const discount of applicableDiscounts) {
        let discountAmount = discount.calculated_discount;

        // Don't apply if no discount amount
        if (discountAmount <= 0) continue;

        appliedDiscounts.push({
          type: 'compensation',
          discountId: discount.id,
          amount: discountAmount,
          description: `Diskon Kompensasi: ${discount.name}`,
          source: 'billing_discounts',
          discountDetails: {
            name: discount.name,
            type: discount.discount_type,
            compensationReason: discount.compensation_reason
          }
        });
      }

      // Apply only the best compensation discount (highest amount)
      if (appliedDiscounts.length > 0) {
        appliedDiscounts.sort((a, b) => b.amount - a.amount);
        return [appliedDiscounts[0]]; // Return only the best discount
      }

      return [];
    } catch (error) {
      logger.error('Error applying compensation discounts:', error);
      return [];
    }
  }

  /**
   * Create invoice with discounts applied
   */
  static async createInvoiceWithDiscounts(invoiceData) {
    try {
      const {
        customerId,
        packageId,
        amount,
        dueDate,
        description,
        invoiceNumber,
        metadata = {}
      } = invoiceData;

      return await transaction(async (client) => {
        // Calculate discounts
        const discountResult = await this.calculateInvoiceDiscounts(customerId, amount, invoiceData);

        // Create invoice
        const invoiceResult = await client.query(`
          INSERT INTO invoices (
            customer_id, package_id, invoice_number, amount, due_date,
            status, notes, discount_amount, final_amount, discount_notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `, [
          customerId,
          packageId,
          invoiceNumber,
          discountResult.originalAmount,
          dueDate,
          'unpaid',
          description,
          discountResult.totalDiscount,
          discountResult.finalAmount,
          this.formatDiscountNotes(discountResult.appliedDiscounts)
        ]);

        const invoice = invoiceResult.rows[0];

        // Create discount application records
        for (const appliedDiscount of discountResult.appliedDiscounts) {
          if (appliedDiscount.type === 'compensation' && appliedDiscount.discountId) {
            await client.query(`
              INSERT INTO billing_discount_applications (
                discount_id, customer_id, invoice_id, original_amount,
                discount_amount, final_amount, notes
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              appliedDiscount.discountId,
              customerId,
              invoice.id,
              discountResult.originalAmount,
              appliedDiscount.amount,
              discountResult.finalAmount,
              appliedDiscount.description
            ]);
          }
        }

        logger.info(`✅ Invoice created with discounts: ${invoiceNumber} - Total discount: ${discountResult.totalDiscount}`);

        return {
          invoice,
          discountResult
        };
      });
    } catch (error) {
      logger.error('Error creating invoice with discounts:', error);
      throw error;
    }
  }

  /**
   * Update invoice with new discounts
   */
  static async updateInvoiceDiscounts(invoiceId) {
    try {
      return await transaction(async (client) => {
        // Get invoice details
        const invoiceResult = await client.query(`
          SELECT * FROM invoices WHERE id = $1
        `, [invoiceId]);

        if (invoiceResult.rows.length === 0) {
          throw new Error('Invoice not found');
        }

        const invoice = invoiceResult.rows[0];

        // Skip if invoice is already paid
        if (invoice.status === 'paid') {
          throw new Error('Cannot update discounts on paid invoice');
        }

        // Calculate new discounts
        const discountResult = await this.calculateInvoiceDiscounts(
          invoice.customer_id,
          invoice.amount,
          { invoiceId, dueDate: invoice.due_date }
        );

        // Update invoice
        await client.query(`
          UPDATE invoices
          SET discount_amount = $1,
              final_amount = $2,
              discount_notes = $3,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
        `, [
          discountResult.totalDiscount,
          discountResult.finalAmount,
          this.formatDiscountNotes(discountResult.appliedDiscounts),
          invoiceId
        ]);

        // Remove old compensation discount applications
        await client.query(`
          DELETE FROM billing_discount_applications
          WHERE invoice_id = $1
        `, [invoiceId]);

        // Create new discount application records
        for (const appliedDiscount of discountResult.appliedDiscounts) {
          if (appliedDiscount.type === 'compensation' && appliedDiscount.discountId) {
            await client.query(`
              INSERT INTO billing_discount_applications (
                discount_id, customer_id, invoice_id, original_amount,
                discount_amount, final_amount, notes
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              appliedDiscount.discountId,
              invoice.customer_id,
              invoiceId,
              discountResult.originalAmount,
              appliedDiscount.amount,
              discountResult.finalAmount,
              appliedDiscount.description
            ]);
          }
        }

        logger.info(`✅ Invoice discounts updated: ${invoice.invoice_number} - Total discount: ${discountResult.totalDiscount}`);

        return discountResult;
      });
    } catch (error) {
      logger.error('Error updating invoice discounts:', error);
      throw error;
    }
  }

  /**
   * Apply discounts to existing unpaid invoices
   */
  static async applyDiscountsToUnpaidInvoices(customerId = null) {
    try {
      let whereClause = 'WHERE i.status = $1';
      let params = ['unpaid'];

      if (customerId) {
        whereClause += ' AND i.customer_id = $2';
        params.push(customerId);
      }

      const invoicesResult = await query(`
        SELECT i.id, i.customer_id, i.amount, i.final_amount, i.invoice_number
        FROM invoices i
        ${whereClause}
        ORDER BY i.created_at DESC
      `, params);

      let updatedCount = 0;
      const results = [];

      for (const invoice of invoicesResult.rows) {
        try {
          await this.updateInvoiceDiscounts(invoice.id);
          updatedCount++;
          results.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            status: 'updated'
          });
        } catch (error) {
          logger.error(`Failed to update discounts for invoice ${invoice.invoice_number}:`, error);
          results.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            status: 'failed',
            error: error.message
          });
        }
      }

      logger.info(`✅ Applied discounts to ${updatedCount} invoices`);

      return {
        totalInvoices: invoicesResult.rows.length,
        updatedCount,
        results
      };
    } catch (error) {
      logger.error('Error applying discounts to unpaid invoices:', error);
      throw error;
    }
  }

  /**
   * Get customer discount summary
   */
  static async getCustomerDiscountSummary(customerId, startDate = null, endDate = null) {
    try {
      let dateFilter = '';
      let params = [customerId];

      if (startDate) {
        dateFilter += ' AND i.due_date >= $' + (params.length + 1);
        params.push(startDate);
      }

      if (endDate) {
        dateFilter += ' AND i.due_date <= $' + (params.length + 1);
        params.push(endDate);
      }

      const result = await query(`
        SELECT
          COUNT(i.id) as total_invoices,
          COALESCE(SUM(i.amount), 0) as total_original_amount,
          COALESCE(SUM(i.discount_amount), 0) as total_discount_amount,
          COALESCE(SUM(i.final_amount), 0) as total_final_amount,
          COUNT(CASE WHEN i.discount_amount > 0 THEN 1 END) as invoices_with_discount,
          AVG(CASE WHEN i.amount > 0 THEN (i.discount_amount / i.amount * 100) END) as avg_discount_percentage,
          COUNT(bda.id) as compensation_applications,
          COALESCE(SUM(bda.discount_amount), 0) as total_compensation_discount
        FROM invoices i
        LEFT JOIN billing_discount_applications bda ON i.id = bda.invoice_id
        WHERE i.customer_id = $1
        ${dateFilter}
      `, params);

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting customer discount summary:', error);
      throw error;
    }
  }

  /**
   * Format discount notes for invoice
   */
  static formatDiscountNotes(appliedDiscounts) {
    const notes = [];

    for (const discount of appliedDiscounts) {
      if (discount.amount > 0) {
        notes.push(`${discount.description}: Rp ${discount.amount.toLocaleString('id-ID')}`);
      }
    }

    return notes.length > 0 ? notes.join('; ') : null;
  }

  /**
   * Validate discount application rules
   */
  static validateDiscountApplication(discount, invoice) {
    // Business rules for discount application
    const rules = {
      // Minimum invoice amount for percentage discounts
      minInvoiceAmount: 10000,
      // Maximum discount percentage
      maxDiscountPercentage: 100,
      // Cannot combine multiple compensation discounts
      maxCompensationDiscounts: 1
    };

    if (discount.discount_type === 'percentage' && invoice.amount < rules.minInvoiceAmount) {
      return {
        valid: false,
        reason: `Invoice amount must be at least Rp ${rules.minInvoiceAmount.toLocaleString('id-ID')} for percentage discounts`
      };
    }

    if (discount.discount_type === 'percentage' && discount.discount_value > rules.maxDiscountPercentage) {
      return {
        valid: false,
        reason: `Discount percentage cannot exceed ${rules.maxDiscountPercentage}%`
      };
    }

    return { valid: true };
  }
}

module.exports = BillingDiscountIntegration;