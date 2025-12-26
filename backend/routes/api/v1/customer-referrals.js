const express = require('express');
const router = express.Router();
const ReferralService = require('../../../services/referral-service');

// Middleware to verify customer token
const verifyCustomerToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak ditemukan'
      });
    }

    // Use the database from config
    const { getPool } = require('../../../config/database');
    const pool = getPool();

    // JWT token validation
    try {
      const jwt = require('jsonwebtoken');
      const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'your-customer-jwt-secret-key-change-in-production';
      const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);

      if (decoded.type === 'customer' && decoded.customerId) {
        // Get customer by ID
        const query = `
          SELECT c.*
          FROM customers c
          WHERE c.id = $1 AND c.status = 'active'
        `;
        const result = await pool.query(query, [decoded.customerId]);

        if (result.rows.length > 0) {
          req.customer = result.rows[0];
          return next();
        } else {
          return res.status(401).json({
            success: false,
            message: 'Customer tidak ditemukan'
          });
        }
      } else {
        return res.status(401).json({
          success: false,
          message: 'Token tidak valid'
        });
      }
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak valid atau kadaluarsa'
      });
    }
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifikasi token'
    });
  }
};

// GET /api/v1/customer-referrals/my-code - Get customer's referral code
router.get('/my-code', verifyCustomerToken, async (req, res) => {
  try {
    const customerId = req.customer.id;

    // Try to get existing referral code
    let referralCode = await ReferralService.getCustomerReferralCode(customerId);

    // If no code exists, create one
    if (!referralCode) {
      referralCode = await ReferralService.createReferralCode(customerId);
    }

    res.json({
      success: true,
      data: referralCode,
      message: referralCode ? 'Kode referral ditemukan' : 'Kode referral dibuat'
    });
  } catch (error) {
    console.error('Error getting customer referral code:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Terjadi kesalahan saat mengambil kode referral'
    });
  }
});

// GET /api/v1/customer-referrals/history - Get customer referral history
router.get('/history', verifyCustomerToken, async (req, res) => {
  try {
    const customerId = req.customer.id;
    const history = await ReferralService.getCustomerReferralHistory(customerId);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error getting customer referral history:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Terjadi kesalahan saat mengambil riwayat referral'
    });
  }
});

// POST /api/v1/customer-referrals/validate - Validate referral code (for registration)
router.post('/validate', async (req, res) => {
  try {
    const { code, newCustomerId } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Kode referral diperlukan'
      });
    }

    const validation = await ReferralService.validateReferralCode(code, newCustomerId);

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('Error validating referral code:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Terjadi kesalahan saat validasi kode referral'
    });
  }
});

// POST /api/v1/customer-referrals/apply - Apply referral code (for registration)
router.post('/apply', async (req, res) => {
  try {
    const { code, customerId, benefitType } = req.body;

    if (!code || !customerId) {
      return res.status(400).json({
        success: false,
        message: 'Kode referral dan customer ID diperlukan'
      });
    }

    const result = await ReferralService.applyReferral(code, customerId, benefitType);

    res.json({
      success: true,
      data: result,
      message: `Referral berhasil diterapkan! ${result.referrerName} akan mendapatkan ${result.benefitType === 'cash' ? 'Rp ' + result.benefitAmount.toLocaleString('id-ID') : 'diskon'}`
    });
  } catch (error) {
    console.error('Error applying referral:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Terjadi kesalahan saat menerapkan referral'
    });
  }
});

// GET /api/v1/customer-referrals/stats - Get referral statistics
router.get('/stats', verifyCustomerToken, async (req, res) => {
  try {
    const customerId = req.customer.id;
    const history = await ReferralService.getCustomerReferralHistory(customerId);

    // Calculate customer-specific stats
    const totalReferrals = history.filter(t => t.referrer_id === customerId).length;
    const successfulReferrals = history.filter(t =>
      t.referrer_id === customerId && t.status === 'applied'
    ).length;
    const totalEarnings = history
      .filter(t => t.referrer_id === customerId && t.status === 'applied')
      .reduce((sum, t) => sum + t.benefit_amount, 0);

    res.json({
      success: true,
      data: {
        totalReferrals,
        successfulReferrals,
        totalEarnings,
        pendingReferrals: totalReferrals - successfulReferrals
      }
    });
  } catch (error) {
    console.error('Error getting referral stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Terjadi kesalahan saat mengambil statistik referral'
    });
  }
});

module.exports = router;