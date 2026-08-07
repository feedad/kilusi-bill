const { logger } = require('../config/logger');
const { query, getOne } = require('../config/database');
const { getSetting } = require('../config/settingsManager');
const BillingCycleService = require('../config/billing-cycle-service');
const { createAccountingTransaction } = require('../config/accounting');

async function processPaymentAfterVerification({
    transactionId,
    invoiceId,
    amount,
    paymentMethod,
    paymentDate,
    customerId,
    customerName,
    customerPhone,
    processedBy,
    verifiedBy,
}) {
    const methodLabel = paymentMethod || 'Transfer';

    // Safety net: skip if invoice already paid (prevents double payment from race conditions)
    const invCheck = await getOne('SELECT status FROM invoices WHERE id = $1', [invoiceId]);
    if (invCheck && invCheck.status === 'paid') {
        await query(`
            UPDATE payment_transactions SET status = 'cancelled',
                verification_notes = 'Invoice already paid by another transaction',
                updated_at = NOW()
            WHERE id = $1
        `, [transactionId]);
        logger.warn(`[PaymentService] Invoice ${invoiceId} already paid — cancelled tx #${transactionId}`);
        return { skipped: true, message: 'Invoice already paid' };
    }

    // 1. INSERT INTO payments → trigger akan update invoices + services otomatis
    const payResult = await query(`
        INSERT INTO payments (invoice_id, amount, payment_method, payment_date, notes, processed_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
    `, [
        invoiceId,
        parseFloat(amount),
        methodLabel,
        paymentDate,
        `Verified from ${processedBy} (transaction #${transactionId})`,
        processedBy
    ]);
    const paymentId = payResult.rows[0].id;

    // 2. Update invoice paid_at explicitly (trigger handle status, not paid_at)
    await query(
        'UPDATE invoices SET paid_at = NOW(), updated_at = NOW() WHERE id = $1',
        [invoiceId]
    );

    // 3. Notify autopay (non-blocking)
    try {
        const autopayService = require('./autopay-service');
        const invData = await getOne('SELECT invoice_number, amount FROM invoices WHERE id = $1', [invoiceId]);
        if (invData) {
            autopayService.notifyAutopayInvoicePaid({
                invoice_number: invData.invoice_number,
                amount: invData.amount,
                customer_name: customerName || '',
            }).catch(e => logger.warn('[PaymentService] Autopay notify failed:', e.message));
        }
    } catch (e) {
        logger.warn('[PaymentService] Autopay notify error:', e.message);
    }

    // 4. Update service dates after payment
    let updatedDates = null;
    try {
        updatedDates = await BillingCycleService.updateServiceDatesAfterPayment(invoiceId, paymentDate);
    } catch (e) {
        logger.warn('[PaymentService] updateServiceDatesAfterPayment failed:', e.message);
    }

    // 5. Check unpaid invoices & restore service if all paid
    let serviceRestored = false;
    try {
        // Get service_number from the paid invoice
        const invService = await getOne('SELECT service_number FROM invoices WHERE id = $1', [invoiceId]);
        const serviceNumber = invService ? invService.service_number : null;

        if (!serviceNumber) {
            logger.warn(`[PaymentService] No service_number found for invoice ${invoiceId}`);
            return { skipped: true, message: 'No service_number on invoice' };
        }

        const unpaidCheck = await query(`
            SELECT COUNT(*) as cnt FROM invoices
            WHERE service_number = $1 AND status IN ('unpaid', 'suspended')
        `, [serviceNumber]);

        const unpaidCount = parseInt(unpaidCheck.rows[0].cnt);

        if (unpaidCount === 0) {
            const serviceDataQuery = await query(`
                SELECT
                    s.id as service_id,
                    s.service_number,
                    s.status as service_status,
                    s.package_id,
                    c.id as customer_id,
                    c.name as customer_name,
                    p.group as package_group,
                    p.pppoe_profile
                FROM services s
                JOIN customers c ON c.id = s.customer_id
                LEFT JOIN packages p ON p.id = s.package_id
                WHERE s.service_number = $1
            `, [serviceNumber]);

            if (serviceDataQuery.rows.length > 0) {
                const serviceData = serviceDataQuery.rows[0];

                let needRestore = false;

                if (serviceData.service_status !== 'active') {
                    needRestore = true;
                } else {
                    // Status active — check radusergroup consistency
                    // (handles case where status=active but radgroup is still ISOLIR)
                    const serviceSuspension = require('../config/serviceSuspension');
                    const radiusUsername = await serviceSuspension.findRadiusUsername(
                        serviceData.service_id,
                        serviceData.service_number
                    );

                    if (radiusUsername) {
                        const radGroup = await getOne(`
                            SELECT groupname FROM radusergroup
                            WHERE username = $1
                            LIMIT 1
                        `, [radiusUsername]);

                        if (radGroup && radGroup.groupname === serviceData.package_group) {
                            logger.info(`[PaymentService] Service active with correct RADIUS group for customer ${customerId}`);
                            serviceRestored = true;
                        } else {
                            logger.warn(`[PaymentService] Service active but RADIUS group (${radGroup?.groupname || 'NONE'}) != expected (${serviceData.package_group}) — restoring`);
                            needRestore = true;
                        }
                    } else {
                        // No RADIUS user — non-PPPoE service, assume active
                        logger.info(`[PaymentService] No RADIUS user found for ${serviceData.service_number}, assuming active`);
                        serviceRestored = true;
                    }
                }

                if (needRestore) {
                    const serviceSuspension = require('../config/serviceSuspension');
                    await serviceSuspension.restoreServiceByServiceId(
                        serviceData.service_id,
                        {
                            name: serviceData.customer_name,
                            service_number: serviceData.service_number,
                            package_group: serviceData.package_group,
                            pppoe_profile: serviceData.pppoe_profile
                        },
                        'Payment received - full restoration'
                    );
                    serviceRestored = true;
                    logger.info(`[PaymentService] Service ${serviceData.service_id} restored for customer ${customerId}`);
                }
            } else {
                logger.warn(`[PaymentService] No service found for customer ${customerId}`);
            }
        } else {
            logger.info(`[PaymentService] Customer ${customerId} still has ${unpaidCount} unpaid invoice(s)`);
        }
    } catch (e) {
        logger.error('[PaymentService] Service restore failed:', e);
    }

    // 6. WhatsApp notification to customer
    try {
        const _isoDate = updatedDates?.newIsolirDate ? new Date(updatedDates.newIsolirDate).toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" }) : undefined;
        const whatsappNotifications = require('../config/whatsapp-notifications');
        await whatsappNotifications.sendPaymentReceivedNotification(paymentId, {
            dueDate: _isoDate,
        });
        logger.info(`[PaymentService] WA notification sent for payment ${paymentId}`);
    } catch (e) {
        logger.warn('[PaymentService] WA notification failed:', e.message);
    }

    // 7. Accounting transaction
    try {
        await createAccountingTransaction(
            'revenue',
            parseFloat(amount),
            `Pembayaran tagihan #${invoiceId} dari ${customerName || 'Unknown'} (${methodLabel})`,
            'payment',
            paymentId
        );
        logger.info(`[PaymentService] Accounting entry created for payment ${paymentId}`);
    } catch (e) {
        logger.warn('[PaymentService] Accounting failed:', e.message);
    }

    // 8. Update payment_transactions status
    await query(`
        UPDATE payment_transactions
        SET status = 'paid',
            verified_by = $1,
            verified_at = NOW(),
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
    `, [verifiedBy || null, transactionId]);

    logger.info(`[PaymentService] Payment #${transactionId} processed — invoice #${invoiceId}, payment #${paymentId}`);

    return {
        paymentId,
        serviceRestored,
        updatedDates,
    };
}

