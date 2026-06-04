/**
 * Omnichat Contact Sync Service
 *
 * Service for synchronizing billing customers to Omnichat WhatsApp contacts
 * Enables customer service to easily respond to customer messages
 *
 * @module services/omnichat-contact-sync
 */

const { query } = require('../config/database');
const { logger } = require('../config/logger');
const { getSetting, updateSetting } = require('../config/settingsManager');
const kilusiOmnichat = require('../config/kilusi-whatsapp');

/**
 * Omnichat Contact Sync Service
 */
class OmnichatContactSyncService {
    constructor() {
        this.syncInProgress = false;
        this.lastSyncTime = null;
        this.syncInterval = null;
    }

    /**
     * Get all customers ready for sync
     * @returns {Promise<Array>} Array of customers with contact data
     */
    async getCustomersForSync(customerIds = null) {
        try {
            let queryText = '';
            let params = [];

            if (customerIds && Array.isArray(customerIds) && customerIds.length > 0) {
                // Sync specific customers
                const placeholders = customerIds.map((_, idx) => `$${idx + 1}`).join(',');
                queryText = `
                    SELECT
                        c.id,
                        c.name,
                        c.phone,
                        c.email,
                        c.status,
                        c.package_id,
                        p.name as package_name,
                        m.name as mitra_name
                    FROM customers_view c
                    LEFT JOIN packages p ON c.package_id = p.id
                    LEFT JOIN regions r ON c.region_id = r.id
                    LEFT JOIN mitra m ON m.id = r.mitra_id
                    WHERE c.id IN (${placeholders})
                    AND c.phone IS NOT NULL
                    AND c.phone != ''
                    ORDER BY c.name
                `;
                params = customerIds;
            } else {
                // Sync all active/suspended customers
                queryText = `
                    SELECT
                        c.id,
                        c.name,
                        c.phone,
                        c.email,
                        c.status,
                        c.package_id,
                        p.name as package_name,
                        m.name as mitra_name
                    FROM customers_view c
                    LEFT JOIN packages p ON c.package_id = p.id
                    LEFT JOIN regions r ON c.region_id = r.id
                    LEFT JOIN mitra m ON m.id = r.mitra_id
                    WHERE c.status IN ('active', 'suspended')
                    AND c.phone IS NOT NULL
                    AND c.phone != ''
                    ORDER BY c.name
                `;
            }

            const result = await query(queryText, params);
            return result.rows;
        } catch (error) {
            logger.error('[ContactSync] Error fetching customers:', error);
            throw error;
        }
    }

    /**
     * Format customer data for Omnichat contact sync
     * @param {object} customer - Customer data from database
     * @param {boolean} includeTags - Whether to include tags
     * @returns {object} Formatted contact object
     */
    formatCustomerForSync(customer, includeTags = true) {
        const tags = [];

        if (includeTags) {
            // Status tag (active, suspended, etc)
            if (customer.status) {
                tags.push(customer.status);
            }

            // Package tag (BRONZE, LITE, SILVER, GOLD, etc)
            if (customer.package_name) {
                tags.push(customer.package_name);
            }

            // Mitra tag (partner name)
            if (customer.mitra_name) {
                tags.push(customer.mitra_name);
            }
        }

        return {
            phone: customer.phone,
            name: customer.name,
            email: customer.email || undefined,
            tags: tags.filter(Boolean)
        };
    }

