const axios = require('axios');
const crypto = require('crypto');

class WhatsAppCloudAPI {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';
    this.webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Send text message via WhatsApp Cloud API
   * @param {string} to - Phone number with country code (e.g., "628123456789")
   * @param {string} message - Message content
   * @returns {Promise<Object>} API response
   */
  async sendTextMessage(to, message) {
    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

      const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: {
          body: message
        }
      };

      const response = await axios.post(url, data, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log(`✅ WhatsApp message sent to ${to}:`, response.data);
      return {
        success: true,
        data: response.data,
        messageId: response.data?.messages?.[0]?.id
      };
    } catch (error) {
      console.error(`❌ Error sending WhatsApp message to ${to}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Send template message (for business initiated conversations)
   * @param {string} to - Phone number with country code
   * @param {string} templateName - Template name
   * @param {Array} components - Template components
   * @returns {Promise<Object>} API response
   */
  async sendTemplateMessage(to, templateName, components = []) {
    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

      const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'id' },
          components: components
        }
      };

      const response = await axios.post(url, data, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log(`✅ WhatsApp template sent to ${to}:`, response.data);
      return {
        success: true,
        data: response.data,
        messageId: response.data?.messages?.[0]?.id
      };
    } catch (error) {
      console.error(`❌ Error sending WhatsApp template to ${to}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Send media message (image, document, etc.)
   * @param {string} to - Phone number with country code
   * @param {string} mediaUrl - URL of the media file
   * @param {string} mediaType - Type of media (image, document, audio, video)
   * @param {string} caption - Optional caption for the media
   * @returns {Promise<Object>} API response
   */
  async sendMediaMessage(to, mediaUrl, mediaType, caption = '') {
    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

      const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: mediaType,
        [mediaType]: {
          link: mediaUrl,
          ...(caption && { caption: caption })
        }
      };

      const response = await axios.post(url, data, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log(`✅ WhatsApp media sent to ${to}:`, response.data);
      return {
        success: true,
        data: response.data,
        messageId: response.data?.messages?.[0]?.id
      };
    } catch (error) {
      console.error(`❌ Error sending WhatsApp media to ${to}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Verify webhook endpoint
   * @param {string} mode - Hub mode
   * @param {string} token - Verify token
   * @param {string} challenge - Challenge string
   * @returns {string|null} Challenge string if valid, null otherwise
   */
  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.webhookVerifyToken) {
      console.log('✅ Webhook verified successfully');
      return challenge;
    } else {
      console.log('❌ Webhook verification failed');
      return null;
    }
  }

  /**
   * Process incoming webhook data
   * @param {Object} body - Webhook request body
   * @returns {Array} Array of processed messages
   */
  processWebhookData(body) {
    try {
      const messages = [];

      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            if (change.field === 'messages') {
              for (const message of change.value.messages || []) {
                if (message.type === 'text') {
                  messages.push({
                    from: message.from,
                    messageId: message.id,
                    text: message.text.body,
                    timestamp: message.timestamp,
                    type: message.type
                  });
                } else if (message.type === 'image') {
                  messages.push({
                    from: message.from,
                    messageId: message.id,
                    image: message.image,
                    timestamp: message.timestamp,
                    type: message.type
                  });
                } else if (message.type === 'interactive') {
                  messages.push({
                    from: message.from,
                    messageId: message.id,
                    interactive: message.interactive,
                    timestamp: message.timestamp,
                    type: message.type
                  });
                }
              }
            }
          }
        }
      }

      console.log(`📨 Processed ${messages.length} messages from webhook`);
      return messages;
    } catch (error) {
      console.error('❌ Error processing webhook data:', error);
      return [];
    }
  }

  /**
   * Check phone number verification status
   * @returns {Promise<Object>} Phone number status
   */
  async getPhoneNumberStatus() {
    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Error getting phone number status:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get API usage statistics
   * @returns {Promise<Object>} Usage statistics
   */
  async getUsageStats() {
    try {
      // Note: This would require additional permissions
      // Implementation depends on Meta's specific API endpoints for usage
      console.log('📊 Usage stats tracking - to be implemented with proper permissions');
      return {
        success: true,
        message: 'Usage stats tracking requires additional API permissions'
      };
    } catch (error) {
      console.error('❌ Error getting usage stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const whatsappAPI = new WhatsAppCloudAPI();

module.exports = whatsappAPI;