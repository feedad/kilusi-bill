// Load environment variables early
require('dotenv').config();

const express = require('express');
const path = require('path');
const axios = require('axios');
const { logger } = require('./config/logger');
const whatsapp = require('./config/whatsapp');
const { monitorPPPoEConnections, resetMikrotikConnection } = require('./config/mikrotik');
const fs = require('fs');
const session = require('express-session');
const { getSetting } = require('./config/settingsManager');
const EventEmitter = require('events');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Import adminAuth router and middleware
const { router: adminAuthRouter, adminAuth } = require('./routes/adminAuth');

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
        try { resetMikrotikConnection(); } catch (_) {}
        // Do not exit; allow system to continue and reconnect lazily
        return;
    }
    // Log other unexpected exceptions without exiting in dev mode
    logger.error('Uncaught exception:', err);
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

// Middleware dasar dengan optimasi
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
            // Allow prefetch
            prefetchSrc: ["'self'"],
            // Child sources
            childSrc: ["'self'"],
            // Worker sources
            workerSrc: ["'self'", 'blob:'],
            // Frame ancestors
            frameAncestors: ["'self'"],
            // Upgrade insecure requests in production
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    },
    // Set consistent Origin-Agent-Cluster header
    originAgentCluster: true,
    crossOriginEmbedderPolicy: false, // Disable to avoid conflicts
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" }
}));

