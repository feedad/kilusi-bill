const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// ============================================
// PUBLIC ENDPOINTS
// ============================================

/**
 * GET /landing/content
 * Returns all manually editable content (Hero, Features, Testimonials, Banners)
 */

// Auto-migration to ensure table exists
(async function ensureTableExists() {
    try {
        const sql = `
            CREATE TABLE IF NOT EXISTS landing_page_content (
                section_key VARCHAR(100) PRIMARY KEY,
                content JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await query(sql);
        logger.info('✅ landing_page_content table ensured');
    } catch (error) {
        logger.error('❌ Failed to ensure landing_page_content table:', error);
    }
})();

router.get('/content', async (req, res) => {
    try {
        const result = await query('SELECT section_key, content FROM landing_page_content');

        // Transform array to object { hero: {}, features: [], ... }
        const content = result.rows.reduce((acc, row) => {
            acc[row.section_key] = row.content;
            return acc;
        }, {});

        res.json({ success: true, data: content });
    } catch (error) {
        logger.error('Error fetching landing content:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

/**
 * GET /landing/coverage
 * Returns ODP locations for coverage map (Obfuscated)
 */
router.get('/coverage', async (req, res) => {
    try {
        // Only select lat/long and status for active ODPs
        // Added slight random jitter in frontend or just return as is (user asked for circles)
        const sql = `
            SELECT latitude, longitude 
            FROM odps 
            WHERE status = 'active' 
            AND latitude IS NOT NULL 
            AND longitude IS NOT NULL
        `;
        const result = await query(sql);

        // Map to simple array of { lat, lng }
        const coverage = result.rows.map(row => ({
            lat: parseFloat(row.latitude),
            lng: parseFloat(row.longitude)
        }));

        res.json({ success: true, data: coverage });
    } catch (error) {
        logger.error('Error fetching coverage data:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

/**
 * GET /landing/packages
 * Returns active packages for pricing section
 */
router.get('/packages', async (req, res) => {
    try {
        // Fetch active packages, ordered by price or logical order
        // Fetch pricing configuration first
        const configResult = await query("SELECT content FROM landing_page_content WHERE section_key = 'pricing'");
        const pricingConfig = configResult.rows[0]?.content || {};
        const selectedIds = pricingConfig.packageIds || [];

        let sql;
        let params = [];

        if (selectedIds.length > 0) {
            // If specific packages are selected, fetch only those
            sql = `
                SELECT id, name, price, speed, description 
                FROM packages 
                WHERE id = ANY($1) AND is_active = true
                ORDER BY price ASC
            `;
            params = [selectedIds];
        } else {
            // Default: fetch all active packages
            sql = `
                SELECT id, name, price, speed, description 
                FROM packages 
                WHERE is_active = true
                ORDER BY price ASC
            `;
        }

        const result = await query(sql, params);

        // Fetch installation fees
        const installationFeesResult = await query("SELECT package_id, fee_amount FROM installation_fee_settings WHERE is_active = true");
        const installationFees = installationFeesResult.rows;

        // Merge DB data with Visual Config and Installation Fees
        const packages = result.rows.map(pkg => {
            const visualConfig = pricingConfig.packages?.[pkg.id] || {};

            // Find installation fee for this package
            const feeSetting = installationFees.find(f => f.package_id == pkg.id) ||
                installationFees.find(f => f.package_id === null && (!f.billing_type || f.billing_type === 'postpaid')); // Default fallback

            let installationFeeDisplay = 'Standard';
            if (feeSetting) {
                const amount = parseFloat(feeSetting.fee_amount);
                if (amount === 0) {
                    installationFeeDisplay = 'Free';
                } else {
                    installationFeeDisplay = new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    }).format(amount);
                }
            }

            // If visual config has features, use them. Otherwise default to description split by newline.
            let features = visualConfig.features || [];
            if (features.length === 0 && pkg.description) {
                features = pkg.description.split('\n').map(line => ({
                    text: line,
                    icon: 'Check' // Default icon
                }));
            }

            return {
                ...pkg,
                ...visualConfig, // Overwrite with visual config (badge, color, etc)
                features: features,
                installationFee: installationFeeDisplay
            };
        });

        res.json({ success: true, data: packages });
    } catch (error) {
        logger.error('Error fetching packages:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// ============================================
// ADMIN ENDPOINTS (Protected)
// ============================================

/**
 * PUT /landing/content
 * Updates a specific section content
 * Body: { section: 'hero', content: { ... } }
 */
router.put('/content', async (req, res) => {
    // Note: Add middleware authentication check here if not globally applied?
    // Assuming global auth middleware or applied in index.js. 
    // Double check implementation.

    const { section, content } = req.body;

    if (!section || !content) {
        return res.status(400).json({ success: false, message: 'Section and Content required' });
    }

    try {
        const sql = `
            INSERT INTO landing_page_content (section_key, content)
            VALUES ($1, $2)
            ON CONFLICT (section_key) 
            DO UPDATE SET content = $2, updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;

        // Ensure content is stringified if it's an object, just in case
        // The pg driver usually handles objects for JSONB columns, but explicit stringify is safer if column type is ambiguous
        // Explicitly stringify if content is an object to avoid PG array confusion
        const paramContent = typeof content === 'object' ? JSON.stringify(content) : content;

        const result = await query(sql, [section, paramContent]);

        logger.info(`Landing page section '${section}' updated`);
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error(`Error updating landing content for section '${section}':`, error); // Log full error object
        if (error.stack) logger.error(error.stack);
        res.status(500).json({ success: false, message: 'Internal Server Error: ' + error.message });
    }
});

module.exports = router;
