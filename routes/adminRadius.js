const express = require('express');
const router = express.Router();
const { logger } = require('../config/logger');
const radiusServer = require('../config/radius-server');
const radiusDb = require('../config/radius-postgres');
const radiusSync = require('../config/radius-sync');
const { adminAuth } = require('./adminAuth');

// Apply admin authentication to all routes
router.use(adminAuth);

/**
 * GET /admin/radius
 * Render halaman RADIUS management
 */
router.get('/', async (req, res) => {
  try {
    const settingsData = require('../settings.json');
    res.render('admin-radius', {
      page: 'radius',
      user: req.session.user,
      settings: settingsData
    });
  } catch (error) {
    logger.error(`Error rendering RADIUS page: ${error.message}`);
    res.status(500).send('Error loading RADIUS management page');
  }
});

/**
 * GET /admin/radius/status
 * Mendapatkan status RADIUS server
 */
router.get('/status', async (req, res) => {
  try {
    const serverStatus = radiusServer.getServerStatus();
    const syncStatus = await radiusSync.getSyncStatus();
    const activeSessions = await radiusDb.getActiveSessions();
    
    // Add backward compatibility aliases
    const enhancedSyncStatus = {
      ...syncStatus,
      total: syncStatus.activeCustomers || 0,
      synced: syncStatus.inSync || 0,
      pending: syncStatus.notInRadius ? syncStatus.notInRadius.length : 0,
      lastSync: new Date().toISOString()
    };
    
    res.json({
      success: true,
      server: serverStatus,
      sync: enhancedSyncStatus,
      activeSessions: activeSessions.length,
      sessions: activeSessions.slice(0, 10) // Limit to 10 recent sessions
    });
  } catch (error) {
    logger.error(`Error getting RADIUS status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/radius/start
 * Memulai RADIUS server
 */
router.post('/start', async (req, res) => {
  try {
    await radiusServer.startRadiusServer();
    
    res.json({
      success: true,
      message: 'RADIUS server started successfully'
    });
  } catch (error) {
    logger.error(`Error starting RADIUS server: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/radius/stop
 * Menghentikan RADIUS server
 */
router.post('/stop', async (req, res) => {
  try {
    await radiusServer.stopRadiusServer();
    
    res.json({
      success: true,
      message: 'RADIUS server stopped successfully'
    });
  } catch (error) {
    logger.error(`Error stopping RADIUS server: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/radius/restart
 * Restart RADIUS server
 */
router.post('/restart', async (req, res) => {
  try {
    await radiusServer.stopRadiusServer();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    await radiusServer.startRadiusServer();
    
    res.json({
      success: true,
      message: 'RADIUS server restarted successfully'
    });
  } catch (error) {
    logger.error(`Error restarting RADIUS server: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/radius/sync
 * Sinkronisasi semua customer ke RADIUS
 */
router.post('/sync', async (req, res) => {
  try {
    const result = await radiusSync.syncCustomersToRadius();
    
    res.json({
      success: true,
      message: 'Customer sync completed',
      result: result
    });
  } catch (error) {
    logger.error(`Error syncing customers: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/radius/sync-packages
 * Sinkronisasi semua packages ke RADIUS groups
 */
router.post('/sync-packages', async (req, res) => {
  try {
    const result = await radiusSync.syncPackagesToRadius();
    
    res.json({
      success: true,
      message: 'Packages sync completed',
      result: result
    });
  } catch (error) {
    logger.error(`Error syncing packages: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/radius/users-page
 * Render halaman PPPoE Users (RADIUS mode)
 */
router.get('/users-page', async (req, res) => {
  try {
    const settingsData = require('../settings.json');
    res.render('admin-radius-users', {
      page: 'radius-users',
      user: req.session.user,
      settings: settingsData
    });
  } catch (error) {
    logger.error(`Error rendering RADIUS users page: ${error.message}`);
    res.status(500).send('Error loading RADIUS users page');
  }
});

/**
 * GET /admin/radius/users
 * Mendapatkan daftar semua user RADIUS (API)
 */
router.get('/users', async (req, res) => {
  try {
    const users = await radiusDb.getAllRadiusUsers();
    
    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    logger.error(`Error getting RADIUS users: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/radius/sessions
 * Mendapatkan daftar active sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await radiusDb.getActiveSessions();
    
    res.json({
      success: true,
      sessions: sessions
    });
  } catch (error) {
    logger.error(`Error getting active sessions: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /admin/radius/user/:username
 * Menghapus user dari RADIUS
 */
router.delete('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const success = await radiusSync.removeCustomerFromRadius(username);
    
    if (success) {
      res.json({
        success: true,
        message: `User ${username} removed from RADIUS`
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to remove user'
      });
    }
  } catch (error) {
    logger.error(`Error removing RADIUS user: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/radius/user/:username/sync
 * Sinkronisasi single customer ke RADIUS
 */
router.post('/user/:username/sync', async (req, res) => {
  try {
    const { username } = req.params;
    const billing = require('../config/billing');
    const customers = await billing.getAllCustomers();
    const customer = customers.find(c => c.username === username);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }
    
    const success = await radiusSync.syncCustomerToRadius(customer);
    
    if (success) {
      res.json({
        success: true,
        message: `Customer ${username} synced to RADIUS`
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to sync customer'
      });
    }
  } catch (error) {
    logger.error(`Error syncing customer: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/radius/reload-nas
 * Reload NAS clients configuration
 */
router.post('/reload-nas', async (req, res) => {
  try {
    await radiusServer.reloadNasClients();
    
    res.json({
      success: true,
      message: 'NAS clients reloaded successfully'
    });
  } catch (error) {
    logger.error(`Error reloading NAS clients: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/radius/nas-clients
 * Get all NAS clients
 */
router.get('/nas-clients', async (req, res) => {
  try {
    const radiusDb = require('../config/radius-postgres');
    const nasClients = await radiusDb.getAllNasClients();
    
    res.json({
      success: true,
      nasClients: nasClients
    });
  } catch (error) {
    logger.error(`Error getting NAS clients: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/radius/nas-clients
 * Add new NAS client
 */
router.post('/nas-clients', async (req, res) => {
  try {
    const { nasname, shortname, secret, type, description } = req.body;
    
    if (!nasname || !shortname || !secret) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: nasname, shortname, secret'
      });
    }
    
    const radiusDb = require('../config/radius-postgres');
    const success = await radiusDb.addNasClient(
      nasname,
      shortname,
      secret,
      type || 'other',
      description || ''
    );
    
    if (success) {
      // Reload NAS clients in server
      await radiusServer.reloadNasClients();
      
      res.json({
        success: true,
        message: 'NAS client added successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to add NAS client'
      });
    }
  } catch (error) {
    logger.error(`Error adding NAS client: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /admin/radius/nas-clients/:id
 * Update NAS client
 */
router.put('/nas-clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nasname, shortname, secret, type, description } = req.body;
    
    if (!nasname || !shortname || !secret) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: nasname, shortname, secret'
      });
    }
    
    const radiusDb = require('../config/radius-postgres');
    const success = await radiusDb.updateNasClient(
      parseInt(id),
      nasname,
      shortname,
      secret,
      type || 'other',
      description || ''
    );
    
    if (success) {
      // Reload NAS clients in server
      await radiusServer.reloadNasClients();
      
      res.json({
        success: true,
        message: 'NAS client updated successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update NAS client'
      });
    }
  } catch (error) {
    logger.error(`Error updating NAS client: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /admin/radius/nas-clients/:id
 * Delete NAS client
 */
router.delete('/nas-clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`📥 DELETE request for NAS client ID: ${id}`);
    
    const radiusDb = require('../config/radius-postgres');
    
    // Check if this is the last NAS client (warning only, allow delete if user wants)
    const allClients = await radiusDb.getAllNasClients();
    logger.info(`📊 Current NAS clients count: ${allClients.length}`);
    
    if (allClients.length <= 1) {
      logger.warn(`⚠️  Deleting last NAS client (ID: ${id}). RADIUS server may not accept connections without NAS clients.`);
      // Allow delete but log warning - user might want to add a new one first
    }
    
    logger.info(`🗑️  Attempting to delete NAS client ID: ${id}`);
    const success = await radiusDb.deleteNasClient(parseInt(id));
    logger.info(`Delete result: ${success ? 'SUCCESS' : 'FAILED'}`);
    
    if (success) {
      // Reload NAS clients in server
      await radiusServer.reloadNasClients();
      
      const message = allClients.length <= 1 
        ? 'NAS client deleted. Warning: No NAS clients remaining. Add at least one NAS client for RADIUS to function.'
        : 'NAS client deleted successfully';
      
      logger.info(`✅ ${message}`);
      
      res.json({
        success: true,
        message: message
      });
    } else {
      logger.error(`❌ Failed to delete NAS client ID: ${id}`);
      res.status(500).json({
        success: false,
        error: 'Failed to delete NAS client'
      });
    }
  } catch (error) {
    logger.error(`❌ Error deleting NAS client: ${error.message}`);
    logger.error(error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/radius/sync-status
 * Mendapatkan status sinkronisasi
 */
router.get('/sync-status', async (req, res) => {
  try {
    const syncStatus = await radiusSync.getSyncStatus();
    
    res.json({
      success: true,
      status: syncStatus
    });
  } catch (error) {
    logger.error(`Error getting sync status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
