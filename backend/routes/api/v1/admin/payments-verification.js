/**
 * Admin Payment Verification Routes
 * Handles verification of manual payments (bank transfer, e-wallet, cash)
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../../../../config/logger');
const { query } = require('../../../../config/database');
const { jwtAuth } = require('../../../../middleware/jwtAuth');
const { asyncHandler } = require('../../../../middleware/response');
const telegramService = require('../../../../services/telegram-service');

/**
 * GET /api/v1/admin/payments-verification/pending
 * Get all pending verification payments
 */
router.get('/pending', jwtAuth, asyncHandler(async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(`
      SELECT
        pt.id,
        pt.invoice_id,
        pt.gateway,
        pt.payment_method,
        pt.amount,
        pt.fee_amount,
        pt.net_amount,
        pt.status,
        pt.proof_of_payment,
        pt.manual_payment_details,
        pt.created_at,
        pt.updated_at,
        (pt.is_manual_payment = true AND pt.manual_payment_details IS NOT NULL) as is_from_chatbot,
        i.invoice_number,
        i.due_date,
        c.id as customer_id,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        p.name as package_name
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      LEFT JOIN packages p ON i.package_id = p.id
      WHERE pt.status = 'pending_verification'
      AND pt.gateway = 'manual'
      ORDER BY pt.created_at ASC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit), parseInt(offset)]);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM payment_transactions pt
      WHERE pt.status = 'pending_verification'
      AND pt.gateway = 'manual'
    `);

    res.json({
      success: true,
      data: {
        transactions: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching pending payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending payments'
    });
  }
}));

/**
 * GET /api/v1/admin/payments-verification/:id
 * Get payment verification details
 */
router.get('/:id', jwtAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT
        pt.*,
        (pt.is_manual_payment = true AND pt.manual_payment_details IS NOT NULL) as is_from_chatbot,
        i.invoice_number,
        i.due_date,
        i.status as invoice_status,
        c.id as customer_id,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address,
        p.name as package_name,
        p.speed as package_speed
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      LEFT JOIN packages p ON i.package_id = p.id
      WHERE pt.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    const transaction = result.rows[0];

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    logger.error('Error fetching payment details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment details'
    });
  }
}));

/**
 * POST /api/v1/admin/payments-verification/:id/approve
 * Approve a manual payment
 */
router.post('/:id/approve', jwtAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const adminId = req.user?.id || req.user?.adminId;

    // Get transaction details
    const transactionResult = await query(`
      SELECT pt.*, i.invoice_number, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      WHERE pt.id = $1 AND pt.status = 'pending_verification'
    `, [id]);

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found or already verified'
      });
    }

    const transaction = transactionResult.rows[0];

    // Process payment via shared service (INSERT payments, restore service, WA notif, accounting)
    const paymentService = require('../../../../services/payment-service');
    const result = await paymentService.processPaymentAfterVerification({
        transactionId: id,
        invoiceId: transaction.invoice_id,
        amount: transaction.amount,
        paymentMethod: transaction.payment_method,
        paymentDate: transaction.created_at,
        customerId: transaction.customer_id,
        customerName: transaction.customer_name,
        customerPhone: transaction.customer_phone,
        processedBy: `admin_${adminId}`,
        verifiedBy: adminId,
    });

    if (result.skipped) {
        logger.warn(`[PaymentsVerification] Payment ${id} skipped — invoice already paid`);
        return res.json({
            success: true,
            data: { transaction_id: id, status: 'cancelled', message: 'Invoice sudah dibayar sebelumnya' }
        });
    }

    // Notify Omnichat (non-blocking)
    try {
        const { notifyOmnichat } = require('../../../../services/payment-service');
        notifyOmnichat({
            transaction_id: id,
            customer_phone: transaction.customer_phone,
            status: 'approved',
        });
    } catch (e) {
        logger.warn('[PaymentsVerification] Omnichat notify failed:', e.message);
    }

    // Send Telegram notification
    const message = `
✅ *PEMBAYARAN DIVERIFIKASI*
 
*Customer:* ${transaction.customer_name}
*Invoice:* ${transaction.invoice_number}
*Jumlah:* Rp ${parseInt(transaction.amount).toLocaleString('id-ID')}
*Metode:* ${transaction.payment_method}
*Status:* LUNAS (Verified by Admin)
${notes ? `*Catatan:* ${notes}` : ''}

_Pembayaran manual telah diverifikasi._
    `;

    await telegramService.sendMessage(message);

    // Store notification
    await telegramService.storeNotification(
      'payment_verified',
      'Pembayaran Diverifikasi',
      `${transaction.customer_name} - Invoice ${transaction.invoice_number} - Rp ${parseInt(transaction.amount).toLocaleString('id-ID')}`,
      { transactionId: id, invoiceNumber: transaction.invoice_number }
    );

    logger.info(`✅ Payment ${id} approved by admin ${adminId}`);

    res.json({
      success: true,
      data: {
        transaction_id: id,
        invoice_id: transaction.invoice_id,
        invoice_number: transaction.invoice_number,
        status: 'paid',
        message: 'Pembayaran berhasil diverifikasi'
      }
    });
  } catch (error) {
    logger.error('Error approving payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve payment'
    });
  }
}));

