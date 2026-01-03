/**
 * Payment Upload Routes
 * Handles upload of payment proof for manual bank transfers
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const { customerJwtAuth } = require('../../../middleware/customerJwtAuth');
const { asyncHandler } = require('../../../middleware/response');
const telegramService = require('../../../services/telegram-service');

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../../../public/uploads/payment-proofs');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `proof-${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Accept only images
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP)'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Helper function to get customer ID from JWT token
const getCustomerIdFromToken = (req) => {
    return req.user?.customerId || req.user?.id;
};

/**
 * POST /api/v1/payment-upload/:transactionId
 * Upload payment proof for a transaction
 */
router.post('/:transactionId', customerJwtAuth, upload.single('proof'), asyncHandler(async (req, res) => {
    try {
        const { transactionId } = req.params;
        const customerId = getCustomerIdFromToken(req);

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        logger.info(`📤 Payment proof uploaded for transaction ${transactionId}`);

        // Verify transaction belongs to customer
        const transactionResult = await query(`
            SELECT pt.*, i.invoice_number, i.customer_id, c.name as customer_name, c.phone as customer_phone
            FROM payment_transactions pt
            JOIN invoices i ON pt.invoice_id = i.id
            JOIN customers c ON i.customer_id = c.id
            WHERE pt.id = $1 AND i.customer_id = $2
        `, [transactionId, customerId]);

        if (transactionResult.rows.length === 0) {
            // Delete uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(404).json({
                success: false,
                error: 'Transaction not found or not authorized'
            });
        }

        const transaction = transactionResult.rows[0];

        // Check if transaction is for manual payment
        if (transaction.gateway !== 'manual') {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Proof upload is only for manual bank transfer payments'
            });
        }

        // Store proof path in database
        const proofPath = `/uploads/payment-proofs/${req.file.filename}`;

        await query(`
            UPDATE payment_transactions 
            SET proof_of_payment = $1, 
                status = 'pending_verification',
                updated_at = NOW()
            WHERE id = $2
        `, [proofPath, transactionId]);

        // Send Telegram notification
        const notificationResult = await telegramService.sendPaymentProofNotification({
            customerName: transaction.customer_name,
            invoiceNumber: transaction.invoice_number,
            amount: transaction.amount,
            proofUrl: req.file.path
        });

        // Store notification in database
        await telegramService.storeNotification(
            'payment_proof',
            'Bukti Pembayaran Baru',
            `${transaction.customer_name} mengunggah bukti pembayaran untuk invoice ${transaction.invoice_number}`,
            { transactionId, invoiceNumber: transaction.invoice_number, proofPath }
        );

        logger.info(`✅ Payment proof saved for transaction ${transactionId}`);

        res.json({
            success: true,
            data: {
                transaction_id: transactionId,
                proof_path: proofPath,
                status: 'pending_verification',
                message: 'Bukti pembayaran berhasil diunggah. Admin akan memverifikasi pembayaran Anda.',
                telegram_sent: notificationResult.success
            }
        });

    } catch (error) {
        logger.error('Error uploading payment proof:', error);

        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to upload payment proof'
        });
    }
}));

/**
 * POST /api/v1/payment-upload/invoice/:invoiceId
 * Upload payment proof directly for an invoice (creates transaction if needed)
 */
router.post('/invoice/:invoiceId', customerJwtAuth, upload.single('proof'), asyncHandler(async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const customerId = getCustomerIdFromToken(req);

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        logger.info(`📤 Payment proof uploaded for invoice ${invoiceId}`);

        // Verify invoice belongs to customer
        const invoiceResult = await query(`
            SELECT i.*, c.name as customer_name, c.phone as customer_phone
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            WHERE i.id = $1 AND i.customer_id = $2 AND i.status IN ('unpaid', 'overdue')
        `, [invoiceId, customerId]);

        if (invoiceResult.rows.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({
                success: false,
                error: 'Invoice not found or already paid'
            });
        }

        const invoice = invoiceResult.rows[0];
        const proofPath = `/uploads/payment-proofs/${req.file.filename}`;

        // Check if there's an existing manual transaction
        let transactionResult = await query(`
            SELECT * FROM payment_transactions
            WHERE invoice_id = $1 AND gateway = 'manual' AND status IN ('pending', 'pending_verification')
            ORDER BY created_at DESC LIMIT 1
        `, [invoiceId]);

        let transactionId;

        if (transactionResult.rows.length > 0) {
            // Update existing transaction
            transactionId = transactionResult.rows[0].id;
            await query(`
                UPDATE payment_transactions 
                SET proof_of_payment = $1, 
                    status = 'pending_verification',
                    updated_at = NOW()
                WHERE id = $2
            `, [proofPath, transactionId]);
        } else {
            // Create new transaction
            const insertResult = await query(`
                INSERT INTO payment_transactions (
                    invoice_id, gateway, gateway_transaction_id, 
                    payment_method, payment_type, amount, fee_amount, net_amount,
                    status, proof_of_payment, created_at
                ) VALUES (
                    $1, 'manual', $2, 
                    'BANK_TRANSFER', 'invoice', $3, 0, $3,
                    'pending_verification', $4, NOW()
                ) RETURNING id
            `, [invoiceId, `MANUAL-${Date.now()}`, invoice.total_amount || invoice.amount, proofPath]);

            transactionId = insertResult.rows[0].id;
        }

        // Send Telegram notification
        const notificationResult = await telegramService.sendPaymentProofNotification({
            customerName: invoice.customer_name,
            invoiceNumber: invoice.invoice_number,
            amount: invoice.total_amount || invoice.amount,
            proofUrl: req.file.path
        });

        // Store notification in database
        await telegramService.storeNotification(
            'payment_proof',
            'Bukti Pembayaran Baru',
            `${invoice.customer_name} mengunggah bukti pembayaran untuk invoice ${invoice.invoice_number}`,
            { transactionId, invoiceNumber: invoice.invoice_number, proofPath }
        );

        logger.info(`✅ Payment proof saved for invoice ${invoice.invoice_number}`);

        res.json({
            success: true,
            data: {
                transaction_id: transactionId,
                invoice_id: invoiceId,
                invoice_number: invoice.invoice_number,
                proof_path: proofPath,
                status: 'pending_verification',
                message: 'Bukti pembayaran berhasil diunggah. Admin akan memverifikasi pembayaran Anda.',
                telegram_sent: notificationResult.success
            }
        });

    } catch (error) {
        logger.error('Error uploading payment proof:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to upload payment proof'
        });
    }
}));

/**
 * GET /api/v1/payment-upload/status/:transactionId
 * Get payment verification status
 */
router.get('/status/:transactionId', customerJwtAuth, asyncHandler(async (req, res) => {
    try {
        const { transactionId } = req.params;
        const customerId = getCustomerIdFromToken(req);

        const result = await query(`
            SELECT pt.*, i.invoice_number
            FROM payment_transactions pt
            JOIN invoices i ON pt.invoice_id = i.id
            WHERE pt.id = $1 AND i.customer_id = $2
        `, [transactionId, customerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        const transaction = result.rows[0];

        res.json({
            success: true,
            data: {
                transaction_id: transaction.id,
                invoice_number: transaction.invoice_number,
                status: transaction.status,
                proof_uploaded: !!transaction.proof_of_payment,
                verified_at: transaction.verified_at,
                verification_notes: transaction.verification_notes
            }
        });

    } catch (error) {
        logger.error('Error fetching payment status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment status'
        });
    }
}));

module.exports = router;