// CORS (allow configured origins or localhost default)
const defaultOrigins = [
    `http://localhost:${process.env.PORT || 3001}`,
    'http://localhost:3000',  // Next.js default port
    'http://localhost:3001',  // Next.js dev port
    'http://localhost:3002',  // Next.js alternative dev port
    'http://127.0.0.1:3000',  // Localhost alternatives
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://192.168.1.235:3000',  // Network IP for Next.js frontend
    'http://192.168.1.235:3001',  // Network IP for Next.js dev frontend
    'http://192.168.1.235:3002',  // Network IP for Next.js dev frontend
    'http://0.0.0.0:3000',        // Docker access
    'http://0.0.0.0:3001',        // Docker access
    'http://0.0.0.0:3002'         // Docker access
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : defaultOrigins;
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

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
app.use('/api', apiLimiter);

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

// Gunakan route adminAuth untuk /admin

// Import dan gunakan route adminDashboard
const adminODPRouter = require('./routes/adminODP');
const adminDashboardRouter = require('./routes/adminDashboard');
const adminGenieacsRouter = require('./routes/adminGenieacs');
const adminMikrotikRouter = require('./routes/adminMikrotik');
const adminAnalyticsRouter = require('./routes/adminAnalytics');
const adminBackupRouter = require('./routes/adminBackup');
const adminRadiusRouter = require('./routes/adminRadius');
const adminSnmpRouter = require('./routes/adminSnmp');
const adminOLTRouter = require('./routes/adminOLT');
const adminNASRouter = require('./routes/adminNAS');
const adminMikrotikServersRouter = require('./routes/adminMikrotikServers');
const adminPelangganOnlineRouter = require('./routes/adminPelangganOnline');

// Mount routes dalam urutan yang benar
app.use('/admin', adminAuthRouter);
app.use('/admin', adminODPRouter);
app.use('/admin', adminDashboardRouter);
app.use('/api/dashboard', adminDashboardRouter); // For API endpoints
app.use('/admin', adminGenieacsRouter);
app.use('/admin', adminMikrotikRouter);
app.use('/admin', adminAnalyticsRouter);
app.use('/admin', adminBackupRouter);
app.use('/admin/radius', adminRadiusRouter);
app.use('/admin', adminSnmpRouter);
app.use('/admin', adminOLTRouter);
app.use('/admin/nas', adminNASRouter);
app.use('/admin/mikrotik-servers', adminMikrotikServersRouter);
app.use('/admin/pelanggan-online', adminPelangganOnlineRouter);

// Test endpoint untuk memverifikasi mounting
app.get('/admin/test-mount', (req, res) => {
  res.json({
    success: true,
    message: 'Route mounting is working!',
    timestamp: new Date().toISOString()
  });
});


// Import dan gunakan route adminHotspot
const adminHotspotRouter = require('./routes/adminHotspot');
app.use('/admin/hotspot', adminHotspotRouter);

// Import dan gunakan route adminSetting
const adminSettingRouter = require('./routes/adminSetting');
app.use('/admin/setting', adminAuth, adminSettingRouter);

// Import dan gunakan route adminTroubleReport
const adminTroubleReportRouter = require('./routes/adminTroubleReport');
app.use('/admin/trouble', adminAuth, adminTroubleReportRouter);

// Import dan gunakan route adminBilling
const adminBillingRouter = require('./routes/adminBilling');
app.use('/admin/billing', adminBillingRouter);

// Import dan gunakan route adminCustomers
const adminCustomersRouter = require('./routes/adminCustomers');
app.use('/admin/customers', adminCustomersRouter);

// Import dan gunakan route adminPackages
const adminPackagesRouter = require('./routes/adminPackages');
app.use('/admin/packages', adminPackagesRouter);

// Import dan gunakan route adminInvoices
const adminInvoicesRouter = require('./routes/adminInvoices');
app.use('/admin/invoices', adminInvoicesRouter);

// Import dan gunakan route adminPayments
const adminPaymentsRouter = require('./routes/adminPayments');
app.use('/admin/payments', adminPaymentsRouter);

// Import dan gunakan route adminWhatsAppSettings
const adminWhatsAppSettingsRouter = require('./routes/adminWhatsAppSettings');
app.use('/admin/whatsapp-settings', adminWhatsAppSettingsRouter);

// Import dan gunakan route adminMikrotikScripts
const adminMikrotikScriptsRouter = require('./routes/adminMikrotikScripts');
app.use('/admin/mikrotik-scripts', adminMikrotikScriptsRouter);

// Import dan gunakan route adminTools
const adminToolsRouter = require('./routes/adminTools');
app.use('/admin/tools', adminToolsRouter);

// Import dan gunakan route testTroubleReport untuk debugging
const testTroubleReportRouter = require('./routes/testTroubleReport');
app.use('/test/trouble', testTroubleReportRouter);

// Import dan gunakan route publicTools (tanpa auth)
const publicToolsRouter = require('./routes/publicTools');
app.use('/tools', publicToolsRouter);

// Import dan gunakan route technicianTroubleReport
const technicianTroubleReportRouter = require('./routes/technicianTroubleReport');
app.use('/technician', technicianTroubleReportRouter);

// Route untuk halaman test trouble report
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

// Import dan gunakan route API dashboard traffic
const apiDashboardRouter = require('./routes/apiDashboard');
app.use('/api', apiDashboardRouter);

// Import dan gunakan route API external
const apiExternalRouter = require('./routes/apiExternal');
app.use('/api/external', apiExternalRouter);

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
  port: getSetting('server_port', 4555),
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

// Route untuk mobile dashboard
app.get('/mobile', async (req, res) => {
    try {
        // Ambil data langsung di server untuk menghindari masalah AJAX
        const { getDevices } = require('./config/genieacs');
        const { getActivePPPoEConnections } = require('./config/mikrotik');
        const { getAllPackages, getAllCustomers, getAllInvoices } = require('./config/billing');
        const { getAllTroubleReports } = require('./config/troubleReport');

        // Ambil data async
        const [devices, pppoeData] = await Promise.all([
            getDevices().catch(() => []),
            getActivePPPoEConnections().catch(() => ({ success: false, data: [] }))
        ]);

        // Ambil data sync
        let packages = [];
        let customers = [];
        let invoices = [];
        let troubleReports = [];

        try { packages = getAllPackages(); } catch (error) { /* ignore */ }
        try { customers = getAllCustomers(); } catch (error) { /* ignore */ }
        try { invoices = getAllInvoices(); } catch (error) { /* ignore */ }
        try { troubleReports = getAllTroubleReports(); } catch (error) { /* ignore */ }

        // Hitung data
        const now = Date.now();
        const onlineDevices = devices.filter(dev => {
            if (!dev._lastInform) return false;
            try {
                const lastInform = new Date(dev._lastInform).getTime();
                if (isNaN(lastInform)) return false;
                return (now - lastInform) < 3600 * 1000;
            } catch (error) {
                return false;
            }
        }).length;

        const mobileData = {
            devices: {
                total: devices.length,
                online: onlineDevices,
                offline: devices.length - onlineDevices
            },
            pppoe: {
                active: pppoeData.success ? pppoeData.data.length : 0
            },
            packages: {
                total: packages.length,
                active: packages.filter(pkg => pkg.status === 'active').length
            },
            customers: {
                total: customers.length,
                active: customers.filter(cust => cust.status === 'active').length,
                inactive: customers.filter(cust => cust.status === 'inactive').length,
                isolir: customers.filter(cust => cust.status === 'isolir').length
            },
            invoices: {
                total: invoices.length,
                pending: invoices.filter(inv => inv.status === 'pending').length,
                paid: invoices.filter(inv => inv.status === 'paid').length,
                overdue: invoices.filter(inv => inv.status === 'overdue').length,
                totalAmount: invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0)
            },
            troubleReports: {
                total: troubleReports.length,
                pending: troubleReports.filter(tr => tr.status === 'pending').length,
                inProgress: troubleReports.filter(tr => tr.status === 'in_progress').length,
                resolved: troubleReports.filter(tr => tr.status === 'resolved').length
            }
        };

        res.render('mobile-dashboard', {
            title: 'Kilusi Mobile',
            page: 'mobile',
            data: mobileData,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error loading mobile dashboard:', error);
        res.render('mobile-dashboard', {
            title: 'Kilusi Mobile',
            page: 'mobile',
            data: {
                devices: { total: 0, online: 0, offline: 0 },
                pppoe: { active: 0 },
                packages: { total: 0, active: 0 },
                customers: { total: 0, active: 0, inactive: 0, isolir: 0 },
                invoices: { total: 0, pending: 0, paid: 0, overdue: 0, totalAmount: 0 },
                troubleReports: { total: 0, pending: 0, inProgress: 0, resolved: 0 }
            },
            lastUpdated: new Date().toISOString(),
            error: error.message
        });
    }
});

// Route untuk mobile dashboard pelanggan
app.get('/mobile-customer', async (req, res) => {
    try {
        logger.debug(`🔍 Mobile customer GET request received at ${new Date().toISOString()}`);
        logger.debug(`Query params:`, req.query);
        
        // Ambil data pelanggan dari session atau parameter
        const customerId = req.query.customer_id || req.session.customerId || req.session.phone;
        
        logger.debug(`🔍 Mobile customer access - customerId: ${customerId}, session.phone: ${req.session.phone}`);
        
        if (!customerId) {
            logger.info(`❌ No customerId found, showing login page`);
            return res.render('mobile-customer-login', {
                title: 'Kilusi Mobile - Login',
                page: 'mobile-customer',
                error: 'Customer ID diperlukan'
            });
        }
        
        logger.info(`✅ CustomerId found: ${customerId}, proceeding to dashboard`);

        // Ambil data pelanggan
        const { getAllCustomers, getAllInvoices, getAllPackages } = require('./config/billing');
        const { getAllTroubleReports } = require('./config/troubleReport');
        const { getDevices } = require('./config/genieacs');

        let customers = [];
        let invoices = [];
        let packages = [];
        let troubleReports = [];
        let devices = [];

        try { customers = getAllCustomers(); } catch (error) { /* ignore */ }
        try { invoices = getAllInvoices(); } catch (error) { /* ignore */ }
        try { packages = getAllPackages(); } catch (error) { /* ignore */ }
        try { troubleReports = getAllTroubleReports(); } catch (error) { /* ignore */ }
        try { devices = await getDevices(); } catch (error) { /* ignore */ }

        // Cari data pelanggan berdasarkan ID atau nomor HP
        logger.debug(`🔍 Looking for customer with customerId: ${customerId}`);
        
        const customer = customers.find(c => 
            c.id === customerId || 
            c.customer_id === customerId ||
            c.phone === customerId ||
            c.username === customerId ||
            c.phone === customerId.replace(/^0/, '62') ||
            c.phone === customerId.replace(/^62/, '0')
        );
        
        logger.debug(`🔍 Found customer:`, customer ? { id: customer.id, phone: customer.phone, name: customer.name } : 'Not found');
        
        if (!customer) {
            logger.warn(`❌ Customer not found for ID: ${customerId}`);
            return res.render('mobile-customer-login', {
                title: 'Kilusi Mobile - Login',
                page: 'mobile-customer',
                error: 'Pelanggan tidak ditemukan. Pastikan Customer ID atau nomor HP benar.'
            });
        }
        
        logger.info(`✅ Customer found: ${customer.name} (${customer.phone})`);

        // Ambil data invoice pelanggan
        const customerInvoices = invoices.filter(inv => 
            inv.customer_id === customerId || inv.customer_name === customer.name
        );

        // Ambil data trouble report pelanggan
        const customerTroubleReports = troubleReports.filter(tr => 
            tr.customer_id === customerId || tr.customer_name === customer.name
        );

        // Cari device pelanggan berdasarkan serial number atau customer_id
        const customerDevices = devices.filter(dev => {
            if (!dev._deviceId) return false;
            
            // Pastikan _deviceId adalah string
            const deviceId = String(dev._deviceId);
            const serialNumber = String(customer.serial_number || '');
            const customerName = String(customer.name || '');
            
            // Hanya cocokkan jika serial_number ada dan tidak kosong
            if (serialNumber && serialNumber !== '' && serialNumber !== 'undefined') {
                return deviceId.includes(serialNumber);
            }
            
            // Jika tidak ada serial_number, coba cari berdasarkan customer_id di tag
            if (dev.tags && Array.isArray(dev.tags)) {
                return dev.tags.includes(customerId) || 
                       dev.tags.includes(customer.phone) ||
                       dev.tags.includes(customer.username);
            }
            
            return false;
        });

        // Hitung status device
        const now = Date.now();
        const onlineDevices = customerDevices.filter(dev => {
            if (!dev._lastInform) return false;
            try {
                const lastInform = new Date(dev._lastInform).getTime();
                if (isNaN(lastInform)) return false;
                return (now - lastInform) < 3600 * 1000;
            } catch (error) {
                return false;
            }
        }).length;

        // Dapatkan SSID saat ini (opsional)
        let currentSsid = '';
        try {
            const firstDeviceId = customerDevices[0]?.id || customerDevices[0]?._deviceId || (customerDevices[0] && String(customerDevices[0]));
            if (firstDeviceId) {
                const { getDevice } = require('./config/genieacs');
                const full = await getDevice(firstDeviceId);
                currentSsid = full?.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.SSID?._value || '';
            }
        } catch (e) { /* ignore */ }

        // Data untuk mobile customer dashboard
        const customerData = {
            customer: {
                id: customer.id || customer.customer_id,
                name: customer.name,
                email: customer.email || '',
                phone: customer.phone || '',
                address: customer.address || '',
                package: customer.package_name || customer.package || '',
                package_price: customer.package_price || 0,
                status: customer.status || 'active',
                serial_number: customer.serial_number || '',
                ssid: currentSsid,
                registration_date: customer.registration_date || customer.created_at
            },
            devices: {
                total: customerDevices.length,
                online: onlineDevices,
                offline: customerDevices.length - onlineDevices,
                list: customerDevices.map(dev => ({
                    id: String(dev._deviceId || ''),
                    serial: String(dev._deviceId || ''),
                    status: dev._lastInform ? 
                        (now - new Date(dev._lastInform).getTime() < 3600 * 1000 ? 'online' : 'offline') : 'unknown',
                    lastSeen: dev._lastInform || 'Tidak diketahui'
                }))
            },
            invoices: {
                total: customerInvoices.length,
                pending: customerInvoices.filter(inv => inv.status === 'pending').length,
                paid: customerInvoices.filter(inv => inv.status === 'paid').length,
                overdue: customerInvoices.filter(inv => inv.status === 'overdue').length,
                totalAmount: customerInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0),
                recent: customerInvoices.slice(0, 5).map(inv => ({
                    id: inv.id,
                    amount: inv.amount || 0,
                    status: inv.status,
                    dueDate: inv.due_date || inv.created_at,
                    description: inv.description || 'Tagihan bulanan'
                }))
            },
            troubleReports: {
                total: customerTroubleReports.length,
                pending: customerTroubleReports.filter(tr => tr.status === 'pending').length,
                inProgress: customerTroubleReports.filter(tr => tr.status === 'in_progress').length,
                resolved: customerTroubleReports.filter(tr => tr.status === 'resolved').length,
                recent: customerTroubleReports.slice(0, 5).map(tr => ({
                    id: tr.id,
                    title: tr.title || 'Laporan Gangguan',
                    status: tr.status,
                    priority: tr.priority || 'normal',
                    created_at: tr.created_at,
                    description: tr.description || ''
                }))
            }
        };

        logger.info(`🎉 Rendering mobile customer dashboard for: ${customer.name} (${customer.phone})`);
        
        res.render('mobile-customer-dashboard', {
            title: 'Kilusi Mobile - Customer',
            page: 'mobile-customer',
            data: customerData,
            lastUpdated: new Date().toISOString(),
            notif: req.query.notif || null
        });
    } catch (error) {
        logger.error('Error loading mobile customer dashboard:', error);
        res.render('mobile-customer-login', {
            title: 'Kilusi Mobile - Login',
            page: 'mobile-customer',
            error: error.message
        });
    }
});

// Route POST untuk login mobile customer
app.post('/mobile-customer/login', async (req, res) => {
    try {
        logger.info(`🔍 Mobile customer POST login request received`);
        
        const { customer_id } = req.body;
        
        if (!customer_id) {
            logger.warn(`❌ No customer_id in body`);
            return res.render('mobile-customer-login', {
                title: 'Kilusi Mobile - Login',
                page: 'mobile-customer',
                error: 'Customer ID diperlukan'
            });
        }
        
        logger.debug(`🔍 Processing login for customer_id: ${customer_id}`);

        // Validasi customer
        const { getAllCustomers } = require('./config/billing');
        const customers = getAllCustomers();
        
        const customer = customers.find(c => 
            c.id === customer_id || 
            c.customer_id === customer_id ||
            c.phone === customer_id ||
            c.username === customer_id ||
            c.phone === customer_id.replace(/^0/, '62') ||
            c.phone === customer_id.replace(/^62/, '0')
        );
        
        if (!customer) {
            logger.warn(`❌ Mobile customer login failed for: ${customer_id}`);
            return res.render('mobile-customer-login', {
                title: 'Kilusi Mobile - Login',
                page: 'mobile-customer',
                error: 'Pelanggan tidak ditemukan. Pastikan Customer ID atau nomor HP benar.'
            });
        }

        // Simpan session
        req.session.phone = customer.phone;
        req.session.customerId = customer.id;
        
        logger.info(`✅ Mobile customer login success: ${customer.name} (${customer.phone})`);
        
        // Render dashboard langsung setelah login
        logger.debug(`🔄 Rendering dashboard directly after login`);
        
        // Ambil data pelanggan untuk dashboard (menggunakan import yang sudah ada)
        const { getAllInvoices, getAllPackages } = require('./config/billing');
        const { getAllTroubleReports } = require('./config/troubleReport');
        const { getDevices } = require('./config/genieacs');

        let allCustomers = [];
        let allInvoices = [];
        let allPackages = [];
        let allTroubleReports = [];
        let allDevices = [];

        try { allCustomers = getAllCustomers(); } catch (error) { /* ignore */ }
        try { allInvoices = getAllInvoices(); } catch (error) { /* ignore */ }
        try { allPackages = getAllPackages(); } catch (error) { /* ignore */ }
        try { allTroubleReports = getAllTroubleReports(); } catch (error) { /* ignore */ }
        try { allDevices = await getDevices(); } catch (error) { /* ignore */ }

        // Cari data pelanggan berdasarkan ID atau nomor HP
        logger.debug(`🔍 Looking for customer after login with:`, { id: customer.id, phone: customer.phone });
        
        const foundCustomer = allCustomers.find(c => 
            c.id === customer.id || 
            c.customer_id === customer.id ||
            c.phone === customer.phone ||
            c.username === customer.phone
        );
        
        if (!foundCustomer) {
            logger.error(`❌ Customer not found after login`);
            return res.render('mobile-customer-login', {
                title: 'Kilusi Mobile - Login',
                page: 'mobile-customer',
                error: 'Pelanggan tidak ditemukan setelah login'
            });
        }

        // Ambil data invoice pelanggan
        const customerInvoices = allInvoices.filter(inv => 
            inv.customer_id === foundCustomer.id || inv.customer_name === foundCustomer.name
        );

        // Ambil data trouble report pelanggan
        const customerTroubleReports = allTroubleReports.filter(tr => 
            tr.customer_id === foundCustomer.id || tr.customer_name === foundCustomer.name
        );

               // Cari device pelanggan berdasarkan serial number atau customer_id
               const customerDevices = allDevices.filter(dev => {
                   if (!dev._deviceId) return false;
                   
                   // Pastikan _deviceId adalah string
                   const deviceId = String(dev._deviceId);
                   const serialNumber = String(foundCustomer.serial_number || '');
                   const customerName = String(foundCustomer.name || '');
                   
                   // Hanya cocokkan jika serial_number ada dan tidak kosong
                   if (serialNumber && serialNumber !== '' && serialNumber !== 'undefined') {
                       return deviceId.includes(serialNumber);
                   }
                   
                   // Jika tidak ada serial_number, coba cari berdasarkan customer_id di tag
                   if (dev.tags && Array.isArray(dev.tags)) {
                       return dev.tags.includes(foundCustomer.id) || 
                              dev.tags.includes(foundCustomer.phone) ||
                              dev.tags.includes(foundCustomer.username);
                   }
                   
                   return false;
               });

        // Hitung status device
        const now = Date.now();
        const onlineDevices = customerDevices.filter(dev => {
            if (!dev._lastInform) return false;
            try {
                const lastInform = new Date(dev._lastInform).getTime();
                if (isNaN(lastInform)) return false;
                return (now - lastInform) < 3600 * 1000;
            } catch (error) {
                return false;
            }
        }).length;

               // Data untuk mobile customer dashboard
               const customerData = {
                   customer: {
                       id: foundCustomer.id || foundCustomer.customer_id,
                       name: foundCustomer.name,
                       email: foundCustomer.email || '',
                       phone: foundCustomer.phone || '',
                       address: foundCustomer.address || '',
                       package: foundCustomer.package_name || foundCustomer.package || '',
                       package_price: foundCustomer.package_price || 0,
                       status: foundCustomer.status || 'active',
                       serial_number: foundCustomer.serial_number || '',
                       registration_date: foundCustomer.registration_date || foundCustomer.created_at
                   },
            devices: {
                total: customerDevices.length,
                online: onlineDevices,
                offline: customerDevices.length - onlineDevices,
                list: customerDevices.map(dev => ({
                    id: String(dev._deviceId || ''),
                    serial: String(dev._deviceId || ''),
                    status: dev._lastInform ? 
                        (now - new Date(dev._lastInform).getTime() < 3600 * 1000 ? 'online' : 'offline') : 'unknown',
                    lastSeen: dev._lastInform || 'Tidak diketahui'
                }))
            },
            invoices: {
                total: customerInvoices.length,
                pending: customerInvoices.filter(inv => inv.status === 'pending').length,
                paid: customerInvoices.filter(inv => inv.status === 'paid').length,
                overdue: customerInvoices.filter(inv => inv.status === 'overdue').length,
                totalAmount: customerInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0),
                recent: customerInvoices.slice(0, 5).map(inv => ({
                    id: inv.id,
                    amount: inv.amount || 0,
                    status: inv.status,
                    dueDate: inv.due_date || inv.created_at,
                    description: inv.description || 'Tagihan bulanan'
                }))
            },
            troubleReports: {
                total: customerTroubleReports.length,
                pending: customerTroubleReports.filter(tr => tr.status === 'pending').length,
                inProgress: customerTroubleReports.filter(tr => tr.status === 'in_progress').length,
                resolved: customerTroubleReports.filter(tr => tr.status === 'resolved').length,
                recent: customerTroubleReports.slice(0, 5).map(tr => ({
                    id: tr.id,
                    title: tr.title || 'Laporan Gangguan',
                    status: tr.status,
                    priority: tr.priority || 'normal',
                    created_at: tr.created_at,
                    description: tr.description || ''
                }))
            }
        };

        logger.info(`🎉 Rendering mobile customer dashboard for: ${foundCustomer.name} (${foundCustomer.phone})`);
        
        res.render('mobile-customer-dashboard', {
            title: 'Kilusi Mobile - Customer',
            page: 'mobile-customer',
            data: customerData,
            lastUpdated: new Date().toISOString(),
            notif: req.query.notif || null
        });
    } catch (error) {
        logger.error('Error in mobile customer login:', error);
        res.render('mobile-customer-login', {
            title: 'Kilusi Mobile - Login',
            page: 'mobile-customer',
            error: error.message
        });
    }
});