/**
 * notifyOmnichat — POST status update to Omnichat webhook
 * @param {Object} params
 * @param {number|string} params.transaction_id
 * @param {string} params.customer_phone
 * @param {'approved'|'rejected'|'cancelled'} params.status
 */
async function notifyOmnichat({ transaction_id, customer_phone, status }) {
    try {
        const axios = require('axios');
        const envKey = process.env.KILUSI_OMNICHAT_API_KEY;
        const apiKey = getSetting('chatbot_api_key', envKey && envKey.length > 10 ? envKey : undefined);
        const apiUrl = getSetting('kilusi_omnichat_api_url', 'https://whatsapp.kilusi.id/api');
        const webhookUrl = `${apiUrl.replace(/\/+$/, '')}/webhook/billing/payment-status`;

        if (!apiKey) {
            logger.warn(`[OmnichatWebhook] ${status} #${transaction_id} skipped: chatbot API key not configured`);
            return;
        }

        await axios.post(webhookUrl, {
            transaction_id: String(transaction_id),
            customer_phone: customer_phone || '',
            status,
        }, {
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        });

        logger.info(`[OmnichatWebhook] ${status} #${transaction_id} sent`);
    } catch (e) {
        if (e.response) {
            logger.warn(`[OmnichatWebhook] ${status} #${transaction_id} failed: HTTP ${e.response.status} ${JSON.stringify(e.response.data)}`);
        } else if (e.code) {
            logger.warn(`[OmnichatWebhook] ${status} #${transaction_id} failed: ${e.code} — ${e.message}`);
        } else {
            logger.warn(`[OmnichatWebhook] ${status} #${transaction_id} failed: ${e.message}`);
        }
    }
}

module.exports = { processPaymentAfterVerification, notifyOmnichat };
