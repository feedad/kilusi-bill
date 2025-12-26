const express = require('express');
const router = express.Router();
const CustomerTokenService = require('../../../services/customer-token-service');
const { query, getOne, getAll } = require('../../../config/database');
const jwt = require('jsonwebtoken');
const whatsappAPI = require('../../../services/whatsapp-cloud-api');

/**
 * In-memory OTP storage (in production, use Redis or database)
 */
const otpStore = new Map();

/**
 * Customer JWT Secret (should be in environment variables)
 */
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'your-customer-jwt-secret-key-change-in-production';

/**
 * Generate JWT token for authenticated customer
 * @param {Object} customer - Customer data
 * @returns {string} JWT token
 */
function generateCustomerJWT(customer) {
    return jwt.sign(
        {
            customerId: customer.id,
            phone: customer.phone,
            type: 'customer'
        },
        CUSTOMER_JWT_SECRET,
        { expiresIn: '30d' }
    );
}

/**
 * Validate token and authenticate customer
 * GET /api/v1/customer-auth/login/:token
 */
router.get('/login/:token', async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token diperlukan'
            });
        }

        // Validate the token
        const validation = await CustomerTokenService.validateToken(token);

        if (!validation.valid) {
            return res.status(401).json({
                success: false,
                message: validation.error || 'Token tidak valid atau sudah kadaluarsa'
            });
        }

        // Generate JWT token for frontend
        const jwtToken = generateCustomerJWT(validation.customer);

        // Return customer data with JWT token
        res.json({
            success: true,
            message: 'Autentikasi berhasil',
            data: {
                customer: validation.customer,
                token: jwtToken,
                expiresIn: '30d'
            }
        });

    } catch (error) {
        console.error('Customer token authentication error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat autentikasi',
            error: error.message
        });
    }
});

/**
 * Login with phone only (bypassing OTP) - requested for easier login
 * POST /api/v1/customer-auth/login-by-phone
 */
router.post('/login-by-phone', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Nomor telepon diperlukan'
            });
        }

        // Clean phone number format
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        let formattedPhone = cleanPhone;

        // Add country code if missing
        if (!cleanPhone.startsWith('62')) {
            if (cleanPhone.startsWith('0')) {
                formattedPhone = '62' + cleanPhone.substring(1);
            } else {
                formattedPhone = '62' + cleanPhone;
            }
        }

        console.log(`📱 Login by phone request: ${phone} -> ${formattedPhone}`);

        // Find customer by phone
        const customer = await getOne(
            'SELECT id, customer_id, name, phone, email, address FROM customers WHERE phone = $1 OR phone = $2 OR phone = $3',
            [phone, formattedPhone, cleanPhone]
        );

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Nomor telepon tidak terdaftar dalam sistem kami'
            });
        }

        // Status check removed as column does not exist
        // if (customer.status !== 'active') { ... }

        // Generate JWT token
        const jwtToken = generateCustomerJWT(customer);

        // Package info lookup removed as package_id column does not exist

        console.log(`✅ Customer ${customer.name} logged in via phone-only`);

        res.json({
            success: true,
            message: 'Login berhasil',
            data: {
                customer: {
                    ...customer,
                    status: 'active', // Default to active since column missing
                    package_name: 'Regular', // Default package
                    package_price: 0,
                    package_speed: 'Unknown'
                },
                token: jwtToken,
                expiresIn: '30d'
            }
        });


    } catch (error) {
        console.error('Login by phone error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat login',
            error: error.message
        });
    }
});

/**
 * Verify customer JWT token (for frontend middleware)
 * POST /api/v1/customer-auth/verify
 */
router.post('/verify', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token diperlukan'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);

        if (decoded.type !== 'customer') {
            return res.status(401).json({
                success: false,
                message: 'Token tidak valid untuk customer'
            });
        }

        // Get fresh customer data
        const customer = await getOne(
            'SELECT id, name, phone, email, pppoe_username, status, package_id FROM customers WHERE id = $1',
            [decoded.customerId]
        );

        if (!customer) {
            return res.status(401).json({
                success: false,
                message: 'Customer tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: 'Token valid',
            data: {
                customer
            }
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token tidak valid'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token sudah kadaluarsa'
            });
        }

        console.error('Token verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat verifikasi token',
            error: error.message
        });
    }
});

