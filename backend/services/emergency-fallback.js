/**
 * Emergency Fallback Service
 *
 * Automatic failover system for WhatsApp notification providers
 * Monitors Omnichat health and falls back to Baileys when needed
 *
 * @module services/emergency-fallback
 */

const { logger } = require('../config/logger');
const { getSetting, updateSetting } = require('../config/settingsManager');
const kilusiOmnichat = require('../config/kilusi-whatsapp');

/**
 * Fallback States
 */
const FALLBACK_STATE = {
    NORMAL: 'normal',           // Using Omnichat, everything working
    DEGRADED: 'degraded',       // Omnichat having issues, monitoring
    FALLBACK: 'fallback',       // Using Baileys, Omnichat failed
    RECOVERING: 'recovering'    // Testing Omnichat recovery
};

/**
 * Fallback Event Types
 */
const EVENT_TYPE = {
    STATE_CHANGE: 'state_change',
    HEALTH_CHECK: 'health_check',
    FAILover: 'failover',
    RECOVERY: 'recovery',
    MANUAL_TOGGLE: 'manual_toggle'
};

/**
 * Emergency Fallback Service
 */
class EmergencyFallbackService {
    constructor() {
        this.currentState = FALLBACK_STATE.NORMAL;
        this.failureCount = 0;
        this.successCount = 0;
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.lastHealthCheck = null;
        this.lastFailover = null;
        this.lastRecovery = null;

        // Circuit breaker thresholds
        this.failureThreshold = 5;          // Consecutive failures before fallback
        this.recoveryThreshold = 3;         // Consecutive successes before recovery
        this.healthCheckInterval = 60000;   // Health check every 60 seconds
        this.healthCheckTimeout = null;

        // Fallback settings
        this.fallbackEnabled = false;
        this.autoRecoveryEnabled = true;

        this.initialized = false;
    }

    /**
     * Initialize the fallback service
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Load settings
            this.fallbackEnabled = getSetting('baileys_fallback_enabled', false) === true;
            this.autoRecoveryEnabled = getSetting('fallback_auto_recovery_enabled', true) !== false;
            this.failureThreshold = parseInt(getSetting('fallback_failure_threshold', '5'));
            this.recoveryThreshold = parseInt(getSetting('fallback_recovery_threshold', '3'));
            this.healthCheckInterval = parseInt(getSetting('fallback_health_check_interval', '60000'));

            // Load state from settings if available
            const savedState = getSetting('fallback_state', 'normal');
            this.currentState = savedState;

            // Load failure/success counts
            this.failureCount = parseInt(getSetting('fallback_failure_count', '0'));
            this.successCount = parseInt(getSetting('fallback_success_count', '0'));

            // Load last failover/recovery times
            this.lastFailover = getSetting('fallback_last_failover', null);
            this.lastRecovery = getSetting('fallback_last_recovery', null);

            // Start health check if fallback is enabled
            if (this.fallbackEnabled) {
                this.startHealthCheck();
            }

            this.initialized = true;
            logger.info('[EmergencyFallback] Initialized', {
                state: this.currentState,
                enabled: this.fallbackEnabled,
                autoRecovery: this.autoRecoveryEnabled
            });
        } catch (error) {
            logger.error('[EmergencyFallback] Initialization error:', error);
        }
    }

    /**
     * Ensure service is initialized
     */
    async _ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * Start health check monitoring
     */
    startHealthCheck() {
        if (this.healthCheckTimeout) {
            clearInterval(this.healthCheckTimeout);
        }

        logger.info('[EmergencyFallback] Starting health check monitoring');

        this.healthCheckTimeout = setInterval(async () => {
            await this.performHealthCheck();
        }, this.healthCheckInterval);

        // Initial health check
        this.performHealthCheck();
    }

    /**
     * Stop health check monitoring
     */
    stopHealthCheck() {
        if (this.healthCheckTimeout) {
            clearInterval(this.healthCheckTimeout);
            this.healthCheckTimeout = null;
            logger.info('[EmergencyFallback] Health check monitoring stopped');
        }
    }

