/**
 * Chatbot Auth Middleware
 * Validates X-API-Key header and enforces per-phone rate limiting
 */
const { getSetting } = require('../config/settingsManager');
const { logger } = require('../config/logger');

// In-memory rate limit store (phone → { count, resetAt })
const rateLimitStore = new Map();

function getRateLimitConfig() {
    return {
        perMinute: parseInt(getSetting('chatbot_rate_limit_per_minute', '15')) || 15,
        perDay: parseInt(getSetting('chatbot_rate_limit_per_day', '100')) || 100,
    };
}

function cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
        if (entry.dayReset < now) rateLimitStore.delete(key);
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);

function chatbotAuth(req, res, next) {
    try {
        // 1. Validate API Key
        const apiKey = req.headers['x-api-key'];
        const expectedKey = getSetting('chatbot_api_key', '');

        if (!expectedKey) {
            logger.warn('[Chatbot] API key not configured');
            return res.status(500).json({ success: false, message: 'Chatbot not configured' });
        }

        if (!apiKey || apiKey !== expectedKey) {
            return res.status(401).json({ success: false, message: 'Invalid API key' });
        }

        // 2. Rate Limiting (per phone number)
        const phone = req.params.phone || req.body?.phone;
        if (phone) {
            const limits = getRateLimitConfig();
            const now = Date.now();
            const dayKey = `day:${phone}:${new Date().toISOString().split('T')[0]}`;
            const minKey = `min:${phone}:${Math.floor(now / 60000)}`;

            // Per-minute check
            const minEntry = rateLimitStore.get(minKey) || { count: 0 };
            if (minEntry.count >= limits.perMinute) {
                return res.status(429).json({ success: false, message: 'Rate limit exceeded. Try again later.' });
            }
            minEntry.count++;
            rateLimitStore.set(minKey, minEntry);

            // Per-day check
            const dayEntry = rateLimitStore.get(dayKey) || { count: 0, dayReset: now + 86400000 };
            if (dayEntry.count >= limits.perDay) {
                return res.status(429).json({ success: false, message: 'Daily limit exceeded.' });
            }
            dayEntry.count++;
            rateLimitStore.set(dayKey, dayEntry);
        }

        next();
    } catch (error) {
        logger.error('[Chatbot] Auth error:', error);
        return res.status(500).json({ success: false, message: 'Unauthorized' });
    }
}

/**
 * Public endpoint auth — API key only + IP-based rate limit
 * Used for /packages, /coverage, /company
 */
function chatbotPublicAuth(req, res, next) {
    try {
        const apiKey = req.headers['x-api-key'];
        const expectedKey = getSetting('chatbot_api_key', '');

        if (!expectedKey) {
            return res.status(500).json({ success: false, message: 'Chatbot not configured' });
        }

        if (!apiKey || apiKey !== expectedKey) {
            return res.status(401).json({ success: false, message: 'Invalid API key' });
        }

        // IP-based rate limit (30/min)
        const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
        const now = Date.now();
        const minKey = `pub:${ip}:${Math.floor(now / 60000)}`;

        const minEntry = rateLimitStore.get(minKey) || { count: 0 };
        if (minEntry.count >= 30) {
            return res.status(429).json({ success: false, message: 'Rate limit exceeded.' });
        }
        minEntry.count++;
        rateLimitStore.set(minKey, minEntry);

        next();
    } catch (error) {
        logger.error('[Chatbot] Public auth error:', error);
        return res.status(500).json({ success: false, message: 'Unauthorized' });
    }
}

module.exports = { chatbotAuth, chatbotPublicAuth };
