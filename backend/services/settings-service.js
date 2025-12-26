const { query } = require('../config/database');
const { logger } = require('../config/logger');

class SettingsService {
    constructor() {
        this.cache = null;
        this.lastCacheUpdate = 0;
        this.CACHE_TTL = 60000; // 1 minute cache (can be effectively infinite if we rely on events to invalidate)
    }

    /**
     * Get all dynamic settings from DB
     */
    async getAllSettings() {
        // Simple time-based cache for read safety
        if (this.cache && (Date.now() - this.lastCacheUpdate < this.CACHE_TTL)) {
            return { ...this.cache };
        }

        try {
            const result = await query('SELECT "key", "value", "type" FROM "app_config"');
            const settings = {};

            result.rows.forEach(row => {
                settings[row.key] = this.parseValue(row.value, row.type);
            });

            this.cache = settings;
            this.lastCacheUpdate = Date.now();
            return settings;
        } catch (error) {
            logger.error(`Failed to fetch settings from DB: ${error.message}`);
            // Return cache if available even if expired, otherwise empty object to prevent crashes
            return this.cache || {};
        }
    }

    /**
     * Get a specific setting
     */
    async get(key, defaultValue = null) {
        const settings = await this.getAllSettings();
        return settings[key] !== undefined ? settings[key] : defaultValue;
    }

    /**
     * Set a setting
     */
    async set(key, value, type = 'string', category = 'general', description = '') {
        try {
            const stringValue = this.stringifyValue(value);

            // Upsert
            const sql = `
                INSERT INTO "app_config" ("key", "value", "type", "category", "description", "updated_at")
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT ("key") 
                DO UPDATE SET 
                    "value" = EXCLUDED."value",
                    "type" = EXCLUDED."type", 
                    "updated_at" = NOW()
            `;

            await query(sql, [key, stringValue, type, category, description]);

            // Invalidate cache locally
            this.invalidateCache();

            // Notify other instances/modules via global event (if exists)
            if (global.appEvents) {
                global.appEvents.emit('settings:updated', { [key]: value });
            }

            return true;
        } catch (error) {
            logger.error(`Failed to save setting ${key}: ${error.message}`);
            return false;
        }
    }

    /**
     * Bulk update settings
     */
    async bulkSet(settingsObj) {
        try {
            const promises = Object.entries(settingsObj).map(([key, value]) => {
                // Infer type if possible, or default to string
                let type = 'string';
                if (typeof value === 'boolean') type = 'boolean';
                else if (typeof value === 'number') type = 'number';
                else if (typeof value === 'object') type = 'json';

                return this.set(key, value, type);
            });

            await Promise.all(promises);
            return true;
        } catch (error) {
            logger.error(`Failed to bulk save settings: ${error.message}`);
            return false;
        }
    }

    invalidateCache() {
        this.cache = null;
        this.lastCacheUpdate = 0;
    }

    // Helper: Parse string from DB to correct type
    parseValue(value, type) {
        if (value === null || value === undefined) return null;
        try {
            switch (type) {
                case 'boolean':
                    return value === 'true' || value === '1';
                case 'number':
                    return Number(value);
                case 'json':
                    return JSON.parse(value);
                default:
                    return value;
            }
        } catch (e) {
            return value;
        }
    }

    // Helper: Stringify value for DB
    stringifyValue(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }
}

module.exports = new SettingsService();
