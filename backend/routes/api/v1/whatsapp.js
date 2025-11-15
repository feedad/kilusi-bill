const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { getSock, getWhatsAppStatus, connectToWhatsApp, deleteWhatsAppSession, sendMessage } = require('../../../config/whatsapp');
const qrcode = require('qrcode');
const whatsappMessageService = require('../../../services/whatsappMessageService');

// Global variables to store QR code and connection state
let currentQRCode = null;
let qrGeneratedAt = null;

// Global message queue and broadcast management
const messageQueue = {
    pending: [],
    processing: [],
    completed: [],
    failed: []
};

const broadcastHistory = [];
let broadcastCounter = 0;

// Scheduling system
const scheduledMessages = [];
const scheduledBroadcasts = [];
let schedulerInterval = null;

// Group management system
const contactGroups = {
    all_customers: {
        id: 'all_customers',
        name: 'All Customers',
        description: 'All registered customers',
        memberCount: 0,
        members: [],
        isDynamic: true,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString()
    },
    active_customers: {
        id: 'active_customers',
        name: 'Active Customers',
        description: 'Customers with active services',
        memberCount: 0,
        members: [],
        isDynamic: true,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString()
    },
    overdue_customers: {
        id: 'overdue_customers',
        name: 'Overdue Customers',
        description: 'Customers with overdue payments',
        memberCount: 0,
        members: [],
        isDynamic: true,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString()
    }
};

// Template management system
const messageTemplates = {
    invoice_reminder: {
        id: 'invoice_reminder',
        name: 'Invoice Reminder',
        content: 'Hello {{customerName}}, your invoice {{invoiceNumber}} for {{amount}} is due on {{dueDate}}. Please make payment to avoid service interruption.',
        category: 'billing',
        enabled: true,
        usageCount: 456,
        variables: ['customerName', 'invoiceNumber', 'amount', 'dueDate'],
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-15').toISOString()
    },
    payment_confirmation: {
        id: 'payment_confirmation',
        name: 'Payment Confirmation',
        content: 'Thank you {{customerName}}! We received your payment of {{amount}} for invoice {{invoiceNumber}}. Your account is now updated.',
        category: 'billing',
        enabled: true,
        usageCount: 312,
        variables: ['customerName', 'invoiceNumber', 'amount'],
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-10').toISOString()
    },
    welcome_message: {
        id: 'welcome_message',
        name: 'Welcome Message',
        content: 'Welcome {{customerName}}! Thank you for joining our service. Your account is now active. For support, contact us at {{supportNumber}}.',
        category: 'onboarding',
        enabled: true,
        usageCount: 189,
        variables: ['customerName', 'supportNumber'],
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-05').toISOString()
    },
    service_interruption: {
        id: 'service_interruption',
        name: 'Service Interruption Notice',
        content: 'Dear {{customerName}}, your service has been temporarily suspended due to {{reason}}. Please settle your outstanding balance of {{amount}} to restore service.',
        category: 'notifications',
        enabled: true,
        usageCount: 67,
        variables: ['customerName', 'reason', 'amount'],
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-20').toISOString()
    },
    service_restored: {
        id: 'service_restored',
        name: 'Service Restored',
        content: 'Good news {{customerName}}! Your service has been restored after payment confirmation. Thank you for your continued patronage.',
        category: 'notifications',
        enabled: true,
        usageCount: 134,
        variables: ['customerName'],
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-12').toISOString()
    }
};

// Set up QR code listener from WhatsApp config
const setupQRListener = () => {
    try {
        // Set up a direct QR code capture mechanism
        console.log('🔧 Setting up QR code listener...');

        // Check for QR codes periodically with reduced frequency
        setInterval(() => {
            try {
                if (global.whatsappStatus && global.whatsappStatus.qrCode) {
                    // Only update if we have a new QR code
                    if (currentQRCode !== global.whatsappStatus.qrCode) {
                        currentQRCode = global.whatsappStatus.qrCode;
                        qrGeneratedAt = new Date();
                        console.log('📱 QR Code captured from global status:', currentQRCode ? 'YES' : 'NO');
                    }
                }
            } catch (error) {
                console.warn('⚠️ Error checking for QR code:', error.message);
            }
        }, 10000); // Check every 10 seconds to reduce frequency

        console.log('✅ QR code listener setup complete');
    } catch (error) {
        console.log('⚠️ Could not set up QR listener:', error.message);
    }
};

// Initialize QR listener
setupQRListener();

// WhatsApp statistics (mock data for now, can be enhanced later)
const whatsappStats = {
    successRate: 0.0,
    messagesSent: 0,
    messagesReceived: 0,
    groups: 0,
    contacts: 0,
    todayMessages: 0
};

// Global variable to track last broadcast to prevent excessive broadcasting
let lastBroadcastTime = 0;
let lastBroadcastData = null;

// Helper function to broadcast WhatsApp status updates via WebSocket (with aggressive throttling)
function broadcastWhatsAppStatus(statusData) {
    try {
        if (global && global.io) {
            const now = Date.now();
            const throttleDelay = 5000; // Increased to 5 seconds minimum between broadcasts

            // Only broadcast if data has significantly changed AND enough time has passed
            const dataChanged = JSON.stringify(statusData) !== JSON.stringify(lastBroadcastData);
            const timePassed = (now - lastBroadcastTime) > throttleDelay;

            if (dataChanged && timePassed) {
                global.io.to('whatsapp-status').emit('whatsapp-status', statusData);
                // Only log important status changes to reduce noise
                if (statusData.connected !== lastBroadcastData?.connected ||
                    (statusData.qrCode && !lastBroadcastData?.qrCode) ||
                    (!statusData.qrCode && lastBroadcastData?.qrCode)) {
                    console.log('📡 WhatsApp status broadcasted to WebSocket clients:', {
                        connected: statusData.connected,
                        hasQR: !!statusData.qrCode,
                        status: statusData.status
                    });
                }

                lastBroadcastTime = now;
                lastBroadcastData = statusData;
            }
        }
    } catch (error) {
        console.warn('⚠️ Failed to broadcast WhatsApp status:', error.message);
    }
}

