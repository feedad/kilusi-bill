const express = require('express');
const router = express.Router();
const { logger } = require('../config/logger');
const radiusDb = require('../config/radius-postgres');
const radiusDisconnect = require('../config/radius-disconnect');
const { adminAuth } = require('./adminAuth');

// Apply admin authentication to all routes
router.use(adminAuth);

/**
 * GET /admin/pelanggan-online
 * Render halaman Pelanggan Online (Active Sessions)
 */
router.get('/', async (req, res) => {
  try {
    const settingsData = require('../settings.json');
    res.render('admin-pelanggan-online', {
      page: 'pelanggan-online',
      user: req.session.user,
      settings: settingsData
    });
  } catch (error) {
    logger.error(`Error rendering Pelanggan Online page: ${error.message}`);
    res.status(500).send('Error loading Pelanggan Online page');
  }
});

/**
 * GET /admin/pelanggan-online/sessions
 * Mendapatkan data active sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const activeSessions = await radiusDb.getActiveSessions();

    // Format sessions data to match the view expectations
    let formattedSessions = activeSessions.map(session => ({
      ...session,
      name: session.name || session.username, // Add name field for display
      acctSessionId: session.acctsessionid || session.acctSessionId,
      framedIpAddress: session.framedipaddress || session.framedIpAddress,
      nasIpAddress: session.nasipaddress || session.nasIpAddress,
      nasShortName: session.shortname || session.nasShortName || `NAS-${session.nasipaddress || session.nasIpAddress}`,
      acctStartTime: session.acctstarttime || session.acctStartTime,
      acctSessionTime: session.acctsessiontime || session.acctSessionTime,
      acctInputOctets: session.acctinputoctets || session.acctInputOctets,
      acctOutputOctets: session.acctoutputoctets || session.acctOutputOctets
    }));

    // If no real sessions, add simulation data for testing
    if (formattedSessions.length === 0) {
      logger.info('🎭 No real RADIUS sessions found, generating simulation data for testing');
      formattedSessions = generateSimulationData();
      logger.info(`🎭 Generated ${formattedSessions.length} mock sessions for testing`);
    }

    res.json({
      success: true,
      sessions: formattedSessions,
      total: formattedSessions.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error getting active sessions: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error getting active sessions',
      error: error.message
    });
  }
});

/**
 * Generate simulation data for testing kick functionality
 */
function generateSimulationData() {
  const mockUsers = [
    { username: '00001', name: 'Ahmad Rizki', ip: '192.168.1.101', nas: '192.168.1.1', nasName: 'Mikrotik-Office' },
    { username: '00002', name: 'Siti Nurhaliza', ip: '192.168.1.102', nas: '192.168.1.1', nasName: 'Mikrotik-Office' },
    { username: '00003', name: 'Budi Santoso', ip: '192.168.1.103', nas: '192.168.1.2', nasName: 'Mikrotik-Branch1' },
    { username: '00004', name: 'Dewi Lestari', ip: '192.168.1.104', nas: '192.168.1.1', nasName: 'Mikrotik-Office' },
    { username: '00005', name: 'Eko Prasetyo', ip: '192.168.1.105', nas: '192.168.1.3', nasName: 'Mikrotik-Branch2' },
    { username: '00006', name: 'Fitri Handayani', ip: '192.168.1.106', nas: '192.168.1.2', nasName: 'Mikrotik-Branch1' },
    { username: '00007', name: 'Gunawan Wijaya', ip: '192.168.1.107', nas: '192.168.1.1', nasName: 'Mikrotik-Office' },
    { username: '00008', name: 'Hartono Susilo', ip: '192.168.1.108', nas: '192.168.1.3', nasName: 'Mikrotik-Branch2' }
  ];

  const now = new Date();

  return mockUsers.map((user, index) => {
    const startTime = new Date(now.getTime() - (Math.random() * 3600000 + 1800000)); // Random time between 30 min to 2 hours ago
    const sessionTime = Math.floor((now.getTime() - startTime.getTime()) / 1000); // seconds
    const downloadBytes = Math.floor(Math.random() * 5000000000); // Up to 5GB
    const uploadBytes = Math.floor(Math.random() * 1000000000); // Up to 1GB

    // Generate MAC address based on username (consistent)
    const macBase = user.username.padStart(5, '0');
    const macAddress = `00:1B:44:${parseInt(macBase).toString(16).padStart(6, '0').slice(0, 2)}:${parseInt(macBase).toString(16).padStart(6, '0').slice(2, 4)}:${parseInt(macBase).toString(16).padStart(6, '0').slice(4, 6)}`;

    return {
      username: user.username,
      name: user.name,
      acctSessionId: `${Math.floor(Math.random() * 900000000) + 100000000}`, // Random 9-digit session ID
      framedIpAddress: user.ip,
      nasIpAddress: user.nas,
      nasShortName: user.nasName,
      acctStartTime: startTime.toISOString(),
      acctSessionTime: sessionTime,
      acctInputOctets: downloadBytes,
      acctOutputOctets: uploadBytes,
      macAddress: macAddress // Add MAC address for reference
    };
  });
}

/**
 * POST /admin/pelanggan-online/disconnect
 * Disconnect a specific session using RADIUS CoA/Disconnect
 */
