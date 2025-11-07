const express = require('express');
const router = express.Router();
const billing = require('../config/billing');
const { getSettingsWithCache } = require('../config/settingsManager');
const { logger } = require('../config/logger');
const { adminAuth } = require('./adminAuth');

// GET: Halaman Payments
router.get('/', adminAuth, async (req, res) => {
  try {
    const invoices = await billing.getAllInvoices();
    const customers = await billing.getAllCustomers();
    const settings = getSettingsWithCache();
    
    // Filter hanya invoice yang sudah dibayar
    const paidInvoices = invoices.filter(inv => inv.status === 'paid');
    
    // Merge customer data
    const paymentsWithCustomer = paidInvoices.map(inv => {
      const customer = customers.find(c => c.phone === inv.customer_phone);
      return {
        ...inv,
        customerName: customer ? customer.name : 'Unknown',
        customerPhone: inv.customer_phone,
        customerAddress: customer ? customer.address : '-'
      };
    });
    
    // Sort by payment date (newest first)
    paymentsWithCustomer.sort((a, b) => {
      const dateA = new Date(a.paid_at || a.created_at);
      const dateB = new Date(b.paid_at || b.created_at);
      return dateB - dateA;
    });

    res.render('admin-payments', {
      title: 'Payment History',
      payments: paymentsWithCustomer,
      settings,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    logger.error(`Error loading payments page: ${error.message}`);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
