// Load environment variables early
require('dotenv').config();

const express = require('express');
const path = require('path');
const axios = require('axios');
const { logger } = require('./config/logger');
const whatsapp = require('./config/whatsapp');
const MikrotikService = require('./services/mikrotik-service');
const fs = require('fs');
const session = require('express-session');
const settingsManager = require('./config/settingsManager');
const { getSetting } = settingsManager;
const EventEmitter = require('events');

// Initialize settings (async) - Fire and forget for now, or await wrapping main?
// Since app.js is top-level sync, we call it and let it resolve in background.
// Early requests might use fallback file settings.
settingsManager.initialize().then(() => {
    logger.info('✅ SettingsManager fully initialized in background');
}).catch(err => {
    logger.error(`❌ SettingsManager initialization failed: ${err.message}`);
});
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

// Legacy admin routes removed - using Next.js frontend

// Inisialisasi aplikasi Express
const app = express();

// 🔊 Setup global event system untuk settings broadcast
global.appEvents = new EventEmitter();
global.appEvents.setMaxListeners(20); // Increase limit untuk multiple listeners

// Event listener untuk settings update
global.appEvents.on('settings:updated', (newSettings) => {
    logger.info(`📡 Settings update event received: ${Object.keys(newSettings).length} fields`);

    // Future: Notify other components yang perlu reload settings
    // Contoh: WhatsApp module, GenieACS module, dll
});

// Auto-sync ke RADIUS ketika ada perubahan data pelanggan
try {
    const radiusSync = require('./config/radius-sync');
    global.appEvents.on('customer:upsert', async (customer) => {
        try {
            // Hanya sync jika ada kredensial PPPoE (username+password)
            const uname = customer && (customer.pppoe_username || customer.username);
            const pwd = customer && (customer.pppoe_password || customer.password);
            if (uname && pwd) {
                logger.info(`🔄 Auto RADIUS sync for customer: ${uname}`);
                await radiusSync.syncCustomerToRadius(customer);
            } else {
                logger.debug('Skipping auto RADIUS sync: missing PPPoE credentials');
            }
        } catch (e) {
            logger.warn(`Auto RADIUS sync warning: ${e.message}`);
        }
    });
} catch (e) {
    logger.warn(`RADIUS auto-sync hook not initialized: ${e.message}`);
}

// Global safeguard for RouterOS tag errors to prevent process crash
process.on('uncaughtException', (err) => {
    const msg = err && err.message ? err.message : String(err);
    if (msg.includes('unregistered tag')) {
        logger.warn('Caught RouterOS unregistered tag error at process level. Resetting Mikrotik connection...');
        try { MikrotikService.resetMikrotikConnection(); } catch (_) { }
        // Do not exit; allow system to continue and reconnect lazily
        return;
    }
    // Log other unexpected exceptions without exiting in dev mode
    logger.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});

// Pre-load settings untuk mempercepat admin login pertama kali
(function preloadSettings() {
    try {
        const settingsPath = path.join(__dirname, 'settings.json');

        if (!fs.existsSync(settingsPath)) {
            logger.info('📝 Creating initial settings.json for faster first-time login');

            const initialSettings = {
                admin_username: 'admin',
                admin_password: 'admin',
                genieacs_url: 'http://localhost:7557',
                genieacs_username: 'admin',
                genieacs_password: 'password',
                mikrotik_host: '192.168.1.1',
                mikrotik_port: '8728',
                mikrotik_user: 'admin',
                mikrotik_password: 'password',
                main_interface: 'ether1',
                company_header: 'ISP Monitor',
                footer_info: 'Powered by Kilusi',
                server_port: '3001',
                server_host: 'localhost',
                customerPortalOtp: 'false',
                otp_length: '6',
                pppoe_monitor_enable: 'true',
                rx_power_warning: '-37',
                rx_power_critical: '-40',
                whatsapp_keep_alive: 'true',
                user_auth_mode: 'mikrotik'
            };

            try {
                fs.writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2), 'utf8');
                logger.info('✅ Initial settings.json created successfully');
            } catch (writeError) {
                logger.error('❌ Failed to create initial settings.json:', writeError.message);
            }
        } else {
            // Validate existing settings
            try {
                const settingsData = fs.readFileSync(settingsPath, 'utf8');
                const settings = JSON.parse(settingsData);

                // Pre-cache di memory untuk akses cepat
                global.preloadedSettings = settings;

                logger.info(`✅ Settings pre-loaded: ${Object.keys(settings).length} fields`);
            } catch (parseError) {
                logger.warn('⚠️ Settings.json exists but invalid format:', parseError.message);
            }
        }
    } catch (error) {
        logger.error('❌ Error during settings pre-load:', error.message);
    }
})();

