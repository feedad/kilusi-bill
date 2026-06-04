const express = require('express');
const router = express.Router();
const CustomerService = require('../../../services/customer-service');
const ReferralService = require('../../../services/referral-service');
const { logger } = require('../../../config/logger');
const { query, getOne } = require('../../../config/database');

// Helper function to get package data
async function getPackageData(packageId) {
    if (!packageId) return null;
    try {
        const result = await getOne(`
            SELECT id, name, price, speed
            FROM packages
            WHERE id = $1
        `, [packageId]);
        return result;
    } catch (error) {
        logger.error(`Error fetching package data: ${error.message}`);
        return null;
    }
}

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
            status: 'waiting', // Waiting for admin review before installation
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

        // 4. Send WhatsApp notification to customer
        try {
            const whatsappNotifications = require('../../../config/whatsapp-notifications');
            const packageData = data.package_id ? await getPackageData(data.package_id) : null;

            // Send registration submitted notification
            await whatsappNotifications.sendRegistrationSubmittedNotification(
                newCustomer.phone,
                {
                    customer_name: newCustomer.name,
                    package_name: packageData?.name || 'Paket dipilih',
                    registration_date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                }
            );
        } catch (notifError) {
            logger.error(`Failed to send WhatsApp registration notification: ${notifError.message}`);
            // Non-blocking error
        }

        // 5. Send notification to admins about new registration
        try {
            const whatsappNotifications = require('../../../config/whatsapp-notifications');
            await whatsappNotifications.notifyAdminsNewRegistration({
                customerName: newCustomer.name,
                customerPhone: newCustomer.phone,
                customerEmail: newCustomer.email,
                address: newCustomer.address || newCustomer.installation_address,
                packageName: packageData?.name || null,
                registrationDate: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
            });
            logger.info(`📱 Admins notified about new registration from ${newCustomer.name}`);
        } catch (notifError) {
            logger.error(`Failed to send admin notification for registration:`, notifError.message);
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