    /**
     * Sync customers to Omnichat
     * @param {Array} customerIds - Optional array of customer IDs to sync
     * @returns {Promise<object>} Sync result
     */
    async syncContacts(customerIds = null) {
        if (this.syncInProgress) {
            logger.warn('[ContactSync] Sync already in progress, skipping...');
            return {
                success: false,
                message: 'Sync already in progress',
                synced: 0,
                failed: 0
            };
        }

        try {
            this.syncInProgress = true;
            logger.info('[ContactSync] Starting contact sync...', { customerIds });

            // Get customers to sync
            const customers = await this.getCustomersForSync(customerIds);

            if (customers.length === 0) {
                logger.info('[ContactSync] No customers to sync');
                return {
                    success: true,
                    synced: 0,
                    failed: 0,
                    message: 'No customers to sync'
                };
            }

            logger.info(`[ContactSync] Syncing ${customers.length} customers...`);

            // Format contacts for Omnichat
            const includeTags = getSetting('omnichat_sync_tags_enabled', true);
            const contacts = customers.map(c => this.formatCustomerForSync(c, includeTags));

            // Get batch size from settings (default 100)
            const batchSize = parseInt(getSetting('omnichat_sync_batch_size', '100'));

            // Split into batches
            const batches = [];
            for (let i = 0; i < contacts.length; i += batchSize) {
                batches.push(contacts.slice(i, i + batchSize));
            }

            logger.info(`[ContactSync] Processing ${batches.length} batches of ${batchSize} contacts each...`);

            let totalSynced = 0;
            let totalFailed = 0;
            const errors = [];

            // Process each batch
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                logger.info(`[ContactSync] Processing batch ${i + 1}/${batches.length} (${batch.length} contacts)`);

                try {
                    const result = await kilusiOmnichat.syncContacts(batch);

                    totalSynced += result.synced || batch.length;
                    totalFailed += result.failed || 0;

                    if (result.errors && result.errors.length > 0) {
                        errors.push(...result.errors);
                    }

                    logger.info(`[ContactSync] Batch ${i + 1} completed: ${result.synced || batch.length} synced, ${result.failed || 0} failed`);

                    // Add delay between batches to respect rate limits
                    if (i < batches.length - 1) {
                        const delayBetweenBatches = parseInt(getSetting('omnichat_sync_batch_delay', '2000'));
                        await this.delay(delayBetweenBatches);
                    }
                } catch (batchError) {
                    logger.error(`[ContactSync] Batch ${i + 1} failed:`, batchError);
                    totalFailed += batch.length;
                    errors.push(`Batch ${i + 1}: ${batchError.message}`);
                }
            }

            // Update last sync time
            this.lastSyncTime = new Date().toISOString();
            await updateSetting('omnichat_last_sync', this.lastSyncTime);

            // Log sync result to database
            await this.logSyncResult(customerIds, customers.length, totalSynced, totalFailed, errors);

            logger.info(`[ContactSync] Sync completed: ${totalSynced} synced, ${totalFailed} failed`);

            return {
                success: true,
                synced: totalSynced,
                failed: totalFailed,
                total: customers.length,
                errors: errors,
                last_sync: this.lastSyncTime
            };

        } catch (error) {
            logger.error('[ContactSync] Sync failed:', error);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Log sync result to database
     */
    async logSyncResult(customerIds, total, synced, failed, errors) {
        try {
            const syncType = customerIds ? 'manual' : 'auto';
            const status = failed === 0 ? 'success' : (synced > 0 ? 'partial' : 'failed');

            // Check if sync_log table exists, if not create it
            await this.ensureSyncLogTable();

            await query(
                `INSERT INTO omnichat_sync_log (sync_type, total_count, synced_count, failed_count, status, error_message, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [syncType, total, synced, failed, status, errors.length > 0 ? JSON.stringify(errors) : null]
            );

            logger.info('[ContactSync] Sync result logged to database');
        } catch (error) {
            logger.error('[ContactSync] Error logging sync result:', error);
        }
    }

    /**
     * Ensure sync_log table exists
     */
    async ensureSyncLogTable() {
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS omnichat_sync_log (
                    id SERIAL PRIMARY KEY,
                    sync_type VARCHAR(50) NOT NULL,
                    total_count INTEGER NOT NULL,
                    synced_count INTEGER NOT NULL DEFAULT 0,
                    failed_count INTEGER NOT NULL DEFAULT 0,
                    status VARCHAR(20) NOT NULL,
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);
        } catch (error) {
            logger.error('[ContactSync] Error creating sync_log table:', error);
        }
    }

    /**
     * Get sync history
     * @param {number} limit - Number of records to return
     * @returns {Promise<Array>} Array of sync log records
     */
    async getSyncHistory(limit = 50) {
        try {
            await this.ensureSyncLogTable();

            const result = await query(
                `SELECT * FROM omnichat_sync_log
                 ORDER BY created_at DESC
                 LIMIT $1`,
                [limit]
            );

            return result.rows;
        } catch (error) {
            logger.error('[ContactSync] Error fetching sync history:', error);
            return [];
        }
    }

    /**
     * Get last sync status
     * @returns {Promise<object>} Last sync status
     */
    async getLastSyncStatus() {
        try {
            await this.ensureSyncLogTable();

            const result = await query(
                `SELECT * FROM omnichat_sync_log
                 ORDER BY created_at DESC
                 LIMIT 1`
            );

            if (result.rows.length > 0) {
                return result.rows[0];
            }

            return null;
        } catch (error) {
            logger.error('[ContactSync] Error fetching last sync status:', error);
            return null;
        }
    }

    /**
     * Get sync statistics
     * @returns {Promise<object>} Sync statistics
     */
    async getSyncStatistics() {
        try {
            await this.ensureSyncLogTable();

            const result = await query(`
                SELECT
                    COUNT(*) as total_syncs,
                    SUM(synced_count) as total_synced,
                    SUM(failed_count) as total_failed,
                    MAX(created_at) as last_sync_at
                FROM omnichat_sync_log
            `);

            const stats = result.rows[0];

            // Get customer count
            const customerResult = await query(`
                SELECT COUNT(*) as total_customers
                FROM customers
                WHERE status IN ('active', 'suspended')
                AND phone IS NOT NULL
                AND phone != ''
            `);

            return {
                total_syncs: parseInt(stats.total_syncs) || 0,
                total_synced: parseInt(stats.total_synced) || 0,
                total_failed: parseInt(stats.total_failed) || 0,
                last_sync_at: stats.last_sync_at,
                total_customers: parseInt(customerResult.rows[0].total_customers) || 0
            };
        } catch (error) {
            logger.error('[ContactSync] Error fetching sync statistics:', error);
            return {
                total_syncs: 0,
                total_synced: 0,
                total_failed: 0,
                last_sync_at: null,
                total_customers: 0
            };
        }
    }

    /**
     * Start scheduled sync
     */
    startScheduledSync() {
        const syncEnabled = getSetting('omnichat_sync_enabled', false);
        const syncSchedule = getSetting('omnichat_sync_schedule', 'manual');

        if (!syncEnabled || syncSchedule === 'manual') {
            logger.info('[ContactSync] Scheduled sync is disabled or set to manual');
            return;
        }

        // Clear existing interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        // Calculate interval based on schedule
        let intervalMs;
        if (syncSchedule === 'daily') {
            intervalMs = 24 * 60 * 60 * 1000; // 24 hours
        } else if (syncSchedule === 'weekly') {
            intervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        } else {
            logger.warn(`[ContactSync] Unknown schedule: ${syncSchedule}`);
            return;
        }

        logger.info(`[ContactSync] Starting scheduled sync every ${syncSchedule}`);

        // Run initial sync
        this.syncContacts().catch(error => {
            logger.error('[ContactSync] Scheduled sync failed:', error);
        });

        // Set up interval
        this.syncInterval = setInterval(() => {
            logger.info('[ContactSync] Running scheduled sync...');
            this.syncContacts().catch(error => {
                logger.error('[ContactSync] Scheduled sync failed:', error);
            });
        }, intervalMs);
    }

    /**
     * Stop scheduled sync
     */
    stopScheduledSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            logger.info('[ContactSync] Scheduled sync stopped');
        }
    }

    /**
     * Restart scheduled sync (when settings change)
     */
    restartScheduledSync() {
        this.stopScheduledSync();
        this.startScheduledSync();
    }

    /**
     * Sync a single customer (triggered by customer creation/update)
     * @param {string} customerId - Customer ID to sync
     * @returns {Promise<object>} Sync result
     */
    async syncSingleCustomer(customerId) {
        try {
            const customers = await this.getCustomersForSync([customerId]);

            if (customers.length === 0) {
                logger.warn(`[ContactSync] Customer ${customerId} not found or has no phone number`);
                return {
                    success: false,
                    message: 'Customer not found or has no phone number'
                };
            }

            const customer = customers[0];
            const includeTags = getSetting('omnichat_sync_tags_enabled', true);
            const contact = this.formatCustomerForSync(customer, includeTags);

            const result = await kilusiOmnichat.syncContact(contact);

            logger.info(`[ContactSync] Single customer synced: ${customer.name} (${customer.phone})`);

            return {
                success: true,
                customer: customer.name,
                phone: customer.phone,
                result: result
            };
        } catch (error) {
            logger.error(`[ContactSync] Failed to sync customer ${customerId}:`, error);
            throw error;
        }
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
const omnichatContactSync = new OmnichatContactSyncService();

module.exports = omnichatContactSync;
module.exports.OmnichatContactSyncService = OmnichatContactSyncService;