// Import middleware
const { injectSettings } = require('./config/middleware');

// Import response middleware for RESTful API standardization
const { responseHandler, errorHandler: responseErrorHandler, requestId } = require('./middleware/response');

// Middleware dasar dengan optimasi
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Debug logging untuk customer requests
// Debug logging removed for security and cleanliness



// Security headers
// Get current origin for CSP configuration
const currentOrigin = process.env.ALLOWED_ORIGINS ?
    process.env.ALLOWED_ORIGINS.split(',')[0] :
    `http://localhost:${process.env.PORT || 3001}`;

// Extract hostname for wildcard matching
const originHost = new URL(currentOrigin).hostname;

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false, // We'll define our own policies
        directives: {
            defaultSrc: ["'self'"],
            // Allow inline styles and CDN styles
            styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdn.datatables.net', 'unpkg.com', 'cdnjs.cloudflare.com'],
            // Allow inline scripts for event handlers and CDN scripts
            scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'code.jquery.com', 'cdn.datatables.net', 'unpkg.com', 'cdnjs.cloudflare.com'],
            // Allow inline script attributes
            scriptSrcAttr: ["'unsafe-inline'"],
            // Allow form submissions to same origin and subdomains
            formAction: ["'self'", `http://${originHost}`, `https://${originHost}`],
            // Images may include data URIs and external sources
            imgSrc: ["'self'", 'data:', 'https:', 'http:', '*.tile.openstreetmap.org', '*.openstreetmap.org'],
            // Allow connections to APIs and services
            connectSrc: ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
            // Fonts from CDN and data URIs
            fontSrc: ["'self'", 'data:', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
            // Allow iframes for embedded content
            frameSrc: ["'self'"],
            // Allow media from various sources
            mediaSrc: ["'self'"],
            // Allow object sources
            objectSrc: ["'none'"],
            // Base URI restrictions
            baseUri: ["'self'"],
            // Allow manifest files
            manifestSrc: ["'self'"],
            // Child sources
            childSrc: ["'self'"],
            // Worker sources
            workerSrc: ["'self'", 'blob:'],
            // Frame ancestors
            frameAncestors: ["'self'"],
            // Upgrade insecure requests in production - disabled for development
            upgradeInsecureRequests: null
        }
    },
    // Disable headers that require HTTPS in development
    originAgentCluster: false, // Disabled to avoid HTTPS enforcement
    hsts: false, // Disable HSTS to allow HTTP access
    crossOriginEmbedderPolicy: false, // Disable to avoid conflicts
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false // Disabled to avoid HTTPS enforcement
}));

// CORS (allow configured origins or localhost default)
// CORS (allow configured origins or localhost default)
const defaultOrigins = [
    'http://localhost',
    'http://localhost:80',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8080',
    'http://127.0.0.1',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:8080'
];

// Combine default local origins with environment-specified origins
let allowedOrigins = [...defaultOrigins];
if (process.env.ALLOWED_ORIGINS) {
    const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
    allowedOrigins = [...allowedOrigins, ...envOrigins];
}
// Remove trailing slashes for consistency
allowedOrigins = allowedOrigins.map(o => o.replace(/\/$/, ""));

// Ensure uniqueness
allowedOrigins = [...new Set(allowedOrigins)];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Check against static whitelist
        if (allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }

        // Check against Regex for Local Network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        const isLocalNetwork = /^(http|https):\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);
        if (isLocalNetwork) {
            return callback(null, true);
        }

        // Allow localhost regex (dynamic ports)
        const isLocalhost = /^(http|https):\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (isLocalhost) {
            return callback(null, true);
        }

        // Default: Block
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
    },
    credentials: true, // Enable credentials for cookie/session support
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-customer-phone', 'X-Customer-Phone']
};

app.use(cors(corsOptions));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many login attempts. Please try again later.'
});

// TEMPORARILY DISABLE RATE LIMITING FOR TESTING
// app.use('/api', apiLimiter);

// Input sanitization and security
const { sanitizeInput, xssProtection } = require('./middleware/validation');
app.use(sanitizeInput);
app.use(xssProtection);

// Session configuration (use ENV secret)
const crypto = require('crypto');
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Add request ID middleware for tracking
app.use(requestId());

// Add response handler middleware for standardized API responses
app.use('/api', responseHandler());

// Swagger API Documentation
const swaggerConfig = require('./config/swagger');
app.use('/api/docs', swaggerConfig.serve, swaggerConfig.setup);

// Inject settings to all views
app.use(injectSettings);

// Middleware untuk optimasi admin settings access
app.use('/admin/setting', (req, res, next) => {
    // Pre-populate settings data jika tersedia di global cache
    if (global.preloadedSettings && req.method === 'GET' && req.path === '/') {
        req.cachedSettings = global.preloadedSettings;
    }
    next();
});


