/**
 * Billing Token Integration Service
 * Integrates customer token system with billing data
 */

const CustomerTokenService = require('./customer-token-service');
const { Customer } = require('../models');
const billing = require('../config/billing');

class BillingTokenIntegration {
    /**
     * Get billing data with portal token for customer
     * @param {string} customerPhone - Customer phone number
     * @returns {Object} Billing data with token information
     */
    static async getBillingDataWithToken(customerPhone) {
        try {
            // Get existing billing data
            const billingData = billing.getBillingDataForCustomer(customerPhone);

            if (!billingData || !billingData.customer) {
                return billingData;
            }

            // Find customer in database
            let customer = null;
            try {
                customer = await Customer.findOne({
                    where: {
                        phone: customerPhone
                    }
                });
            } catch (error) {
                console.warn('Customer not found in database:', error.message);
            }

            let portalToken = null;
            let tokenExpiresAt = null;
            let portalLoginUrl = null;

            if (customer) {
                // Check if customer has existing token
                if (customer.portal_access_token && customer.token_expires_at && customer.token_expires_at > new Date()) {
                    portalToken = customer.portal_access_token;
                    tokenExpiresAt = customer.token_expires_at;
                } else {
                    // Generate new token if needed
                    try {
                        const tokenData = await CustomerTokenService.generateCustomerToken(customer.id);
                        portalToken = tokenData.token;
                        tokenExpiresAt = tokenData.expiresAt;
                    } catch (error) {
                        console.error('Error generating token for customer:', error);
                    }
                }

                // Generate login URL
                if (portalToken) {
                    const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';
                    portalLoginUrl = `${baseUrl}/customer/login/${portalToken}`;
                }
            }

            // Enhance customer data with token info
            billingData.customer.portal_login_url = portalLoginUrl;
            billingData.customer.portal_token = portalToken;
            billingData.customer.token_expires_at = tokenExpiresAt;
            billingData.customer.has_portal_access = !!portalToken;

            return billingData;

        } catch (error) {
            console.error('Error getting billing data with token:', error);
            throw error;
        }
    }

