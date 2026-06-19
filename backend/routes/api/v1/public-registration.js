const express = require('express');
const router = express.Router();
const CustomerService = require('../../../services/customer-service');
const ReferralService = require('../../../services/referral-service');
const { logger } = require('../../../config/logger');
const { query, getOne } = require('../../../config/database');

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

        if (!data.name || !data.phone || !data.address) {
            return res.status(400).json({
                success: false,
                message: 'Nama, Nomor Telepon (WA), dan Alamat wajib diisi.'
            });
        }

        // 1. Create Identity (no service yet — status waiting)
        const customer = await CustomerService.createIdentity({
            name: data.name,
            phone: data.phone,
            email: data.email,
            address: data.address
        });

        // 2. Save selected package
        if (data.package_id) {
            await query('UPDATE customers SET selected_package_id = $1 WHERE id = $2', [data.package_id, customer.id]);
        }

        // 3. Save coordinates if provided
        if (data.latitude && data.longitude) {
            const lat = parseFloat(data.latitude);
            const lng = parseFloat(data.longitude);
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                await query(
                    'UPDATE customers SET latitude = $1, longitude = $2 WHERE id = $3',
                    [lat, lng, customer.id]
                );
            } else {
                logger.warn(`Invalid coordinates for customer ${customer.id}: ${data.latitude}, ${data.longitude}`);
            }
        }

        // 3. Handle Referral if code provided
        if (data.referral_code && customer && customer.id) {
            try {
                const validation = await ReferralService.validateReferralCode(data.referral_code, customer.id);
                if (validation.valid) {
                    await ReferralService.applyReferral(data.referral_code, customer.id, 'discount');
                    logger.info(`Referral applied for new customer ${customer.id} using code ${data.referral_code}`);
                }
            } catch (refError) {
                logger.error(`Referral application failed during registration: ${refError.message}`);
            }
        }

        // 4. Send Notification to Admin (Telegram & Dashboard)
        try {
            const TelegramService = require('../../../services/telegram-service');
            await TelegramService.sendNewRegistrationNotification(customer);
        } catch (notifError) {
            logger.error(`Failed to send new registration notification: ${notifError.message}`);
        }

        // 5. Send WhatsApp notification to customer
        try {
            const whatsappNotifications = require('../../../config/whatsapp-notifications');
            const packageData = data.package_id ? await getPackageData(data.package_id) : null;
            await whatsappNotifications.sendRegistrationSubmittedNotification(
                customer.phone,
                {
                    customer_name: customer.name,
                    package_name: packageData?.name || 'Paket dipilih',
                    registration_date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                }
            );
        } catch (notifError) {
            logger.error(`Failed to send WhatsApp registration notification: ${notifError.message}`);
        }

        // 6. Send admin notification about new registration
        try {
            const whatsappNotifications = require('../../../config/whatsapp-notifications');
            const packageData = data.package_id ? await getPackageData(data.package_id) : null;
            await whatsappNotifications.notifyAdminsNewRegistration({
                customerName: customer.name,
                customerPhone: customer.phone,
                customerEmail: customer.email,
                address: customer.address || data.address,
                packageName: packageData?.name || null,
                registrationDate: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
            });
            logger.info(`Admins notified about new registration from ${customer.name}`);
        } catch (notifError) {
            logger.error(`Failed to send admin notification for registration:`, notifError.message);
        }

        res.status(201).json({
            success: true,
            message: 'Registrasi berhasil! Tim kami akan segera menghubungi Anda.',
            data: {
                customerId: customer.id,
                name: customer.name
            }
        });

    } catch (error) {
        logger.error('Public registration error:', error);

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