/**
 * Login with phone and password (alternative method)
 * POST /api/v1/customer-auth/login
 */
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'Phone dan password diperlukan'
            });
        }

        // Find customer by phone
        const customer = await getOne(
            'SELECT id, name, phone, email, pppoe_username, status, package_id, pppoe_password FROM customers WHERE phone = $1',
            [phone]
        );

        if (!customer) {
            return res.status(401).json({
                success: false,
                message: 'Phone atau password salah'
            });
        }

        // Simple password check (in production, use proper hashing)
        if (customer.pppoe_password !== password) {
            return res.status(401).json({
                success: false,
                message: 'Phone atau password salah'
            });
        }

        // Generate JWT token
        const jwtToken = generateCustomerJWT(customer);

        res.json({
            success: true,
            message: 'Login berhasil',
            data: {
                customer: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    email: customer.email,
                    username: customer.pppoe_username,
                    status: customer.status,
                    package_id: customer.package_id
                },
                token: jwtToken,
                expiresIn: '30d'
            }
        });

    } catch (error) {
        console.error('Customer login error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat login',
            error: error.message
        });
    }
});

/**
 * Refresh customer token
 * POST /api/v1/customer-auth/refresh
 */
router.post('/refresh', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token diperlukan'
            });
        }

        // Verify current token (even if expired)
        const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET, { ignoreExpiration: true });

        if (decoded.type !== 'customer') {
            return res.status(401).json({
                success: false,
                message: 'Token tidak valid untuk customer'
            });
        }

        // Get fresh customer data
        const customer = await getOne(
            'SELECT id, name, phone, email, pppoe_username, status, package_id FROM customers WHERE id = $1',
            [decoded.customerId]
        );

        if (!customer || customer.status !== 'active') {
            return res.status(401).json({
                success: false,
                message: 'Customer tidak aktif atau tidak ditemukan'
            });
        }

        // Generate new JWT token
        const newToken = generateCustomerJWT(customer);

        res.json({
            success: true,
            message: 'Token berhasil diperbarui',
            data: {
                customer,
                token: newToken,
                expiresIn: '30d'
            }
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui token',
            error: error.message
        });
    }
});

/**
 * Logout customer (client-side only, but we can track it)
 * POST /api/v1/customer-auth/logout
 */
router.post('/logout', async (req, res) => {
    try {
        const { token } = req.body;

        if (token) {
            try {
                // Verify token to get customer ID for logging
                const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET, { ignoreExpiration: true });
                console.log(`Customer ${decoded.customerId} logged out`);
            } catch (err) {
                // Token invalid, but that's fine for logout
                console.log('Logout with invalid token');
            }
        }

        res.json({
            success: true,
            message: 'Logout berhasil'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat logout',
            error: error.message
        });
    }
});

/**
 * Get customer info from token
 * GET /api/v1/customer-auth/me
 */
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Token diperlukan'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify JWT token
        const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);

        if (decoded.type !== 'customer') {
            return res.status(401).json({
                success: false,
                message: 'Token tidak valid untuk customer'
            });
        }

        // Get customer data
        const customer = await getOne(
            'SELECT c.id, c.name, c.phone, c.email, c.pppoe_username, c.status, c.package_id, p.name as package_name, p.price, p.speed FROM customers c LEFT JOIN packages p ON c.package_id = p.id WHERE c.id = $1',
            [decoded.customerId]
        );

        if (!customer) {
            return res.status(401).json({
                success: false,
                message: 'Customer tidak ditemukan'
            });
        }

        // Format customer data to include package object
        const formattedCustomer = {
            ...customer,
            package: customer.package_name ? {
                name: customer.package_name,
                price: customer.price,
                speed: customer.speed
            } : null
        };

        res.json({
            success: true,
            data: {
                customer: formattedCustomer
            }
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token tidak valid'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token sudah kadaluarsa'
            });
        }

        console.error('Get customer info error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data customer',
            error: error.message
        });
    }
});

/**
 * Generate 6-digit OTP
 * @returns {string} 6-digit OTP
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Clean expired OTPs (older than 5 minutes)
 */
