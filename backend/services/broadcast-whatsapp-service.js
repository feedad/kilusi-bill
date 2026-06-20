/**
 * Broadcast WhatsApp Notification Service
 *
 * Shared service for sending WhatsApp notifications for broadcast messages.
 * Used by both broadcast messages and maintenance scheduler.
 *
 * @module services/broadcast-whatsapp-service
 */

const { query } = require('../config/database');
const kilusiOmnichat = require('../config/kilusi-whatsapp');
const whatsappNotifications = require('../config/whatsapp-notifications');
const { logger } = require('../config/logger');

/**
 * Send WhatsApp broadcast notification
 *
 * @param {object} options - Broadcast options
 * @param {string} options.title - Message title
 * @param {string} options.message - Message content
 * @param {string} options.type - Message type (info, gangguan, maintenance, etc.)
 * @param {boolean} options.target_all - Target all customers
 * @param {Array} options.target_areas - Target specific areas
 * @param {string} options.whatsapp_template_id - Template ID (optional)
 * @param {Date} options.scheduled_start_time - Maintenance start time (optional)
 * @param {Date} options.scheduled_end_time - Maintenance end time (optional)
 * @param {number} options.estimated_duration - Estimated duration in minutes (optional)
 * @returns {Promise<object>} Delivery results
 */
async function sendBroadcastNotification(options) {
  const {
    title,
    message,
    type,
    target_all,
    target_areas,
    target_mitra,
    whatsapp_template_id,
    info_tambahan,
    scheduled_start_time,
    scheduled_end_time,
    estimated_duration
  } = options;

  try {
    // Get target customers based on targeting settings
    // Join with services table to get area information
    let customersQuery = `
      SELECT DISTINCT c.phone, c.name, c.id as customer_id
      FROM customers c
      LEFT JOIN services s ON s.customer_id::text = c.id AND s.status = 'active'
      LEFT JOIN regions r ON r.id = s.region_id
      LEFT JOIN mitra m ON m.id = r.mitra_id
      WHERE c.phone IS NOT NULL AND c.phone != ''
    `;
    const queryParams = [];
    let paramIndex = 1;

    // Filter by target areas if not targeting all
    if (!target_all && target_areas && target_areas.length > 0) {
      // Parse target_areas if it's stored as JSON string
      let areasArray = target_areas;
      if (typeof target_areas === 'string') {
        try {
          areasArray = JSON.parse(target_areas);
        } catch (e) {
          areasArray = [target_areas];
        }
      }

      if (Array.isArray(areasArray) && areasArray.length > 0) {
        customersQuery += ` AND (s.area = ANY($${paramIndex}) OR r.name = ANY($${paramIndex}))`;
        queryParams.push(areasArray);
        paramIndex++;
      }
    }

    // Filter by target mitra if not targeting all
    if (!target_all && target_mitra && target_mitra.length > 0) {
      let mitraArray = target_mitra;
      if (typeof target_mitra === 'string') {
        try {
          mitraArray = JSON.parse(target_mitra);
        } catch (e) {
          mitraArray = [target_mitra];
        }
      }

      if (Array.isArray(mitraArray) && mitraArray.length > 0) {
        customersQuery += ` AND m.name = ANY($${paramIndex})`;
        queryParams.push(mitraArray);
        paramIndex++;
      }
    }

    const customersResult = await query(customersQuery, queryParams);
    const customers = customersResult.rows;

    const areaInfo = target_areas?.length || 0;
    const mitraInfo = target_mitra?.length || 0;
    logger.info(`WhatsApp broadcast target: ${target_all ? 'ALL customers' : `${areaInfo} areas, ${mitraInfo} mitra`}, found ${customers.length} customers`);

    if (customers.length === 0) {
      return {
        success: true,
        total: 0,
        sent: 0,
        failed: 0,
        customers: []
      };
    }

    // Check if using template or custom message
    const useTemplate = whatsapp_template_id && whatsapp_template_id !== 'custom';

    let sentCount = 0;
    let failedCount = 0;
    const results = [];

    if (useTemplate) {
      logger.info(`Using WhatsApp template: ${whatsapp_template_id}`);

      const companyInfo = await whatsappNotifications.getCompanyInfo();

      // Compute info_tambahan value
      let infoTambahanValue = info_tambahan;
      if (!infoTambahanValue && type === 'maintenance') {
        if (scheduled_start_time && scheduled_end_time) {
          const startMs = new Date(scheduled_start_time).getTime();
          const endMs = new Date(scheduled_end_time).getTime();
          const diffMinutes = Math.round((endMs - startMs) / 60000);
          if (diffMinutes > 0) {
            const hours = Math.floor(diffMinutes / 60);
            const mins = diffMinutes % 60;
            if (hours > 0 && mins > 0) {
              infoTambahanValue = `estimasi pengerjaan ${hours} jam ${mins} menit`;
            } else if (hours > 0) {
              infoTambahanValue = `estimasi pengerjaan ${hours} jam`;
            } else {
              infoTambahanValue = `estimasi pengerjaan ${mins} menit`;
            }
          } else {
            infoTambahanValue = 'estimasi waktu belum dapat kami informasikan';
          }
        } else {
          infoTambahanValue = 'estimasi waktu belum dapat kami informasikan';
        }
      } else if (!infoTambahanValue) {
        infoTambahanValue = '-';
      }

      // Get template variables
      const templateResult = await query(
        'SELECT * FROM whatsapp_templates WHERE template_id = $1',
        [whatsapp_template_id]
      );

      if (templateResult.rows.length === 0) {
        logger.error(`Template not found: ${whatsapp_template_id}`);
        results.push({ customer: '', success: false, error: 'Template not found' });
        failedCount = customers.length;
        return { success: false, total: customers.length, sent: 0, failed: failedCount, customers: results };
      }

      const template = templateResult.rows[0];
      const templateVars = template.variables
        ? template.variables.split(',').map(v => v.trim())
        : [];

      // Map variable names to values
      const varMap = {
        title: title,
        content: message,
        info_tambahan: infoTambahanValue,
        supportPhone: companyInfo.support_phone || '',
        customerPortal: companyInfo.customer_portal || '',
        companyName: companyInfo.name || 'KITA SELALU TERKONEKSI'
      };

      for (const customer of customers) {
        try {
          // Build parameter array matching template variable order
          const parameters = templateVars.map(v => ({
            type: 'text',
            text: String(varMap[v] || '-').replace(/[\r\n]+/g, ' ').trim()
          }));

          const templateName = template.meta_name || whatsapp_template_id;
          await kilusiOmnichat.sendTemplate(
            customer.phone,
            templateName,
            'id',
            parameters,
            {
              customer_id: customer.customer_id,
              customer_name: customer.name,
              notification_type: `broadcast_${type}`,
              source: 'broadcast'
            }
          );

          logger.info(`📱 WhatsApp template sent to ${customer.name} (${customer.phone})`);
          sentCount++;
          results.push({ customer: customer.phone, success: true });
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (customerError) {
          logger.error(`Failed to send WhatsApp template to ${customer.phone}:`, customerError.message);
          failedCount++;
          results.push({ customer: customer.phone, success: false, error: customerError.message });
        }
      }
    } else {
      // Use custom message format (session message)
      logger.info(`Using custom message format (not template)`);

      const companyInfo = await whatsappNotifications.getCompanyInfo();

      const typeLabels = {
        'informasi': '📢 INFORMASI',
        'info': '📢 INFORMASI',
        'gangguan': '🚨 GANGGUAN',
        'error': '🚨 GANGGUAN',
        'maintenance': '🔧 PEMELIHARAAN',
        'warning': '⚠️ PERINGATAN',
        'selesai': '✅ SELESAI',
        'success': '✅ SELESAI'
      };

      const typeLabel = typeLabels[type] || '📢 INFORMASI';

      // Format time for maintenance messages
      let timeInfo = '';
      if (type === 'maintenance') {
        if (scheduled_start_time) {
          const startDate = new Date(scheduled_start_time);
          const startTimeStr = startDate.toLocaleString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Jakarta'
          });
          timeInfo += `⏰ *Waktu Mulai:* ${startTimeStr}\n`;

          if (scheduled_end_time) {
            const endDate = new Date(scheduled_end_time);
            const endTimeStr = endDate.toLocaleString('id-ID', {
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Jakarta'
            });
            timeInfo += `⏰ *Waktu Selesai:* ${endTimeStr}\n`;
          }

          if (estimated_duration) {
            const hours = Math.floor(estimated_duration / 60);
            const mins = estimated_duration % 60;
            if (hours > 0) {
              timeInfo += `⏱ *Durasi:* ${hours} jam ${mins} menit\n`;
            } else {
              timeInfo += `⏱ *Durasi:* ${mins} menit\n`;
            }
          }
        }
      }

      for (const customer of customers) {
        try {
          let waMessage = `*${typeLabel}*\n\n` +
            `Halo ${customer.name},\n\n` +
            `*${title}*\n\n` +
            `${message}\n\n`;

          // Add time info for maintenance
          if (timeInfo) {
            waMessage += `${timeInfo}`;
          }

          waMessage += `─────────────────────\n` +
            `${companyInfo.name}\n` +
            `Hubungi: ${companyInfo.support_phone}\n\n` +
            `_Cek portal pelanggan untuk info lebih lanjut._`;

          await kilusiOmnichat.sendMessage(customer.phone, waMessage);
          logger.info(`📱 WhatsApp sent to ${customer.name} (${customer.phone}) for broadcast: ${title}`);
          sentCount++;
          results.push({ customer: customer.phone, success: true });
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (customerError) {
          logger.error(`Failed to send WhatsApp to ${customer.phone}:`, customerError.message);
          failedCount++;
          results.push({ customer: customer.phone, success: false, error: customerError.message });
        }
      }
    }

    logger.info(`📱 WhatsApp broadcast completed: ${sentCount} sent, ${failedCount} failed`);

    return {
      success: true,
      total: customers.length,
      sent: sentCount,
      failed: failedCount,
      customers: results
    };
  } catch (error) {
    logger.error('WhatsApp broadcast error:', error);
    throw error;
  }
}