// Route logout mobile customer
app.post('/mobile-customer/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/mobile-customer');
    });
});

// Mobile customer change SSID
app.post('/mobile-customer/change-ssid', async (req, res) => {
    try {
        const phone = req.session && req.session.phone;
        if (!phone) return res.redirect('/mobile-customer');
        
        const { ssid } = req.body;
        
        // Import function untuk update SSID
        const { updateSSID } = require('./config/genieacs');
        const result = await updateSSID(phone, ssid);
        
        let notificationMessage = 'Gagal mengubah SSID.';
        
        if (result.success) {
            const timeInfo = result.processingTime ? ` (${result.processingTime}ms, ${result.mode} mode)` : '';
            notificationMessage = `Nama WiFi berhasil diubah${timeInfo}.`;
            
            // Kirim notifikasi WhatsApp ke pelanggan
            const { sendMessage } = require('./config/sendMessage');
            const waJid = phone.replace(/^0/, '62') + '@s.whatsapp.net';
            const msg = `✅ *PERUBAHAN NAMA WIFI*\n\n` +
              `Nama WiFi Anda telah diubah menjadi:\n` +
              `• WiFi 2.4GHz: ${ssid}\n` +
              `• WiFi 5GHz: ${ssid}-5G\n\n` +
              `⚡ Diproses dalam ${result.processingTime}ms menggunakan ${result.mode} mode\n\n` +
              `Silakan hubungkan ulang perangkat Anda ke WiFi baru.`;
            
            try { 
              await sendMessage(waJid, msg); 
            } catch (e) {
              console.warn('Gagal kirim notifikasi WhatsApp:', e.message);
            }
        }
        
        // Redirect kembali ke mobile dashboard dengan notifikasi
        res.redirect(`/mobile-customer?notif=${encodeURIComponent(notificationMessage)}`);
    } catch (error) {
        console.error('Error in mobile change SSID:', error);
        res.redirect(`/mobile-customer?notif=${encodeURIComponent('Gagal mengubah SSID.')}`);
    }
});

