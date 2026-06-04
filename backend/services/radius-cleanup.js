/**
 * Auto Cleanup Service for Stale RADIUS Sessions
 * 
 * Problem: MikroTik sometimes fails to send Accounting-Stop packets
 * when users disconnect or router reboots. This leaves "zombie" sessions
 * in radacct table with acctstoptime = NULL forever.
 * 
 * Solution: Periodically clean up sessions that haven't received
 * an interim update within the configured threshold (default: 30 minutes).
 */

const { query } = require('../config/database');
const { logger } = require('../config/logger');

class RadiusSessionCleanup {
    constructor() {
        // Sessions older than this without update are considered stale
        this.staleThresholdMinutes = parseInt(process.env.RADIUS_STALE_THRESHOLD_MINUTES) || 30;
        // Run cleanup every this many minutes
        this.cleanupIntervalMinutes = parseInt(process.env.RADIUS_CLEANUP_INTERVAL_MINUTES) || 15;
        this.timer = null;
        this.isRunning = false;
    }

    /**
     * Start automatic cleanup scheduler
     */
    start() {
        if (this.timer) {
            logger.warn('[RadiusCleanup] Already running');
            return;
        }

        logger.info(`[RadiusCleanup] Starting auto-cleanup service (interval: ${this.cleanupIntervalMinutes}min, threshold: ${this.staleThresholdMinutes}min)`);
        
        // Run immediately on start
        this.cleanup();

        // Schedule periodic cleanup
        this.timer = setInterval(() => {
            this.cleanup();
        }, this.cleanupIntervalMinutes * 60 * 1000);
    }

    /**
     * Stop automatic cleanup scheduler
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            logger.info('[RadiusCleanup] Stopped');
        }
    }

    /**
     * Perform cleanup of stale sessions
     */
    async cleanup() {
        if (this.isRunning) {
            logger.warn('[RadiusCleanup] Previous cleanup still running, skipping...');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            // Step 1: Count stale sessions before cleanup
            const countResult = await query(`
                SELECT COUNT(*) as stale_count, COUNT(DISTINCT username) as stale_users
                FROM radacct
                WHERE acctstoptime IS NULL
                  AND acctupdatetime < NOW() - INTERVAL '${this.staleThresholdMinutes} minutes'
            `);
            const staleCount = parseInt(countResult.rows[0].stale_count);
            const staleUsers = parseInt(countResult.rows[0].stale_users);

            if (staleCount === 0) {
                logger.info('[RadiusCleanup] No stale sessions found. Database is clean.');
                this.isRunning = false;
                return;
            }

            logger.info(`[RadiusCleanup] Found ${staleCount} stale sessions (${staleUsers} unique users) to clean up`);

            // Step 2: Mark stale sessions as stopped
            // We set acctstoptime to the last acctupdatetime (when we know the user was last active)
            // and acctsessiontime to the actual session duration
            const updateResult = await query(`
                UPDATE radacct
                SET 
                    acctstoptime = acctupdatetime,
                    acctsessiontime = EXTRACT(EPOCH FROM (acctupdatetime - acctstarttime)),
                    acctterminatecause = 'Stale Session Cleanup'
                WHERE acctstoptime IS NULL
                  AND acctupdatetime < NOW() - INTERVAL '${this.staleThresholdMinutes} minutes'
            `);

            const cleanedCount = updateResult.rowCount;
            const duration = Date.now() - startTime;

            logger.info(`[RadiusCleanup] ✅ Cleaned up ${cleanedCount} stale sessions in ${duration}ms`);

            // Step 3: Log statistics for monitoring
            const statsResult = await query(`
                SELECT 
                    COUNT(*) as total_active_rows,
                    COUNT(DISTINCT username) as unique_active_users
                FROM radacct
                WHERE acctstoptime IS NULL
            `);
            
            logger.info(`[RadiusCleanup] Current active sessions: ${statsResult.rows[0].unique_active_users} users (${statsResult.rows[0].total_active_rows} rows)`);

        } catch (error) {
            logger.error('[RadiusCleanup] ❌ Error during cleanup:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get current cleanup statistics
     */
    async getStats() {
        try {
            const result = await query(`
                SELECT 
                    (SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL) as active_rows,
                    (SELECT COUNT(DISTINCT username) FROM radacct WHERE acctstoptime IS NULL) as active_users,
                    (SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL AND acctupdatetime < NOW() - INTERVAL '${this.staleThresholdMinutes} minutes') as stale_rows,
                    (SELECT COUNT(DISTINCT username) FROM radacct WHERE acctstoptime IS NULL AND acctupdatetime < NOW() - INTERVAL '${this.staleThresholdMinutes} minutes') as stale_users
            `);
            return {
                activeRows: parseInt(result.rows[0].active_rows),
                activeUsers: parseInt(result.rows[0].active_users),
                staleRows: parseInt(result.rows[0].stale_rows),
                staleUsers: parseInt(result.rows[0].stale_users),
                thresholdMinutes: this.staleThresholdMinutes,
                intervalMinutes: this.cleanupIntervalMinutes
            };
        } catch (error) {
            logger.error('[RadiusCleanup] Error getting stats:', error.message);
            return null;
        }
    }
}

// Singleton instance
const radiusCleanup = new RadiusSessionCleanup();

module.exports = radiusCleanup;
