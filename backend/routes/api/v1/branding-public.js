/**
 * Public Branding Routes (No authentication required)
 * For login pages to display logo/branding
 */

const express = require('express');
const router = express.Router();
const { getSetting } = require('../../../config/settingsManager');

/**
 * GET /api/v1/branding-public
 * Get branding settings without authentication (for login pages)
 */
router.get('/', async (req, res) => {
  try {
    let branding = getSetting('branding') || {
      siteTitle: 'Kilusi Bill',
      titleType: 'text',
      logoUrl: '',
      faviconUrl: '/favicon.ico'
    };
    
    // Parse if stored as JSON string
    if (typeof branding === 'string') {
      try {
        branding = JSON.parse(branding);
      } catch (e) {
        // Keep as default
      }
    }
    
    res.json({
      success: true,
      data: { branding }
    });
  } catch (error) {
    console.error('Error getting public branding:', error);
    res.json({
      success: true,
      data: {
        branding: {
          siteTitle: 'Kilusi Bill',
          titleType: 'text',
          logoUrl: '',
          faviconUrl: '/favicon.ico'
        }
      }
    });
  }
});

module.exports = router;