// Legacy admin and tools routes removed - handled by Next.js frontend


// Route untuk halaman test trouble report (Development Only)
if (process.env.NODE_ENV !== 'production') {
    app.get('/test-trouble-report', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'test-trouble-report.html'));
    });

    // Route test trouble report langsung
    app.get('/test-trouble-direct', async (req, res) => {
        try {
            const { createTroubleReport, updateTroubleReportStatus } = require('./config/troubleReport');
            const { logger } = require('./config/logger');

            logger.info('🧪 Test trouble report langsung dimulai...');

            const testReport = {
                phone: '081234567890',
                name: 'Test User Direct',
                location: 'Test Location Direct',
                category: 'Internet Lambat',
                description: 'Test deskripsi masalah internet lambat untuk testing notifikasi WhatsApp - test langsung'
            };

            const newReport = createTroubleReport(testReport);

            if (newReport) {
                logger.info(`✅ Laporan gangguan berhasil dibuat dengan ID: ${newReport.id}`);

                // Test update status setelah 3 detik
                setTimeout(async () => {
                    logger.info(`🔄 Test update status untuk laporan ${newReport.id}...`);
                    const updatedReport = updateTroubleReportStatus(
                        newReport.id,
                        'in_progress',
                        'Test update status dari test langsung - sedang ditangani',
                        true // sendNotification = true
                    );

                    if (updatedReport) {
                        logger.info(`✅ Status laporan berhasil diupdate ke: ${updatedReport.status}`);
                    }
                }, 3000);

                res.json({
                    success: true,
                    message: 'Test trouble report berhasil dijalankan',
                    report: newReport,
                    note: 'Status akan diupdate otomatis dalam 3 detik. Cek log server untuk melihat notifikasi WhatsApp.'
                });
            } else {
                logger.error('❌ Gagal membuat laporan gangguan');
                res.status(500).json({
                    success: false,
                    message: 'Gagal membuat laporan gangguan'
                });
            }
        } catch (error) {
            logger.error('❌ Error dalam test trouble report:', error.message);
            res.status(500).json({
                success: false,
                message: 'Error dalam test trouble report',
                error: error.message
            });
        }
    });

    // Route test restart device
    app.get('/test-restart-device', (req, res) => {
        res.sendFile(path.join(__dirname, 'test-restart-device.html'));
    });

    // Route test session
    app.get('/test-session', (req, res) => {
        res.sendFile(path.join(__dirname, 'test-session.html'));
    });

    // Route test restart device web interface
    app.get('/test-restart-web', (req, res) => {
        res.sendFile(path.join(__dirname, 'test-restart-web.html'));
    });

    // Route test frontend debug
    app.get('/test-frontend-debug', (req, res) => {
        res.sendFile(path.join(__dirname, 'test-frontend-debug.html'));
    });

    // Route test dashboard simple
    app.get('/test-dashboard-simple', (req, res) => {
        res.sendFile(path.join(__dirname, 'test-dashboard-simple.html'));
    });
}

// Route RADIUS management page
// NOTE: RADIUS page is served via routes/adminRadius.js which renders EJS view.
// The legacy static HTML handler has been removed to avoid overriding the router.

