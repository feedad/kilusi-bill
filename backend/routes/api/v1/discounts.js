const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const DiscountService = require('../../../services/discount-service');
const { query } = require('../../../config/database');

// GET /api/v1/discounts - Get all billing discounts with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || '';
    const targetType = req.query.target_type || '';

    const filters = {};
    if (status) filters.status = status;
    if (targetType) filters.targetType = targetType;

    const result = await DiscountService.getAllDiscounts(page, limit, filters);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting billing discounts:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/v1/discounts/:id - Get discount by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const discount = await DiscountService.getDiscountById(parseInt(id));

    if (!discount) {
      return res.status(404).json({
        success: false,
        error: 'Discount not found'
      });
    }

    res.json({
      success: true,
      data: discount
    });
  } catch (error) {
    logger.error('Error getting discount:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/v1/discounts - Create new billing discount
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      discountType,
      discountValue,
      targetType,
      targetIds,
      compensationReason,
      startDate,
      endDate,
      maxDiscountAmount,
      applyToExistingInvoices
    } = req.body;

    // Validate required fields
    if (!name || !discountType || !discountValue || !targetType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Validate discount type
    if (!['percentage', 'fixed'].includes(discountType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount type. Must be percentage or fixed'
      });
    }

    // Validate target type
    if (!['all', 'area', 'package', 'customer'].includes(targetType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid target type'
      });
    }

    // Validate target ids for specific target types
    if (targetType !== 'all' && (!targetIds || targetIds.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Target IDs required for specific target types'
      });
    }

    // Validate date range
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        error: 'Start date must be before end date'
      });
    }

    // Validate percentage
    if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
      return res.status(400).json({
        success: false,
        error: 'Percentage discount must be between 0 and 100'
      });
    }

    // Validate fixed amount
    if (discountType === 'fixed' && discountValue <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Fixed discount amount must be greater than 0'
      });
    }

    const discountData = {
      name,
      description,
      discountType,
      discountValue,
      targetType,
      targetIds,
      compensationReason,
      startDate,
      endDate,
      maxDiscountAmount,
      applyToExistingInvoices: applyToExistingInvoices || false,
      createdBy: req.user?.id || null
    };

    const discount = await DiscountService.createDiscount(discountData);

    res.status(201).json({
      success: true,
      data: discount,
      message: 'Billing discount created successfully'
    });
  } catch (error) {
    logger.error('Error creating billing discount:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// PUT /api/v1/discounts/:id - Update billing discount
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate date range if both dates are provided
    if (updateData.startDate && updateData.endDate) {
      if (new Date(updateData.startDate) > new Date(updateData.endDate)) {
        return res.status(400).json({
          success: false,
          error: 'Start date must be before end date'
        });
      }
    }

    // Validate percentage if provided
    if (updateData.discountValue && updateData.discountType === 'percentage') {
      if (updateData.discountValue <= 0 || updateData.discountValue > 100) {
        return res.status(400).json({
          success: false,
          error: 'Percentage discount must be between 0 and 100'
        });
      }
    }

    const discount = await DiscountService.updateDiscount(parseInt(id), updateData);

    res.json({
      success: true,
      data: discount,
      message: 'Billing discount updated successfully'
    });
  } catch (error) {
    logger.error('Error updating billing discount:', error);
    if (error.message === 'Discount not found') {
      return res.status(404).json({
        success: false,
        error: 'Discount not found'
      });
    }
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// DELETE /api/v1/discounts/:id - Delete billing discount
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await DiscountService.deleteDiscount(parseInt(id));

    res.json({
      success: true,
      message: 'Billing discount deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting billing discount:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/v1/discounts/:id/apply - Apply discount to existing invoices
router.post('/:id/apply', async (req, res) => {
  try {
    const { id } = req.params;
    const appliedCount = await DiscountService.applyDiscountToExistingInvoices(parseInt(id));

    res.json({
      success: true,
      data: {
        appliedCount
      },
      message: `Discount applied to ${appliedCount} existing invoices`
    });
  } catch (error) {
    logger.error('Error applying discount to existing invoices:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// GET /api/v1/discounts/:id/applications - Get discount applications
router.get('/:id/applications', async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await DiscountService.getDiscountApplications(parseInt(id), page, limit);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting discount applications:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/v1/discounts/customer/:customerId - Get applicable discounts for customer
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const invoiceAmount = req.query.invoice_amount ? parseFloat(req.query.invoice_amount) : null;

    const discounts = await DiscountService.getApplicableDiscounts(parseInt(customerId), invoiceAmount);

    res.json({
      success: true,
      data: discounts
    });
  } catch (error) {
    logger.error('Error getting applicable discounts:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/v1/discounts/stats - Get discount statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await DiscountService.getDiscountStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting discount statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/v1/discounts/targets - Get available target options
router.get('/targets/options', async (req, res) => {
  try {
    // Get areas (from customer addresses)
    const areasResult = await query(`
      SELECT DISTINCT
        CASE
          WHEN address LIKE '%Kecamatan%' THEN split_part(address, 'Kecamatan', 2)
          WHEN address LIKE '%Kelurahan%' THEN split_part(address, 'Kelurahan', 2)
          WHEN address LIKE '%Desa%' THEN split_part(address, 'Desa', 2)
          ELSE split_part(address, ',', 1)
        END as area
      FROM customers
      WHERE address IS NOT NULL AND address != ''
      ORDER BY area
      LIMIT 50
    `);

    // Get packages
    const packagesResult = await query(`
      SELECT id, name FROM packages WHERE is_active = true ORDER BY name
    `);

    // Get customers
    const customersResult = await query(`
      SELECT id, name, phone FROM customers WHERE status = 'active' ORDER BY name LIMIT 100
    `);

    res.json({
      success: true,
      data: {
        areas: areasResult.rows.map(row => row.area).filter(area => area && area.trim() !== ''),
        packages: packagesResult.rows,
        customers: customersResult.rows
      }
    });
  } catch (error) {
    logger.error('Error getting target options:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;