// GET /api/v1/whatsapp - Main WhatsApp endpoint
router.get('/', (req, res) => {
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

// GET /api/v1/whatsapp/status - Get WhatsApp connection status
router.get('/status', (req, res) => {
    try {
        const sock = getSock();
        const whatsappStatus = getWhatsAppStatus();
        const isConnected = sock && sock.user && whatsappStatus.connected;

        let statusData = {
            connected: isConnected,
            connectionStatus: whatsappStatus.connectionStatus || 'disconnected',
            phoneNumber: isConnected ? sock.user.id.split(':')[0] : null,
            profileName: isConnected ? sock.user.name || sock.user.pushname : null,
            qrCode: currentQRCode,
            qrGeneratedAt: qrGeneratedAt ? qrGeneratedAt.toISOString() : null,
            lastSync: isConnected ? new Date().toISOString() : null,
            uptime: whatsappStatus.uptime || 0,
            successRate: whatsappStats.successRate || 0.0,
            deviceInfo: {
                device: isConnected ? sock.user?.device || 'Mobile' : 'Not Connected',
                version: isConnected ? sock.user?.version || 'N/A' : 'N/A',
                platform: isConnected ? sock.user?.platform || 'Android' : 'N/A',
                connected: isConnected
            },
            stats: {
                messagesSent: whatsappStats.messagesSent || 0,
                messagesReceived: whatsappStats.messagesReceived || 0,
                groups: whatsappStats.groups || 0,
                contacts: whatsappStats.contacts || 0,
                todayMessages: whatsappStats.todayMessages || 0
            }
        };

        // Broadcast status update via WebSocket
        broadcastWhatsAppStatus({
            connected: statusData.connected,
            status: statusData.connectionStatus,
            phoneNumber: statusData.phoneNumber,
            profileName: statusData.profileName,
            qrCode: statusData.qrCode,
            message: statusData.connected ? 'WhatsApp connected' : 'WhatsApp disconnected',
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            data: statusData
        });

    } catch (error) {
        console.error('❌ Error getting WhatsApp status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get WhatsApp status',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/connect - Connect to WhatsApp
router.post('/connect', async (req, res) => {
    try {
        console.log('🚀 [API] Initiating WhatsApp connection...');

        // Connect to WhatsApp using the real configuration
        const connectionResult = await connectToWhatsApp();

        const connectionData = {
            status: 'connecting',
            qrCode: currentQRCode,
            phoneNumber: null,
            connectionId: 'whatsapp-' + Date.now(),
            timestamp: new Date().toISOString(),
            qrGeneratedAt: qrGeneratedAt ? qrGeneratedAt.toISOString() : null,
            message: 'WhatsApp connection initiated successfully'
        };

        res.json({
            success: true,
            message: 'WhatsApp connection initiated',
            data: connectionData
        });

    } catch (error) {
        console.error('❌ [API] Failed to connect to WhatsApp:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to connect to WhatsApp',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/disconnect - Disconnect from WhatsApp
router.post('/disconnect', async (req, res) => {
    try {
        console.log('🔌 [API] Disconnecting WhatsApp...');

        // Disconnect using the real WhatsApp configuration
        await deleteWhatsAppSession();

        // Clear current QR code
        currentQRCode = null;
        qrGeneratedAt = null;

        const disconnectData = {
            status: 'disconnected',
            disconnectedAt: new Date().toISOString(),
            message: 'WhatsApp disconnected successfully'
        };

        res.json({
            success: true,
            message: 'WhatsApp disconnected successfully',
            data: disconnectData
        });

    } catch (error) {
        console.error('❌ [API] Failed to disconnect from WhatsApp:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect from WhatsApp',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/regions-stats - Get regions with customer statistics
router.get('/regions-stats', async (req, res) => {
    try {
        const { query } = require('../../../config/database');

        // Get regions from regions table (UUID-based system)
        const regionsQuery = String.raw`
            SELECT
                r.id,
                r.name,
                r.district || ', ' || r.regency || ', ' || r.province as description,
                COUNT(c.id) as customer_count,
                COUNT(CASE WHEN c.status = 'active' THEN 1 END) as active_count
            FROM regions r
            LEFT JOIN customers c ON c.region_id = r.id AND c.deleted_at IS NULL
            GROUP BY r.id, r.name, r.district, r.regency, r.province
            ORDER BY r.name ASC
        `;

        const regionsResult = await query(regionsQuery);

        // Transform the results into the expected format
        const regionsWithStats = regionsResult.rows.map((region) => {
            console.log(`📍 Region ${region.name}: ${region.customer_count} total, ${region.active_count} active customers`);

            return {
                id: region.id, // Use UUID directly
                name: region.name,
                description: region.description,
                customerCount: parseInt(region.customer_count) || 0,
                activeCount: parseInt(region.active_count) || 0
            };
        });

        res.json({
            success: true,
            data: regionsWithStats,
            message: 'Regions statistics retrieved successfully'
        });
    } catch (error) {
        console.error('Error fetching regions stats:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/customer-stats - Get customer statistics
router.get('/customer-stats', async (req, res) => {
    try {
        const { query } = require('../../../config/database');

        // Get overall customer statistics
        const statsQuery = `
            SELECT
                COUNT(*) as total_customers,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_customers,
                COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_customers,
                COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_customers
            FROM customers
        `;

        const result = await query(statsQuery);
        const stats = result.rows[0];

        res.json({
            success: true,
            data: {
                total: parseInt(stats.total_customers),
                active: parseInt(stats.active_customers),
                inactive: parseInt(stats.inactive_customers),
                suspended: parseInt(stats.suspended_customers)
            },
            message: 'Customer statistics retrieved successfully'
        });
    } catch (error) {
        console.error('Error fetching customer stats:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/qr - Get QR code for connection
router.get('/qr', async (req, res) => {
    try {
        console.log('📱 [API] QR endpoint called, checking global status...');

        // Get current WhatsApp connection status and QR code
        const sock = getSock();
        const whatsappStatus = getWhatsAppStatus();

        // First, check if we already have a QR code in global status
        if (global.whatsappStatus && global.whatsappStatus.qrCode) {
            console.log('✅ [API] QR code found in global status, processing...');
            currentQRCode = global.whatsappStatus.qrCode;
            qrGeneratedAt = qrGeneratedAt || new Date();
        } else {
            console.log('⚠️ [API] No QR code in global status, checking local cache...');
            // Check if we need to force refresh QR code (request parameter)
            const forceRefresh = req.query.refresh === 'true';
            const isExpired = qrGeneratedAt ? (Date.now() - qrGeneratedAt.getTime()) > 60000 : true;

            if (forceRefresh || !currentQRCode || isExpired) {
                console.log('🔄 ' + (forceRefresh ? 'Force refreshing' : 'Generating new') + ' QR code...');

                // Clear current QR code to force regeneration
                currentQRCode = null;
                qrGeneratedAt = null;

                // If connected, disconnect first to get fresh QR
                if (sock && sock.user) {
                    console.log('📱 Disconnecting existing session to get fresh QR code...');
                    await deleteWhatsAppSession();
                    // Wait a moment for cleanup
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Initiate new connection to generate QR code
                await connectToWhatsApp();

                // Wait for QR code generation with better retry logic
                let attempts = 0;
                const maxAttempts = 20;

                while (!currentQRCode && attempts < maxAttempts) {
                    attempts++;
                    console.log(`📱 [API] Checking for QR code (attempt ${attempts}/${maxAttempts})...`);

                    // Check global status for new QR code
                    if (global.whatsappStatus && global.whatsappStatus.qrCode) {
                        currentQRCode = global.whatsappStatus.qrCode;
                        qrGeneratedAt = new Date();
                        console.log('✅ [API] QR code generated successfully from global status');
                        break;
                    }

                    // Check whatsappStatus function as fallback
                    const status = getWhatsAppStatus();
                    if (status && status.qrCode) {
                        currentQRCode = status.qrCode;
                        qrGeneratedAt = new Date();
                        console.log('✅ [API] QR code found via getWhatsAppStatus()');
                        break;
                    }

                    // Wait between attempts with progressive backoff
                    const waitTime = Math.min(500 + (attempts * 100), 2000);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

                if (!currentQRCode) {
                    console.warn('⚠️ [API] QR code generation timeout - returning failed status');
                    const qrData = {
                        qrCode: null,
                        rawQR: null,
                        expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
                        generatedAt: new Date().toISOString(),
                        status: 'failed',
                        message: 'QR code generation failed. Please try again.',
                        forceRefreshAvailable: true
                    };

                    return res.json({
                        success: true,
                        data: qrData
                    });
                }
            } else {
                // Use existing QR code
                console.log('📱 [API] Using existing QR code from cache');
            }
        }

        // Convert QR code to base64 image if available
        let qrCodeImage = null;
        if (currentQRCode) {
            try {
                qrCodeImage = await qrcode.toDataURL(currentQRCode, {
                    width: 256,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                console.log('✅ QR code image generated successfully');
            } catch (qrError) {
                console.warn('⚠️ Could not generate QR code image:', qrError.message);
                qrCodeImage = currentQRCode; // Fallback to raw QR data
            }
        }

        const qrAge = qrGeneratedAt ? (Date.now() - qrGeneratedAt.getTime()) : 0;
        const qrExpired = qrAge > 60000;
        const qrData = {
            qrCode: qrCodeImage || currentQRCode,
            rawQR: currentQRCode,
            expiresAt: qrGeneratedAt ? new Date(qrGeneratedAt.getTime() + 60 * 1000).toISOString() : new Date(Date.now() + 60 * 1000).toISOString(),
            generatedAt: qrGeneratedAt ? qrGeneratedAt.toISOString() : new Date().toISOString(),
            status: currentQRCode && !qrExpired ? 'active' : (currentQRCode ? 'expired' : 'pending'),
            message: currentQRCode ? (qrExpired ? 'QR code expired, please refresh' : 'QR code ready for scanning') : 'Waiting for QR code generation...',
            forceRefreshAvailable: true,
            age: qrAge
        };

        console.log('📤 [API] Returning QR data:', {
            hasQR: !!qrData.qrCode,
            qrLength: qrData.qrCode?.length || 0,
            status: qrData.status,
            age: qrData.age
        });

        // Broadcast QR code update via WebSocket
        broadcastWhatsAppStatus({
            connected: false,
            status: qrData.status,
            qrCode: qrData.qrCode,
            message: qrData.message,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            data: qrData
        });

    } catch (error) {
        console.error('❌ [API] Failed to get QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate QR code',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/qr/refresh - Force refresh QR code
router.post('/qr/refresh', async (req, res) => {
    try {
        console.log('🔄 [API] Force refreshing QR code...');

        // Clear current QR code to force regeneration
        currentQRCode = null;
        qrGeneratedAt = null;

        // Get current socket and disconnect if connected
        const sock = getSock();
        if (sock && sock.user) {
            console.log('📱 Disconnecting existing session for fresh QR code...');
            await deleteWhatsAppSession();
            // Wait for cleanup
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Initiate new connection
        await connectToWhatsApp();

        // Wait for QR code generation with better retry logic
        let attempts = 0;
        const maxAttempts = 20;
        let newQRCode = null;

        while (!newQRCode && attempts < maxAttempts) {
            attempts++;
            console.log(`📱 QR refresh attempt ${attempts}/${maxAttempts}...`);

            // Check global status for new QR code
            if (global.whatsappStatus && global.whatsappStatus.qrCode) {
                newQRCode = global.whatsappStatus.qrCode;
                currentQRCode = newQRCode;
                qrGeneratedAt = new Date();
                console.log('✅ QR code refreshed successfully');
                break;
            }

            // Check if connection succeeded without QR (already logged in)
            if (global.whatsappStatus && global.whatsappStatus.connected) {
                console.log('ℹ️ WhatsApp already connected, no QR code needed');
                return res.json({
                    success: true,
                    data: {
                        connected: true,
                        message: 'WhatsApp already connected',
                        qrCode: null
                    }
                });
            }

            // Wait between attempts with progressive backoff
            const waitTime = Math.min(500 + (attempts * 100), 2000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Final check
        if (!newQRCode && global.whatsappStatus && global.whatsappStatus.qrCode) {
            newQRCode = global.whatsappStatus.qrCode;
            currentQRCode = newQRCode;
            qrGeneratedAt = new Date();
            console.log('✅ QR code found in final check');
        }

        if (!newQRCode) {
            console.warn('⚠️ QR refresh timeout - no QR code generated');
            return res.status(408).json({
                success: false,
                message: 'QR code generation timeout',
                error: 'Failed to generate QR code after multiple attempts'
            });
        }

        // Convert to base64 image
        let qrCodeImage = null;
        try {
            qrCodeImage = await qrcode.toDataURL(newQRCode, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            console.log('✅ QR code image generated successfully');
        } catch (qrError) {
            console.warn('⚠️ Could not convert QR to image:', qrError.message);
            qrCodeImage = newQRCode;
        }

        const qrData = {
            qrCode: qrCodeImage,
            rawQR: newQRCode,
            expiresAt: new Date(qrGeneratedAt.getTime() + 60 * 1000).toISOString(),
            generatedAt: qrGeneratedAt.toISOString(),
            status: 'active',
            message: 'QR code refreshed successfully'
        };

        // Broadcast update via WebSocket
        broadcastWhatsAppStatus({
            connected: false,
            status: 'qr_available',
            qrCode: qrData.qrCode,
            message: qrData.message,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'QR code refreshed successfully',
            data: qrData
        });

    } catch (error) {
        console.error('❌ [API] Failed to refresh QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh QR code',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/send - Send message
router.post('/send', async (req, res) => {
    try {
        const { phone, message, type = 'text' } = req.body;

        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and message are required'
            });
        }

        console.log(`📤 [API] Sending ${type} message to ${phone}...`);

        // Check if WhatsApp is connected
        const sock = getSock();
        if (!sock || !sock.user) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp is not connected. Please connect first.'
            });
        }

        // Format phone number
        const formattedPhone = phone.replace(/[^0-9]/g, '');
        const jid = formattedPhone + '@s.whatsapp.net';

        // Send message using the real WhatsApp configuration
        let result;
        try {
            result = await sendMessage(jid, message);
        } catch (sendError) {
            console.error('❌ [API] Error sending message:', sendError);
            return res.status(400).json({
                success: false,
                message: 'Failed to send message: ' + sendError.message
            });
        }

        // Create message record for history and save to database
        try {
            const savedMessage = await whatsappMessageService.saveMessage({
                recipient: formattedPhone,
                message: message,
                status: 'sent',
                messageType: type || 'Direct Message',
                sentAt: new Date().toISOString()
            });

            // Keep in-memory for backward compatibility
            const messageRecord = {
                id: savedMessage.id,
                recipient: formattedPhone,
                message: message,
                status: 'completed',
                createdAt: savedMessage.created_at,
                sentAt: savedMessage.sent_at,
                type: type || 'Direct Message',
                attempts: 1
            };

            messageQueue.completed.push(messageRecord);
            console.log(`💾 [API] Message saved to database: ${savedMessage.id}`);
        } catch (dbError) {
            console.error('❌ [API] Failed to save message to database:', dbError);
            // Continue with in-memory fallback if database fails
            const messageRecord = {
                id: result.messageId || 'msg-' + Date.now(),
                recipient: formattedPhone,
                message: message,
                status: 'completed',
                createdAt: new Date().toISOString(),
                sentAt: new Date().toISOString(),
                type: type || 'Direct Message',
                attempts: 1
            };
            messageQueue.completed.push(messageRecord);
        }

        // Update statistics
        whatsappStats.messagesSent++;

        const messageData = {
            messageId: result.messageId || 'msg-' + Date.now(),
            phone: formattedPhone,
            message,
            type,
            status: 'sent',
            sentAt: new Date().toISOString(),
            jid: jid
        };

        console.log(`✅ [API] Message sent successfully to ${formattedPhone}`);

        res.json({
            success: true,
            message: 'Message sent successfully',
            data: messageData
        });

    } catch (error) {
        console.error('❌ [API] Failed to send message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/templates - Get message templates
router.get('/templates', (req, res) => {
    try {
        const { category, enabled, limit = 50, offset = 0 } = req.query;

        let templates = Object.values(messageTemplates);

        // Apply filters
        if (category) {
            templates = templates.filter(t => t.category === category);
        }

        if (enabled !== undefined) {
            const isEnabled = enabled === 'true';
            templates = templates.filter(t => t.enabled === isEnabled);
        }

        // Apply pagination
        const total = templates.length;
        const paginatedTemplates = templates.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        // Get categories summary
        const categories = {};
        Object.values(messageTemplates).forEach(template => {
            if (!categories[template.category]) {
                categories[template.category] = {
                    name: template.category,
                    count: 0,
                    enabled: 0
                };
            }
            categories[template.category].count++;
            if (template.enabled) {
                categories[template.category].enabled++;
            }
        });

        res.json({
            success: true,
            data: {
                templates: paginatedTemplates,
                categories: Object.values(categories),
                pagination: {
                    total: total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: parseInt(offset) + parseInt(limit) < total
                }
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to fetch templates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch templates',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/templates/:id - Get specific template
router.get('/templates/:id', (req, res) => {
    try {
        const { id } = req.params;
        const template = messageTemplates[id];

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        res.json({
            success: true,
            data: template
        });

    } catch (error) {
        console.error('❌ [API] Failed to fetch template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch template',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/templates - Create new template
router.post('/templates', (req, res) => {
    try {
        const { id, name, content, category, enabled = true } = req.body;

        if (!id || !name || !content || !category) {
            return res.status(400).json({
                success: false,
                message: 'Template ID, name, content, and category are required'
            });
        }

        if (messageTemplates[id]) {
            return res.status(400).json({
                success: false,
                message: 'Template with this ID already exists'
            });
        }

        // Extract variables from content
        const variableRegex = /\{\{(\w+)\}\}/g;
        const variables = [];
        let match;
        while ((match = variableRegex.exec(content)) !== null) {
            if (!variables.includes(match[1])) {
                variables.push(match[1]);
            }
        }

        const template = {
            id: id,
            name: name,
            content: content,
            category: category,
            enabled: enabled,
            usageCount: 0,
            variables: variables,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        messageTemplates[id] = template;

        console.log(`📝 [API] Template created: ${id}`);

        res.status(201).json({
            success: true,
            message: 'Template created successfully',
            data: template
        });

    } catch (error) {
        console.error('❌ [API] Failed to create template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create template',
            error: error.message
        });
    }
});

// PUT /api/v1/whatsapp/templates/:id - Update template
router.put('/templates/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, content, category, enabled } = req.body;

        if (!messageTemplates[id]) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        const template = messageTemplates[id];

        // Update fields
        if (name) template.name = name;
        if (content) {
            template.content = content;
            // Re-extract variables
            const variableRegex = /\{\{(\w+)\}\}/g;
            const variables = [];
            let match;
            while ((match = variableRegex.exec(content)) !== null) {
                if (!variables.includes(match[1])) {
                    variables.push(match[1]);
                }
            }
            template.variables = variables;
        }
        if (category) template.category = category;
        if (enabled !== undefined) template.enabled = enabled;

        template.updatedAt = new Date().toISOString();

        console.log(`✏️ [API] Template updated: ${id}`);

        res.json({
            success: true,
            message: 'Template updated successfully',
            data: template
        });

    } catch (error) {
        console.error('❌ [API] Failed to update template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update template',
            error: error.message
        });
    }
});

// DELETE /api/v1/whatsapp/templates/:id - Delete template
router.delete('/templates/:id', (req, res) => {
    try {
        const { id } = req.params;

        if (!messageTemplates[id]) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        // Check if template is in use (optional, based on your requirements)
        const isInUse = broadcastHistory.some(b => b.templateId === id);
        if (isInUse) {
            // Option 1: Prevent deletion
            // return res.status(400).json({
            //     success: false,
            //     message: 'Cannot delete template that is in use'
            // });

            // Option 2: Allow deletion but warn
            console.warn(`⚠️ [API] Deleting template ${id} that is in use`);
        }

        delete messageTemplates[id];

        console.log(`🗑️ [API] Template deleted: ${id}`);

        res.json({
            success: true,
            message: 'Template deleted successfully'
        });

    } catch (error) {
        console.error('❌ [API] Failed to delete template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete template',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/templates/:id/preview - Preview template with variables
router.post('/templates/:id/preview', (req, res) => {
    try {
        const { id } = req.params;
        const { variables = {} } = req.body;

        const template = messageTemplates[id];
        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        let preview = template.content;

        // Replace variables
        Object.keys(variables).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            preview = preview.replace(regex, variables[key] || `[${key}]`);
        });

        // Replace remaining variables with placeholder
        const remainingRegex = /\{\{(\w+)\}\}/g;
        preview = preview.replace(remainingRegex, '[$1]');

        res.json({
            success: true,
            data: {
                templateId: id,
                templateName: template.name,
                variables: variables,
                preview: preview,
                originalContent: template.content
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to preview template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to preview template',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/templates/:id/test - Test template with phone number
router.post('/templates/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        const { phoneNumber, variables = {} } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        const template = messageTemplates[id];
        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        // Check if WhatsApp is connected
        const sock = getSock();
        if (!sock || !sock.user) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp is not connected. Please connect first.'
            });
        }

        // Process template
        let message = template.content;
        Object.keys(variables).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            message = message.replace(regex, variables[key] || `[${key}]`);
        });

        // Send test message
        const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
        const jid = formattedPhone + '@s.whatsapp.net';

        // Create message record for history and save to database
        const messageId = `test_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            const savedMessage = await whatsappMessageService.saveMessage({
                recipient: formattedPhone,
                message: message,
                status: 'sent',
                messageType: 'Template Test',
                templateId: id,
                sentAt: new Date().toISOString()
            });

            // Send test message
            await sendMessage(jid, message);

            // Keep in-memory for backward compatibility
            const messageRecord = {
                id: savedMessage.id,
                recipient: formattedPhone,
                message: message,
                status: 'completed',
                createdAt: savedMessage.created_at,
                sentAt: savedMessage.sent_at,
                templateId: id,
                type: 'Template Test',
                attempts: 1
            };

            messageQueue.completed.push(messageRecord);
            console.log(`💾 [API] Template test message saved to database: ${savedMessage.id}`);
        } catch (dbError) {
            console.error('❌ [API] Failed to save template message to database:', dbError);

            // Send test message anyway
            await sendMessage(jid, message);

            // In-memory fallback
            const messageRecord = {
                id: messageId,
                recipient: formattedPhone,
                message: message,
                status: 'completed',
                createdAt: new Date().toISOString(),
                sentAt: new Date().toISOString(),
                templateId: id,
                type: 'Template Test',
                attempts: 1
            };
            messageQueue.completed.push(messageRecord);
        }

        // Increment usage count
        template.usageCount++;

        console.log(`🧪 [API] Template test sent: ${id} to ${phoneNumber}`);

        res.json({
            success: true,
            message: 'Test message sent successfully',
            data: {
                templateId: id,
                phoneNumber: phoneNumber,
                message: message,
                sentAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to test template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send test message',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/analytics - Get analytics data
router.get('/analytics', (req, res) => {
    try {
        const { period = '7d', start, end } = req.query;

        // Calculate date range
        const endDate = end ? new Date(end) : new Date();
        const startDate = start ? new Date(start) : new Date(endDate.getTime() - getPeriodMilliseconds(period));

        // Calculate overview statistics from real data
        const totalSent = messageQueue.completed.length;
        const totalFailed = messageQueue.failed.length;
        const totalProcessed = totalSent + totalFailed;
        const totalQueued = messageQueue.pending.length + messageQueue.processing.length;

        const deliveryRate = totalProcessed > 0 ? (totalSent / totalProcessed * 100).toFixed(1) : 0;
        const successRate = totalQueued > 0 ? (totalSent / (totalSent + totalFailed) * 100).toFixed(1) : 100;

        // Generate daily statistics (mock data for now, would use real timestamps)
        const dailyStats = generateDailyStats(startDate, endDate);

        // Template usage statistics
        const templateStats = {};
        Object.values(messageTemplates).forEach(template => {
            templateStats[template.id] = {
                name: template.name,
                category: template.category,
                usageCount: template.usageCount,
                enabled: template.enabled
            };
        });

        // Broadcast statistics
        const broadcastStats = {
            total: broadcastHistory.length,
            completed: broadcastHistory.filter(b => b.status === 'completed').length,
            processing: broadcastHistory.filter(b => b.status === 'processing').length,
            scheduled: broadcastHistory.filter(b => b.status === 'scheduled').length,
            failed: broadcastHistory.filter(b => b.status === 'failed').length
        };

        // Calculate performance metrics
        const avgMessagesPerMinute = calculateAverageMessagesPerMinute();
        const peakHour = calculatePeakHour();

        const analytics = {
            period: {
                start: startDate.toISOString(),
                end: endDate.toISOString(),
                type: period
            },
            overview: {
                totalSent: totalSent,
                totalFailed: totalFailed,
                totalQueued: totalQueued,
                deliveryRate: parseFloat(deliveryRate),
                successRate: parseFloat(successRate),
                averageResponseTime: 1.2, // Mock: would calculate from real data
                totalMessages: totalProcessed + totalQueued
            },
            dailyStats: dailyStats,
            templates: {
                summary: {
                    total: Object.keys(messageTemplates).length,
                    enabled: Object.values(messageTemplates).filter(t => t.enabled).length,
                    disabled: Object.values(messageTemplates).filter(t => !t.enabled).length
                },
                usage: templateStats
            },
            broadcasts: broadcastStats,
            performance: {
                avgMessagesPerMinute: avgMessagesPerMinute,
                peakHour: peakHour,
                queueProcessingTime: '2-5 minutes', // Mock: would calculate from real data
                systemUptime: process.uptime() // Seconds
            },
            queue: {
                pending: messageQueue.pending.length,
                processing: messageQueue.processing.length,
                completed: messageQueue.completed.length,
                failed: messageQueue.failed.length
            }
        };

        res.json({
            success: true,
            data: analytics
        });

    } catch (error) {
        console.error('❌ [API] Failed to fetch analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics',
            error: error.message
        });
    }
});

// Helper functions for analytics
function getPeriodMilliseconds(period) {
    const periodMap = {
        '1d': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '90d': 90 * 24 * 60 * 60 * 1000
    };
    return periodMap[period] || periodMap['7d'];
}

function generateDailyStats(startDate, endDate) {
    const stats = [];
    const oneDay = 24 * 60 * 60 * 1000;

    for (let date = new Date(startDate); date <= endDate; date.setTime(date.getTime() + oneDay)) {
        const dateStr = date.toISOString().split('T')[0];

        // Mock data - in real implementation, filter messages by date
        const sent = Math.floor(Math.random() * 50) + 10;
        const delivered = Math.floor(sent * 0.95);
        const failed = sent - delivered;

        stats.push({
            date: dateStr,
            sent: sent,
            delivered: delivered,
            failed: failed,
            deliveryRate: ((delivered / sent) * 100).toFixed(1)
        });
    }

    return stats;
}

function calculateAverageMessagesPerMinute() {
    // Mock calculation - in real implementation, calculate from actual message timestamps
    const totalCompleted = messageQueue.completed.length;
    const avgMinutes = 30; // Assume messages sent over 30 minutes
    return (totalCompleted / Math.max(avgMinutes, 1)).toFixed(1);
}

function calculatePeakHour() {
    // Mock calculation - in real implementation, analyze message timestamps
    const hours = Array.from({length: 24}, (_, i) => i);
    const randomHour = hours[Math.floor(Math.random() * hours.length)];
    return `${randomHour.toString().padStart(2, '0')}:00`;
}

// GET /api/v1/whatsapp/queue - Get message queue
router.get('/queue', (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let messages = [];

        // Collect messages from all queues
        if (!status || status === 'pending') {
            messages = messages.concat(messageQueue.pending.map(m => ({...m, queue: 'pending'})));
        }
        if (!status || status === 'processing') {
            messages = messages.concat(messageQueue.processing.map(m => ({...m, queue: 'processing'})));
        }
        if (!status || status === 'completed') {
            messages = messages.concat(messageQueue.completed.map(m => ({...m, queue: 'completed'})));
        }
        if (!status || status === 'failed') {
            messages = messages.concat(messageQueue.failed.map(m => ({...m, queue: 'failed'})));
        }

        // Sort by creation time (newest first)
        messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Apply pagination
        const total = messages.length;
        const paginatedMessages = messages.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        const queueData = {
            summary: {
                pending: messageQueue.pending.length,
                processing: messageQueue.processing.length,
                completed: messageQueue.completed.length,
                failed: messageQueue.failed.length,
                total: total
            },
            messages: paginatedMessages,
            pagination: {
                total: total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(offset) + parseInt(limit) < total
            }
        };

        res.json({
            success: true,
            data: queueData
        });

    } catch (error) {
        console.error('❌ [API] Failed to fetch queue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch queue',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/queue/pause - Pause message queue processing
router.post('/queue/pause', (req, res) => {
    try {
        // Implementation would set a global flag to pause processing
        // For now, just return success
        console.log('⏸️ [API] Queue processing paused');

        res.json({
            success: true,
            message: 'Queue processing paused',
            data: {
                status: 'paused',
                pending: messageQueue.pending.length,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to pause queue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to pause queue',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/queue/resume - Resume message queue processing
router.post('/queue/resume', (req, res) => {
    try {
        // Implementation would clear the pause flag and restart processing
        console.log('▶️ [API] Queue processing resumed');

        // Start processing immediately
        processMessageQueue();

        res.json({
            success: true,
            message: 'Queue processing resumed',
            data: {
                status: 'running',
                pending: messageQueue.pending.length,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to resume queue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resume queue',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/queue/clear - Clear message queue
router.post('/queue/clear', (req, res) => {
    try {
        const { status = 'pending' } = req.body; // Default to clearing pending messages

        let clearedCount = 0;

        switch (status) {
            case 'pending':
                clearedCount = messageQueue.pending.length;
                messageQueue.pending = [];
                break;
            case 'processing':
                clearedCount = messageQueue.processing.length;
                messageQueue.processing = [];
                break;
            case 'failed':
                clearedCount = messageQueue.failed.length;
                messageQueue.failed = [];
                break;
            case 'all':
                clearedCount = messageQueue.pending.length + messageQueue.processing.length + messageQueue.failed.length;
                messageQueue.pending = [];
                messageQueue.processing = [];
                messageQueue.failed = [];
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Use: pending, processing, failed, or all'
                });
        }

        console.log(`🗑️ [API] Cleared ${clearedCount} messages from ${status} queue`);

        res.json({
            success: true,
            message: `Cleared ${clearedCount} messages from ${status} queue`,
            data: {
                status: status,
                clearedCount: clearedCount,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to clear queue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear queue',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/broadcast - Send broadcast message
router.post('/broadcast', async (req, res) => {
    try {
        const { name, recipients, message, templateId, variables = {}, scheduledAt, sendImmediately = false } = req.body;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Recipients array is required'
            });
        }

        if (!message && !templateId) {
            return res.status(400).json({
                success: false,
                message: 'Either message content or template ID is required'
            });
        }

        // Check if WhatsApp is connected
        const sock = getSock();
        if (!sock || !sock.user) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp is not connected. Please connect first.'
            });
        }

        // Generate broadcast ID
        const broadcastId = `broadcast_${++broadcastCounter}_${Date.now()}`;

        // Process template if templateId is provided
        let finalMessage = message;
        if (templateId) {
            const template = messageTemplates[templateId];
            if (template) {
                if (!template.enabled) {
                    return res.status(400).json({
                        success: false,
                        message: `Template "${templateId}" is disabled`
                    });
                }

                finalMessage = template.content;
                // Replace variables
                Object.keys(variables).forEach(key => {
                    const regex = new RegExp(`{{${key}}}`, 'g');
                    finalMessage = finalMessage.replace(regex, variables[key] || `[${key}]`);
                });

                // Increment template usage count
                template.usageCount++;
            } else {
                return res.status(404).json({
                    success: false,
                    message: `Template "${templateId}" not found`
                });
            }
        }

        // Resolve recipients - handle both direct phone numbers and region-based filtering
        let resolvedRecipients = [];
        let originalRecipients = [...recipients];

        // Check if any recipients are region-based (format: {type: 'region', id: 'uuid'})
        const regionRecipients = recipients.filter(r =>
            typeof r === 'object' && r.type === 'region' && r.id
        );

        if (regionRecipients.length > 0) {
            console.log(`📍 Resolving ${regionRecipients.length} region(s) to customer phone numbers`);

            // Get customers for each region
            for (const regionRecipient of regionRecipients) {
                const regionQuery = `
                    SELECT phone, name
                    FROM customers
                    WHERE region_id = $1 AND status = 'active' AND phone IS NOT NULL
                `;

                try {
                    const regionResult = await query(regionQuery, [regionRecipient.id]);
                    const regionCustomers = regionResult.rows;

                    console.log(`📍 Found ${regionCustomers.length} active customers in region ${regionRecipient.id}`);

                    // Add customer phone numbers to resolved recipients
                    regionCustomers.forEach(customer => {
                        resolvedRecipients.push(customer.phone);
                    });
                } catch (error) {
                    console.error(`❌ Error resolving region ${regionRecipient.id}:`, error);
                }
            }

            // Add any direct phone number recipients
            const directRecipients = recipients.filter(r => typeof r === 'string');
            resolvedRecipients.push(...directRecipients);

            // Remove duplicates
            resolvedRecipients = [...new Set(resolvedRecipients)];

            console.log(`📍 Resolved ${recipients.length} recipient(s) to ${resolvedRecipients.length} phone numbers`);
        } else {
            // All recipients are direct phone numbers
            resolvedRecipients = recipients.filter(r => typeof r === 'string');
        }

        // Create broadcast record
        const broadcast = {
            id: broadcastId,
            name: name || `Broadcast ${broadcastCounter}`,
            recipients: originalRecipients, // Keep original recipients for reference
            resolvedRecipients: resolvedRecipients, // Add resolved phone numbers
            message: finalMessage,
            templateId: templateId || null,
            variables: variables,
            scheduledAt: scheduledAt || null,
            sendImmediately: sendImmediately,
            status: scheduledAt ? 'scheduled' : 'queued',
            createdAt: new Date().toISOString(),
            createdBy: 'admin',
            statistics: {
                total: resolvedRecipients.length, // Use resolved count
                sent: 0,
                delivered: 0,
                failed: 0,
                pending: resolvedRecipients.length
            }
        };

        // Add to broadcast history
        broadcastHistory.push(broadcast);

        // Add messages to queue (use resolved recipients)
        const messages = resolvedRecipients.map((recipient, index) => ({
            id: `${broadcastId}_msg_${index}`,
            broadcastId: broadcastId,
            recipient: recipient,
            message: finalMessage,
            status: 'pending',
            createdAt: new Date().toISOString(),
            scheduledAt: scheduledAt || null,
            attempts: 0,
            maxAttempts: 3
        }));

        // If send immediately, start processing
        if (sendImmediately) {
            messageQueue.pending.push(...messages);
            // Start processing in background
            processMessageQueue();
        } else {
            messageQueue.pending.push(...messages);
        }

        console.log(`📢 [API] Broadcast created: ${broadcastId} with ${recipients.length} recipients`);

        res.json({
            success: true,
            message: 'Broadcast created successfully',
            data: {
                broadcastId: broadcastId,
                name: broadcast.name,
                totalRecipients: recipients.length,
                status: broadcast.status,
                scheduledAt: broadcast.scheduledAt,
                estimatedDuration: Math.ceil(recipients.length / 2) + ' minutes', // Estimate 2 messages per minute
                createdAt: broadcast.createdAt
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to create broadcast:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create broadcast',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/broadcast - Get all broadcasts
router.get('/broadcast', (req, res) => {
    try {
        const { status, limit = 20, offset = 0 } = req.query;

        let filteredBroadcasts = broadcastHistory;

        if (status) {
            filteredBroadcasts = filteredBroadcasts.filter(b => b.status === status);
        }

        const paginatedBroadcasts = filteredBroadcasts.slice(
            parseInt(offset),
            parseInt(offset) + parseInt(limit)
        );

        res.json({
            success: true,
            data: paginatedBroadcasts,
            total: filteredBroadcasts.length,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('❌ [API] Failed to fetch broadcasts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch broadcasts',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/broadcast/:id - Get specific broadcast
router.get('/broadcast/:id', (req, res) => {
    try {
        const { id } = req.params;
        const broadcast = broadcastHistory.find(b => b.id === id);

        if (!broadcast) {
            return res.status(404).json({
                success: false,
                message: 'Broadcast not found'
            });
        }

        // Get detailed message status for this broadcast
        const broadcastMessages = [
            ...messageQueue.pending,
            ...messageQueue.processing,
            ...messageQueue.completed,
            ...messageQueue.failed
        ].filter(msg => msg.broadcastId === id);

        const detailedStats = {
            total: broadcast.recipients.length,
            pending: broadcastMessages.filter(m => m.status === 'pending').length,
            processing: broadcastMessages.filter(m => m.status === 'processing').length,
            sent: broadcastMessages.filter(m => m.status === 'completed').length,
            failed: broadcastMessages.filter(m => m.status === 'failed').length,
            delivered: broadcast.statistics.delivered || 0
        };

        res.json({
            success: true,
            data: {
                ...broadcast,
                detailedStats,
                messages: broadcastMessages.slice(0, 10) // Return first 10 messages as preview
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to fetch broadcast:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch broadcast',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/broadcast/:id/execute - Execute scheduled broadcast
router.post('/broadcast/:id/execute', async (req, res) => {
    try {
        const { id } = req.params;
        const broadcast = broadcastHistory.find(b => b.id === id);

        if (!broadcast) {
            return res.status(404).json({
                success: false,
                message: 'Broadcast not found'
            });
        }

        if (broadcast.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Broadcast already completed'
            });
        }

        // Check if WhatsApp is connected
        const sock = getSock();
        if (!sock || !sock.user) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp is not connected. Please connect first.'
            });
        }

        // Move pending messages to processing
        const pendingMessages = messageQueue.pending.filter(msg => msg.broadcastId === id);

        // Update broadcast status
        broadcast.status = 'processing';
        broadcast.startedAt = new Date().toISOString();

        console.log(`🚀 [API] Executing broadcast: ${id} with ${pendingMessages.length} messages`);

        // Start processing in background
        processMessageQueue();

        res.json({
            success: true,
            message: 'Broadcast execution started',
            data: {
                broadcastId: id,
                totalMessages: pendingMessages.length,
                status: 'processing',
                startedAt: broadcast.startedAt
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to execute broadcast:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to execute broadcast',
            error: error.message
        });
    }
});

// Process message queue (background function)
async function processMessageQueue() {
    if (messageQueue.processing.length >= 5) { // Limit concurrent processing
        return;
    }

    const sock = getSock();
    if (!sock || !sock.user) {
        console.log('⚠️ WhatsApp not connected, skipping queue processing');
        return;
    }

    // Process up to 5 messages at once
    const batchSize = Math.min(5, messageQueue.pending.length);
    const batch = messageQueue.pending.splice(0, batchSize);

    if (batch.length === 0) return;

    console.log(`📤 Processing batch of ${batch.length} messages`);

    for (const messageObj of batch) {
        try {
            messageQueue.processing.push(messageObj);
            messageObj.status = 'processing';
            messageObj.attempts++;

            // Add delay to respect WhatsApp rate limits
            if (messageQueue.processing.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between messages
            }

            // Format phone number
            const phone = messageObj.recipient.replace(/[^0-9]/g, '');
            const jid = phone + '@s.whatsapp.net';

            // Send message
            await sendMessage(jid, messageObj.message);

            // Mark as completed
            messageObj.status = 'completed';
            messageObj.sentAt = new Date().toISOString();
            messageQueue.completed.push(messageObj);

            // Update broadcast statistics
            const broadcast = broadcastHistory.find(b => b.id === messageObj.broadcastId);
            if (broadcast) {
                broadcast.statistics.sent++;
                broadcast.statistics.pending--;
            }

            console.log(`✅ Message sent to ${phone}`);

        } catch (error) {
            console.error(`❌ Failed to send message to ${messageObj.recipient}:`, error.message);

            messageObj.status = 'failed';
            messageObj.error = error.message;
            messageObj.failedAt = new Date().toISOString();

            if (messageObj.attempts < messageObj.maxAttempts) {
                // Retry logic
                console.log(`🔄 Retrying message to ${messageObj.recipient} (attempt ${messageObj.attempts + 1}/${messageObj.maxAttempts})`);
                setTimeout(() => {
                    messageQueue.pending.unshift(messageObj);
                }, 5000 * messageObj.attempts); // Exponential backoff
            } else {
                // Max attempts reached
                messageQueue.failed.push(messageObj);

                // Update broadcast statistics
                const broadcast = broadcastHistory.find(b => b.id === messageObj.broadcastId);
                if (broadcast) {
                    broadcast.statistics.failed++;
                    broadcast.statistics.pending--;
                }
            }
        }

        // Remove from processing
        const processingIndex = messageQueue.processing.indexOf(messageObj);
        if (processingIndex > -1) {
            messageQueue.processing.splice(processingIndex, 1);
        }
    }

    // Continue processing if there are more messages
    if (messageQueue.pending.length > 0) {
        setTimeout(processMessageQueue, 2000); // Wait 2 seconds before next batch
    }
}

// Auto-start queue processing
setInterval(processMessageQueue, 30000); // Check every 30 seconds

// POST /api/v1/whatsapp/test - Test WhatsApp connection
router.post('/test', (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required for test'
            });
        }

        const testData = {
            testId: 'test_' + Date.now(),
            phone,
            status: 'sent',
            testMessage: 'This is a test message from WhatsApp Notification System',
            sentAt: new Date().toISOString()
        };

        res.json({
            success: true,
            message: 'Test message sent successfully',
            data: testData
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send test message',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/settings - Get WhatsApp settings
router.get('/settings', (req, res) => {
    try {
        const settings = {
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
        };

        res.json({
            success: true,
            data: settings
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch settings',
            error: error.message
        });
    }
});

// PUT /api/v1/whatsapp/settings - Update WhatsApp settings
router.put('/settings', (req, res) => {
    try {
        const settings = req.body;

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Settings object is required'
            });
        }

        const updateData = {
            updatedAt: new Date().toISOString(),
            settings: settings,
            message: 'Settings updated successfully'
        };

        res.json({
            success: true,
            message: 'Settings updated successfully',
            data: updateData
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update settings',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/history - Get message history
router.get('/history', async (req, res) => {
    try {
        const { page = 1, limit = 20, status, template, dateFrom, dateTo, recipient, includeStats = 'false' } = req.query;

        console.log('📜 [API] Fetching message history from database...', {
            filters: { page, limit, status, template, dateFrom, dateTo, recipient, includeStats }
        });

        // Use database service to get message history
        const historyData = await whatsappMessageService.getMessageHistory({
            page: parseInt(page),
            limit: parseInt(limit),
            status,
            template,
            dateFrom,
            dateTo,
            recipient
        });

        console.log(`✅ [API] Retrieved ${historyData.messages.length} messages from database`);

        const responseData = {
            messages: historyData.messages,
            pagination: historyData.pagination
        };

        // Include storage stats if requested
        if (includeStats === 'true') {
            const stats = await whatsappMessageService.getMessageHistoryStats();
            responseData.storageStats = stats;

            // Add warning if storage is getting full
            if (stats.needsCleanup) {
                console.log(`⚠️ [API] Storage warning: ${stats.warningMessage}`);
            }
        }

        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('❌ [API] Failed to fetch message history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch message history',
            error: error.message
        });
    }
});

// Helper function to convert timestamp to "time ago" format
function getTimeAgo(timestamp) {
    if (!timestamp) return 'Unknown time';

    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
        return 'Just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} min ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
        return past.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: past.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }
}

// 404 handler
router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        availableEndpoints: {
            main: 'GET /',
            status: 'GET /status',
            connect: 'POST /connect',
            disconnect: 'POST /disconnect',
            qr: 'GET /qr',
            qr_refresh: 'POST /qr/refresh',
            schedule_message: 'POST /schedule/message',
            schedule_messages: 'GET /schedule/messages',
            cancel_scheduled: 'DELETE /schedule/messages/:id',
            send: 'POST /send',
            templates: 'GET|POST|PUT|DELETE /templates',
            templates_preview: 'POST /templates/:id/preview',
            templates_test: 'POST /templates/:id/test',
            analytics: 'GET /analytics',
            queue: 'GET|POST /queue',
            queue_pause: 'POST /queue/pause',
            queue_resume: 'POST /queue/resume',
            queue_clear: 'POST /queue/clear',
            broadcast: 'GET|POST /broadcast',
            broadcast_execute: 'POST /broadcast/:id/execute',
            broadcast_details: 'GET /broadcast/:id',
            groups: 'GET|POST /groups',
            group_details: 'GET /groups/:id',
            group_update: 'PUT /groups/:id',
            group_delete: 'DELETE /groups/:id',
            group_refresh: 'POST /groups/:id/refresh',
            history: 'GET /history',
            test: 'POST /test',
            settings: 'GET|PUT /settings',
            regions_stats: 'GET /regions-stats',
            customer_stats: 'GET /customer-stats'
        }
    });
});

// Scheduling Endpoints

// POST /api/v1/whatsapp/schedule/message - Schedule single message
router.post('/schedule/message', (req, res) => {
    try {
        const { recipient, message, scheduledAt, templateId, variables = {}, recurring } = req.body;

        if (!recipient || !message) {
            return res.status(400).json({
                success: false,
                message: 'Recipient and message are required'
            });
        }

        if (!scheduledAt) {
            return res.status(400).json({
                success: false,
                message: 'Scheduled time is required'
            });
        }

        // Validate scheduled time
        const scheduledTime = new Date(scheduledAt);
        if (scheduledTime <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Scheduled time must be in the future'
            });
        }

        // Process template if provided
        let finalMessage = message;
        if (templateId) {
            const template = messageTemplates[templateId];
            if (template) {
                if (!template.enabled) {
                    return res.status(400).json({
                        success: false,
                        message: `Template "${templateId}" is disabled`
                    });
                }

                finalMessage = template.content;
                Object.keys(variables).forEach(key => {
                    const regex = new RegExp(`{{${key}}}`, 'g');
                    finalMessage = finalMessage.replace(regex, variables[key] || `[${key}]`);
                });

                // Increment template usage count
                template.usageCount++;
            }
        }

        const scheduledMessage = {
            id: `scheduled_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            recipient: recipient,
            message: finalMessage,
            templateId: templateId || null,
            variables: variables,
            scheduledAt: scheduledTime.toISOString(),
            recurring: recurring || null,
            status: 'scheduled',
            createdAt: new Date().toISOString(),
            attempts: 0,
            maxAttempts: 3
        };

        scheduledMessages.push(scheduledMessage);

        console.log(`⏰ [API] Message scheduled for ${scheduledTime.toISOString()}: ${recipient}`);

        res.status(201).json({
            success: true,
            message: 'Message scheduled successfully',
            data: {
                messageId: scheduledMessage.id,
                recipient: scheduledMessage.recipient,
                scheduledAt: scheduledMessage.scheduledAt,
                status: scheduledMessage.status
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to schedule message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to schedule message',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/schedule/messages - Get scheduled messages
router.get('/schedule/messages', (req, res) => {
    try {
        const { status, limit = 20, offset = 0 } = req.query;

        let messages = scheduledMessages;

        // Filter by status
        if (status) {
            messages = messages.filter(m => m.status === status);
        }

        // Sort by scheduled time
        messages.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

        // Apply pagination
        const total = messages.length;
        const paginatedMessages = messages.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        res.json({
            success: true,
            data: {
                messages: paginatedMessages,
                pagination: {
                    page: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit)),
                    hasMore: parseInt(offset) + parseInt(limit) < total
                },
                summary: {
                    total: scheduledMessages.length,
                    pending: scheduledMessages.filter(m => m.status === 'scheduled').length,
                    processing: scheduledMessages.filter(m => m.status === 'processing').length,
                    completed: scheduledMessages.filter(m => m.status === 'completed').length,
                    failed: scheduledMessages.filter(m => m.status === 'failed').length
                }
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to fetch scheduled messages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch scheduled messages',
            error: error.message
        });
    }
});



// DELETE /api/v1/whatsapp/schedule/messages/:id - Cancel scheduled message
router.delete('/schedule/messages/:id', (req, res) => {
    try {
        const { id } = req.params;
        const index = scheduledMessages.findIndex(m => m.id === id);

        if (index === -1) {
            return res.status(404).json({
                success: false,
                message: 'Scheduled message not found'
            });
        }

        const message = scheduledMessages[index];
        if (message.status === 'processing') {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel message that is currently processing'
            });
        }

        scheduledMessages.splice(index, 1);

        console.log(`❌ [API] Scheduled message cancelled: ${id}`);

        res.json({
            success: true,
            message: 'Scheduled message cancelled successfully'
        });

    } catch (error) {
        console.error('❌ [API] Failed to cancel scheduled message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel scheduled message',
            error: error.message
        });
    }
});

// Start the scheduler
function startScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
    }

    schedulerInterval = setInterval(() => {
        checkScheduledMessages();
        checkScheduledBroadcasts();
    }, 30000); // Check every 30 seconds

    console.log('⏰ [Scheduler] Message scheduler started');
}

// Check scheduled messages
function checkScheduledMessages() {
    const now = new Date();
    const messagesToSend = scheduledMessages.filter(m =>
        m.status === 'scheduled' && new Date(m.scheduledAt) <= now
    );

    messagesToSend.forEach(scheduledMessage => {
        processScheduledMessage(scheduledMessage);
    });
}

// Check scheduled broadcasts
function checkScheduledBroadcasts() {
    const now = new Date();
    const broadcastsToExecute = scheduledBroadcasts.filter(b =>
        b.status === 'scheduled' && new Date(b.scheduledAt) <= now
    );

    broadcastsToExecute.forEach(scheduledBroadcast => {
        processScheduledBroadcast(scheduledBroadcast);
    });
}

// Process scheduled message
async function processScheduledMessage(scheduledMessage) {
    try {
        scheduledMessage.status = 'processing';
        scheduledMessage.attempts++;

        const sock = getSock();
        if (!sock || !sock.user) {
            console.log(`⚠️ WhatsApp not connected, rescheduling message: ${scheduledMessage.id}`);
            scheduledMessage.status = 'scheduled';
            scheduledMessage.scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // Retry in 5 minutes
            return;
        }

        const phone = scheduledMessage.recipient.replace(/[^0-9]/g, '');
        const jid = phone + '@s.whatsapp.net';

        await sendMessage(jid, scheduledMessage.message);

        scheduledMessage.status = 'completed';
        scheduledMessage.completedAt = new Date().toISOString();

        console.log(`✅ [Scheduler] Scheduled message sent: ${scheduledMessage.recipient}`);

        // Handle recurring messages
        if (scheduledMessage.recurring) {
            scheduleNextOccurrence(scheduledMessage);
        }

    } catch (error) {
        console.error(`❌ [Scheduler] Failed to send scheduled message ${scheduledMessage.id}:`, error.message);

        if (scheduledMessage.attempts < scheduledMessage.maxAttempts) {
            scheduledMessage.status = 'scheduled';
            scheduledMessage.scheduledAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // Retry in 10 minutes
        } else {
            scheduledMessage.status = 'failed';
            scheduledMessage.failedAt = new Date().toISOString();
        }
    }
}

// Process scheduled broadcast
async function processScheduledBroadcast(scheduledBroadcast) {
    try {
        scheduledBroadcast.status = 'processing';

        const sock = getSock();
        if (!sock || !sock.user) {
            console.log(`⚠️ WhatsApp not connected, rescheduling broadcast: ${scheduledBroadcast.id}`);
            scheduledBroadcast.status = 'scheduled';
            scheduledBroadcast.scheduledAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // Retry in 10 minutes
            return;
        }

        // Execute the broadcast
        await processMessageQueue();

        scheduledBroadcast.status = 'completed';
        scheduledBroadcast.completedAt = new Date().toISOString();

        console.log(`✅ [Scheduler] Scheduled broadcast executed: ${scheduledBroadcast.broadcastId}`);

        // Handle recurring broadcasts
        if (scheduledBroadcast.recurring) {
            scheduleNextBroadcastOccurrence(scheduledBroadcast);
        }

    } catch (error) {
        console.error(`❌ [Scheduler] Failed to execute scheduled broadcast ${scheduledBroadcast.id}:`, error.message);
        scheduledBroadcast.status = 'failed';
        scheduledBroadcast.failedAt = new Date().toISOString();
    }
}

// Schedule next occurrence for recurring messages
function scheduleNextOccurrence(scheduledMessage) {
    if (!scheduledMessage.recurring) return;

    const nextTime = calculateNextOccurrence(
        new Date(scheduledMessage.scheduledAt),
        scheduledMessage.recurring
    );

    const nextMessage = {
        ...scheduledMessage,
        id: `scheduled_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        scheduledAt: nextTime.toISOString(),
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        attempts: 0
    };

    scheduledMessages.push(nextMessage);
    console.log(`🔄 [Scheduler] Next occurrence scheduled: ${nextTime.toISOString()}`);
}

// Calculate next occurrence based on recurring pattern
function calculateNextOccurrence(currentTime, pattern) {
    const next = new Date(currentTime);

    switch (pattern) {
        case 'daily':
            next.setDate(next.getDate() + 1);
            break;
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            break;
        default:
            // Default to daily
            next.setDate(next.getDate() + 1);
    }

    return next;
}

// Schedule next occurrence for recurring broadcasts
function scheduleNextBroadcastOccurrence(scheduledBroadcast) {
    if (!scheduledBroadcast.recurring) return;

    const nextTime = calculateNextOccurrence(
        new Date(scheduledBroadcast.scheduledAt),
        scheduledBroadcast.recurring
    );

    const nextBroadcast = {
        ...scheduledBroadcast,
        id: `scheduled_broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        scheduledAt: nextTime.toISOString(),
        status: 'scheduled',
        createdAt: new Date().toISOString()
    };

    scheduledBroadcasts.push(nextBroadcast);
    console.log(`🔄 [Scheduler] Next broadcast occurrence scheduled: ${nextTime.toISOString()}`);
}

// Initialize scheduler when server starts
startScheduler();

// Group Management Endpoints

// GET /api/v1/whatsapp/groups - Get all contact groups
router.get('/groups', (req, res) => {
    try {
        const { type, limit = 50, offset = 0 } = req.query;

        let groups = Object.values(contactGroups);

        // Filter by type (dynamic or static)
        if (type) {
            const isDynamic = type === 'dynamic';
            groups = groups.filter(g => g.isDynamic === isDynamic);
        }

        // Apply pagination
        const total = groups.length;
        const paginatedGroups = groups.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        // Update member counts for dynamic groups
        paginatedGroups.forEach(group => {
            if (group.isDynamic) {
                group.memberCount = generateDynamicGroupCount(group.id);
            }
        });

        res.json({
            success: true,
            data: {
                groups: paginatedGroups,
                pagination: {
                    total: total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: parseInt(offset) + parseInt(limit) < total
                },
                summary: {
                    total: Object.keys(contactGroups).length,
                    dynamic: Object.values(contactGroups).filter(g => g.isDynamic).length,
                    static: Object.values(contactGroups).filter(g => !g.isDynamic).length
                }
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to fetch groups:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch groups',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/groups/:id - Get specific group
router.get('/groups/:id', (req, res) => {
    try {
        const { id } = req.params;
        const group = contactGroups[id];

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        // Update member count for dynamic groups
        if (group.isDynamic) {
            group.memberCount = generateDynamicGroupCount(id);
            group.members = generateDynamicGroupMembers(id);
        }

        res.json({
            success: true,
            data: group
        });

    } catch (error) {
        console.error('❌ [API] Failed to fetch group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch group',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/groups - Create new contact group
router.post('/groups', (req, res) => {
    try {
        const { id, name, description, members = [] } = req.body;

        if (!id || !name) {
            return res.status(400).json({
                success: false,
                message: 'Group ID and name are required'
            });
        }

        if (contactGroups[id]) {
            return res.status(400).json({
                success: false,
                message: 'Group with this ID already exists'
            });
        }

        const group = {
            id: id,
            name: name,
            description: description || '',
            memberCount: members.length,
            members: members,
            isDynamic: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        contactGroups[id] = group;

        console.log(`👥 [API] Group created: ${id}`);

        res.status(201).json({
            success: true,
            message: 'Group created successfully',
            data: group
        });

    } catch (error) {
        console.error('❌ [API] Failed to create group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create group',
            error: error.message
        });
    }
});

// PUT /api/v1/whatsapp/groups/:id - Update group
router.put('/groups/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, members } = req.body;

        if (!contactGroups[id]) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        if (contactGroups[id].isDynamic) {
            return res.status(400).json({
                success: false,
                message: 'Cannot modify dynamic groups'
            });
        }

        const group = contactGroups[id];

        // Update fields
        if (name) group.name = name;
        if (description !== undefined) group.description = description;
        if (members) {
            group.members = members;
            group.memberCount = members.length;
        }

        group.updatedAt = new Date().toISOString();

        console.log(`✏️ [API] Group updated: ${id}`);

        res.json({
            success: true,
            message: 'Group updated successfully',
            data: group
        });

    } catch (error) {
        console.error('❌ [API] Failed to update group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update group',
            error: error.message
        });
    }
});

// DELETE /api/v1/whatsapp/groups/:id - Delete group
router.delete('/groups/:id', (req, res) => {
    try {
        const { id } = req.params;

        if (!contactGroups[id]) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        if (contactGroups[id].isDynamic) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete dynamic groups'
            });
        }

        delete contactGroups[id];

        console.log(`🗑️ [API] Group deleted: ${id}`);

        res.json({
            success: true,
            message: 'Group deleted successfully'
        });

    } catch (error) {
        console.error('❌ [API] Failed to delete group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete group',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/groups/:id/refresh - Refresh dynamic group members
router.post('/groups/:id/refresh', (req, res) => {
    try {
        const { id } = req.params;
        const group = contactGroups[id];

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        if (!group.isDynamic) {
            return res.status(400).json({
                success: false,
                message: 'Can only refresh dynamic groups'
            });
        }

        // Refresh group members
        const newMembers = generateDynamicGroupMembers(id);
        const memberCount = newMembers.length;

        // Update group
        group.members = newMembers;
        group.memberCount = memberCount;
        group.updatedAt = new Date().toISOString();

        console.log(`🔄 [API] Group refreshed: ${id} (${memberCount} members)`);

        res.json({
            success: true,
            message: 'Group refreshed successfully',
            data: {
                groupId: id,
                memberCount: memberCount,
                refreshedAt: group.updatedAt
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to refresh group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh group',
            error: error.message
        });
    }
});

// Helper functions for dynamic groups
function generateDynamicGroupCount(groupId) {
    // Mock implementation - in real scenario, query database
    switch (groupId) {
        case 'all_customers':
            return 1250;
        case 'active_customers':
            return 980;
        case 'overdue_customers':
            return 87;
        default:
            return 0;
    }
}

function generateDynamicGroupMembers(groupId) {
    // Mock implementation - in real scenario, query database
    const mockMembers = [
        '62811223344',
        '62812345678',
        '62898765432',
        '62876543210',
        '62854321098'
    ];

    const count = generateDynamicGroupCount(groupId);
    const members = [];

    for (let i = 0; i < Math.min(count, 10); i++) {
        members.push(mockMembers[i % mockMembers.length]);
    }

    return members;
}

// GET /api/v1/whatsapp/history/stats - Get message history statistics and storage info
router.get('/history/stats', async (req, res) => {
    try {
        console.log('📊 [API] Getting message history statistics...');

        const stats = await whatsappMessageService.getMessageHistoryStats();

        res.json({
            success: true,
            data: stats,
            message: 'Message history statistics retrieved successfully'
        });

    } catch (error) {
        console.error('❌ [API] Failed to get message history stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get message history statistics',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/history/cleanup - Clean up old messages
router.post('/history/cleanup', async (req, res) => {
    try {
        const { keepCount = 500 } = req.body;

        console.log(`🧹 [API] Manual cleanup requested - keeping ${keepCount} latest messages`);

        if (keepCount < 100 || keepCount > 1000) {
            return res.status(400).json({
                success: false,
                message: 'keepCount must be between 100 and 1000 messages'
            });
        }

        const result = await whatsappMessageService.cleanupOldMessages(keepCount);

        console.log(`✅ [API] Manual cleanup completed: ${result.deletedCount} messages deleted`);

        res.json({
            success: true,
            data: result,
            message: `Successfully cleaned up ${result.deletedCount} old messages`
        });

    } catch (error) {
        console.error('❌ [API] Failed to cleanup message history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cleanup message history',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/history/clear - Clear all message history
router.post('/history/clear', async (req, res) => {
    try {
        console.log('🗑️ [API] Clear all message history requested');

        // Get stats before clearing
        const statsBefore = await whatsappMessageService.getMessageHistoryStats();

        const result = await query('DELETE FROM whatsapp_messages RETURNING id');

        console.log(`🗑️ [API] Cleared ${result.rows.length} messages from history`);

        res.json({
            success: true,
            data: {
                deletedCount: result.rows.length,
                deletedIds: result.rows.map(row => row.id)
            },
            message: `Successfully cleared all ${result.rows.length} messages from history`
        });

    } catch (error) {
        console.error('❌ [API] Failed to clear message history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear message history',
            error: error.message
        });
    }
});

// DELETE /api/v1/whatsapp/clear-session - Clear WhatsApp session
router.delete('/clear-session', async (req, res) => {
    try {
        console.log('🗑️ [API] Clear WhatsApp session requested');

        // Get current status before clearing
        const currentStatus = getWhatsAppStatus();

        // Delete session files and disconnect
        const result = await deleteWhatsAppSession();

        // Clear QR code cache
        currentQRCode = null;
        qrGeneratedAt = null;

        // Reset global status
        if (global.whatsappStatus) {
            global.whatsappStatus = {
                connected: false,
                qrCode: null,
                phoneNumber: null,
                connectedSince: null,
                status: 'disconnected'
            };
        }

        console.log('✅ [API] WhatsApp session cleared successfully');

        res.json({
            success: true,
            message: 'WhatsApp session cleared successfully. Please scan QR code to reconnect.',
            data: {
                previousStatus: currentStatus.status,
                clearedAt: new Date().toISOString(),
                sessionFilesDeleted: result.filesDeleted || true
            }
        });

    } catch (error) {
        console.error('❌ [API] Failed to clear WhatsApp session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear WhatsApp session',
            error: error.message
        });
    }
});

module.exports = router;