    /**
     * Perform health check on Omnichat
     */
    async performHealthCheck() {
        await this._ensureInitialized();

        if (!this.fallbackEnabled) {
            return { status: 'disabled', message: 'Fallback is disabled' };
        }

        this.lastHealthCheck = new Date().toISOString();

        try {
            const isHealthy = await this.checkOmnichatHealth();

            if (isHealthy) {
                await this.handleSuccess();
            } else {
                await this.handleFailure();
            }

            // Log health check event
            await this.logEvent(EVENT_TYPE.HEALTH_CHECK, {
                healthy: isHealthy,
                state: this.currentState,
                consecutiveFailures: this.consecutiveFailures,
                consecutiveSuccesses: this.consecutiveSuccesses
            });

            return {
                status: 'success',
                healthy: isHealthy,
                state: this.currentState
            };
        } catch (error) {
            logger.error('[EmergencyFallback] Health check error:', error);
            await this.handleFailure();
            return {
                status: 'error',
                healthy: false,
                state: this.currentState
            };
        }
    }

    /**
     * Check if Omnichat is healthy
     */
    async checkOmnichatHealth() {
        try {
            const result = await kilusiOmnichat.getStatus();

            if (result && result.success && result.connected) {
                return true;
            }

            return false;
        } catch (error) {
            logger.warn('[EmergencyFallback] Omnichat health check failed:', error.message);
            return false;
        }
    }

    /**
     * Handle successful health check
     */
    async handleSuccess() {
        this.successCount++;
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;

        // Update stats
        await updateSetting('fallback_success_count', this.successCount);

        // If in fallback state, check if we can recover
        if (this.currentState === FALLBACK_STATE.FALLBACK && this.autoRecoveryEnabled) {
            if (this.consecutiveSuccesses >= this.recoveryThreshold) {
                await this.attemptRecovery();
            }
        }
    }

    /**
     * Handle failed health check
     */
    async handleFailure() {
        this.failureCount++;
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;

        // Update stats
        await updateSetting('fallback_failure_count', this.failureCount);

        // Check if we need to failover
        if (this.currentState === FALLBACK_STATE.NORMAL ||
            this.currentState === FALLBACK_STATE.RECOVERING) {

            if (this.consecutiveFailures >= this.failureThreshold) {
                await this.triggerFailover();
            } else if (this.consecutiveFailures >= Math.ceil(this.failureThreshold / 2)) {
                // Enter degraded state
                await this.changeState(FALLBACK_STATE.DEGRADED);
            }
        }
    }

    /**
     * Trigger failover to Baileys
     */
    async triggerFailover() {
        logger.warn('[EmergencyFallback] TRIGGERING FAILOVER to Baileys', {
            consecutiveFailures: this.consecutiveFailures,
            threshold: this.failureThreshold
        });

        await this.changeState(FALLBACK_STATE.FALLBACK);
        this.lastFailover = new Date().toISOString();
        await updateSetting('fallback_last_failover', this.lastFailover);

        // Log failover event
        await this.logEvent(EVENT_TYPE.FAILover, {
            from: 'omnichat',
            to: 'baileys',
            reason: 'consecutive_failures',
            failures: this.consecutiveFailures
        });

        // Send alert notification
        await this.sendAlert({
            type: 'FAILOVER',
            message: `WhatsApp failover activated! Switched from Omnichat to Baileys after ${this.consecutiveFailures} consecutive failures.`,
            severity: 'high'
        });
    }

    /**
     * Attempt recovery to Omnichat
     */
    async attemptRecovery() {
        logger.info('[EmergencyFallback] Attempting recovery to Omnichat', {
            consecutiveSuccesses: this.consecutiveSuccesses,
            threshold: this.recoveryThreshold
        });

        await this.changeState(FALLBACK_STATE.RECOVERING);

        // Log recovery attempt
        await this.logEvent(EVENT_TYPE.RECOVERY, {
            attempt: 'switching_to_omnichat',
            consecutiveSuccesses: this.consecutiveSuccesses
        });
    }