function cleanExpiredOTPs() {
    const now = Date.now();
    const expireTime = 5 * 60 * 1000; // 5 minutes

    for (const [phone, data] of otpStore.entries()) {
        if (now - data.timestamp > expireTime) {
            otpStore.delete(phone);
        }
    }
}

/**
 * Send OTP to customer phone number
 * POST /api/v1/customer-auth/otp
 */
router.post('/otp', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Nomor telepon diperlukan'
            });
        }

        // Clean phone number format
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        let formattedPhone = cleanPhone;

        // Add country code if missing
        if (!cleanPhone.startsWith('62')) {
            if (cleanPhone.startsWith('0')) {
                formattedPhone = '62' + cleanPhone.substring(1);
            } else {
                formattedPhone = '62' + cleanPhone;
            }
        }

        console.log(`📱 OTP request for phone: ${phone} -> formatted: ${formattedPhone}`);

        // Check if customer exists
        const customer = await getOne(
            'SELECT id, name, phone, status FROM customers WHERE phone = $1 OR phone = $2 OR phone = $3',
            [phone, formattedPhone, cleanPhone]
        );

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Nomor telepon tidak terdaftar dalam sistem kami'
            });
        }

        if (customer.status !== 'active') {
            return res.status(401).json({
                success: false,
                message: 'Akun pelanggan tidak aktif. Silakan hubungi admin.'
            });
        }

        // Clean expired OTPs
        cleanExpiredOTPs();

        // Check rate limiting (max 3 OTPs per 5 minutes)
        const existingOTP = otpStore.get(formattedPhone);
        const now = Date.now();
        const rateLimitWindow = 5 * 60 * 1000; // 5 minutes

        if (existingOTP && (now - existingOTP.timestamp < rateLimitWindow) && existingOTP.attempts >= 3) {
            return res.status(429).json({
                success: false,
                message: 'Terlalu banyak permintaan OTP. Silakan coba lagi dalam 5 menit.'
            });
        }

        // Generate new OTP
        const otp = generateOTP();
        const expiresAt = now + (5 * 60 * 1000); // 5 minutes

        // Store OTP
        const otpData = existingOTP || { attempts: 0 };
        otpStore.set(formattedPhone, {
            otp: otp,
            timestamp: now,
            expiresAt: expiresAt,
            attempts: otpData.attempts + 1,
            customerId: customer.id
        });

        console.log(`🔐 Generated OTP for ${formattedPhone}: ${otp} (expires: ${new Date(expiresAt)})`);

        // Development mode - log OTP to console
        console.log(`\n🔐 DEVELOPMENT MODE - OTP FOR TESTING:`);
        console.log(`📱 Phone: ${formattedPhone} (${customer.name})`);
        console.log(`⚠️  OTP: ${otp}`);
        console.log(`⏰ Expires: ${new Date(expiresAt).toLocaleString('id-ID')}`);
        console.log(`👆 Copy this OTP for testing\n`);

        // Try to send via WhatsApp (if configured)
        let whatsappSent = false;
        let whatsappError = null;

        try {
            const message = `🔐 *KODE OTP KILUSI BILL*\n\nHai ${customer.name},\n\nKode OTP untuk login ke Portal Pelanggan:\n\n*${otp}*\n\n⏰ Berlaku 5 menit\n🚫 Jangan berikan kode ini kepada siapa pun!\n\nJika Anda tidak meminta ini, abaikan pesan ini.\n\n- PT Kilusi Digital Network`;

            const whatsappResult = await whatsappAPI.sendTextMessage(formattedPhone, message);

            if (whatsappResult.success) {
                whatsappSent = true;
                console.log(`✅ OTP also sent via WhatsApp to ${formattedPhone}`);
            } else {
                whatsappError = whatsappResult.error;
                console.warn(`⚠️ WhatsApp not available: ${whatsappError}`);
            }
        } catch (error) {
            whatsappError = error.message;
            console.warn(`⚠️ WhatsApp service not configured or failed: ${error.message}`);
        }

        // Send response with development info
        const responseMessage = whatsappSent
            ? `OTP berhasil dikirim ke WhatsApp ${customer.phone}`
            : `OTP berhasil dibuat. Kode ditampilkan di console (development mode)${process.env.NODE_ENV === 'production' ? '. Silakan hubungi admin.' : ''}`;

        res.json({
            success: true,
            message: responseMessage,
            data: {
                phone: customer.phone,
                otp: otp, // Always show OTP on screen for development/testing
                expiresIn: 300, // 5 minutes in seconds
                attemptsLeft: 3 - (otpData.attempts + 1),
                whatsappSent: whatsappSent,
                whatsappError: whatsappError,
                developmentMode: process.env.NODE_ENV === 'development'
            }
        });

    } catch (error) {
        console.error('OTP request error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat meminta OTP',
            error: error.message
        });
    }
});

