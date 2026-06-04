const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');

// GET /api/v1/broadcast-public/messages/active - Get active messages for customer display
router.get('/messages/active', async (req, res) => {
  try {
    const customerId = req.query.customer_id;
    const customerRegion = req.query.region;

    let whereClause = `
      WHERE is_active = true
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;
    const queryParams = [];
    let paramIndex = 1;

    if (customerId) {
      // Note: area column missing in customers table
      // Disable region lookup
      /*
    // Get customer's region from database
    const customerQuery = `SELECT area FROM customers WHERE id = $1`;
    const customerResult = await query(customerQuery, [customerId]);

    if (customerResult.rows.length > 0) {
      const customerRegionName = customerResult.rows[0].area;

      whereClause += ` AND (
        target_all = true
        OR target_areas IS NULL
        OR $${paramIndex} = ANY(string_to_array(replace(target_areas::text, '"', ''), ','))
      )`;
      queryParams.push(customerRegionName);
      paramIndex++;
    } */
      // Only show global messages
      whereClause += ` AND (target_all = true OR target_areas IS NULL)`;
    } else if (customerRegion) {
      whereClause += ` AND (
        target_all = true
        OR target_areas IS NULL
        OR $${paramIndex} = ANY(string_to_array(replace(target_areas::text, '"', ''), ','))
      )`;
      queryParams.push(customerRegion);
      paramIndex++;
    }

    const messagesQuery = `
      SELECT id, title, message, type, priority, created_at, expires_at
      FROM broadcast_messages
      ${whereClause}
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        created_at DESC
      LIMIT 10
    `;

    const result = await query(messagesQuery, queryParams);

    res.json({
      success: true,
      data: {
        messages: result.rows,
        total: result.rows.length
      }
    });
  } catch (error) {
    console.error('Error fetching active broadcast messages:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil pesan aktif'
    });
  }
});

/**
 * GET /api/v1/broadcast-public/payment-settings
 * Get payment settings including bank accounts (public for WhatsApp broadcast)
 */
router.get('/payment-settings', async (req, res) => {
  try {
    const settingsManager = require('../../../config/settingsManager');

    // Get payment settings from app_config
    let paymentSettings = settingsManager.getSetting('payment_settings') || settingsManager.getSetting('paymentSettings');

    if (typeof paymentSettings === 'string') {
      try {
        paymentSettings = JSON.parse(paymentSettings);
      } catch (e) {
        paymentSettings = {};
      }
    }

    // If no bank_accounts in settings, try to get from payment_gateway_settings table
    if (!paymentSettings || !paymentSettings.bank_accounts || paymentSettings.bank_accounts.length === 0) {
      const result = await query(
        "SELECT config FROM payment_gateway_settings WHERE gateway = 'manual' LIMIT 1"
      );

      if (result.rows.length > 0) {
        let conf = result.rows[0].config;
        if (typeof conf === 'string') {
          try { conf = JSON.parse(conf); } catch (e) { conf = {}; }
        }
        if (conf.bank_accounts) {
          paymentSettings = {
            ...paymentSettings,
            bank_accounts: conf.bank_accounts
          };
        }
      }
    }

    // Format bank accounts for WhatsApp template
    let formattedBankAccounts = '';
    if (paymentSettings && paymentSettings.bank_accounts && paymentSettings.bank_accounts.length > 0) {
      formattedBankAccounts = paymentSettings.bank_accounts.map((account, index) => {
        const emoji = ['💳', '🏦', '🏛️'][index % 3];
        return `${emoji} ${account.bank_name}: ${account.account_number}\n   a.n ${account.account_name}`;
      }).join('\n\n');
    }

    res.json({
      success: true,
      data: {
        bank_accounts: paymentSettings?.bank_accounts || [],
        formatted_bank_accounts: formattedBankAccounts
      }
    });
  } catch (error) {
    console.error('Error fetching payment settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment settings',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/broadcast-public/customers-preview
 * Get preview of customers data for broadcast (with sample data)
 */
router.get('/customers-preview', async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    // Get sample customers for preview
    const result = await query(`
      SELECT
        c.id,
        c.nama_customer,
        c.no_layanan,
        c.phone,
        c.alamat,
        c.status,
        p.name as package_name,
        p.price as package_price,
        p.profile
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE c.status = 'active'
      ORDER BY c.created_at DESC
      LIMIT $1
    `, [limit]);

    const customers = result.rows.map(c => ({
      ...c,
      nama_pelanggan: c.nama_customer,
      profile: c.profile || c.package_name,
      harga: c.package_price ? `Rp ${Math.round(c.package_price).toLocaleString('id-ID')}` : 'Rp 0',
      phone: c.phone || '62xxxxxxxx',
      jenis_tagihan: c.billing_cycle || 'Bulanan'
    }));

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    console.error('Error fetching customers preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers preview',
      error: error.message
    });
  }
});

module.exports = router;