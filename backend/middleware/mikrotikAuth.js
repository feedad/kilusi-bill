/**
 * MikroTik Auth Middleware
 * Validates `X-API-Key` header (or `key` query param) against app_config.mikrotik_api_key.
 * IP allowlists are unusable here: requests arrive via Cloudflare/nginx, so the client IP
 * is either public or taken from a spoofable X-Forwarded-For header.
 */
const crypto = require('crypto');
const { getSetting } = require('../config/settingsManager');

function mikrotikAuth(req, res, next) {
    const expectedKey = String(getSetting('mikrotik_api_key', '') || '');
    if (!expectedKey) {
        return res.status(503).json({ success: false, message: 'MikroTik API key not configured' });
    }

    const providedKey = String(req.headers['x-api-key'] || req.query.key || '');
    const expected = Buffer.from(expectedKey);
    const provided = Buffer.from(providedKey);

    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return res.status(401).json({ success: false, message: 'Invalid API key' });
    }

    next();
}

module.exports = mikrotikAuth;