    /**
     * Generate token for customer by phone number
     * @param {string} customerPhone - Customer phone number
     * @param {string} expiresIn - Token expiration period
     * @returns {Object} Token data
     */
    static async generateTokenForCustomerByPhone(customerPhone, expiresIn = '30d') {
        try {
            // Find customer by phone
            const customer = await Customer.findOne({
                where: {
                    phone: customerPhone
                }
            });

            if (!customer) {
                throw new Error('Customer tidak ditemukan');
            }

            // Generate token
            const tokenData = await CustomerTokenService.generateCustomerToken(customer.id, expiresIn);

            return {
                success: true,
                ...tokenData,
                customer: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    status: customer.status
                }
            };

        } catch (error) {
            console.error('Error generating token for customer by phone:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send billing notification with portal link
     * @param {Object} invoiceData - Invoice data
     * @param {Object} options - Notification options
     */
    static async sendBillingNotificationWithPortal(invoiceData, options = {}) {
        try {
            const billingData = await this.getBillingDataWithToken(invoiceData.customer_phone);

            if (!billingData.customer.portal_login_url) {
                console.warn('No portal access available for customer:', invoiceData.customer_phone);
                return { success: false, message: 'Portal access not available' };
            }

            // Import WhatsApp service
            const { sendMessage } = require('../config/sendMessage');

            const message = this.buildBillingNotificationMessage(billingData, invoiceData, options);

            const waJid = invoiceData.customer_phone.replace(/^0/, '62') + '@s.whatsapp.net';

            await sendMessage(waJid, message);

            return {
                success: true,
                message: 'Notification sent successfully',
                portalUrl: billingData.customer.portal_login_url
            };

        } catch (error) {
            console.error('Error sending billing notification with portal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Build billing notification message with portal link
     * @param {Object} billingData - Customer billing data
     * @param {Object} invoiceData - Invoice data
     * @param {Object} options - Additional options
     * @returns {string} Formatted message
     */
    static buildBillingNotificationMessage(billingData, invoiceData, options = {}) {
        const customer = billingData.customer;
        const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';

        let message = `📋 *INFO TAGIHAN BULAN INI*\n\n`;

        if (customer.name) {
            message += `Yth. Bapak/Ibu *${customer.name}*,\n\n`;
        }

        message += `📄 *Detail Tagihan:*\n`;
        message += `• No. Invoice: ${invoiceData.invoice_number}\n`;
        message += `• Jumlah: Rp ${parseFloat(invoiceData.amount).toLocaleString('id-ID')}\n`;
        message += `• Jatuh Tempo: ${new Date(invoiceData.due_date).toLocaleDateString('id-ID')}\n\n`;

        message += `🔗 *Akses Portal Pelanggan:*\n`;
        message += `${customer.portal_login_url}\n\n`;

        message += `*Fitur Portal:*\n`;
        message += `✅ Lihat detail tagihan\n`;
        message += `✅ Cek histori pembayaran\n`;
        message += `✅ Kelola WiFi (ubah nama/password)\n`;
        message += `✅ Restart perangkat\n`;
        message += `✅ Laporan gangguan\n\n`;

        if (customer.token_expires_at) {
            message += `💡 *Catatan:* Link berlaku sampai ${new Date(customer.token_expires_at).toLocaleDateString('id-ID')}\n`;
        }
        message += `Simpan link ini untuk akses mudah ke dashboard.`;

        if (options.includePaymentInfo) {
            message += `\n\n💳 *Info Pembayaran:*\n`;
            message += `Hubungi admin untuk metode pembayaran yang tersedia.`;
        }

        return message;
    }

    /**
     * Generate portal access for all customers with billing data
     * @returns {Object} Results with statistics
     */
    static async generatePortalAccessForAllCustomers() {
        try {
            // Get all customers from billing
            const allCustomers = billing.getAllCustomers();

            if (!Array.isArray(allCustomers)) {
                throw new Error('Invalid customer data format');
            }

            let successCount = 0;
            let errorCount = 0;
            const results = [];

            for (const billingCustomer of allCustomers) {
                try {
                    // Find customer in database
                    const dbCustomer = await Customer.findOne({
                        where: { phone: billingCustomer.phone }
                    });

                    if (dbCustomer) {
                        // Check if token exists and is valid
                        if (!dbCustomer.portal_access_token || dbCustomer.token_expires_at < new Date()) {
                            // Generate new token
                            const tokenData = await CustomerTokenService.generateCustomerToken(dbCustomer.id);

                            results.push({
                                customerId: dbCustomer.id,
                                customerName: billingCustomer.name || dbCustomer.name,
                                phone: billingCustomer.phone,
                                tokenGenerated: true,
                                loginUrl: tokenData.loginUrl
                            });

                            successCount++;
                        } else {
                            results.push({
                                customerId: dbCustomer.id,
                                customerName: billingCustomer.name || dbCustomer.name,
                                phone: billingCustomer.phone,
                                tokenGenerated: false,
                                existingToken: dbCustomer.portal_access_token,
                                loginUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/customer/login/${dbCustomer.portal_access_token}`
                            });
                        }
                    } else {
                        results.push({
                            customerName: billingCustomer.name,
                            phone: billingCustomer.phone,
                            error: 'Customer not found in database'
                        });
                        errorCount++;
                    }
                } catch (error) {
                    console.error(`Error processing customer ${billingCustomer.phone}:`, error);
                    results.push({
                        customerName: billingCustomer.name,
                        phone: billingCustomer.phone,
                        error: error.message
                    });
                    errorCount++;
                }
            }

            return {
                success: true,
                totalCustomers: allCustomers.length,
                successCount,
                errorCount,
                results
            };

        } catch (error) {
            console.error('Error generating portal access for all customers:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get customer dashboard data with announcements
     * @param {string} customerPhone - Customer phone number
     * @returns {Object} Dashboard data with announcements
     */
    static async getCustomerDashboardWithAnnouncements(customerPhone) {
        try {
            // Get billing data with token
            const billingData = await this.getBillingDataWithToken(customerPhone);

            // Get announcements
            const announcements = await this.getRelevantAnnouncements(customerPhone);

            return {
                billingData,
                announcements,
                hasUnreadAnnouncements: announcements.some(ann => !ann.is_read)
            };

        } catch (error) {
            console.error('Error getting customer dashboard with announcements:', error);
            throw error;
        }
    }

    /**
     * Get relevant announcements for customer
     * @param {string} customerPhone - Customer phone number
     * @returns {Array} List of relevant announcements
     */
    static async getRelevantAnnouncements(customerPhone) {
        try {
            const { Announcement, CustomerAnnouncementRead } = require('../models');

            const announcements = await Announcement.findAll({
                where: {
                    is_active: true,
                    start_date: { [require('sequelize').Op.lte]: new Date() },
                    [require('sequelize').Op.or]: [
                        { end_date: { [require('sequelize').Op.is]: null } },
                        { end_date: { [require('sequelize').Op.gte]: new Date() } }
                    ]
                },
                include: [
                    {
                        model: CustomerAnnouncementRead,
                        where: { customer_phone: customerPhone },
                        required: false
                    }
                ],
                order: [
                    ['priority', 'DESC'],
                    ['created_at', 'DESC']
                ],
                limit: 10
            });

            // Filter announcements based on targeting
            const customer = await Customer.findOne({ where: { phone: customerPhone } });

            return announcements.filter(announcement => {
                const target = announcement.target_type;

                if (target === 'all') return true;
                if (target === 'active' && customer && customer.status === 'active') return true;
                if (target === 'overdue' && customer && customer.payment_status === 'overdue') return true;
                if (target === 'suspended' && customer && customer.status === 'suspended') return true;
                if (target === 'specific') {
                    return announcement.target_customers &&
                           announcement.target_customers.includes(customer ? customer.id : 0);
                }

                return false;
            }).map(announcement => ({
                ...announcement.toJSON(),
                is_read: announcement.CustomerAnnouncementReads && announcement.CustomerAnnouncementReads.length > 0
            }));

        } catch (error) {
            console.error('Error getting relevant announcements:', error);
            return [];
        }
    }
}

module.exports = BillingTokenIntegration;