router.post('/disconnect', async (req, res) => {
  try {
    const { username, sessionId, nasIp } = req.body;

    if (!username || !sessionId || !nasIp) {
      return res.status(400).json({
        success: false,
        message: 'Username, Session ID, and NAS IP are required'
      });
    }

    logger.info(`RADIUS disconnect request for user ${username}, session ${sessionId} from NAS ${nasIp}`);

    // Get NAS secret from database
    const nasClient = await radiusDb.getAllNasClients();
    let nas = nasClient.find(n => n.nasname === nasIp || n.ip_address === nasIp);

    // For simulation data, if NAS not found, create a mock NAS
    if (!nas && nasIp === '192.168.1.1') {
      nas = {
        nasname: '192.168.1.1',
        secret: 'testing123', // Default RADIUS secret for testing
        shortname: 'Test-NAS'
      };
      logger.info(`Using mock NAS configuration for simulation: ${nas.nasname}`);
    }

    if (!nas) {
      return res.status(404).json({
        success: false,
        message: 'NAS client not found'
      });
    }

    // Send RADIUS CoA disconnect request
    const result = await radiusDisconnect.disconnectUser({
      username,
      sessionId,
      nasIp: nas.nasname || nas.ip_address,
      nasSecret: nas.secret,
      framedIp: null // Will be populated if needed
    });

    logger.info(`RADIUS disconnect result for ${username}: ${result.success ? 'SUCCESS' : 'FAILED'}`);

    if (result.success) {
      res.json({
        success: true,
        message: `User ${username} disconnected successfully via RADIUS CoA`
      });
    } else {
      res.status(400).json({
        success: false,
        message: `Failed to disconnect user ${username}: ${result.message}`
      });
    }

  } catch (error) {
    logger.error(`Error in RADIUS disconnect: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error disconnecting user via RADIUS',
      error: error.message
    });
  }
});

/**
 * POST /admin/pelanggan-online/kick-multiple
 * Kick multiple sessions using RADIUS CoA/Disconnect
 */
router.post('/kick-multiple', async (req, res) => {
  try {
    const { users } = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Users array is required'
      });
    }

    logger.info(`Bulk RADIUS disconnect request for ${users.length} users`);

    // Get NAS clients for secrets
    const nasClients = await radiusDb.getAllNasClients();

    const results = await Promise.allSettled(
      users.map(async (user) => {
        if (!user.username || !user.sessionId || !user.nasIp) {
          throw new Error('Username, Session ID, and NAS IP are required');
        }

        try {
          // Find NAS client
          let nas = nasClients.find(n => n.nasname === user.nasIp || n.ip_address === user.nasIp);

          // For simulation data, if NAS not found, create a mock NAS
          if (!nas && user.nasIp === '192.168.1.1') {
            nas = {
              nasname: '192.168.1.1',
              secret: 'testing123', // Default RADIUS secret for testing
              shortname: 'Test-NAS'
            };
            logger.info(`Using mock NAS configuration for bulk simulation: ${nas.nasname}`);
          }

          if (!nas) {
            throw new Error(`NAS client not found for ${user.nasIp}`);
          }

          // Send RADIUS CoA disconnect request
          logger.info(`Sending RADIUS disconnect for ${user.username} via NAS ${nas.nasname}`);

          const result = await radiusDisconnect.disconnectUser({
            username: user.username,
            sessionId: user.sessionId,
            nasIp: nas.nasname || nas.ip_address,
            nasSecret: nas.secret,
            framedIp: user.framedIp || null
          });

          return {
            username: user.username,
            success: result.success,
            message: result.success
              ? `User ${user.username} disconnected successfully via RADIUS CoA`
              : `Failed to disconnect ${user.username}: ${result.message}`
          };
        } catch (error) {
          logger.error(`Error disconnecting ${user.username}: ${error.message}`);
          return {
            username: user.username,
            success: false,
            message: `Error: ${error.message}`
          };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed = results.filter(r => r.status === 'rejected');

    const successCount = successful.filter(s => s.success).length;
    const failedCount = successful.filter(s => !s.success).length + failed.length;

    logger.info(`Bulk RADIUS disconnect completed: ${successCount} successful, ${failedCount} failed`);

    res.json({
      success: failedCount === 0,
      message: `${successCount} users disconnected successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
      results: {
        successful: successful.filter(s => s.success),
        failed: [...successful.filter(s => !s.success), ...failed.map(f => ({
          reason: f.reason.message
        }))]
      }
    });
  } catch (error) {
    logger.error(`Error in bulk RADIUS disconnect: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error in bulk RADIUS disconnect operation',
      error: error.message
    });
  }
});

/**
 * GET /admin/pelanggan-online/statistics
 * Mendapatkan statistik pelanggan online
 */
router.get('/statistics', async (req, res) => {
  try {
    let activeSessions = await radiusDb.getActiveSessions();
    let onlineUsersByGroup = await radiusDb.getOnlineUsersByGroup();

    // If no real sessions, use simulation data
    if (activeSessions.length === 0) {
      activeSessions = generateSimulationData();
      // Generate mock group statistics
      onlineUsersByGroup = {
        'ISP-Premium': 3,
        'ISP-Basic': 2,
        'ISP-Standard': 3
      };
    }

    // Calculate statistics
    const totalSessions = activeSessions.length;
    const totalDataUsage = activeSessions.reduce((total, session) => {
      return total + (session.acctInputOctets || 0) + (session.acctOutputOctets || 0);
    }, 0);

    // Average session duration
    const avgSessionDuration = activeSessions.length > 0
      ? activeSessions.reduce((total, session) => total + (session.acctSessionTime || 0), 0) / activeSessions.length
      : 0;

    res.json({
      success: true,
      statistics: {
        totalSessions,
        totalDataUsage,
        avgSessionDuration,
        onlineUsersByGroup,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error getting online statistics: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error getting online statistics',
      error: error.message
    });
  }
});

module.exports = router;