/**
 * Broadcast to WebSocket for real-time updates
 *
 * @param {object} message - Broadcast message object
 * @param {string} eventType - Event type (new, update, delete)
 */
function broadcastWebSocket(message, eventType = 'new') {
  try {
    const io = global.io;
    if (io) {
      const broadcastEvent = {
        type: eventType,
        message: message,
        timestamp: new Date().toISOString()
      };

      // Broadcast to all customer rooms
      io.emit(`broadcast:${eventType}`, broadcastEvent);

      // Broadcast to specific regions if targeted
      if (message.target_areas && !message.target_all) {
        const targetAreas = Array.isArray(message.target_areas)
          ? message.target_areas
          : JSON.parse(message.target_areas || '[]');

        targetAreas.forEach(region => {
          io.to(`region-${region}`).emit(`broadcast:${eventType}`, broadcastEvent);
        });
      }

      // Broadcast to all customers if target_all is true
      if (message.target_all) {
        io.emit(`broadcast:${eventType}`, broadcastEvent);
      }

      logger.info(`📡 Broadcast WebSocket ${eventType}: ${message.title}`);
    }
  } catch (wsError) {
    logger.error('WebSocket broadcast error:', wsError);
  }
}

module.exports = {
  sendBroadcastNotification,
  broadcastWebSocket
};
