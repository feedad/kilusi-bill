const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { connectToWhatsApp, deleteWhatsAppSession } = require('../../../config/whatsapp');

/**
 * GET /api/v1/baileys/status
 * Cek status koneksi Baileys saat ini
 * Reads from global.whatsappStatus set by config/whatsapp.js
 */
router.get('/status', async (req, res) => {
    try {
        const status = global.whatsappStatus || {
            connected: false,
            qrCode: null,
            phoneNumber: null,
            status: 'disconnected'
        };
        
        res.json({
            success: true,
            data: {
                connected: status.connected,
                user: status.connected ? {
                    id: status.phoneNumber,
                    name: status.phoneNumber
                } : null,
                status: status.status,
                provider: 'baileys'
            }
        });
    } catch (error) {
        logger.error('[Baileys-API] Status check failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/baileys/qr
 * Ambil QR Code terbaru dari global.whatsappStatus
 * Jika tidak ada QR, trigger koneksi ulang untuk generate QR baru
 */
router.get('/qr', async (req, res) => {
    try {
        const status = global.whatsappStatus || {};

        if (status.connected) {
            return res.json({ success: true, message: 'Already connected', data: { connected: true, qr: null } });
        }

        // Jika tidak ada QR code, trigger connect untuk generate QR baru
        if (!status.qrCode) {
            console.log('📱 [Baileys-API] QR not available, triggering connectToWhatsApp()...');
            try {
                // Jalankan connect tanpa menunggu (fire-and-forget) karena QR akan muncul via event listener
                connectToWhatsApp().catch(err => {
                    console.error('❌ [Baileys-API] connectToWhatsApp error:', err.message);
                });
            } catch (connErr) {
                console.error('❌ [Baileys-API] Failed to trigger connect:', connErr.message);
            }
        }

        res.json({
            success: true,
            data: {
                qr: status.qrCode || null,
                status: status.status || 'disconnected',
                instruction: status.qrCode 
                    ? 'Scan QR code ini dengan aplikasi WhatsApp Anda'
                    : 'Menunggu QR code dari server...'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v1/baileys/pair
 * Request pairing code menggunakan nomor telepon
 */
router.post('/pair', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ success: false, message: 'Nomor telepon diperlukan' });

        // Try to get sock from whatsapp-notifications or global
        let waManager = null;
        try {
            const whatsappNotificationManager = require('../../../config/whatsapp-notifications');
            waManager = whatsappNotificationManager;
        } catch (e) {
            // Fallback
        }

        if (waManager && waManager.sock) {
            const code = await waManager.sock.requestPairingCode(phone);
            return res.json({
                success: true,
                data: {
                    code: code,
                    instruction: 'Masukkan kode ini di perangkat WhatsApp Anda'
                }
            });
        }

        res.status(503).json({ success: false, message: 'WhatsApp belum terkoneksi. Silakan coba scan QR terlebih dahulu.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v1/baileys/logout
 * Putuskan koneksi dan hapus session, lalu generate QR baru
 */
router.post('/logout', async (req, res) => {
    try {
        let waManager = null;
        try {
            const whatsappNotificationManager = require('../../../config/whatsapp-notifications');
            waManager = whatsappNotificationManager;
        } catch (e) {
            // Fallback
        }

        if (waManager && waManager.sock) {
            await waManager.sock.logout();
            waManager.sock = null;
        }

        // CRITICAL: Use the full session cleanup to properly reset state
        await deleteWhatsAppSession();

        res.json({ success: true, message: 'Berhasil logout. QR code baru akan segera dibuat.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
