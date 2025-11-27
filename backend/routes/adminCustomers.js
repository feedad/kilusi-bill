const express = require('express');
const router = express.Router();
const billing = require('../config/billing');
const { getSettingsWithCache } = require('../config/settingsManager');
const { logger } = require('../config/logger');
const { adminAuth } = require('./adminAuth');
const { getAll } = require('../config/database');

// Database query helper - now uses PostgreSQL
async function dbAll(sql, params = []) {
  try {
    return await getAll(sql, params);
  } catch (error) {
    logger.error('Database query error:', error);
    throw error;
  }
}

// GET: Halaman Customers
router.get('/', adminAuth, async (req, res) => {
  try {
    const packages = await billing.getAllPackages();
    const settings = getSettingsWithCache();
    
    // Get NAS servers
    let nasServers = [];
    try {
      nasServers = await dbAll('SELECT * FROM nas_servers WHERE is_active = true ORDER BY id');
    } catch (err) {
      logger.warn(`Could not fetch NAS servers: ${err.message}`);
    }
    
    // Get Mikrotik servers
    let mikrotikServers = [];
    try {
      mikrotikServers = await dbAll('SELECT * FROM mikrotik_servers WHERE is_active = true ORDER BY id');
    } catch (err) {
      logger.warn(`Could not fetch Mikrotik servers: ${err.message}`);
    }
    
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

    res.render('admin-customers', {
      title: 'Customer Management',
      packages,
      pppoeProfiles,
      nasServers,
      mikrotikServers,
      settings,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    logger.error(`Error loading customers page: ${error.message}`);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
