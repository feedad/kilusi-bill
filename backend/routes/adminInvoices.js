const express = require('express');
const router = express.Router();
const billing = require('../config/billing');
const { getSettingsWithCache } = require('../config/settingsManager');
const { logger } = require('../config/logger');
const { adminAuth } = require('./adminAuth');

// GET: Halaman Invoices - default redirect to unpaid
router.get('/', adminAuth, (req, res) => {
  res.redirect('/admin/invoices/unpaid');
});

// GET: Halaman Unpaid Invoices
router.get('/unpaid', adminAuth, async (req, res) => {
  try {
    const settings = getSettingsWithCache();
    
    res.render('admin-invoices-unpaid', {
      title: 'Unpaid Invoices',
      page: 'invoices-unpaid',
      settings,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    logger.error(`Error loading unpaid invoices page: ${error.message}`);
    res.status(500).send('Internal Server Error');
  }
});

// GET: Halaman Paid Invoices
router.get('/paid', adminAuth, async (req, res) => {
  try {
    const settings = getSettingsWithCache();
    
    res.render('admin-invoices-paid', {
      title: 'Paid Invoices',
      page: 'invoices-paid',
      settings,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    logger.error(`Error loading paid invoices page: ${error.message}`);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
