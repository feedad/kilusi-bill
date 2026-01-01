const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const { jwtAuth } = require('../../../middleware/jwtAuth');
const ReferralService = require('../../../services/referral-service');

// GET /api/v1/referrals/codes - Get all referral codes (admin)
router.get('/codes', jwtAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await ReferralService.getAllReferralCodes(page, limit);

    res.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    logger.error('Error getting referral codes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/v1/referrals/codes - Create referral code for customer
router.post('/codes', jwtAuth, async (req, res) => {
  try {
    const { customerId, maxUses, expiryDays } = req.body;

    if (!customerId) {
      return res.status(400).json({ success: false, message: 'Customer ID is required' });
    }

    const referralCode = await ReferralService.createReferralCode(customerId, {
      maxUses,
      expiryDays
    });

    res.json({
      success: true,
      data: referralCode,
      message: 'Referral code created successfully'
    });
  } catch (error) {
    logger.error('Error creating referral code:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/v1/referrals/my-code - Get customer's referral code
router.get('/my-code', jwtAuth, async (req, res) => {
  try {
    // Get customer ID from user context (assuming JWT contains customer info)
    const customerId = req.user.customerId || req.query.customerId;

    if (!customerId) {
      return res.status(400).json({ success: false, message: 'Customer ID is required' });
    }

    const referralCode = await ReferralService.getCustomerReferralCode(customerId);

    if (!referralCode) {
      // Auto-create referral code if none exists
      const newCode = await ReferralService.createReferralCode(customerId);
      return res.json({
        success: true,
        data: newCode,
        message: 'Referral code created'
      });
    }

    res.json({
      success: true,
      data: referralCode
    });
  } catch (error) {
    logger.error('Error getting customer referral code:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/v1/referrals/apply - Apply referral code
router.post('/apply', jwtAuth, async (req, res) => {
  try {
    const { code, customerId, benefitType } = req.body;

    if (!code || !customerId) {
      return res.status(400).json({
        success: false,
        message: 'Referral code and customer ID are required'
      });
    }

    const result = await ReferralService.applyReferral(code, customerId, benefitType);

    res.json({
      success: true,
      data: result,
      message: `Referral applied successfully! ${result.referrerName} will receive ${result.benefitType === 'cash' ? 'Rp ' + result.benefitAmount.toLocaleString() : 'discount'}`
    });
  } catch (error) {
    logger.error('Error applying referral:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/v1/referrals/validate/:code - Validate referral code
router.get('/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { customerId } = req.query;

    const validation = await ReferralService.validateReferralCode(code, customerId);

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    logger.error('Error validating referral code:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/v1/referrals/history - Get customer referral history
router.get('/history', jwtAuth, async (req, res) => {
  try {
    const customerId = req.user.customerId || req.query.customerId;

    if (!customerId) {
      return res.status(400).json({ success: false, message: 'Customer ID is required' });
    }

    const history = await ReferralService.getCustomerReferralHistory(customerId);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Error getting referral history:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/v1/referrals/marketing - Create marketing referral
router.post('/marketing', jwtAuth, async (req, res) => {
  try {
    const {
      marketerName,
      marketerPhone,
      marketerEmail,
      customerId,
      feeAmount
    } = req.body;

    if (!marketerName || !customerId) {
      return res.status(400).json({
        success: false,
        message: 'Marketer name and customer ID are required'
      });
    }

    const marketingReferral = await ReferralService.createMarketingReferral({
      marketerName,
      marketerPhone,
      marketerEmail,
      feeAmount
    }, customerId);

    res.json({
      success: true,
      data: marketingReferral,
      message: 'Marketing referral created successfully'
    });
  } catch (error) {
    logger.error('Error creating marketing referral:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/v1/referrals/marketing - Get marketing referrals
router.get('/marketing', jwtAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || '';
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let queryParams = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM marketing_referrals
      ${whereClause}
    `;

    const countResult = await query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Data query
    const dataQuery = `
      SELECT
        mr.*,
        c.name as customer_name,
        c.customer_id as customer_code
      FROM marketing_referrals mr
      LEFT JOIN customers c ON mr.customer_id = c.id
      ${whereClause}
      ORDER BY mr.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);

    const result = await query(dataQuery, queryParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error getting marketing referrals:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/v1/referrals/marketing/:id/pay - Mark marketing referral as paid
router.put('/marketing/:id/pay', jwtAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get marketing referral details
    const referralResult = await query(`
      SELECT * FROM marketing_referrals WHERE id = $1
    `, [id]);

    if (referralResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Marketing referral not found' });
    }

    const referral = referralResult.rows[0];

    // Process marketing fee payment with accounting integration
    await ReferralService.processMarketingFeePayment(
      referral.marketer_name,
      referral.fee_amount,
      referral.id
    );

    // Update status
    const result = await query(`
      UPDATE marketing_referrals
      SET status = 'paid', paid_date = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Marketing referral marked as paid and accounting transaction created'
    });
  } catch (error) {
    logger.error('Error marking marketing referral as paid:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/v1/referrals/stats - Get referral statistics
router.get('/stats', jwtAuth, async (req, res) => {
  try {
    const stats = await ReferralService.getReferralStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting referral stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/v1/referrals/settings - Get referral settings
router.get('/settings', jwtAuth, async (req, res) => {
  try {
    const settings = await ReferralService.getReferralSettings();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Error getting referral settings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/v1/referrals/settings - Update referral settings
router.put('/settings', jwtAuth, async (req, res) => {
  try {
    const settings = req.body;

    await ReferralService.updateReferralSettings(settings);

    res.json({
      success: true,
      message: 'Referral settings updated successfully'
    });
  } catch (error) {
    logger.error('Error updating referral settings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/v1/referrals/apply-benefits - Apply referral benefits to billing (internal)
router.post('/apply-benefits', async (req, res) => {
  try {
    const { customerId, billingAmount } = req.body;

    if (!customerId || !billingAmount) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID and billing amount are required'
      });
    }

    const totalDiscount = await ReferralService.applyReferralBenefits(
      customerId,
      billingAmount
    );

    res.json({
      success: true,
      data: { totalDiscount },
      message: `Applied Rp ${totalDiscount.toLocaleString()} in referral benefits`
    });
  } catch (error) {
    logger.error('Error applying referral benefits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/v1/referrals/accounting-summary - Get referral accounting summary
router.get('/accounting-summary', jwtAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const summary = await ReferralService.getReferralAccountingSummary(
      startDate || null,
      endDate || null
    );

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error getting referral accounting summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/v1/referrals/process-cash-payout - Process cash payout to referrer
router.post('/process-cash-payout', jwtAuth, async (req, res) => {
  try {
    const { referrerId, amount, transactionId } = req.body;

    if (!referrerId || !amount || !transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Referrer ID, amount, and transaction ID are required'
      });
    }

    const success = await ReferralService.processReferralCashPayout(
      referrerId,
      amount,
      transactionId
    );

    if (success) {
      res.json({
        success: true,
        message: 'Cash payout processed and accounting transaction created'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to process cash payout'
      });
    }
  } catch (error) {
    logger.error('Error processing cash payout:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/v1/referrals/fixed-marketing-code - Create fixed marketing referral code
router.post('/fixed-marketing-code', jwtAuth, async (req, res) => {
  try {
    const { code, marketerName, maxUses, expiryDays } = req.body;

    if (!code || !marketerName) {
      return res.status(400).json({
        success: false,
        message: 'Code and marketer name are required'
      });
    }

    const result = await ReferralService.createFixedMarketingCode(
      code,
      marketerName,
      maxUses || 1000,
      expiryDays || 365
    );

    res.json({
      success: true,
      data: result,
      message: `Fixed marketing code '${code}' created successfully`
    });
  } catch (error) {
    logger.error('Error creating fixed marketing code:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/v1/referrals/fixed-marketing-codes - Get all fixed marketing codes
router.get('/fixed-marketing-codes', jwtAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT rc.*, mr.marketer_name, mr.marketer_phone, mr.marketer_email
      FROM referral_codes rc
      LEFT JOIN marketing_referrals mr ON rc.code = mr.referral_code
      WHERE rc.customer_id IS NULL
      ORDER BY rc.created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Error getting fixed marketing codes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/v1/referrals/fixed-marketing-code/:code - Deactivate fixed marketing code
router.delete('/fixed-marketing-code/:code', jwtAuth, async (req, res) => {
  try {
    const { code } = req.params;

    const result = await query(`
      UPDATE referral_codes
      SET is_active = false
      WHERE code = $1 AND customer_id IS NULL
      RETURNING *
    `, [code]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Fixed marketing code not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: `Fixed marketing code '${code}' deactivated`
    });
  } catch (error) {
    logger.error('Error deactivating fixed marketing code:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;