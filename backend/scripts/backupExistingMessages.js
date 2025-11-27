// Backup existing in-memory messages to database
const whatsappMessageService = require('../services/whatsappMessageService');

// This would be used when migrating from in-memory to database storage
async function backupExistingMessages() {
    console.log('🔄 Starting message backup process...');

    try {
        // Note: This function would need access to the global messageQueue and scheduledMessages
        // For now, this is a template for when we need to migrate

        console.log('ℹ️  [BACKUP] This script would backup existing in-memory messages to database');
        console.log('ℹ️  [BACKUP] To use this, you need to pass the current messageQueue and scheduledMessages');

        // Example usage:
        /*
        const backupPromises = [];

        // Backup completed messages
        messageQueue.completed.forEach(async (msg) => {
            backupPromises.push(
                whatsappMessageService.saveMessage({
                    recipient: msg.recipient,
                    message: msg.message,
                    status: 'sent',
                    messageType: msg.type || 'Direct Message',
                    broadcastId: msg.broadcastId,
                    sentAt: msg.sentAt || msg.createdAt
                })
            );
        });

        // Backup failed messages
        messageQueue.failed.forEach(async (msg) => {
            backupPromises.push(
                whatsappMessageService.saveMessage({
                    recipient: msg.recipient,
                    message: msg.message,
                    status: 'failed',
                    messageType: msg.broadcastId ? 'Broadcast Message' : 'Direct Message',
                    broadcastId: msg.broadcastId,
                    errorMessage: msg.error,
                    failedAt: msg.failedAt || msg.createdAt
                })
            );
        });

        // Backup scheduled messages
        scheduledMessages.forEach(async (msg) => {
            backupPromises.push(
                whatsappMessageService.saveMessage({
                    recipient: msg.recipient,
                    message: msg.message,
                    status: 'scheduled',
                    messageType: msg.templateId ? 'Template Message' : 'Scheduled Message',
                    templateId: msg.templateId,
                    scheduledAt: msg.scheduledAt,
                    maxAttempts: msg.maxAttempts || 3
                })
            );
        });

        const results = await Promise.allSettled(backupPromises);
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        console.log(`✅ Backup completed: ${successful} successful, ${failed} failed`);
        */

    } catch (error) {
        console.error('❌ Backup failed:', error);
    }
}

module.exports = { backupExistingMessages };