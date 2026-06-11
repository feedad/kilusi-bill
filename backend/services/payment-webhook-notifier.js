/**
 * Payment Webhook Notifier
 * Listens for pg_notify('payment_cancelled') and calls Omnichat webhook.
 */
const { logger } = require('../config/logger');

let client = null;

/**
 * Start LISTENING for payment_cancelled notifications.
 * @param {import('pg').Pool} pool - The application's PostgreSQL pool
 */
function start(pool) {
    if (client) {
        logger.warn('[PaymentWebhookNotifier] Already running');
        return;
    }

    pool.connect((err, pgClient, release) => {
        if (err) {
            logger.error('[PaymentWebhookNotifier] Failed to connect:', err.message);
            return;
        }

        client = pgClient;
        logger.info('[PaymentWebhookNotifier] Connected, listening for payment_cancelled...');

        client.query('LISTEN payment_cancelled');

        client.on('notification', async (msg) => {
            try {
                const payload = JSON.parse(msg.payload);
                const { transaction_id, customer_phone } = payload;

                logger.info(`[PaymentWebhookNotifier] Received payment_cancelled: #${transaction_id}`);

                const { notifyOmnichat } = require('./payment-service');
                await notifyOmnichat({
                    transaction_id,
                    customer_phone,
                    status: 'cancelled',
                });
            } catch (e) {
                logger.error('[PaymentWebhookNotifier] Error processing notification:', e.message);
            }
        });

        client.on('error', (err) => {
            logger.error('[PaymentWebhookNotifier] Client error:', err.message);
            client = null;
            // Auto-reconnect after 10s
            setTimeout(() => {
                logger.info('[PaymentWebhookNotifier] Reconnecting...');
                start(pool);
            }, 10000);
        });

        client.on('end', () => {
            logger.warn('[PaymentWebhookNotifier] Client disconnected');
            client = null;
        });

        // Release is not called because we keep the connection for LISTEN
        // The release function is available if we need to clean up
    });
}

/**
 * Stop the LISTEN connection gracefully.
 */
function stop() {
    if (client) {
        try {
            client.query('UNLISTEN payment_cancelled');
            client.release();
        } catch (e) {
            logger.warn('[PaymentWebhookNotifier] Error stopping:', e.message);
        }
        client = null;
        logger.info('[PaymentWebhookNotifier] Stopped');
    }
}

module.exports = { start, stop };