    /**
     * Complete recovery
     */
    async completeRecovery() {
        logger.info('[EmergencyFallback] Recovery complete - back to Omnichat');

        await this.changeState(FALLBACK_STATE.NORMAL);
        this.lastRecovery = new Date().toISOString();
        await updateSetting('fallback_last_recovery', this.lastRecovery);

        // Reset counters
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;

        // Log recovery event
        await this.logEvent(EVENT_TYPE.RECOVERY, {
            status: 'success',
            back_to: 'omnichat'
        });

        // Send alert notification
        await this.sendAlert({
            type: 'RECOVERY',
            message: 'WhatsApp service recovered! Switched back from Baileys to Omnichat.',
            severity: 'info'
        });
    }

    /**
     * Change fallback state
     */
    async changeState(newState) {
        const oldState = this.currentState;
        this.currentState = newState;
        await updateSetting('fallback_state', newState);

        logger.info('[EmergencyFallback] State changed', {
            from: oldState,
            to: newState
        });

        // Emit event for other services to listen to
        if (global.emitter) {
            global.emitter.emit('fallback-state-change', {
                oldState,
                newState,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Log fallback event
     */
    async logEvent(type, data) {
        try {
            const { query } = require('../config/database');

            await query(`
                CREATE TABLE IF NOT EXISTS fallback_events (
                    id SERIAL PRIMARY KEY,
                    event_type VARCHAR(50) NOT NULL,
                    event_data JSONB,
                    state VARCHAR(20) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);

            await query(
                `INSERT INTO fallback_events (event_type, event_data, state)
                 VALUES ($1, $2, $3)`,
                [type, JSON.stringify(data), this.currentState]
            );
        } catch (error) {
            logger.error('[EmergencyFallback] Error logging event:', error);
        }
    }

    /**
     * Send alert notification
     */
    async sendAlert(alert) {
        try {
            // Create admin notification
            const { query } = require('../config/database');

            await query(`
                CREATE TABLE IF NOT EXISTS admin_notifications (
                    id SERIAL PRIMARY KEY,
                    type VARCHAR(50) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    severity VARCHAR(20) NOT NULL,
                    is_read BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);

            await query(
                `INSERT INTO admin_notifications (type, title, message, severity)
                 VALUES ($1, $2, $3, $4)`,
                [
                    'fallback_alert',
                    `WhatsApp ${alert.type}`,
                    alert.message,
                    alert.severity
                ]
            );

            logger.info('[EmergencyFallback] Alert notification created');
        } catch (error) {
            logger.error('[EmergencyFallback] Error sending alert:', error);
        }
    }

    /**
     * Manually enable fallback
     */
    async enableFallback() {
        await this._ensureInitialized();

        if (!this.fallbackEnabled) {
            this.fallbackEnabled = true;
            await updateSetting('baileys_fallback_enabled', true);

            // Start health check
            this.startHealthCheck();

            // Log event
            await this.logEvent(EVENT_TYPE.MANUAL_TOGGLE, {
                action: 'enable_fallback',
                enabled_by: 'admin'
            });

            logger.info('[EmergencyFallback] Fallback enabled by admin');
        }

        return { success: true, enabled: true };
    }

    /**
     * Manually disable fallback
     */
    async disableFallback() {
        await this._ensureInitialized();

        if (this.fallbackEnabled) {
            this.fallbackEnabled = false;
            await updateSetting('baileys_fallback_enabled', false);

            // Stop health check
            this.stopHealthCheck();

            // Log event
            await this.logEvent(EVENT_TYPE.MANUAL_TOGGLE, {
                action: 'disable_fallback',
                enabled_by: 'admin'
            });

            logger.info('[EmergencyFallback] Fallback disabled by admin');
        }

        return { success: true, enabled: false };
    }

    /**
     * Manually trigger failover
     */
    async manualFailover() {
        await this._ensureInitialized();

        await this.triggerFailover();

        return {
            success: true,
            state: this.currentState,
            message: 'Manual failover triggered'
        };
    }

    /**
     * Manually trigger recovery
     */
    async manualRecovery() {
        await this._ensureInitialized();

        await this.completeRecovery();

        return {
            success: true,
            state: this.currentState,
            message: 'Manual recovery triggered'
        };
    }

    /**
     * Get current status
     */
    async getStatus() {
        await this._ensureInitialized();

        return {
            state: this.currentState,
            enabled: this.fallbackEnabled,
            autoRecovery: this.autoRecoveryEnabled,
            failureCount: this.failureCount,
            successCount: this.successCount,
            consecutiveFailures: this.consecutiveFailures,
            consecutiveSuccesses: this.consecutiveSuccesses,
            lastHealthCheck: this.lastHealthCheck,
            lastFailover: this.lastFailover,
            lastRecovery: this.lastRecovery,
            thresholds: {
                failure: this.failureThreshold,
                recovery: this.recoveryThreshold
            }
        };
    }

    /**
     * Get event history
     */
    async getEventHistory(limit = 50) {
        try {
            const { query } = require('../config/database');

            // Ensure table exists
            await query(`
                CREATE TABLE IF NOT EXISTS fallback_events (
                    id SERIAL PRIMARY KEY,
                    event_type VARCHAR(50) NOT NULL,
                    event_data JSONB,
                    state VARCHAR(20) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);

            const result = await query(
                `SELECT * FROM fallback_events
                 ORDER BY created_at DESC
                 LIMIT $1`,
                [limit]
            );

            return result.rows;
        } catch (error) {
            logger.error('[EmergencyFallback] Error fetching event history:', error);
            return [];
        }
    }

    /**
     * Get statistics
     */
    async getStatistics() {
        try {
            const { query } = require('../config/database');

            // Ensure table exists
            await query(`
                CREATE TABLE IF NOT EXISTS fallback_events (
                    id SERIAL PRIMARY KEY,
                    event_type VARCHAR(50) NOT NULL,
                    event_data JSONB,
                    state VARCHAR(20) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);

            const result = await query(`
                SELECT
                    event_type,
                    COUNT(*) as count,
                    MAX(created_at) as last_occurrence
                FROM fallback_events
                GROUP BY event_type
            `);

            const stats = {
                byType: {},
                totalEvents: 0
            };

            result.rows.forEach(row => {
                stats.byType[row.event_type] = {
                    count: parseInt(row.count),
                    lastOccurrence: row.last_occurrence
                };
                stats.totalEvents += parseInt(row.count);
            });

            return stats;
        } catch (error) {
            logger.error('[EmergencyFallback] Error fetching statistics:', error);
            return { byType: {}, totalEvents: 0 };
        }
    }

    /**
     * Update settings
     */
    async updateSettings(settings) {
        await this._ensureInitialized();

        if (settings.failureThreshold !== undefined) {
            this.failureThreshold = settings.failureThreshold;
            await updateSetting('fallback_failure_threshold', settings.failureThreshold);
        }

        if (settings.recoveryThreshold !== undefined) {
            this.recoveryThreshold = settings.recoveryThreshold;
            await updateSetting('fallback_recovery_threshold', settings.recoveryThreshold);
        }

        if (settings.autoRecoveryEnabled !== undefined) {
            this.autoRecoveryEnabled = settings.autoRecoveryEnabled;
            await updateSetting('fallback_auto_recovery_enabled', settings.autoRecoveryEnabled);
        }

        if (settings.healthCheckInterval !== undefined) {
            this.healthCheckInterval = settings.healthCheckInterval;
            await updateSetting('fallback_health_check_interval', settings.healthCheckInterval);

            // Restart health check with new interval
            if (this.fallbackEnabled) {
                this.startHealthCheck();
            }
        }

        logger.info('[EmergencyFallback] Settings updated', settings);

        return { success: true };
    }
}

// Export singleton instance
const emergencyFallback = new EmergencyFallbackService();

// Auto-initialize on module load
emergencyFallback.initialize().catch(error => {
    logger.error('[EmergencyFallback] Auto-initialization failed:', error);
});

module.exports = emergencyFallback;
module.exports.EmergencyFallbackService = EmergencyFallbackService;
module.exports.FALLBACK_STATE = FALLBACK_STATE;
module.exports.EVENT_TYPE = EVENT_TYPE;