/**
 * POST /api/v1/admin/payments-verification/:id/reject
 * Reject a manual payment
 */
router.post('/:id/reject', jwtAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user?.id || req.user?.adminId;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }

    // Get transaction details
    const transactionResult = await query(`
      SELECT pt.*, i.invoice_number, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      WHERE pt.id = $1 AND pt.status = 'pending_verification'
    `, [id]);

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found or already processed'
      });
    }

    const transaction = transactionResult.rows[0];

    // Update transaction status
    await query(`
      UPDATE payment_transactions
      SET status = 'failed',
          verified_by = $1,
          verified_at = NOW(),
          verification_notes = $2,
          updated_at = NOW()
      WHERE id = $3
    `, [adminId, reason, id]);

    // Notify Omnichat (non-blocking)
    try {
        const { notifyOmnichat } = require('../../../../services/payment-service');
        notifyOmnichat({
            transaction_id: id,
            customer_phone: transaction.customer_phone,
            status: 'rejected',
        });
    } catch (e) {
        logger.warn('[PaymentsVerification] Omnichat notify failed:', e.message);
    }

    // Send Telegram notification
    const message = `
❌ *PEMBAYARAN DITOLAK*
 
*Customer:* ${transaction.customer_name}
*Invoice:* ${transaction.invoice_number}
*Jumlah:* Rp ${parseInt(transaction.amount).toLocaleString('id-ID')}
*Metode:* ${transaction.payment_method}
*Alasan:* ${reason}

_Pembayaran manual ditolak. Silakan upload ulang bukti pembayaran._
    `;

    await telegramService.sendMessage(message);

    // Store notification
    await telegramService.storeNotification(
      'payment_rejected',
      'Pembayaran Ditolak',
      `${transaction.customer_name} - Invoice ${transaction.invoice_number} - ${reason}`,
      { transactionId: id, invoiceNumber: transaction.invoice_number, reason }
    );

    logger.info(`❌ Payment ${id} rejected by admin ${adminId}`);

    res.json({
      success: true,
      data: {
        transaction_id: id,
        invoice_id: transaction.invoice_id,
        invoice_number: transaction.invoice_number,
        status: 'failed',
        message: 'Pembayaran ditolak'
      }
    });
  } catch (error) {
    logger.error('Error rejecting payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject payment'
    });
  }
}));

/**
 * GET /api/v1/admin/payments-verification/stats
 * Get verification statistics
 */
router.get('/stats/summary', jwtAuth, asyncHandler(async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending_verification') as pending_count,
        COUNT(*) FILTER (WHERE status = 'paid' AND gateway = 'manual') as verified_count,
        COUNT(*) FILTER (WHERE status = 'failed' AND gateway = 'manual') as rejected_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending_verification'), 0) as pending_amount,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND gateway = 'manual'), 0) as verified_amount,
        COALESCE(SUM(amount) FILTER (WHERE status = 'failed' AND gateway = 'manual'), 0) as rejected_amount
      FROM payment_transactions
      WHERE gateway = 'manual'
      AND created_at >= CURRENT_DATE
    `);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error fetching verification stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
}));

module.exports = router;