// Mobile customer change password
app.post('/mobile-customer/change-password', async (req, res) => {
    try {
        const phone = req.session && req.session.phone;
        if (!phone) return res.redirect('/mobile-customer');
        
        const { password } = req.body;
        
        // Import function untuk update password
        const { updatePassword } = require('./config/genieacs');
        const result = await updatePassword(phone, password);
        
        let notificationMessage = result.error || 'Gagal mengubah password.';
        
        if (result.success) {
            const timeInfo = result.processingTime ? ` (${result.processingTime}ms, ${result.mode} mode)` : '';
            notificationMessage = `Password WiFi berhasil diubah${timeInfo}.`;
            
            // Kirim notifikasi WhatsApp ke pelanggan
            const { sendMessage } = require('./config/sendMessage');
            const waJid = phone.replace(/^0/, '62') + '@s.whatsapp.net';
            const msg = `✅ *PERUBAHAN PASSWORD WIFI*\n\n` +
              `Password WiFi Anda telah diubah menjadi:\n` +
              `• Password: ${password}\n\n` +
              `⚡ Diproses dalam ${result.processingTime}ms menggunakan ${result.mode} mode\n\n` +
              `Silakan hubungkan ulang perangkat Anda dengan password baru.`;
            
            try { 
              await sendMessage(waJid, msg); 
            } catch (e) {
              logger.warn('Gagal kirim notifikasi WhatsApp:', e.message);
            }
        }
        
        // Redirect kembali ke mobile dashboard dengan notifikasi
        res.redirect(`/mobile-customer?notif=${encodeURIComponent(notificationMessage)}`);
    } catch (error) {
        logger.error('Error in mobile change password:', error);
        res.redirect(`/mobile-customer?notif=${encodeURIComponent('Gagal mengubah password.')}`);
    }
});

// Route untuk API Documentation
app.get('/api-docs', (req, res) => {
    res.render('apiDocs', {
        title: 'API Documentation',
        page: 'api'
    });
});

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

// Redirect root ke portal pelanggan
app.get('/', (req, res) => {
  res.redirect('/customer/login');
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
// Mount customer portal
const customerPortal = require('./routes/customerPortal');
app.use('/customer', customerPortal);

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
        monitorPPPoEConnections().catch(err => {
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
        const host = getSetting('server_host', 'localhost');
        const server = app.listen(port, host, () => {
            logger.info(`✅ Server berhasil berjalan pada port ${port}`);
            logger.info(`🌐 Web Portal tersedia di: http://${host === '0.0.0.0' ? '192.168.1.235' : host}:${port}`);
            logger.info(`🌐 Local access: http://localhost:${port}`);
            logger.info(`🌐 Network access: http://192.168.1.235:${port}`);
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
(async () => {
    try {
        const { ensureMultiServerDatabase } = require('./config/db-init');
        await ensureMultiServerDatabase();
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
app.use((err, req, res, next) => {
    const { errorHandler } = require('./config/errorHandler');
    errorHandler.handleError(err, req, res);
});

// Export app untuk testing
module.exports = app;
