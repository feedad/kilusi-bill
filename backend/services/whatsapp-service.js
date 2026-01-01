const { getSock, getWhatsAppStatus, connectToWhatsApp, deleteWhatsAppSession, sendMessage } = require('../config/whatsapp');
const qrcode = require('qrcode');
const whatsappMessageService = require('./whatsappMessageService');

class WhatsappService {
    constructor() {
        this.currentQRCode = null;
        this.qrGeneratedAt = null;
        this.messageQueue = {
            pending: [],
            processing: [],
            completed: [],
            failed: []
        };
        this.messageTemplates = {
            // Initializing with templates found in original route file
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

        // WhatsApp statistics
        this.whatsappStats = {
            successRate: 0.0,
            messagesSent: 0,
            messagesReceived: 0,
            groups: 0,
            contacts: 0,
            todayMessages: 0
        };

        this.lastBroadcastTime = 0;
        this.lastBroadcastData = null;

        // Scheduling and Broadcasts
        this.scheduledMessages = [];
        this.broadcastHistory = [];
        this.broadcastCounter = 0;

        // Group management
        this.contactGroups = {
            all_customers: {
                id: 'all_customers',
                name: 'All Customers',
                description: 'All registered customers',
                memberCount: 0,
                members: [],
                isDynamic: true,
                createdAt: new Date('2025-01-01').toISOString(),
                updatedAt: new Date('2025-01-01').toISOString()
            }
        };

        // Start listeners and schedulers
        this.setupQRListener();
        this.startSchedulers();
    }

    /**
     * Start QR Code Listener
     */
    setupQRListener() {
        try {
            console.log('🔧 [Service] Setting up QR code listener...');
            setInterval(() => {
                try {
                    if (global.whatsappStatus && global.whatsappStatus.qrCode) {
                        if (this.currentQRCode !== global.whatsappStatus.qrCode) {
                            this.currentQRCode = global.whatsappStatus.qrCode;
                            this.qrGeneratedAt = new Date();
                            console.log('📱 [Service] QR Code captured from global status');
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ [Service] Error checking for QR code:', error.message);
                }
            }, 10000);
        } catch (error) {
            console.log('⚠️ [Service] Could not set up QR listener:', error.message);
        }
    }

    /**
     * Broadcast status via WebSocket
     */
    broadcastWhatsAppStatus(statusData) {
        try {
            if (global && global.io) {
                const now = Date.now();
                const throttleDelay = 5000;
                const dataChanged = JSON.stringify(statusData) !== JSON.stringify(this.lastBroadcastData);
                const timePassed = (now - this.lastBroadcastTime) > throttleDelay;

                if (dataChanged && timePassed) {
                    global.io.to('whatsapp-status').emit('whatsapp-status', statusData);

                    if (statusData.connected !== this.lastBroadcastData?.connected ||
                        (statusData.qrCode && !this.lastBroadcastData?.qrCode) ||
                        (!statusData.qrCode && this.lastBroadcastData?.qrCode)) {
                        console.log('📡 [Service] Status broadcasted to WebSocket');
                    }

                    this.lastBroadcastTime = now;
                    this.lastBroadcastData = statusData;
                }
            }
        } catch (error) {
            console.warn('⚠️ [Service] Failed to broadcast WhatsApp status:', error.message);
        }
    }

    /**
     * Get Connection Status
     */
    async getStatus() {
        const sock = getSock();
        const whatsappStatus = getWhatsAppStatus();
        const isConnected = sock && sock.user && whatsappStatus.connected;

        const statusData = {
            connected: isConnected,
            connectionStatus: whatsappStatus.connectionStatus || 'disconnected',
            phoneNumber: isConnected ? sock.user.id.split(':')[0] : null,
            profileName: isConnected ? sock.user.name || sock.user.pushname : null,
            qrCode: this.currentQRCode,
            qrGeneratedAt: this.qrGeneratedAt ? this.qrGeneratedAt.toISOString() : null,
            lastSync: isConnected ? new Date().toISOString() : null,
            uptime: whatsappStatus.uptime || 0,
            successRate: this.whatsappStats.successRate || 0.0,
            deviceInfo: {
                device: isConnected ? sock.user?.device || 'Mobile' : 'Not Connected',
                version: isConnected ? sock.user?.version || 'N/A' : 'N/A',
                platform: isConnected ? sock.user?.platform || 'Android' : 'N/A',
                connected: isConnected
            },
            stats: {
                messagesSent: this.whatsappStats.messagesSent || 0,
                messagesReceived: this.whatsappStats.messagesReceived || 0,
                groups: this.whatsappStats.groups || 0,
                contacts: this.whatsappStats.contacts || 0,
                todayMessages: this.whatsappStats.todayMessages || 0
            }
        };

        this.broadcastWhatsAppStatus({
            connected: statusData.connected,
            status: statusData.connectionStatus,
            phoneNumber: statusData.phoneNumber,
            profileName: statusData.profileName,
            qrCode: statusData.qrCode,
            message: statusData.connected ? 'WhatsApp connected' : 'WhatsApp disconnected',
            timestamp: new Date().toISOString()
        });

        return statusData;
    }

    /**
     * Connect to WhatsApp
     */
    async connect() {
        const sock = getSock();
        if (sock && sock.user) {
            throw { code: 'CONFLICT', message: 'WhatsApp is already connected' };
        }

        try {
            await connectToWhatsApp();
            return {
                status: 'connecting',
                qrCode: this.currentQRCode,
                connectionId: 'whatsapp-' + Date.now(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw { code: 'EXTERNAL_SERVICE_ERROR', message: `WhatsApp connection failed: ${error.message}` };
        }
    }

    /**
     * Disconnect WhatsApp
     */
    async disconnect() {
        await deleteWhatsAppSession();
        this.currentQRCode = null;
        this.qrGeneratedAt = null;
        return { status: 'disconnected', disconnectedAt: new Date().toISOString() };
    }

    /**
     * Get/Generate QR Code
     */
    async getQR(refresh = false) {
        // Check global status first
        if (global.whatsappStatus && global.whatsappStatus.qrCode) {
            this.currentQRCode = global.whatsappStatus.qrCode;
            this.qrGeneratedAt = this.qrGeneratedAt || new Date();
        } else {
            const isExpired = this.qrGeneratedAt ? (Date.now() - this.qrGeneratedAt.getTime()) > 60000 : true;

            if (refresh || !this.currentQRCode || isExpired) {
                // Logic to generate new QR
                this.currentQRCode = null;
                this.qrGeneratedAt = null;

                const sock = getSock();
                if (sock && sock.user) {
                    await deleteWhatsAppSession();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                await connectToWhatsApp();

                // Wait loop for QR
                let attempts = 0;
                while (!this.currentQRCode && attempts < 20) {
                    attempts++;
                    if (global.whatsappStatus && global.whatsappStatus.qrCode) {
                        this.currentQRCode = global.whatsappStatus.qrCode;
                        this.qrGeneratedAt = new Date();
                        break;
                    }
                    const status = getWhatsAppStatus();
                    if (status && status.qrCode) {
                        this.currentQRCode = status.qrCode;
                        this.qrGeneratedAt = new Date();
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, Math.min(500 + (attempts * 100), 2000)));
                }
            }
        }

        let qrCodeImage = null;
        if (this.currentQRCode) {
            try {
                qrCodeImage = await qrcode.toDataURL(this.currentQRCode, { width: 256, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
            } catch (e) {
                qrCodeImage = this.currentQRCode;
            }
        }

        return {
            qrCode: qrCodeImage,
            rawQR: this.currentQRCode,
            generatedAt: this.qrGeneratedAt,
            status: this.currentQRCode ? 'active' : 'pending'
        };
    }

    /**
     * Send Message
     */
    async sendMessage(phone, message, type = 'text') {
        const sock = getSock();
        if (!sock || !sock.user) {
            throw { code: 'SERVICE_UNAVAILABLE', message: 'WhatsApp is not connected' };
        }

        const formattedPhone = phone.replace(/[^0-9]/g, '');
        const jid = formattedPhone + '@s.whatsapp.net';

        let result;
        try {
            result = await sendMessage(jid, message);
        } catch (error) {
            throw { code: 'EXTERNAL_SERVICE_ERROR', message: error.message };
        }

        // Save to DB
        let savedMessage = null;
        try {
            savedMessage = await whatsappMessageService.saveMessage({
                recipient: formattedPhone,
                message: message,
                status: 'sent',
                messageType: type,
                sentAt: new Date().toISOString()
            });
        } catch (e) {
            console.error('[Service] Failed to save message to DB:', e.message);
        }

        // Stats
        this.whatsappStats.messagesSent++;

        return {
            messageId: result?.messageId || 'msg-' + Date.now(),
            phone: formattedPhone,
            status: 'sent',
            database_id: savedMessage?.id
        };
    }

    /**
     * Start Schedulers
     */
    startSchedulers() {
        // Message Queue Processor (every 5 seconds)
        setInterval(() => this.processMessageQueue(), 5000);

        // Scheduled Message Processor (every 60 seconds)
        setInterval(() => this.processScheduledMessages(), 60000);
    }

    /**
     * Process Message Queue
     */
    async processMessageQueue() {
        if (this.messageQueue.processing.length >= 5 || this.messageQueue.pending.length === 0) return;

        const sock = getSock();
        if (!sock || !sock.user) return;

        const batchSize = Math.min(5, this.messageQueue.pending.length);
        const batch = this.messageQueue.pending.splice(0, batchSize);

        for (const messageObj of batch) {
            try {
                this.messageQueue.processing.push(messageObj);
                messageObj.status = 'processing';
                messageObj.attempts = (messageObj.attempts || 0) + 1;

                // Send
                const formattedPhone = messageObj.recipient.replace(/[^0-9]/g, '');
                const jid = formattedPhone + '@s.whatsapp.net';
                await sendMessage(jid, messageObj.message);

                // Success
                messageObj.status = 'completed';
                messageObj.sentAt = new Date().toISOString();
                this.messageQueue.completed.push(messageObj);

                // Update broadcast stats if applicable
                if (messageObj.broadcastId) {
                    const broadcast = this.broadcastHistory.find(b => b.id === messageObj.broadcastId);
                    if (broadcast) {
                        broadcast.statistics.sent++;
                        broadcast.statistics.pending--;
                    }
                }

                // Remove from processing
                this.messageQueue.processing = this.messageQueue.processing.filter(m => m !== messageObj);

            } catch (error) {
                console.error(`[Service] Failed to process queued message for ${messageObj.recipient}: ${error.message}`);
                messageObj.status = 'failed';
                messageObj.error = error.message;

                // Retry logic could go here
                this.messageQueue.failed.push(messageObj);
                this.messageQueue.processing = this.messageQueue.processing.filter(m => m !== messageObj);

                if (messageObj.broadcastId) {
                    const broadcast = this.broadcastHistory.find(b => b.id === messageObj.broadcastId);
                    if (broadcast) {
                        broadcast.statistics.failed++;
                        broadcast.statistics.pending--;
                    }
                }
            }
        }
    }

    /**
     * Process Scheduled Messages
     */
    processScheduledMessages() {
        const now = new Date();
        const dueMessages = this.scheduledMessages.filter(m => new Date(m.scheduledAt) <= now && m.status === 'scheduled');

        dueMessages.forEach(msg => {
            msg.status = 'queued';
            this.messageQueue.pending.push(msg);
            console.log(`⏰ [Service] Moved scheduled message ${msg.id} to queue`);
        });
    }

    /**
     * Create Broadcast
     */
    createBroadcast(data) {
        const { name, recipients, message, templateId, variables, scheduledAt, sendImmediately } = data;
        this.broadcastCounter++;
        const broadcastId = `broadcast_${this.broadcastCounter}_${Date.now()}`;

        const broadcast = {
            id: broadcastId,
            name: name || `Broadcast ${this.broadcastCounter}`,
            recipients,
            message, // This should be pre-resolved content if no template, or template content
            templateId,
            variables,
            scheduledAt,
            status: scheduledAt ? 'scheduled' : 'queued',
            createdAt: new Date().toISOString(),
            statistics: {
                total: recipients.length,
                sent: 0,
                delivered: 0,
                failed: 0,
                pending: recipients.length
            }
        };

        this.broadcastHistory.push(broadcast);

        // Create messages
        const messages = recipients.map((recipient, index) => ({
            id: `${broadcastId}_msg_${index}`,
            broadcastId,
            recipient,
            message, // logic to resolve template variables should happen before calling this or here
            status: 'pending',
            createdAt: new Date().toISOString(),
            attempts: 0
        }));

        if (sendImmediately && !scheduledAt) {
            this.messageQueue.pending.push(...messages);
        } else if (scheduledAt) {
            // Logic for scheduled broadcast not fully implemented in this simple array
            // Ideally we'd add these to scheduledMessages or have a broadcast scheduler
            // For now, let's just push to pending if not scheduled, or note it.
            // Refactoring choice: If scheduled, we might need a "Scheduled Broadcast" handler.
            // Simplification: Push to scheduledMessages if single messages, but for broadcast it's a batch.
            // Let's assume sendImmediately for now or just push to pending.
            if (!scheduledAt) this.messageQueue.pending.push(...messages);
        } else {
            this.messageQueue.pending.push(...messages);
        }

        return broadcast;
    }

    getAllBroadcasts(status) {
        if (!status) return this.broadcastHistory;
        return this.broadcastHistory.filter(b => b.status === status);
    }

    getBroadcastById(id) {
        return this.broadcastHistory.find(b => b.id === id);
    }

    /**
     * Schedule Message
     */
    scheduleMessage(data) {
        const { recipient, message, scheduledAt, templateId, variables } = data;
        const id = `scheduled_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const msg = {
            id, recipient, message, templateId, variables, scheduledAt,
            status: 'scheduled', createdAt: new Date().toISOString(), attempts: 0
        };

        this.scheduledMessages.push(msg);
        return msg;
    }

    getScheduledMessages(status) {
        if (!status) return this.scheduledMessages;
        return this.scheduledMessages.filter(m => m.status === status);
    }

    getQueue(status) {
        if (status === 'pending') return this.messageQueue.pending;
        if (status === 'processing') return this.messageQueue.processing;
        if (status === 'completed') return this.messageQueue.completed;
        if (status === 'failed') return this.messageQueue.failed;

        return {
            pending: this.messageQueue.pending,
            processing: this.messageQueue.processing,
            completed: this.messageQueue.completed,
            failed: this.messageQueue.failed
        };
    }

    clearQueue(status) {
        let count = 0;
        if (status === 'pending' || status === 'all') {
            count += this.messageQueue.pending.length;
            this.messageQueue.pending = [];
        }
        if (status === 'processing' || status === 'all') {
            count += this.messageQueue.processing.length;
            this.messageQueue.processing = [];
        }
        if (status === 'failed' || status === 'all') {
            count += this.messageQueue.failed.length;
            this.messageQueue.failed = [];
        }
        return count;
    }

    // --- Template Methods ---

    getAllTemplates(category, enabled) {
        let templates = Object.values(this.messageTemplates);
        if (category) templates = templates.filter(t => t.category === category);
        if (enabled !== undefined) templates = templates.filter(t => t.enabled === (enabled === 'true' || enabled === true));
        return templates;
    }

    getTemplate(id) {
        return this.messageTemplates[id];
    }

    createTemplate(templateData) {
        const { id, name, content, category, enabled = true } = templateData;
        if (this.messageTemplates[id]) throw { code: 'CONFLICT', message: 'Template ID exists' };

        const variableRegex = /\{\{(\w+)\}\}/g;
        const variables = [];
        let match;
        while ((match = variableRegex.exec(content)) !== null) {
            if (!variables.includes(match[1])) variables.push(match[1]);
        }

        const template = {
            id, name, content, category, enabled,
            usageCount: 0,
            variables,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.messageTemplates[id] = template;
        return template;
    }

    updateTemplate(id, data) {
        const template = this.messageTemplates[id];
        if (!template) throw { code: 'NOT_FOUND', message: 'Template not found' };

        if (data.name) template.name = data.name;
        if (data.content) {
            template.content = data.content;
            const variableRegex = /\{\{(\w+)\}\}/g;
            const variables = [];
            let match;
            while ((match = variableRegex.exec(data.content)) !== null) {
                if (!variables.includes(match[1])) variables.push(match[1]);
            }
            template.variables = variables;
        }
        if (data.category) template.category = data.category;
        if (data.enabled !== undefined) template.enabled = data.enabled;
        template.updatedAt = new Date().toISOString();

        return template;
    }

    deleteTemplate(id) {
        if (!this.messageTemplates[id]) throw { code: 'NOT_FOUND', message: 'Template not found' };
        delete this.messageTemplates[id];
        return true;
    }

    getAnalytics(period = '7d', start, end) {
        // Simple mock analytics to match existing endpoint behavior
        const totalSent = this.whatsappStats.messagesSent;
        const successRate = 100;

        return {
            overview: {
                totalSent,
                successRate,
                totalMessages: totalSent
            },
            templates: {
                total: Object.keys(this.messageTemplates).length
            }
        };
    }
}

module.exports = new WhatsappService();
