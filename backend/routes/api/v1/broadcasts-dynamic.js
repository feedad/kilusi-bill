/**
 * Send Dynamic Broadcast with Personalized Customer Data
 * Each customer gets personalized message based on their actual data (invoice, package, etc.)
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../../config/database');
const { logger } = require('../../../config/logger');
const kilusiOmnichat = require('../../../config/kilusi-whatsapp');

/**
 * POST /api/v1/broadcasts/send-dynamic
 * Send broadcast with personalized messages for each customer
 */
router.post('/send-dynamic', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      template_id,
      recipient_type, // 'all_active', 'region', 'overdue', 'expiring_soon'
      region_id,
      customer_ids, // specific customer IDs
      dry_run = false // true = preview only, false = actually send
    } = req.body;

    if (!template_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'template_id is required'
      });
    }

    // Get template details
    const templateResult = await client.query(
      'SELECT * FROM whatsapp_templates WHERE id = $1',
      [template_id]
    );

    if (templateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const template = templateResult.rows[0];

    if (!template.enabled) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Template is disabled'
      });
    }

    // Build query to get customers
    let customerQuery = '';
    const queryParams = [];
    let paramIndex = 1;

    // Base query with relevant customer and billing data
    customerQuery = `
      SELECT DISTINCT
        c.id as customer_id,
        c.nama_customer,
        c.no_layanan,
        c.phone,
        c.alamat,
        c.status,
        c.billing_cycle,
        p.name as package_name,
        p.price as package_price,
        p.profile,
        p.speed as package_speed,
        p.id as package_id,
        COALESCE(i.id, 0) as has_invoice,
        COALESCE(i.invoice_number, 'N/A') as invoice_number,
        COALESCE(i.amount, 0) as invoice_amount,
        COALESCE(i.due_date, CURRENT_DATE + INTERVAL '7 days') as due_date,
        i.status as invoice_status,
        rp.expiry_date
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      LEFT JOIN invoices i ON c.id = i.customer_id
        AND i.status = 'unpaid'
        AND i.is_current = true
      LEFT JOIN recurring_packages rp ON c.id = rp.customer_id
      WHERE 1=1
    `;

    // Filter by recipient type
    if (recipient_type === 'all_active') {
      customerQuery += ` AND c.status = 'active'`;
    } else if (recipient_type === 'overdue') {
      customerQuery += ` AND i.due_date < CURRENT_DATE AND i.status = 'unpaid'`;
    } else if (recipient_type === 'expiring_soon') {
      customerQuery += ` AND rp.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`;
    } else if (recipient_type === 'region' && region_id) {
      customerQuery += ` AND c.area_id = $${paramIndex++}`;
      queryParams.push(region_id);
    } else if (customer_ids && Array.isArray(customer_ids) && customer_ids.length > 0) {
      customerQuery += ` AND c.id = ANY($${paramIndex++})`;
      queryParams.push(customer_ids);
    }

    customerQuery += ` ORDER BY c.nama_customer LIMIT 1000`; // Safety limit

    logger.info(`Executing customer query for broadcast: ${recipient_type}`);
    const customersResult = await client.query(customerQuery, queryParams);
    const customers = customersResult.rows;

    if (customers.length === 0) {
      await client.query('ROLLBACK');
      return res.json({
        success: true,
        message: 'No customers found matching criteria',
        data: {
          preview_count: 0,
          customers: [],
          dry_run: dry_run
        }
      });
    }

    // Generate personalized messages for each customer
    const personalizedMessages = [];

    for (const customer of customers) {
      // Get latest invoice if exists
      let invoiceData = {};
      if (customer.has_invoice) {
        const invoiceResult = await client.query(`
          SELECT invoice_number, amount, due_date, period
          FROM invoices
          WHERE customer_id = $1
          AND status = 'unpaid'
          AND is_current = true
          ORDER BY due_date ASC
          LIMIT 1
        `, [customer.customer_id]);

        if (invoiceResult.rows.length > 0) {
          invoiceData = {
            invoice_number: invoiceResult.rows[0].invoice_number,
            amount: invoiceResult.rows[0].amount,
            due_date: invoiceResult.rows[0].due_date,
            period: invoiceResult.rows[0].period
          };
        }
      }

      // Get package expiry date
      let expiryDate = '';
      if (customer.expiry_date) {
        const date = new Date(customer.expiry_date);
        expiryDate = date.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }

      // Format price
      const formattedPrice = customer.package_price
        ? `Rp ${Math.round(customer.package_price).toLocaleString('id-ID')}`
        : 'Rp 0';

      // Build variables object based on customer data
      const variables = {
        // Basic info
        nama_pelanggan: customer.nama_customer || 'Pelanggan',
        customerName: customer.nama_customer || 'Pelanggan',
        no_layanan: customer.no_layanan || 'N/A',
        phone: customer.phone || '',
        alamat_pasang: customer.alamat || '',

        // Package info
        packageName: customer.package_name || 'N/A',
        packageSpeed: customer.package_speed || 'N/A',
        profile: customer.profile || customer.package_name || 'N/A',
        harga: formattedPrice,

        // Billing info
        jenis_tagihan: customer.billing_cycle || 'Bulanan',

        // Dates
        tgl_aktif: customer.created_at ? new Date(customer.created_at).toLocaleDateString('id-ID') : new Date().toLocaleDateString('id-ID'),
        tgl_isolir: expiryDate || 'N/A',

        // Invoice info
        invoiceNumber: invoiceData.invoice_number || 'N/A',
        amount: invoiceData.amount ? `Rp ${Math.round(invoiceData.amount).toLocaleString('id-ID')}` : 'Rp 0',
        dueDate: invoiceData.due_date ? new Date(invoiceData.due_date).toLocaleDateString('id-ID') : 'N/A',
        month: invoiceData.period ? invoiceData.period.split('-')[1] : new Date().toLocaleString('id-ID', { month: 'long' }),
        year: invoiceData.period ? invoiceData.period.split('-')[0] : new Date().getFullYear().toString(),

        // Company info
        companyName: 'Kilusi Bill',
        supportNumber: '62811225323',

        // Client area link (will be generated based on customer ID or no layanan)
        link_client_area: `https://client.kilusi.id/login?ref=${customer.no_layanan || customer.customer_id}`
      };

      // Replace variables in template content
      let personalizedContent = template.content;
      Object.keys(variables).forEach(key => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        personalizedContent = personalizedContent.replace(regex, variables[key] || `[${key}]`);
      });

      personalizedMessages.push({
        customer_id: customer.customer_id,
        phone: customer.phone,
        nama_pelanggan: customer.nama_customer,
        no_layanan: customer.no_layanan,
        message: personalizedContent,
        variables: variables
      });
    }

    // Return preview if dry_run
    if (dry_run) {
      await client.query('ROLLBACK');
      return res.json({
        success: true,
        message: 'Preview generated successfully',
        data: {
          preview_count: personalizedMessages.length,
          recipients: personalizedMessages.map(m => ({
            customer_id: m.customer_id,
            nama: m.nama_pelanggan,
            no_layanan: m.no_layanan,
            phone: m.phone,
            message_preview: m.message.substring(0, 200) + '...'
          }))
        }
      });
    }

    // Actually send messages
    const results = {
      total: personalizedMessages.length,
      sent: 0,
      failed: 0,
      errors: []
    };

    logger.info(`Starting broadcast to ${personalizedMessages.length} customers`);

    for (const msg of personalizedMessages) {
      try {
        // Send via Omnichat
        const sendResult = await kilusiOmnichat.sendMessage(msg.phone, msg.message, {
          source: 'broadcast',
          saveToHistory: true,
          customer_id: msg.customer_id
        });

        if (sendResult.success) {
          results.sent++;
          logger.info(`✅ Sent to ${msg.phone} (${msg.nama_pelanggan})`);
        } else {
          results.failed++;
          results.errors.push({
            customer: msg.nama_pelanggan,
            phone: msg.phone,
            error: sendResult.error || 'Failed to send'
          });
          logger.error(`❌ Failed to send to ${msg.phone}: ${sendResult.error}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          customer: msg.nama_pelanggan,
          phone: msg.phone,
          error: error.message
        });
        logger.error(`❌ Error sending to ${msg.phone}:`, error);
      }

      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    res.json({
      success: true,
      message: `Broadcast completed: ${results.sent} sent, ${results.failed} failed`,
      data: {
        total: results.total,
        sent: results.sent,
        failed: results.failed,
        success_rate: results.total > 0 ? Math.round((results.sent / results.total) * 100) : 0,
        errors: results.errors.slice(0, 10) // First 10 errors
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error sending dynamic broadcast:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send broadcast',
      error: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/broadcasts/recipient-count
 * Get count of customers by recipient type
 */
router.get('/recipient-count', async (req, res) => {
  try {
    const { type = 'all_active', region_id } = req.query;

    let query = '';
    const params = [];
    let paramIndex = 1;

    if (type === 'all_active') {
      query = 'SELECT COUNT(*) as count FROM customers WHERE status = $1';
      params.push('active');
    } else if (type === 'region' && region_id) {
      query = 'SELECT COUNT(*) as count FROM customers WHERE area_id = $1 AND status = $2';
      params.push(region_id, 'active');
    } else if (type === 'overdue') {
      query = `
        SELECT COUNT(DISTINCT c.id) as count
        FROM customers c
        INNER JOIN invoices i ON c.id = i.customer_id
        WHERE c.status = 'active'
        AND i.status = 'unpaid'
        AND i.due_date < CURRENT_DATE
      `;
    } else if (type === 'expiring_soon') {
      query = `
        SELECT COUNT(*) as count
        FROM recurring_packages rp
        WHERE rp.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
      `;
    } else {
      query = "SELECT COUNT(*) as count FROM customers WHERE status = 'active'";
    }

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        type,
        count: parseInt(result.rows[0].count)
      }
    });
  } catch (error) {
    logger.error('Error fetching recipient count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recipient count',
      error: error.message
    });
  }
});

module.exports = router;
