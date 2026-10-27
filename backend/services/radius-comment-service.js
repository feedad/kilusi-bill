const { query } = require('../config/database');
const { logger } = require('../config/logger');

/**
 * Service for resolving PPPoE usernames to customer names for MikroTik comments
 * and cleaning up legacy invalid Mikrotik-Comment radreply attributes.
 */
class RadiusCommentService {
    /**
     * Normalize PPPoE username (strip <pppoe-...> wrapper if passed from interface name)
     * @param {string} pppoeUsername
     * @returns {string}
     */
    static normalizeUsername(pppoeUsername) {
        if (!pppoeUsername) return '';
        return String(pppoeUsername)
            .trim()
            .replace(/^<pppoe-/i, '')
            .replace(/>$/, '')
            .trim();
    }

    /**
     * Sanitize single-line text for RouterOS comments
     * @param {string} text
     * @returns {string}
     */
    static sanitizeName(text) {
        if (!text) return '';
        return String(text).replace(/["\\\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * Lookup customer info by PPPoE username or service number
     * @param {string} pppoeUsername - e.g. 26090019901@kilusi.id
     * @returns {Promise<{customer_id: any, name: string, sanitized_name: string, service_number: string, pppoe_username: string, region_name: string|null, status: string|null}|null>}
     */
    static async getCustomerByPppoeUsername(pppoeUsername) {
        try {
            const normalized = this.normalizeUsername(pppoeUsername);
            if (!normalized) return null;

            const result = await query(`
                SELECT
                    c.id AS customer_id,
                    c.name,
                    s.service_number,
                    td.pppoe_username,
                    r.name AS region_name,
                    m.name AS mitra_name,
                    s.status
                FROM technical_details td
                JOIN services s ON td.service_id = s.id
                JOIN customers c ON s.customer_id::text = c.id::text
                LEFT JOIN regions r ON s.region_id = r.id
                LEFT JOIN mitra m ON m.id = r.mitra_id
                WHERE LOWER(td.pppoe_username) = LOWER($1)
                   OR LOWER(SPLIT_PART(td.pppoe_username, '@', 1)) = LOWER(SPLIT_PART($1, '@', 1))
                   OR LOWER(s.service_number) = LOWER(SPLIT_PART($1, '@', 1))
                ORDER BY (LOWER(td.pppoe_username) = LOWER($1)) DESC, s.updated_at DESC NULLS LAST
                LIMIT 1
            `, [normalized]);

            if (result.rows.length === 0) {
                return null;
            }

            const row = result.rows[0];
            const sanitizedName = this.sanitizeName(row.name);
            const sanitizedRegion = row.region_name ? this.sanitizeName(row.region_name) : null;
            const sanitizedMitra = row.mitra_name ? this.sanitizeName(row.mitra_name) : sanitizedRegion;
            return {
                customer_id: row.customer_id,
                name: row.name,
                sanitized_name: sanitizedName,
                display_label: sanitizedMitra ? `${sanitizedName}-${sanitizedMitra}` : sanitizedName,
                service_number: row.service_number,
                pppoe_username: row.pppoe_username,
                mitra_name: sanitizedMitra,
                region_name: sanitizedRegion,
                status: row.status || null
            };
        } catch (error) {
            logger.error('Error looking up customer by PPPoE username:', error);
            return null;
        }
    }

    /**
     * Format comment string for MikroTik
     * @param {object} customer
     * @param {string} fallbackUsername
     * @returns {string}
     */
    static formatComment(customer, fallbackUsername = '') {
        if (!customer || !customer.name) {
            return fallbackUsername || 'UNKNOWN';
        }
        const sanitizedName = this.sanitizeName(customer.name);
        const areaLabel = customer.mitra_name || customer.region_name;
        return areaLabel ? `${sanitizedName}-${this.sanitizeName(areaLabel)}` : sanitizedName;
    }

    /**
     * Get all active/registered PPPoE usernames with their formatted NAMA-MITRA label
     * @returns {Promise<Array<{pppoe_username: string, display_label: string}>>}
     */
    static async getAllCustomerPppoeBindings() {
        try {
            const result = await query(`
                SELECT DISTINCT ON (LOWER(TRIM(td.pppoe_username)))
                    TRIM(td.pppoe_username) AS pppoe_username,
                    c.name,
                    r.name AS region_name,
                    m.name AS mitra_name
                FROM technical_details td
                JOIN services s ON td.service_id = s.id
                JOIN customers c ON s.customer_id::text = c.id::text
                LEFT JOIN regions r ON s.region_id = r.id
                LEFT JOIN mitra m ON m.id = r.mitra_id
                WHERE td.pppoe_username IS NOT NULL
                  AND TRIM(td.pppoe_username) != ''
                ORDER BY
                    LOWER(TRIM(td.pppoe_username)),
                    CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
                    s.updated_at DESC NULLS LAST
            `);

            return result.rows.map(row => {
                const sanitizedName = this.sanitizeName(row.name);
                const sanitizedRegion = row.region_name ? this.sanitizeName(row.region_name) : null;
                const sanitizedMitra = row.mitra_name ? this.sanitizeName(row.mitra_name) : sanitizedRegion;
                return {
                    pppoe_username: row.pppoe_username,
                    display_label: sanitizedMitra ? `${sanitizedName}-${sanitizedMitra}` : sanitizedName
                };
            });
        } catch (error) {
            logger.error('Error getting all customer PPPoE bindings:', error);
            return [];
        }
    }

    /**
     * Remove all invalid Mikrotik-Comment rows from radreply
     * @returns {Promise<number>} Number of rows deleted
     */
    static async cleanupInvalidRadreplyComments() {
        try {
            const result = await query(`
                DELETE FROM radreply
                WHERE attribute = 'Mikrotik-Comment'
                RETURNING id
            `);
            const deletedCount = result.rows.length;
            if (deletedCount > 0) {
                logger.info(`Cleaned up ${deletedCount} invalid Mikrotik-Comment rows from radreply`);
            }
            return deletedCount;
        } catch (error) {
            logger.error('Error cleaning up invalid Mikrotik-Comment rows from radreply:', error);
            return 0;
        }
    }

    /**
     * Compatibility method: ensures no invalid Mikrotik-Comment attribute remains in radreply.
     * RouterOS comments are resolved dynamically via /api/v1/radius-comments/lookup.
     * @param {string} pppoeUsername - PPPoE username
     * @param {string} customerName - Customer name from database
     */
    static async updateMikrotikComment(pppoeUsername, customerName) {
        try {
            if (!pppoeUsername || !customerName) {
                return false;
            }
            await this.removeMikrotikComment(pppoeUsername);
            return true;
        } catch (error) {
            logger.error('Error in updateMikrotikComment:', error);
            return false;
        }
    }

    /**
     * Remove any stale Mikrotik-Comment row from radreply for the given username
     * @param {string} pppoeUsername - PPPoE username
     * @param {string} domain - PPPoE domain (default: kilusi.id)
     */
    static async removeMikrotikComment(pppoeUsername, domain = 'kilusi.id') {
        try {
            const normalized = this.normalizeUsername(pppoeUsername);
            if (!normalized) return false;
            const withDomain = normalized.includes('@') ? normalized : `${normalized}@${domain}`;

            await query(`
                DELETE FROM radreply
                WHERE attribute = 'Mikrotik-Comment'
                  AND (LOWER(username) = LOWER($1) OR LOWER(username) = LOWER($2) OR LOWER(username) = LOWER($3))
            `, [normalized, withDomain, `${normalized}@${domain}`]);

            return true;
        } catch (error) {
            logger.error('Error removing RADIUS Mikrotik comment:', error);
            return false;
        }
    }

    /**
     * Get resolved customer comment for PPPoE username
     * @param {string} pppoeUsername - PPPoE username
     * @returns {Promise<string|null>} Comment text or null
     */
    static async getMikrotikComment(pppoeUsername) {
        try {
            const customer = await this.getCustomerByPppoeUsername(pppoeUsername);
            return customer ? customer.display_label : null;
        } catch (error) {
            logger.error('Error getting Mikrotik comment:', error);
            return null;
        }
    }

    /**
     * Clean up invalid radreply comments and return count of active PPPoE usernames in technical_details
     * @returns {Promise<number>} Number of PPPoE usernames ready for lookup
     */
    static async syncAllCustomerComments() {
        try {
            await this.cleanupInvalidRadreplyComments();

            const result = await query(`
                SELECT COUNT(*) AS count
                FROM technical_details td
                JOIN services s ON td.service_id = s.id
                JOIN customers c ON s.customer_id::text = c.id::text
                WHERE td.pppoe_username IS NOT NULL AND td.pppoe_username != ''
            `);

            const count = parseInt(result.rows[0]?.count || '0', 10);
            logger.info(`PPPoE comment lookup ready for ${count} technical_details records`);
            return count;
        } catch (error) {
            logger.error('Error in syncAllCustomerComments:', error);
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