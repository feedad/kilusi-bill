const express = require('express');
const router = express.Router();
const { adminAuth } = require('./adminAuth');
const oltMonitor = require('../config/olt-snmp-monitor');
const { getSetting, getSettingsWithCache } = require('../config/settingsManager');
const { logger } = require('../config/logger');
const fs = require('fs');
const path = require('path');

/**
 * GET /admin/olt - OLT Monitoring Dashboard
 */
router.get('/olt', adminAuth, async (req, res) => {
  try {
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    res.render('admin-olt', {
      page: 'olt',
      title: 'OLT Monitoring',
      settings,
      oltDevices,
      user: req.session.user
    });
  } catch (error) {
    logger.error('Error loading OLT monitoring page:', error);
    res.status(500).send('Error loading OLT monitoring page');
  }
});

/**
 * GET /admin/olt/devices - Get list of configured OLT devices
 */
router.get('/olt/devices', adminAuth, async (req, res) => {
  try {
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    res.json({
      success: true,
      devices: oltDevices.map((dev, idx) => ({
        id: idx,
        name: dev.name,
        host: dev.host,
        vendor: dev.vendor,
        location: dev.location || 'N/A'
      }))
    });
  } catch (error) {
    logger.error('Error getting OLT devices:', error);
    res.json({
      success: false,
      message: error.message,
      devices: []
    });
  }
});

/**
 * GET /admin/olt/:id/info - Get OLT device info
 */
router.get('/olt/:id/info', adminAuth, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    if (deviceId >= oltDevices.length) {
      return res.json({
        success: false,
        message: 'OLT device not found'
      });
    }
    
    const device = oltDevices[deviceId];
    const info = await oltMonitor.getOLTDeviceInfo({
      host: device.host,
      community: device.community || 'public',
      version: device.snmp_version || '2c',
      port: device.snmp_port || 161
    });
    
    if (info.success) {
      res.json({
        success: true,
        device: {
          id: deviceId,
          name: device.name,
          host: device.host,
          vendor: device.vendor,
          location: device.location,
          ...info
        }
      });
    } else {
      res.json(info);
    }
  } catch (error) {
    logger.error('Error getting OLT info:', error);
    res.json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /admin/olt/:id/ports - Get PON ports status
 */
router.get('/olt/:id/ports', adminAuth, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    if (deviceId >= oltDevices.length) {
      return res.json({
        success: false,
        message: 'OLT device not found',
        ports: []
      });
    }
    
    const device = oltDevices[deviceId];
    const ports = await oltMonitor.getPONPorts({
      host: device.host,
      community: device.community || 'public',
      version: device.snmp_version || '2c',
      port: device.snmp_port || 161
    });
    
    res.json(ports);
  } catch (error) {
    logger.error('Error getting PON ports:', error);
    res.json({
      success: false,
      message: error.message,
      ports: []
    });
  }
});

/**
 * GET /admin/olt/:id/port/:portIndex/traffic - Get PON port traffic
 */
router.get('/olt/:id/port/:portIndex/traffic', adminAuth, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    const portIndex = parseInt(req.params.portIndex);
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    if (deviceId >= oltDevices.length) {
      return res.json({
        success: false,
        message: 'OLT device not found'
      });
    }
    
    const device = oltDevices[deviceId];
    const traffic = await oltMonitor.getPONPortTraffic({
      host: device.host,
      community: device.community || 'public',
      version: device.snmp_version || '2c',
      port: device.snmp_port || 161
    }, portIndex);
    
    res.json(traffic);
  } catch (error) {
    logger.error('Error getting PON port traffic:', error);
    res.json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /admin/olt/:id/port/:portIndex/onus - Get ONUs on PON port
 */
router.get('/olt/:id/port/:portIndex/onus', adminAuth, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    const portIndex = parseInt(req.params.portIndex);
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    if (deviceId >= oltDevices.length) {
      return res.json({
        success: false,
        message: 'OLT device not found',
        onus: []
      });
    }
    
    const device = oltDevices[deviceId];
    const onus = await oltMonitor.getONUsOnPort({
      host: device.host,
      community: device.community || 'public',
      version: device.snmp_version || '2c',
      port: device.snmp_port || 161,
      vendor: device.vendor || 'generic'
    }, portIndex);
    
    res.json(onus);
  } catch (error) {
    logger.error('Error getting ONUs on port:', error);
    res.json({
      success: false,
      message: error.message,
      onus: []
    });
  }
});

/**
 * GET /admin/olt/:id/statistics - Get complete OLT statistics
 */
