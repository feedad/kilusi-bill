const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');
const onuLifecycle = require('../../../config/onu-lifecycle');

function parseBool(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

// GET /api/v1/onu-lifecycle/scan?olt_id=&customer_id=
// Read-only review of detected ONU replacements. Never writes to the OLT.
router.get('/scan', async (req, res) => {
    try {
        const oltId = req.query.olt_id || null;
        const customerId = req.query.customer_id || null;
        const result = await onuLifecycle.scanOnuChanges({ oltId, customerId });

        res.json({
            success: true,
            data: result,
            message: `Scan selesai. ${result.summary.rename_new} ONU baru, ${result.summary.mark_old} ONU lama, ${result.summary.sync_mac} sinkron MAC.`
        });
    } catch (error) {
        logger.error(`[ONU Lifecycle] scan gagal: ${error.message}`);
        res.status(500).json({ success: false, message: `Gagal scan perubahan ONU: ${error.message}` });
    }
});

// POST /api/v1/onu-lifecycle/apply
// body: { items: [...], mark_old?: boolean, dry_run?: boolean }
router.post('/apply', async (req, res) => {
    try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (items.length === 0) {
            return res.status(400).json({ success: false, message: 'Tidak ada item yang dipilih.' });
        }

        const markOld = parseBool(req.body?.mark_old, true);
        const dryRun = parseBool(req.body?.dry_run, false);

        const result = await onuLifecycle.applyOnuChanges(items, {
            markOld,
            dryRun,
            source: req.user?.username ? `manual:${req.user.username}` : 'manual'
        });

        res.json({
            success: true,
            data: result,
            message: dryRun
                ? `Dry run: ${result.skipped} item akan diproses.`
                : `Selesai. ${result.applied} berhasil, ${result.failed} gagal, ${result.skipped} dilewati.`
        });
    } catch (error) {
        logger.error(`[ONU Lifecycle] apply gagal: ${error.message}`);
        res.status(500).json({ success: false, message: `Gagal menerapkan perubahan ONU: ${error.message}` });
    }
});

// GET /api/v1/onu-lifecycle/log?limit=50
router.get('/log', async (req, res) => {
    try {
        const rows = await onuLifecycle.recentChanges(req.query.limit);
        res.json({ success: true, data: rows });
    } catch (error) {
        logger.error(`[ONU Lifecycle] log gagal: ${error.message}`);
        res.status(500).json({ success: false, message: 'Gagal mengambil riwayat perubahan ONU.' });
    }
});

// GET /api/v1/onu-lifecycle/settings
router.get('/settings', async (req, res) => {
    try {
        const res2 = await query(
            `SELECT key, value FROM app_config WHERE key IN ('onu_auto_sync_enabled', 'onu_auto_mark_old_enabled')`
        );
        const map = {};
        for (const row of res2.rows || []) map[row.key] = row.value === 'true' || row.value === '1';
        res.json({
            success: true,
            data: {
                auto_sync_enabled: Boolean(map.onu_auto_sync_enabled),
                auto_mark_old_enabled: Boolean(map.onu_auto_mark_old_enabled)
            }
        });
    } catch (error) {
        logger.error(`[ONU Lifecycle] settings gagal: ${error.message}`);
        res.status(500).json({ success: false, message: 'Gagal membaca pengaturan ONU.' });
    }
});

// PUT /api/v1/onu-lifecycle/settings
// body: { auto_sync_enabled?: boolean, auto_mark_old_enabled?: boolean }
router.put('/settings', async (req, res) => {
    try {
        const updates = [];
        if (req.body?.auto_sync_enabled !== undefined) {
            updates.push(['onu_auto_sync_enabled', parseBool(req.body.auto_sync_enabled)]);
        }
        if (req.body?.auto_mark_old_enabled !== undefined) {
            updates.push(['onu_auto_mark_old_enabled', parseBool(req.body.auto_mark_old_enabled)]);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'Tidak ada pengaturan yang dikirim.' });
        }

        for (const [key, value] of updates) {
            await query(
                `INSERT INTO app_config (key, value, category, description)
                 VALUES ($1, $2, 'olt', 'ONU lifecycle')
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
                [key, value ? 'true' : 'false']
            );
        }

        res.json({ success: true, message: 'Pengaturan ONU diperbarui.' });
    } catch (error) {
        logger.error(`[ONU Lifecycle] update settings gagal: ${error.message}`);
        res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan ONU.' });
    }
});

module.exports = router;