// Route test upload logo tanpa auth
app.get('/test-upload-logo', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Test Upload Logo</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .form-group { margin: 10px 0; }
                input[type="file"] { margin: 10px 0; }
                button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
                .result { margin: 10px 0; padding: 10px; border-radius: 5px; }
                .success { background: #d4edda; color: #155724; }
                .error { background: #f8d7da; color: #721c24; }
            </style>
        </head>
        <body>
            <h2>Test Upload Logo</h2>
            <form id="uploadForm" enctype="multipart/form-data">
                <div class="form-group">
                    <label>Pilih file logo:</label><br>
                    <input type="file" name="logo" accept="image/*" required>
                </div>
                <button type="submit">Upload Logo</button>
            </form>
            <div id="result"></div>
            
            <script>
                document.getElementById('uploadForm').addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    const formData = new FormData(this);
                    const resultDiv = document.getElementById('result');
                    
                    fetch('/admin/setting/upload-logo', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            resultDiv.innerHTML = '<div class="result success">✓ ' + data.message + '</div>';
                        } else {
                            resultDiv.innerHTML = '<div class="result error">✗ ' + data.error + '</div>';
                        }
                    })
                    .catch(error => {
                        resultDiv.innerHTML = '<div class="result error">✗ Error: ' + error.message + '</div>';
                    });
                });
            </script>
        </body>
        </html>
    `);
});


// Legacy apiDashboard and apiExternal routes removed - use /api/v1 instead


// Import dan gunakan route API v1 untuk Next.js frontend
const apiV1Router = require('./routes/api/v1');
app.use('/api/v1', apiV1Router);


// Konstanta
const VERSION = '1.0.0';

// Variabel global untuk menyimpan status koneksi WhatsApp
global.whatsappStatus = {
    connected: false,
    qrCode: null,
    phoneNumber: null,
    connectedSince: null,
    status: 'disconnected'
};

// Variabel global untuk menyimpan semua pengaturan dari settings.json
global.appSettings = {
    // Server
    port: getSetting('server_port', 3001),
    host: getSetting('server_host', 'localhost'),

    // Admin
    adminUsername: getSetting('admin_username', 'admin'),
    adminPassword: getSetting('admin_password', 'admin'),

    // GenieACS
    genieacsUrl: getSetting('genieacs_url', 'http://localhost:7557'),
    genieacsUsername: getSetting('genieacs_username', ''),
    genieacsPassword: getSetting('genieacs_password', ''),

    // Mikrotik
    mikrotikHost: getSetting('mikrotik_host', ''),
    mikrotikUser: getSetting('mikrotik_user', ''),
    mikrotikPassword: getSetting('mikrotik_password', ''),

    // WhatsApp
    adminNumber: getSetting('admins', [''])[0] || '',
    technicianNumbers: getSetting('technician_numbers', []).join(','),
    reconnectInterval: 5000,
    maxReconnectRetries: 5,
    whatsappSessionPath: getSetting('whatsapp_session_path', './whatsapp-session'),
    whatsappKeepAlive: getSetting('whatsapp_keep_alive', true),
    whatsappRestartOnError: getSetting('whatsapp_restart_on_error', true),

    // Monitoring
    pppoeMonitorInterval: getSetting('pppoe_monitor_interval_minutes', 1) * 60 * 1000, // Convert menit ke ms
    rxPowerWarning: getSetting('rx_power_warning', -37),
    rxPowerCritical: getSetting('rx_power_critical', -40),
    rxPowerNotificationEnable: getSetting('rx_power_notification_enable', true),
    rxPowerNotificationInterval: getSetting('rx_power_notification_interval_minutes', 5) * 60 * 1000, // Convert menit ke ms

    // Company Info
    companyHeader: getSetting('company_header', 'ISP Monitor'),
    footerInfo: getSetting('footer_info', ''),
};

// Override port/host with environment variables if provided
if (process.env.PORT) {
    global.appSettings.port = process.env.PORT.toString();
}
if (process.env.HOST) {
    global.appSettings.host = process.env.HOST;
}

// Pastikan direktori sesi WhatsApp ada
const sessionDir = global.appSettings.whatsappSessionPath || './whatsapp-session';
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    logger.info(`Direktori sesi WhatsApp dibuat: ${sessionDir}`);
}

// Route untuk health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: VERSION,
        whatsapp: global.whatsappStatus.status
    });
});


// Mobile dashboard routes removed - now handled by Next.js frontend at /customer/portal


// Route test sederhana
app.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        data: {
            devices: 111,
            customers: 4,
            invoices: 2,
            troubleReports: 0
        }
    });
});

// Route debug mobile customer
app.get('/debug-mobile', async (req, res) => {
    try {
        const { getAllCustomers } = require('./config/billing');
        const customers = getAllCustomers();

        res.json({
            success: true,
            message: 'Debug mobile customer data',
            customers: customers.map(c => ({
                id: c.id,
                phone: c.phone,
                username: c.username,
                name: c.name
            })),
            testPhone: '081321960111',
            foundCustomer: customers.find(c =>
                c.phone === '081321960111' ||
                c.username === '081321960111' ||
                c.phone === '081321960111'.replace(/^0/, '62') ||
                c.phone === '081321960111'.replace(/^62/, '0')
            )
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Route untuk mendapatkan status WhatsApp
app.get('/whatsapp/status', (req, res) => {
    res.json({
        status: global.whatsappStatus.status,
        connected: global.whatsappStatus.connected,
        phoneNumber: global.whatsappStatus.phoneNumber,
        connectedSince: global.whatsappStatus.connectedSince
    });
});

// Route untuk mendapatkan QR code WhatsApp
app.get('/whatsapp/qr', (req, res) => {
    res.json({
        success: true,
        qrCode: global.whatsappStatus.qrCode,
        status: global.whatsappStatus.status,
        connected: global.whatsappStatus.connected
    });
});

// Route untuk refresh QR code WhatsApp
app.post('/whatsapp/qr/refresh', async (req, res) => {
    try {
        // Import whatsapp module untuk restart koneksi
        const whatsapp = require('./config/whatsapp');

        // Clear current QR code dan status
        global.whatsappStatus.qrCode = null;
        global.whatsappStatus.status = 'reconnecting';

        // Restart WhatsApp connection untuk generate QR baru
        logger.info('🔄 Refreshing WhatsApp QR code...');

        // Implementation sederhana - clear status saja dulu
        // QR code akan digenerate otomatis oleh WhatsApp module
        setTimeout(() => {
            global.whatsappStatus.status = 'waiting_for_qr';
        }, 1000);

        res.json({
            success: true,
            message: 'QR code refresh initiated',
            status: global.whatsappStatus.status
        });
    } catch (error) {
        logger.error('Error refreshing QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh QR code'
        });
    }
});

// Route untuk clear session WhatsApp
app.delete('/whatsapp/clear-session', async (req, res) => {
    try {
        logger.info('🗑️ [API] Clear WhatsApp session requested');

        // Import whatsapp module
        const whatsapp = require('./config/whatsapp');
        const fs = require('fs');
        const path = require('path');

        // Clear session directory
        const sessionDir = global.appSettings.whatsappSessionPath || './whatsapp-session';
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                fs.unlinkSync(path.join(sessionDir, file));
            }
            logger.info(`✅ Cleared ${files.length} session files from ${sessionDir}`);
        }

        // Reset global status
        global.whatsappStatus = {
            connected: false,
            qrCode: null,
            phoneNumber: null,
            connectedSince: null,
            status: 'disconnected'
        };

        res.json({
            success: true,
            message: 'WhatsApp session cleared successfully'
        });
    } catch (error) {
        logger.error('Error clearing WhatsApp session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear WhatsApp session'
        });
    }
});

// Route untuk WhatsApp templates (mock response)
app.get('/whatsapp/templates', (req, res) => {
    res.json({
        success: true,
        data: {
            welcome: {
                id: 'welcome',
                name: 'Welcome Message',
                content: 'Hello {{name}}, welcome to our service!',
                category: 'general',
                enabled: true
            },
            invoice_reminder: {
                id: 'invoice_reminder',
                name: 'Invoice Reminder',
                content: 'Hi {{name}}, your invoice of {{amount}} is due on {{due_date}}.',
                category: 'billing',
                enabled: true
            },
            payment_confirmation: {
                id: 'payment_confirmation',
                name: 'Payment Confirmation',
                content: 'Thank you {{name}}, your payment of {{amount}} has been received.',
                category: 'billing',
                enabled: true
            }
        }
    });
});

// Route untuk WhatsApp message history (mock response)
app.get('/whatsapp/history', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Mock data for message history
    const mockMessages = [
        {
            id: '1',
            to: '+628123456789',
            message: 'Test message 1',
            status: 'sent',
            sentAt: new Date(Date.now() - 3600000).toISOString(),
            type: 'text'
        },
        {
            id: '2',
            to: '+628987654321',
            message: 'Test message 2',
            status: 'delivered',
            sentAt: new Date(Date.now() - 7200000).toISOString(),
            type: 'text'
        }
    ];

    res.json({
        success: true,
        data: {
            messages: mockMessages,
            total: mockMessages.length,
            page: page,
            totalPages: 1
        }
    });
});

// POST /whatsapp/templates - Create new template
app.post('/whatsapp/templates', (req, res) => {
    try {
        const { id, name, content, category, enabled } = req.body;

        if (!id || !name || !content || !category) {
            return res.status(400).json({
                success: false,
                message: 'Template data is incomplete'
            });
        }

        res.status(201).json({
            success: true,
            data: {
                id,
                name,
                content,
                category,
                enabled: enabled !== false
            },
            message: 'Template created successfully'
        });
    } catch (error) {
        logger.error('Error creating template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create template'
        });
    }
});

// PUT /whatsapp/templates/:id - Update template
app.put('/whatsapp/templates/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, content, category, enabled } = req.body;

        res.json({
            success: true,
            data: {
                id,
                name: name || 'Updated Template',
                content: content || 'Updated content',
                category: category || 'general',
                enabled: enabled !== false
            },
            message: 'Template updated successfully'
        });
    } catch (error) {
        logger.error('Error updating template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update template'
        });
    }
});

// DELETE /whatsapp/templates/:id - Delete template
app.delete('/whatsapp/templates/:id', (req, res) => {
    try {
        const { id } = req.params;

        res.json({
            success: true,
            message: `Template ${id} deleted successfully`
        });
    } catch (error) {
        logger.error('Error deleting template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete template'
        });
    }
});

// POST /whatsapp/templates/:id/test - Test template
app.post('/whatsapp/templates/:id/test', (req, res) => {
    try {
        const { id } = req.params;
        const { recipient } = req.body;

        if (!recipient) {
            return res.status(400).json({
                success: false,
                message: 'Recipient is required'
            });
        }

        res.json({
            success: true,
            data: {
                templateId: id,
                recipient,
                status: 'sent',
                messageId: 'msg_' + Date.now()
            },
            message: 'Template test sent successfully'
        });
    } catch (error) {
        logger.error('Error testing template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test template'
        });
    }
});

// Redirect root ke dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// Route alternatif untuk tool umum
app.get('/network-tools', (req, res) => {
    res.redirect('/tools');
});

// Import PPPoE monitoring modules
const pppoeMonitor = require('./config/pppoe-monitor');
const pppoeCommands = require('./config/pppoe-commands');

// Import GenieACS commands module
const genieacsCommands = require('./config/genieacs-commands');

// Import MikroTik commands module
const mikrotikCommands = require('./config/mikrotik-commands');

// Import RX Power Monitor module
const rxPowerMonitor = require('./config/rxPowerMonitor');

// Tambahkan view engine dan static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve API Dashboard SPA
app.use('/dashboard', express.static(path.join(__dirname, 'public/dashboard')));
// SPA fallback for client-side routing
app.get('/dashboard/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/dashboard/index.html'));
});


// Customer portal moved to Next.js frontend at /customer/portal


// Inisialisasi WhatsApp dan PPPoE monitoring
try {
    whatsapp.connectToWhatsApp().then(sock => {
        if (sock) {
            // Set sock instance untuk whatsapp
            whatsapp.setSock(sock);

            // Set sock instance untuk PPPoE monitoring
            pppoeMonitor.setSock(sock);
            pppoeCommands.setSock(sock);

            // Set sock instance untuk GenieACS commands
            genieacsCommands.setSock(sock);

            // Set sock instance untuk MikroTik commands
            mikrotikCommands.setSock(sock);

            // Set sock instance untuk RX Power Monitor
            rxPowerMonitor.setSock(sock);

            // Set sock instance untuk trouble report
            const troubleReport = require('./config/troubleReport');
            troubleReport.setSockInstance(sock);

            // Set sock instance untuk billing commands
            const billingCommands = require('./config/billing-commands');
            billingCommands.setSock(sock);

            logger.info('WhatsApp connected successfully');

            // Initialize PPPoE monitoring jika MikroTik dikonfigurasi
            if (global.appSettings.mikrotikHost && global.appSettings.mikrotikUser && global.appSettings.mikrotikPassword) {
                pppoeMonitor.initializePPPoEMonitoring().then(() => {
                    logger.info('PPPoE monitoring initialized');
                }).catch(err => {
                    logger.error('Error initializing PPPoE monitoring:', err);
                });
            }

            // Initialize RX Power monitoring
            try {
                rxPowerMonitor.startRXPowerMonitoring();
                logger.info('RX Power monitoring initialized');
            } catch (err) {
                logger.error('Error initializing RX Power monitoring:', err);
            }
        }
    }).catch(err => {
        logger.error('Error connecting to WhatsApp:', err);
    });

    // Mulai monitoring PPPoE lama jika dikonfigurasi (fallback)
    if (global.appSettings.mikrotikHost && global.appSettings.mikrotikUser && global.appSettings.mikrotikPassword) {
        MikrotikService.monitorPPPoEConnections().catch(err => {
            logger.error('Error starting legacy PPPoE monitoring:', err);
        });
    }
} catch (error) {
    logger.error('Error initializing services:', error);
}

// Tambahkan delay yang lebih lama untuk reconnect WhatsApp
const RECONNECT_DELAY = 30000; // 30 detik

// Fungsi untuk memulai server hanya pada port yang dikonfigurasi di settings.json
function startServer(portToUse) {
    // Pastikan port adalah number
    const port = parseInt(portToUse);
    if (isNaN(port) || port < 1 || port > 65535) {
        logger.error(`Port tidak valid: ${portToUse}`);
        process.exit(1);
    }

    logger.info(`Memulai server pada port: ${port}`);
    logger.info(`Sumber port: ${process.env.PORT ? 'ENV PORT' : 'settings.json (server_port)'}`);

    // Hanya gunakan port dari settings.json, tidak ada fallback
    try {
        // Enforce 0.0.0.0 to ensure accessibility from LAN/Frontend
        const host = '0.0.0.0'; // getSetting('server_host', 'localhost');

        // Create HTTP server for Socket.IO
        const server = http.createServer(app);

        // Setup Socket.IO with CORS
        const io = new Server(server, {
            cors: {
                origin: allowedOrigins,
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });

        // Make io globally available
        global.io = io;

        // Handle WebSocket connections
        io.on('connection', (socket) => {
            logger.info(`🔌 WebSocket client connected: ${socket.id}`);

            // Join WhatsApp room for real-time updates
            socket.join('whatsapp-status');

            // Send current WhatsApp status on connection
            socket.emit('whatsapp-status', {
                connected: false,
                status: 'initializing',
                message: 'Checking WhatsApp status...'
            });

            // Broadcast Messages - Customer Portal Integration
            socket.on('join-customer-room', (data) => {
                const { customerId, customerRegion } = data;
                if (customerId) {
                    socket.join(`customer-${customerId}`);
                    logger.info(`👤 Customer ${customerId} joined their room`);
                }
                if (customerRegion) {
                    socket.join(`region-${customerRegion}`);
                    logger.info(`📍 Client joined region room: ${customerRegion}`);
                }
            });

            socket.on('leave-customer-room', (data) => {
                const { customerId } = data;
                if (customerId) {
                    socket.leave(`customer-${customerId}`);
                    logger.info(`👤 Customer ${customerId} left their room`);
                }
            });

            socket.on('join-room', (roomName) => {
                socket.join(roomName);
                logger.info(`🔌 Client ${socket.id} joined room: ${roomName}`);
            });

            socket.on('leave-room', (roomName) => {
                socket.leave(roomName);
                logger.info(`🔌 Client ${socket.id} left room: ${roomName}`);
            });

            // Handle disconnect
            socket.on('disconnect', () => {
                logger.info(`🔌 WebSocket client disconnected: ${socket.id}`);
            });

            // Handle subscribe to WhatsApp status
            socket.on('subscribe-whatsapp', () => {
                socket.join('whatsapp-status');
                logger.info(`📱 Client ${socket.id} subscribed to WhatsApp status updates`);
            });

            // Handle unsubscribe from WhatsApp status
            socket.on('unsubscribe-whatsapp', () => {
                socket.leave('whatsapp-status');
                logger.info(`📱 Client ${socket.id} unsubscribed from WhatsApp status updates`);
            });
        });

        logger.info('🔌 WebSocket server initialized for real-time WhatsApp status');

        // Initialize Maintenance Scheduler
        try {
            const maintenanceScheduler = require('./services/maintenanceScheduler');
            maintenanceScheduler.start();
            logger.info('⏰ Maintenance scheduler initialized successfully');

            // Stop scheduler on graceful shutdown
            process.on('SIGINT', async () => {
                await maintenanceScheduler.stop();
            });

            process.on('SIGTERM', async () => {
                await maintenanceScheduler.stop();
            });
        } catch (error) {
            logger.error(`❌ Failed to initialize maintenance scheduler: ${error.message}`);
        }

        // Initialize WebSocket Log Streaming for API Dashboard
        try {
            const { initializeLogWebSocket, handleUpgrade: handleLogUpgrade } = require('./config/websocket-logs');
            initializeLogWebSocket(server);

            // Manual upgrade handling to prevent conflict with Socket.IO
            server.on('upgrade', (request, socket, head) => {
                if (request.url === '/ws/logs') {
                    handleLogUpgrade(request, socket, head);
                }
                // For other paths (like /socket.io/), let other listeners handle it
            });

            logger.info('📟 WebSocket log streaming initialized manually on /ws/logs');
        } catch (error) {
            logger.warn(`⚠️ Failed to initialize log streaming: ${error.message}`);
        }

        server.listen(port, host, () => {
            logger.info(`✅ Server berhasil berjalan pada port ${port}`);
            logger.info(`🌐 Web Portal tersedia di: http://${host === '0.0.0.0' ? '172.22.10.29' : host}:${port}`);
            logger.info(`🌐 Local access: http://localhost:${port}`);
            logger.info(`🌐 Network access: http://172.22.10.29:${port}`);
            logger.info(`🌐 WebSocket available: ws://${host === '0.0.0.0' ? '172.22.10.29' : host}:${port}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            // Update global.appSettings.port dengan port yang berhasil digunakan
            global.appSettings.port = port.toString();
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logger.error(`❌ ERROR: Port ${port} sudah digunakan oleh aplikasi lain!`);
                logger.error(`💡 Solusi: Hentikan aplikasi yang menggunakan port ${port} atau ubah port di settings.json`);
                logger.error(`🔍 Cek aplikasi yang menggunakan port: netstat -ano | findstr :${port}`);
            } else {
                logger.error('❌ Error starting server:', err.message);
            }
            process.exit(1);
        });
    } catch (error) {
        logger.error(`❌ Terjadi kesalahan saat memulai server:`, error.message);
        process.exit(1);
    }
}

// Mulai server setelah memastikan database siap (migrations)
// NOTE: SQLite migration disabled - using PostgreSQL instead
(async () => {
    try {
        // Skip SQLite migration since we're using PostgreSQL
        // const { ensureMultiServerDatabase } = require('./config/db-init');
        // await ensureMultiServerDatabase();
        logger.info('SQLite migration skipped - using PostgreSQL database');
    } catch (e) {
        logger.warn(`Database migration step encountered an issue: ${e.message}`);
    }
    const port = global.appSettings.port;
    logger.info(`Attempting to start server on configured port: ${port}`);
    startServer(port);
})();

// Tambahkan perintah untuk menambahkan nomor pelanggan ke tag GenieACS
const { addCustomerTag } = require('./config/customerTag');

// Initialize billing system and other services
(async function initializeServices() {
    try {
        // Initialize billing system (must be first)
        const billing = require('./config/billing');
        await billing.initializeBilling();

        // Initialize isolir service
        const isolirService = require('./config/isolir-service');
        isolirService.initializeIsolirService();

        // Initialize monthly invoice service - DISABLED to prevent infinite loop
        // Use scheduler.js instead for invoice generation
        // const monthlyInvoiceService = require('./config/monthly-invoice-service');
        // monthlyInvoiceService.initializeMonthlyInvoiceService();

        // Initialize auto expense service
        const autoExpenseService = require('./config/auto-expense-service');
        logger.info('✅ Auto expense service initialized');
    } catch (error) {
        logger.error('❌ Failed to initialize services:', error);
    }
})();

// Initialize backup system
const backupSystem = require('./config/backup-system');
backupSystem.initialize();

// Initialize RADIUS server
// DISABLED: Using FreeRADIUS in Docker instead of Node.js RADIUS server
// const radiusServer = require('./config/radius-server');
const radiusSync = require('./config/radius-sync');

(async function initializeRadius() {
    try {
        // Node.js RADIUS server disabled - using FreeRADIUS in Docker
        logger.info('⏭️  Node.js RADIUS server disabled - using FreeRADIUS in Docker');

        // Keep sync functionality for FreeRADIUS integration
        const radiusEnabled = getSetting('radius_server_enabled', 'true');
        if (radiusEnabled === 'true') {
            // Auto sync customers and packages on startup
            const autoSyncOnStartup = getSetting('radius_auto_sync_on_startup', 'true');
            if (autoSyncOnStartup === 'true') {
                logger.info('🔄 Syncing customers to FreeRADIUS...');
                await radiusSync.syncCustomersToRadius();

                logger.info('🔄 Syncing packages to FreeRADIUS...');
                await radiusSync.syncPackagesToRadius();
            }

            // Setup periodic sync
            const syncInterval = parseInt(getSetting('radius_sync_interval_minutes', '60'));
            if (syncInterval > 0) {
                setInterval(async () => {
                    logger.info('🔄 Running scheduled customer sync...');
                    await radiusSync.autoSync();

                    logger.info('🔄 Running scheduled packages sync...');
                    await radiusSync.syncPackagesToRadius();
                }, syncInterval * 60 * 1000);
                logger.info(`✅ FreeRADIUS auto-sync configured: every ${syncInterval} minutes`);
            }
        } else {
            logger.info('⏭️  FreeRADIUS sync disabled in settings');
        }
    } catch (error) {
        logger.error(`❌ Failed to initialize RADIUS sync: ${error.message}`);
    }
})();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('🛑 Shutting down gracefully...');
    // Node.js RADIUS server disabled - using FreeRADIUS in Docker
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('🛑 Shutting down gracefully...');
    // Node.js RADIUS server disabled - using FreeRADIUS in Docker
    process.exit(0);
});

// Global error handler - must be last middleware
app.use(responseErrorHandler());

// Keep legacy error handler for non-API routes
app.use((err, req, res, next) => {
    // Only use legacy error handler for non-API routes
    if (!req.path.startsWith('/api')) {
        const { errorHandler } = require('./config/errorHandler');
        errorHandler.handleError(err, req, res);
    } else {
        next();
    }
});


// Serve legacy dashboard (Vite Build)
const dashboardPath = path.join(__dirname, 'public', 'dashboard');
if (fs.existsSync(dashboardPath)) {
    // Serve static files
    app.use('/dashboard', express.static(dashboardPath));

    // Handle SPA routing for dashboard
    app.get('/dashboard/*', (req, res) => {
        res.sendFile(path.join(dashboardPath, 'index.html'));
    });
    logger.info('✅ Legacy dashboard served at /dashboard');
} else {
    logger.warn(`⚠️ Legacy dashboard build not found at ${dashboardPath}. Run "npm run build" in dashboard-src to enable it.`);
}

// Export app untuk testing
module.exports = app;