router.get('/olt/:id/statistics', adminAuth, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    if (deviceId >= oltDevices.length) {
      return res.json({
        success: false,
        message: 'OLT device not found'
      });
    }
    
    const device = oltDevices[deviceId];
    const stats = await oltMonitor.getOLTStatistics({
      host: device.host,
      community: device.community || 'public',
      version: device.snmp_version || '2c',
      port: device.snmp_port || 161,
      vendor: device.vendor || 'generic'
    });
    
    if (stats.success) {
      res.json({
        success: true,
        deviceId,
        deviceName: device.name,
        ...stats
      });
    } else {
      res.json(stats);
    }
  } catch (error) {
    logger.error('Error getting OLT statistics:', error);
    res.json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /admin/olt/device/add - Add new OLT device
 */
router.post('/olt/device/add', adminAuth, async (req, res) => {
  try {
    const { name, host, vendor, community, snmp_version, snmp_port, location, latitude, longitude } = req.body;
    
    if (!name || !host || !vendor) {
      return res.json({
        success: false,
        message: 'Name, host, and vendor are required'
      });
    }
    
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    oltDevices.push({
      name,
      host,
      vendor,
      community: community || 'public',
      snmp_version: snmp_version || '2c',
      snmp_port: snmp_port || '161',
      location: location || '',
      latitude: latitude || '',
      longitude: longitude || ''
    });
    
    // Save to settings.json
    settings.olt_devices = oltDevices;
    const settingsPath = path.join(process.cwd(), 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    
    logger.info(`New OLT device added: ${name} (${host})`);
    
    res.json({
      success: true,
      message: 'OLT device added successfully',
      deviceId: oltDevices.length - 1
    });
  } catch (error) {
    logger.error('Error adding OLT device:', error);
    res.json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /admin/olt/device/:id/update - Update OLT device
 */
router.post('/olt/device/:id/update', adminAuth, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    const { name, host, vendor, community, snmp_version, snmp_port, location, latitude, longitude } = req.body;
    
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    if (deviceId >= oltDevices.length) {
      return res.json({
        success: false,
        message: 'OLT device not found'
      });
    }
    
    oltDevices[deviceId] = {
      ...oltDevices[deviceId],
      name: name || oltDevices[deviceId].name,
      host: host || oltDevices[deviceId].host,
      vendor: vendor || oltDevices[deviceId].vendor,
      community: community || oltDevices[deviceId].community,
      snmp_version: snmp_version || oltDevices[deviceId].snmp_version,
      snmp_port: snmp_port || oltDevices[deviceId].snmp_port,
      location: location || oltDevices[deviceId].location,
      latitude: latitude || oltDevices[deviceId].latitude,
      longitude: longitude || oltDevices[deviceId].longitude
    };
    
    // Save to settings.json
    settings.olt_devices = oltDevices;
    const settingsPath = path.join(process.cwd(), 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    
    logger.info(`OLT device updated: ${name} (${host})`);
    
    res.json({
      success: true,
      message: 'OLT device updated successfully'
    });
  } catch (error) {
    logger.error('Error updating OLT device:', error);
    res.json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /admin/olt/device/:id/delete - Delete OLT device
 */
router.post('/olt/device/:id/delete', adminAuth, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    if (deviceId >= oltDevices.length) {
      return res.json({
        success: false,
        message: 'OLT device not found'
      });
    }
    
    const deletedDevice = oltDevices.splice(deviceId, 1)[0];
    
    // Save to settings.json
    settings.olt_devices = oltDevices;
    const settingsPath = path.join(process.cwd(), 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    
    logger.info(`OLT device deleted: ${deletedDevice.name} (${deletedDevice.host})`);
    
    res.json({
      success: true,
      message: 'OLT device deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting OLT device:', error);
    res.json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/map/olt-devices - Get OLT devices for network map
 */
router.get('/map/olt-devices', adminAuth, async (req, res) => {
  try {
    const settings = getSettingsWithCache();
    const oltDevices = settings.olt_devices || [];
    
    const mapDevices = [];
    
    for (let i = 0; i < oltDevices.length; i++) {
      const device = oltDevices[i];
      
      // Skip devices without coordinates
      if (!device.latitude || !device.longitude) continue;
      
      // Get device statistics
      const stats = await oltMonitor.getOLTStatistics({
        host: device.host,
        community: device.community || 'public',
        version: device.snmp_version || '2c',
        port: device.snmp_port || 161
      }).catch(err => {
        logger.warn(`Failed to get stats for OLT ${device.name}: ${err.message}`);
        return { success: false };
      });
      
      mapDevices.push({
        id: i,
        type: 'olt',
        name: device.name,
        host: device.host,
        vendor: device.vendor,
        location: {
          lat: parseFloat(device.latitude),
          lng: parseFloat(device.longitude),
          address: device.location || 'N/A'
        },
        status: stats.success ? {
          online: true,
          uptime: stats.device?.uptime || 'N/A',
          totalPorts: stats.totalPorts || 0,
          activePorts: stats.activePorts || 0
        } : {
          online: false,
          uptime: 'N/A',
          totalPorts: 0,
          activePorts: 0
        }
      });
    }
    
    res.json({
      success: true,
      devices: mapDevices,
      total: mapDevices.length
    });
  } catch (error) {
    logger.error('Error getting OLT devices for map:', error);
    res.json({
      success: false,
      devices: [],
      message: error.message
    });
  }
});

module.exports = router;
