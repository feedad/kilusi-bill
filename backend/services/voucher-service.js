/**
 * Voucher Service
 * Handles hotspot voucher creation, activation, and validation
 */

const { query, getOne } = require('../config/database');
const { logger } = require('../config/logger');
const radiusSync = require('../config/radius-sync');
const whatsappNotifications = require('../config/whatsapp-notifications');

class VoucherService {
  /**
   * Get voucher format settings from database
   */
  static async getFormatSettings() {
    try {
      const settings = await getOne(
        'SELECT * FROM voucher_format_settings WHERE is_active = true ORDER BY id DESC LIMIT 1'
      );

      if (!settings) {
        return {
          username_prefix: 'HS',
          username_length: 12,
          username_use_numbers: true,
          username_use_uppercase: true,
          username_use_lowercase: false,
          password_same_as_username: true,
          password_length: 8,
          password_use_numbers: true,
          password_use_uppercase: true,
          password_use_lowercase: false,
          code_template: '{PREFIX}{RANDOM}'
        };
      }

      // Convert boolean values from PostgreSQL
      return {
        username_prefix: settings.username_prefix || 'HS',
        username_length: settings.username_length || 12,
        username_use_numbers: settings.username_use_numbers === true,
        username_use_uppercase: settings.username_use_uppercase === true,
        username_use_lowercase: settings.username_use_lowercase === true,
        password_same_as_username: settings.password_same_as_username === true,
        password_length: settings.password_length || 8,
        password_use_numbers: settings.password_use_numbers === true,
        password_use_uppercase: settings.password_use_uppercase === true,
        password_use_lowercase: settings.password_use_lowercase === true,
        code_template: settings.code_template || '{PREFIX}{RANDOM}'
      };
    } catch (error) {
      logger.error('Error getting voucher format settings:', error.message);
      // Return defaults
      return {
        username_prefix: 'HS',
        username_length: 12,
        username_use_numbers: true,
        username_use_uppercase: true,
        username_use_lowercase: false,
        password_same_as_username: true,
        password_length: 8,
        password_use_numbers: true,
        password_use_uppercase: true,
        password_use_lowercase: false,
        code_template: '{PREFIX}{RANDOM}'
      };
    }
  }

