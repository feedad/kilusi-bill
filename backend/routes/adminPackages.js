const express = require('express');
const router = express.Router();
const billing = require('../config/billing');
const { getSettingsWithCache } = require('../config/settingsManager');
const { logger } = require('../config/logger');
const { adminAuth } = require('./adminAuth');

// GET: Halaman Packages
router.get('/', adminAuth, async (req, res) => {
  try {
    const packages = await billing.getAllPackages();
    const settings = getSettingsWithCache();
    
    // Get PPPoE profiles from Mikrotik
    const { getPPPoEProfiles } = require('../config/mikrotik');
    let pppoeProfiles = [];
    try {
      const profilesResult = await getPPPoEProfiles();
      if (profilesResult.success) {
        pppoeProfiles = profilesResult.data.map(profile => ({
          name: profile.name,
          rateLimit: profile['rate-limit'] || 'Unlimited',
          localAddress: profile['local-address'] || '',
          remoteAddress: profile['remote-address'] || ''
        }));
      }
    } catch (profileError) {
      logger.warn(`Could not fetch PPPoE profiles: ${profileError.message}`);
    }

    res.render('admin-packages', {
      title: 'Package Management',
      packages,
      pppoeProfiles,
      settings,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    logger.error(`Error loading packages page: ${error.message}`);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
