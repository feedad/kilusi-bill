const { query } = require('../config/database');
const { logger } = require('../config/logger');

/**
 * Service for managing Mikrotik comments via RADIUS reply attributes
 */
class RadiusCommentService {
    /**
     * Add/update Mikrotik comment in RADIUS radreply table
     * @param {string} pppoeUsername - PPPoE username
     * @param {string} customerName - Customer name from database
     * @param {string} domain - PPPoE domain (default: kilusi.id)
     */
    static async updateMikrotikComment(pppoeUsername, customerName, domain = 'kilusi.id') {
        try {
            if (!pppoeUsername || !customerName) {
                logger.warn('Missing required parameters for RADIUS comment update');
                return false;
            }

            const fullUsername = `${pppoeUsername}@${domain}`;
            const comment = customerName; // Simple: just the name

            // Check if comment already exists
            const existingComment = await query(`
                SELECT id, value
                FROM radreply
                WHERE username = $1 AND attribute = 'Mikrotik-Comment'
            `, [fullUsername]);

            if (existingComment.rows.length > 0) {
                // Update existing comment
                await query(`
                    UPDATE radreply
                    SET value = $1
                    WHERE username = $2 AND attribute = 'Mikrotik-Comment'
                `, [comment, fullUsername]);

                logger.info(`Updated RADIUS comment for ${fullUsername}: ${comment}`);
            } else {
                // Insert new comment
                await query(`
                    INSERT INTO radreply (username, attribute, op, value, created_at)
                    VALUES ($1, 'Mikrotik-Comment', '=', $2, NOW())
                `, [fullUsername, comment]);

                logger.info(`Added RADIUS comment for ${fullUsername}: ${comment}`);
            }

            return true;
        } catch (error) {
            logger.error('Error updating RADIUS Mikrotik comment:', error);
            return false;
        }
    }

    /**
     * Remove Mikrotik comment from RADIUS
     * @param {string} pppoeUsername - PPPoE username
     * @param {string} domain - PPPoE domain (default: kilusi.id)
     */
    static async removeMikrotikComment(pppoeUsername, domain = 'kilusi.id') {
        try {
            const fullUsername = `${pppoeUsername}@${domain}`;

            const result = await query(`
                DELETE FROM radreply
                WHERE username = $1 AND attribute = 'Mikrotik-Comment'
                RETURNING id
            `, [fullUsername]);

            if (result.rows.length > 0) {
                logger.info(`Removed RADIUS comment for ${fullUsername}`);
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Error removing RADIUS Mikrotik comment:', error);
            return false;
        }
    }

    /**
     * Get existing Mikrotik comment
     * @param {string} pppoeUsername - PPPoE username
     * @param {string} domain - PPPoE domain (default: kilusi.id)
     * @returns {Promise<string|null>} Comment text or null
     */
    static async getMikrotikComment(pppoeUsername, domain = 'kilusi.id') {
        try {
            const fullUsername = `${pppoeUsername}@${domain}`;

            const result = await query(`
                SELECT value
                FROM radreply
                WHERE username = $1 AND attribute = 'Mikrotik-Comment'
                LIMIT 1
            `, [fullUsername]);

            return result.rows.length > 0 ? result.rows[0].value : null;
        } catch (error) {
            logger.error('Error getting RADIUS Mikrotik comment:', error);
            return null;
        }
    }

    /**
     * Sync all customer comments to RADIUS (for bulk operations)
     * @returns {Promise<number>} Number of comments synced
     */
    static async syncAllCustomerComments() {
        try {
            logger.info('Starting bulk sync of customer comments to RADIUS...');

            // Get all customers with PPPoE usernames
            const customers = await query(`
                SELECT id, name, pppoe_username
                FROM customers
                WHERE pppoe_username IS NOT NULL AND pppoe_username != ''
                ORDER BY id
            `);

            let syncedCount = 0;

            for (const customer of customers.rows) {
                const success = await this.updateMikrotikComment(
                    customer.pppoe_username,
                    customer.name
                );

                if (success) {
                    syncedCount++;
                }
            }

            logger.info(`Bulk sync completed: ${syncedCount}/${customers.rows.length} comments synced`);
            return syncedCount;

        } catch (error) {
            logger.error('Error in bulk sync of RADIUS comments:', error);
            return 0;
        }
    }

    /**
     * Check if RADIUS tables exist and are accessible
     * @returns {Promise<boolean>} True if RADIUS is accessible
     */
    static async checkRadiusAccess() {
        try {
            const result = await query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'radreply'
                ) as exists
            `);

            return result.rows[0].exists;
        } catch (error) {
            logger.error('Error checking RADIUS access:', error);
            return false;
        }
    }
}

module.exports = RadiusCommentService;