  /**
   * Generate random string based on settings
   */
  static generateRandomString(length, useNumbers, useUppercase, useLowercase) {
    let chars = '';
    if (useNumbers) chars += '0123456789';
    if (useUppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (useLowercase) chars += 'abcdefghijklmnopqrstuvwxyz';

    if (chars.length === 0) chars = '0123456789'; // Default fallback

    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate unique voucher code and password based on format settings
   */
  static async generateCode() {
    try {
      const settings = await this.getFormatSettings();

      logger.info('🎲 Generating voucher with settings:', {
        prefix: settings.username_prefix,
        length: settings.username_length,
        numbers: settings.username_use_numbers,
        upper: settings.username_use_uppercase,
        lower: settings.username_use_lowercase
      });

      // Calculate random part length (include prefix in total length)
      const prefixLength = settings.username_prefix.length;
      const randomLength = settings.username_length - prefixLength;

      // Ensure minimum random length
      const finalRandomLength = Math.max(randomLength, 4);

      logger.info(`📐 Random part length: ${finalRandomLength} (total: ${settings.username_length}, prefix: ${prefixLength})`);

      // Generate username
      const randomPart = this.generateRandomString(
        finalRandomLength,
        settings.username_use_numbers,
        settings.username_use_uppercase,
        settings.username_use_lowercase
      );

      const username = settings.username_prefix + randomPart;

      // Generate password (same as username if enabled)
      let password;
      if (settings.password_same_as_username) {
        password = username;
      } else {
        password = this.generateRandomString(
          settings.password_length,
          settings.password_use_numbers,
          settings.password_use_uppercase,
          settings.password_use_lowercase
        );
      }

      // Generate display code (for customer reference)
      const code = username; // Default to username for simplicity

      logger.info(`✅ Generated voucher: ${username} (${username.length} chars)`);

      return { code, username, password };
    } catch (error) {
      logger.error('Error generating voucher code:', error.message);
      // Fallback to default format
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `HS-${timestamp}-${random}`;
      return { code, username: code, password: code };
    }
  }

  /**
   * Create voucher purchase order
   * Creates voucher record in pending status
   */
  static async createPurchaseOrder(data) {
    const { packageId, customerName, customerPhone, customerEmail } = data;

    try {
      // Get hotspot package
      const pkg = await getOne(
        'SELECT * FROM hotspot_packages WHERE id = $1 AND is_active = true',
        [packageId]
      );

      if (!pkg) {
        throw new Error('Invalid package');
      }

      // Generate voucher code and credentials
      const { code, username, password } = await this.generateCode();

      // Calculate expiration based on duration type
      const expiresAt = new Date();
      const durationValue = pkg.duration_value || pkg.duration_hours || 1;
      const durationType = pkg.duration_type || 'hours';

      switch (durationType) {
        case 'hours':
          expiresAt.setHours(expiresAt.getHours() + durationValue);
          break;
        case 'days':
          expiresAt.setDate(expiresAt.getDate() + durationValue);
          break;
        case 'months':
          expiresAt.setMonth(expiresAt.getMonth() + durationValue);
          break;
      }

      // Calculate session timeout in seconds for RADIUS
      let sessionTimeoutSeconds;
      switch (durationType) {
        case 'hours':
          sessionTimeoutSeconds = durationValue * 3600;
          break;
        case 'days':
          sessionTimeoutSeconds = durationValue * 86400;
          break;
        case 'months':
          // Approximate as 30 days per month
          sessionTimeoutSeconds = durationValue * 30 * 86400;
          break;
      }

      // Create voucher record
      const voucher = await getOne(`
        INSERT INTO vouchers (
          code, username, password, package_id, amount, duration_hours,
          speed_limit, customer_name, customer_phone, customer_email,
          profile, status, payment_status, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', 'unpaid', $12)
        RETURNING *
      `, [
        code, username, password, packageId, pkg.price, durationValue,
        pkg.speed_limit, customerName, customerPhone, customerEmail,
        pkg.mikrotik_profile || 'default', expiresAt
      ]);

      // Store session timeout for RADIUS
      voucher.session_timeout = sessionTimeoutSeconds;

      logger.info(`✅ Voucher purchase order created: ${code} for ${customerName} (${durationValue} ${durationType})`);

      return voucher;
    } catch (error) {
      logger.error(`Error creating voucher purchase order: ${error.message}`);
      throw error;
    }
  }

  /**
   * Activate voucher after payment
   * Updates voucher status and creates RADIUS entries
   */
  static async activateVoucher(voucherCode, transactionId) {
    try {
      // Update voucher status
      const voucher = await getOne(`
        UPDATE vouchers
        SET status = 'active', payment_status = 'paid',
            paid_at = NOW(), activated_at = NOW(),
            payment_transaction_id = $1
        WHERE code = $2 AND payment_status = 'unpaid'
        RETURNING *
      `, [transactionId, voucherCode]);

      if (!voucher) {
        throw new Error('Voucher not found or already paid');
      }

      // Get package info to calculate session timeout
      const pkg = await getOne(
        'SELECT * FROM hotspot_packages WHERE id = $1',
        [voucher.package_id]
      );

      // Calculate session timeout based on duration type
      const durationValue = pkg?.duration_value || voucher.duration_hours || 1;
      const durationType = pkg?.duration_type || 'hours';
      let sessionTimeoutSeconds;

      switch (durationType) {
        case 'hours':
          sessionTimeoutSeconds = durationValue * 3600;
          break;
        case 'days':
          sessionTimeoutSeconds = durationValue * 86400;
          break;
        case 'months':
          sessionTimeoutSeconds = durationValue * 30 * 86400;
          break;
        default:
          sessionTimeoutSeconds = durationValue * 3600;
      }

      // Create RADIUS entries for authentication
      await radiusSync.createVoucherRadiusEntries({
        username: voucher.username,
        password: voucher.password,
        speed_limit: voucher.speed_limit,
        duration_hours: durationValue,
        session_timeout: sessionTimeoutSeconds,
        mikrotik_profile: voucher.profile || 'HOTSPOT_DEFAULT'
      });

      // Send voucher via WhatsApp
      try {
        await whatsappNotifications.sendVoucherDeliveredNotification(
          voucher.customer_phone,
          {
            customer_name: voucher.customer_name,
            voucher_code: voucher.code,
            username: voucher.username,
            password: voucher.password,
            duration_hours: voucher.duration_hours,
            speed_limit: voucher.speed_limit
          }
        );
        logger.info(`📱 Voucher sent via WhatsApp to ${voucher.customer_phone}`);
      } catch (notifError) {
        logger.error(`Failed to send WhatsApp notification: ${notifError.message}`);
        // Don't fail activation if notification fails
      }

      // Create financial transaction for revenue tracking
      try {
        // Get Hotspot Voucher category with its type
        const category = await getOne(
          "SELECT id, type FROM accounting_categories WHERE name = 'Hotspot Voucher'"
        );

        if (category) {
          await query(`
            INSERT INTO accounting_transactions (
              type, category_id, amount, description,
              date, reference_type, reference_id, notes
            ) VALUES (
              $1, $2, $3, $4, CURRENT_DATE, 'voucher', $5, $6
            )
          `, [
            category.type, // Use category type ('revenue') instead of hardcoded 'income'
            category.id,
            voucher.amount,
            `Hotspot Voucher ${voucher.code} - ${voucher.duration_hours} jam (${voucher.speed_limit})`,
            voucher.id,
            `Payment via Tripay QRIS. Customer: ${voucher.customer_name} (${voucher.customer_phone})`
          ]);
          logger.info(`💰 Financial transaction created for voucher: ${voucher.code} - Rp ${voucher.amount}`);
        }
      } catch (finError) {
        logger.error(`Failed to create financial transaction: ${finError.message}`);
        // Don't fail activation if financial transaction fails
      }

      logger.info(`✅ Voucher activated: ${voucherCode}`);

      return voucher;
    } catch (error) {
      logger.error(`Error activating voucher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate voucher for login
   * Checks if voucher is active, not expired, and not already used
   */
  static async validateVoucher(code, password) {
    try {
      const voucher = await getOne(`
        SELECT * FROM vouchers
        WHERE code = $1
        AND password = $2
        AND status = 'active'
        AND payment_status = 'paid'
        AND (expires_at IS NULL OR expires_at > NOW())
      `, [code, password]);

      if (!voucher) {
        logger.warn(`Voucher validation failed: ${code}`);
        return null;
      }

      logger.debug(`✅ Voucher validated: ${code}`);
      return voucher;
    } catch (error) {
      logger.error(`Error validating voucher: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if voucher can be used for login (prevents re-use of used vouchers)
   * This is called by RADIUS or authentication system
   */
  static async canUseVoucher(code, password) {
    try {
      const voucher = await getOne(`
        SELECT * FROM vouchers
        WHERE code = $1
        AND password = $2
        AND status = 'active'
        AND payment_status = 'paid'
        AND (expires_at IS NULL OR expires_at > NOW())
      `, [code, password]);

      if (!voucher) {
        // Check if voucher exists but is used/expired to return appropriate message
        const usedVoucher = await getOne(`
          SELECT * FROM vouchers WHERE code = $1 AND password = $2
        `, [code, password]);

        if (usedVoucher) {
          if (usedVoucher.status === 'used') {
            return { allowed: false, reason: 'Voucher sudah digunakan' };
          }
          if (usedVoucher.payment_status !== 'paid') {
            return { allowed: false, reason: 'Voucher belum dibayar' };
          }
          if (usedVoucher.expires_at && new Date(usedVoucher.expires_at) < new Date()) {
            return { allowed: false, reason: 'Voucher sudah kedaluwarsa' };
          }
        }
        return { allowed: false, reason: 'Voucher tidak valid' };
      }

      return { allowed: true, voucher };
    } catch (error) {
      logger.error(`Error checking voucher usage: ${error.message}`);
      return { allowed: false, reason: 'Error validasi voucher' };
    }
  }

  /**
   * Mark voucher as used (after duration expires or logout)
   * Updates voucher status and removes from RADIUS
   */
  static async markAsUsed(code, username, ipAddress, macAddress, sessionDuration) {
    try {
      // Check if already used
      const existing = await getOne('SELECT status, username FROM vouchers WHERE code = $1', [code]);
      if (existing?.status === 'used') {
        logger.info(`Voucher ${code} already marked as used`);
        return true;
      }

      // Update voucher status
      await query(`
        UPDATE vouchers
        SET status = 'used', used_at = NOW()
        WHERE code = $1 AND status = 'active'
      `, [code]);

      // Track usage in voucher_usage table
      await query(`
        INSERT INTO voucher_usage (voucher_code, username, login_time, ip_address, mac_address, duration_minutes)
        VALUES ($1, $2, NOW(), $3, $4, $5)
      `, [code, username, ipAddress, macAddress, sessionDuration ? Math.floor(sessionDuration / 60) : null]);

      // Remove from RADIUS to prevent re-login
      if (existing?.username) {
        await radiusSync.deleteVoucherUser(existing.username);
        logger.info(`🗑️ Removed from RADIUS: ${existing.username} (voucher ${code} used)`);
      }

      logger.info(`✅ Voucher marked as used: ${code}`);
      return true;
    } catch (error) {
      logger.error(`Error marking voucher as used: ${error.message}`);
      return false;
    }
  }

  /**
   * Check and mark expired vouchers based on RADIUS accounting
   * This should be called periodically to update vouchers that have exhausted their duration
   */
  static async checkAndUpdateExpiredVouchers() {
    try {
      // 1. Mark vouchers from radacct that have exhausted their duration
      const exhaustedVouchers = await query(`
        SELECT DISTINCT
          v.code,
          v.username,
          v.status,
          v.duration_hours,
          ra.acctstarttime,
          ra.acctstoptime,
          ra.acctsessiontime,
          ra.acctterminatecause
        FROM vouchers v
        INNER JOIN radacct ra ON v.username = ra.username
        WHERE v.status = 'active'
          AND v.payment_status = 'paid'
          AND ra.acctstoptime IS NOT NULL
          AND (
            ra.acctterminatecause IN ('User-Request', 'Admin-Reset', 'Session-Timeout', 'Idle-Timeout')
            OR
            EXTRACT(EPOCH FROM (ra.acctstoptime - ra.acctstarttime)) >= v.duration_hours * 3600 * 0.95
          )
        ORDER BY ra.acctstoptime DESC
      `);

      for (const voucher of exhaustedVouchers.rows) {
        await this.markAsUsed(
          voucher.code,
          voucher.username,
          null, null,
          voucher.acctsessiontime
        );
      }

      // 2. Fallback: vouchers with expired_at passed but no radacct record (crash/offline)
      const expiredNoSession = await query(`
        SELECT code, username FROM vouchers
        WHERE status = 'active'
          AND payment_status = 'paid'
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
          AND NOT EXISTS (
            SELECT 1 FROM radacct ra
            WHERE ra.username = vouchers.username
              AND ra.acctstoptime IS NULL
          )
      `);

      for (const voucher of expiredNoSession.rows) {
        await this.markAsUsed(
          voucher.code,
          voucher.username,
          null, null, null
        );
      }

      return exhaustedVouchers.rows.length + expiredNoSession.rows.length;
    } catch (error) {
      logger.error(`Error checking expired vouchers: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get voucher by code
   */
  static async getVoucherByCode(code) {
    try {
      const voucher = await getOne(`
        SELECT code, status, payment_status, created_at, paid_at, activated_at,
               expires_at, duration_hours, speed_limit, customer_name, customer_phone
        FROM vouchers WHERE code = $1
      `, [code]);

      return voucher;
    } catch (error) {
      logger.error(`Error getting voucher: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all active vouchers
   */
  static async getActiveVouchers() {
    try {
      const vouchers = await query(`
        SELECT code, customer_name, customer_phone, duration_hours, speed_limit,
               created_at, activated_at, expires_at
        FROM vouchers
        WHERE status = 'active' AND payment_status = 'paid'
        ORDER BY activated_at DESC
      `);

      return vouchers;
    } catch (error) {
      logger.error(`Error getting active vouchers: ${error.message}`);
      return [];
    }
  }

  /**
   * Cleanup expired vouchers
   */
  static async cleanupExpiredVouchers() {
    try {
      const result = await query(`
        UPDATE vouchers
        SET status = 'expired'
        WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
        RETURNING code
      `);

      if (result.length > 0) {
        logger.info(`🗑️  Cleaned up ${result.length} expired vouchers`);

        // Also remove from RADIUS
        for (const voucher of result) {
          await radiusSync.deleteVoucherUser(voucher.code);
        }
      }

      return result.length;
    } catch (error) {
      logger.error(`Error cleaning up expired vouchers: ${error.message}`);
      return 0;
    }
  }
}

module.exports = VoucherService;
