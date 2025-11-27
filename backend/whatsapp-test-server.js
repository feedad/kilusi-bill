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
            test: 'POST /api/v1/whatsapp/test'
        }
    });
});

const PORT = 3002;
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp API Server running on port ${PORT}`);
    console.log(`📡 Available at: http://localhost:${PORT}`);
    console.log(`🔗 Frontend should connect to: http://192.168.1.235:${PORT}/api/v1`);
});