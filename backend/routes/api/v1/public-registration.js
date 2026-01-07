const express = require('express');
const router = express.Router();
const CustomerService = require('../../../services/customer-service');
const ReferralService = require('../../../services/referral-service');
const { logger } = require('../../../config/logger');

// POST /api/v1/public/register
router.post('/register', async (req, res) => {
    try {
        const data = req.body;

        // Basic Validation
        if (!data.name || !data.phone || !data.address) {
            return res.status(400).json({
                success: false,
                message: 'Nama, Nomor Telepon (WA), dan Alamat wajib diisi.'
            });
        }

        // 1. Create Customer
        // We set basic defaults for self-registration
        const customerData = {
            ...data,
            status: 'pending', // Pending activation/survey
            billing_type: 'postpaid'
        };

        // Check if package selected
        if (!data.package_id) {
            // Optional: Set default package or leave null?
            // Leaving null means valid, but they need to select later.
        }

        // Create the customer using Service
        // Note: CustomerService.createCustomer handles Identity + Service creation
        // We might need to adjust it if we want 'pending' status without full service details yet.
        // But createCustomer is robust.

        const result = await CustomerService.createCustomer(customerData);
        const newCustomer = result.customer;

        // 2. Handle Referral if Code provided
        if (data.referral_code && newCustomer && newCustomer.id) {
            try {
                // Validate first
                const validation = await ReferralService.validateReferralCode(data.referral_code, newCustomer.id);

                if (validation.valid) {
                    // Apply Referral
                    await ReferralService.applyReferral(
                        data.referral_code,
                        newCustomer.id,
                        'discount' // New customers get discount usually
                    );

                    logger.info(`Referral applied for new customer ${newCustomer.id} using code ${data.referral_code}`);
                }
            } catch (refError) {
                logger.error(`Referral application failed during registration: ${refError.message}`);
                // Don't fail the registration, just log valid error
            }
        }

        // 3. Send Notification to Admin (Telegram & Dashboard)
        try {
            const TelegramService = require('../../../services/telegram-service');
            await TelegramService.sendNewRegistrationNotification(newCustomer);
        } catch (notifError) {
            logger.error(`Failed to send new registration notification: ${notifError.message}`);
            // Non-blocking error
        }

        res.status(201).json({
            success: true,
            message: 'Registrasi berhasil! Tim kami akan segera menghubungi Anda.',
            data: {
                customerId: newCustomer.id,
                name: newCustomer.name
            }
        });

    } catch (error) {
        logger.error('Public registration error:', error);

        // Handle specific service errors (e.g. duplicates)
        if (error.code === 'RESOURCE_CONFLICT') {
            return res.status(409).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat registrasi. Silakan coba lagi.'
        });
    }
});

module.exports = router;