/**
 * Verify OTP and authenticate customer
 * POST /api/v1/customer-auth/verify-otp
 */
router.post('/verify-otp', async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Nomor telepon dan OTP diperlukan'
            });
        }

        // Clean phone number format
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        let formattedPhone = cleanPhone;

        // Add country code if missing
        if (!cleanPhone.startsWith('62')) {
            if (cleanPhone.startsWith('0')) {
                formattedPhone = '62' + cleanPhone.substring(1);
            } else {
                formattedPhone = '62' + cleanPhone;
            }
        }

        // Clean expired OTPs
        cleanExpiredOTPs();

        // Get stored OTP
        const storedData = otpStore.get(formattedPhone);

        if (!storedData) {
            return res.status(401).json({
                success: false,
                message: 'OTP tidak ditemukan atau telah kadaluarsa. Silakan minta OTP baru.'
            });
        }

        // Check if OTP is expired
        const now = Date.now();
        if (now > storedData.expiresAt) {
            otpStore.delete(formattedPhone);
            return res.status(401).json({
                success: false,
                message: 'OTP telah kadaluarsa. Silakan minta OTP baru.'
            });
        }

        // Verify OTP
        if (storedData.otp !== otp) {
            return res.status(401).json({
                success: false,
                message: 'OTP tidak valid. Silakan periksa kembali kode Anda.'
            });
        }

        // OTP is valid, authenticate customer
        const customer = await getOne(
            'SELECT id, name, phone, email, pppoe_username, status, package_id, address FROM customers WHERE id = $1',
            [storedData.customerId]
        );

        if (!customer || customer.status !== 'active') {
            return res.status(401).json({
                success: false,
                message: 'Akun pelanggan tidak aktif atau tidak ditemukan'
            });
        }

        // Clean OTP after successful verification
        otpStore.delete(formattedPhone);

        // Generate JWT token
        const jwtToken = generateCustomerJWT(customer);

        // Get package info
        const packageInfo = await getOne(
            'SELECT name as package_name, price, speed FROM packages WHERE id = $1',
            [customer.package_id]
        );

        console.log(`✅ Customer ${customer.name} authenticated successfully via OTP`);

        res.json({
            success: true,
            message: 'Login berhasil',
            data: {
                customer: {
                    ...customer,
                    package_name: packageInfo?.package_name || null,
                    package_price: packageInfo?.price || null,
                    package_speed: packageInfo?.speed || null
                },
                token: jwtToken,
                expiresIn: '30d'
            }
        });

    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat verifikasi OTP',
            error: error.message
        });
    }
});

/**
 * Resend OTP (rate limited)
 * POST /api/v1/customer-auth/resend-otp
 */
router.post('/resend-otp', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Nomor telepon diperlukan'
            });
        }

        // Check if there's an existing OTP
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        let formattedPhone = cleanPhone;

        if (!cleanPhone.startsWith('62')) {
            if (cleanPhone.startsWith('0')) {
                formattedPhone = '62' + cleanPhone.substring(1);
            } else {
                formattedPhone = '62' + cleanPhone;
            }
        }

        const existingOTP = otpStore.get(formattedPhone);
        const now = Date.now();
        const resendCooldown = 60 * 1000; // 1 minute cooldown

        if (existingOTP && (now - existingOTP.timestamp < resendCooldown)) {
            const remainingTime = Math.ceil((resendCooldown - (now - existingOTP.timestamp)) / 1000);
            return res.status(429).json({
                success: false,
                message: `Silakan tunggu ${remainingTime} detik sebelum meminta OTP kembali`
            });
        }

        // Forward to OTP endpoint (this will create new OTP)
        req.body.phone = phone;
        return router.handle(Object.assign(req, { originalUrl: req.originalUrl }), res);

    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim ulang OTP',
            error: error.message
        });
    }
});


module.exports = router;