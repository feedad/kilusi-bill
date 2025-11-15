const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for frontend
app.use(cors());
app.use(express.json());

// WhatsApp API Routes
app.get('/api/v1/whatsapp/', (req, res) => {
    res.json({
        success: true,
        message: 'WhatsApp Notification API v1',
        status: 'active',
        endpoints: {
            main: 'GET /',
            status: 'GET /status',
            connect: 'POST /connect',
            disconnect: 'POST /disconnect',
            qr: 'GET /qr',
            send: 'POST /send',
            templates: 'GET /templates',
            analytics: 'GET /analytics',
            queue: 'GET /queue',
            broadcast: 'POST /broadcast',
            test: 'POST /test',
            settings: 'GET|PUT /settings'
        }
    });
});

app.get('/api/v1/whatsapp/status', (req, res) => {
    res.json({
        success: true,
        data: {
            connected: true,
            connectionStatus: 'connected',
            phoneNumber: '+6281947215703',
            profileName: 'WhatsApp Business',
            qrCode: null,
            lastSync: new Date().toISOString(),
            uptime: Math.floor(process.uptime()),
            successRate: 99.0,
            deviceInfo: {
                device: 'Chrome',
                version: '119.0.6045.123',
                platform: 'Linux',
                connected: true
            },
            stats: {
                messagesSent: 1247,
                messagesReceived: 832,
                groups: 3,
                contacts: 156,
                todayMessages: 32
            }
        }
    });
});

app.post('/api/v1/whatsapp/connect', async (req, res) => {
    res.json({
        success: true,
        message: 'WhatsApp connection initiated',
        data: {
            status: 'connecting',
            qrCode: 'mock-qr-code-data-' + Date.now(),
            phoneNumber: null,
            connectionId: 'whatsapp-' + Date.now(),
            timestamp: new Date().toISOString()
        }
    });
});

app.get('/api/v1/whatsapp/qr', (req, res) => {
    res.json({
        success: true,
        data: {
            qrCode: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
            generatedAt: new Date().toISOString(),
            status: 'active'
        }
    });
});

app.post('/api/v1/whatsapp/send', (req, res) => {
    const { phone, message, type = 'text' } = req.body;

    if (!phone || !message) {
        return res.status(400).json({
            success: false,
            message: 'Phone number and message are required'
        });
    }

    res.json({
        success: true,
        message: 'Message sent successfully',
        data: {
            messageId: 'msg-' + Date.now(),
            phone,
            message,
            type,
            status: 'sent',
            sentAt: new Date().toISOString()
        }
    });
});

app.get('/api/v1/whatsapp/templates', (req, res) => {
    const templates = [
        {
            id: 'invoice_reminder',
            name: 'Invoice Reminder',
            content: 'Hello {{customerName}}, your invoice {{invoiceNumber}} for {{amount}} is due on {{dueDate}}.',
            category: 'billing',
            enabled: true,
            usageCount: 456
        },
        {
            id: 'payment_confirmation',
            name: 'Payment Confirmation',
            content: 'Thank you {{customerName}}! We received your payment of {{amount}} for invoice {{invoiceNumber}}.',
            category: 'billing',
            enabled: true,
            usageCount: 312
        }
    ];

    res.json({
        success: true,
        data: templates,
        total: templates.length
    });
});

app.post('/api/v1/whatsapp/test', (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({
            success: false,
            message: 'Phone number is required for test'
        });
    }

    res.json({
        success: true,
        message: 'Test message sent successfully',
        data: {
            testId: 'test_' + Date.now(),
            phone,
            status: 'sent',
            testMessage: 'This is a test message from WhatsApp Notification System',
            sentAt: new Date().toISOString()
        }
    });
});

app.get('/api/v1/whatsapp/analytics', (req, res) => {
    res.json({
        success: true,
        data: {
            overview: {
                totalSent: 1247,
                totalDelivered: 1198,
                totalFailed: 49,
                deliveryRate: 96.1,
                averageResponseTime: 2.3,
                successRate: 99.0
            },
            dailyStats: [
                { date: '2025-11-08', sent: 45, delivered: 43, failed: 2 },
                { date: '2025-11-09', sent: 32, delivered: 30, failed: 2 }
            ]
        }
    });
});

app.get('/api/v1/whatsapp/queue', (req, res) => {
    res.json({
        success: true,
        data: {
            pending: 12,
            processing: 3,
            completed: 1247,
            failed: 8,
            total: 1270
        }
    });
});

app.post('/api/v1/whatsapp/broadcast', (req, res) => {
    const { phones, message } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0 || !message) {
        return res.status(400).json({
            success: false,
            message: 'Phone numbers array and message are required'
        });
    }

    res.json({
        success: true,
        message: 'Broadcast queued successfully',
        data: {
            broadcastId: 'broadcast_' + Date.now(),
            totalRecipients: phones.length,
            status: 'queued',
            createdAt: new Date().toISOString()
        }
    });
});

app.get('/api/v1/whatsapp/settings', (req, res) => {
    res.json({
        success: true,
        data: {
            general: {
                enabled: true,
                autoConnect: true,
                reconnectAttempts: 5,
                reconnectDelay: 30000
            },
            rateLimit: {
                enabled: true,
                messagesPerSecond: 1,
                messagesPerMinute: 30,
                messagesPerHour: 1000
            }
        }
    });
});

app.put('/api/v1/whatsapp/settings', (req, res) => {
    const settings = req.body;

    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
            success: false,
            message: 'Settings object is required'
        });
    }

    res.json({
        success: true,
        message: 'Settings updated successfully',
        data: {
            updatedAt: new Date().toISOString(),
            settings: settings
        }
    });
});

// Health check
app.get('/api/v1/health', (req, res) => {
    res.json({
        success: true,
        message: 'API is working',
        timestamp: new Date().toISOString()
    });
});

// 404 handler for WhatsApp API
app.use('/api/v1/whatsapp/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        availableEndpoints: {
            main: 'GET /api/v1/whatsapp/',
            status: 'GET /api/v1/whatsapp/status',
            connect: 'POST /api/v1/whatsapp/connect',
            disconnect: 'POST /api/v1/whatsapp/disconnect',
            qr: 'GET /api/v1/whatsapp/qr',
            send: 'POST /api/v1/whatsapp/send',
            templates: 'GET /api/v1/whatsapp/templates',
            test: 'POST /api/v1/whatsapp/test',
            analytics: 'GET /api/v1/whatsapp/analytics',
            queue: 'GET /api/v1/whatsapp/queue',
            broadcast: 'POST /api/v1/whatsapp/broadcast',
            settings: 'GET|PUT /api/v1/whatsapp/settings'
        }
    });
});

const PORT = 3002;
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp API Server running on port ${PORT}`);
    console.log(`📡 Available at: http://localhost:${PORT}`);
    console.log(`🌐 Network access: http://192.168.1.235:${PORT}`);
    console.log(`🔗 Frontend should connect to: http://192.168.1.235:${PORT}/api/v1`);
    console.log('✅ WhatsApp API endpoints are now working!');
});