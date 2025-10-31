const dgram = require('dgram');
const radius = require('radius');
const crypto = require('crypto');
const { logger } = require('./logger');
const radiusDb = require('./radius-postgres');
const { getSetting } = require('./settingsManager');

// Konfigurasi RADIUS server
let server = null;
let authServer = null;
let acctServer = null;
let isRunning = false;
let stats = {
  startTime: null,
  totalRequests: 0,
  acceptedRequests: 0,
  rejectedRequests: 0,
  accountingRequests: 0,
  errors: 0
};

// NAS (Network Access Server) clients yang diizinkan
let nasClients = [];

// Fungsi untuk load NAS clients dari database
async function loadNasClients() {
  try {
    const dbClients = await radiusDb.getAllNasClients();
    
    if (dbClients && dbClients.length > 0) {
      // Convert database format to server format
      nasClients = dbClients.map(c => ({
        ip: c.nasname,
        secret: c.secret,
        name: c.shortname
      }));
      logger.info(`✅ Loaded ${nasClients.length} NAS clients from database`);
    } else {
      // Jangan auto-buat NAS default. Biarkan kosong dan beri peringatan.
      // Ini penting agar penghapusan NAS terakhir di UI benar-benar permanen.
      nasClients = [];
      logger.warn('⚠️  No NAS clients configured. RADIUS will not accept any NAS connections until at least one NAS is added.');
    }
  } catch (error) {
    logger.error(`Error loading NAS clients: ${error.message}`);
    // Pada error, jangan auto-buat default juga; tetap kosong agar perilaku konsisten
    nasClients = [];
  }
}

// Fungsi untuk verify NAS client
function verifyNasClient(remoteAddress) {
  // Hapus port dari IP address jika ada
  const ip = remoteAddress.split(':')[0];
  
  const client = nasClients.find(c => c.ip === ip || c.ip === '0.0.0.0');
  if (client) {
    return client;
  }
  
  logger.warn(`⚠️  Unauthorized NAS client: ${ip}`);
  return null;
}

// Fungsi untuk authenticate user
async function authenticateUser(username, password) {
  try {
    const user = await radiusDb.getRadiusUser(username);
    
    if (!user) {
      logger.warn(`❌ User not found: ${username}`);
      return { success: false, reason: 'User not found' };
    }
    
    // Verify password
    if (user.value === password) {
      logger.info(`✅ Authentication successful: ${username}`);
      return { success: true, user: user };
    } else {
      logger.warn(`❌ Invalid password for user: ${username}`);
      return { success: false, reason: 'Invalid password' };
    }
  } catch (error) {
    logger.error(`Error authenticating user: ${error.message}`);
    return { success: false, reason: 'Database error' };
  }
}

// Fungsi untuk mendapatkan reply attributes untuk user
async function getUserReplyAttributes(username) {
  try {
    const attributes = await radiusDb.query(
      'SELECT attribute, op, value FROM radreply WHERE username = ?',
      [username]
    );
    
    return attributes;
  } catch (error) {
    logger.error(`Error getting reply attributes: ${error.message}`);
    return [];
  }
}

// Handler untuk Access-Request
async function handleAccessRequest(packet, nasClient, rinfo) {
  stats.totalRequests++;
  
  try {
    const decoded = radius.decode({
      packet: packet,
      secret: nasClient.secret
    });
    
    const username = decoded.attributes['User-Name'];
    const password = decoded.attributes['User-Password'];
    
    logger.info(`📨 Access-Request from ${rinfo.address}: ${username}`);
    
    if (!username || !password) {
      logger.warn('❌ Missing username or password');
      stats.rejectedRequests++;
      return createAccessReject(decoded, nasClient.secret);
    }
    
    // Authenticate user
    const authResult = await authenticateUser(username, password);
    
    if (authResult.success) {
      stats.acceptedRequests++;
      
      // Get reply attributes
      const replyAttributes = await getUserReplyAttributes(username);
      
      // Build response attributes
      const responseAttrs = {
        'Reply-Message': 'Authentication successful'
      };
      
      // Add custom reply attributes
      replyAttributes.forEach(attr => {
        responseAttrs[attr.attribute] = attr.value;
      });
      
      return createAccessAccept(decoded, nasClient.secret, responseAttrs);
    } else {
      stats.rejectedRequests++;
      return createAccessReject(decoded, nasClient.secret, authResult.reason);
    }
  } catch (error) {
    logger.error(`Error handling access request: ${error.message}`);
    stats.errors++;
    return null;
  }
}

// Handler untuk Accounting-Request
async function handleAccountingRequest(packet, nasClient, rinfo) {
  stats.accountingRequests++;
  
  try {
    const decoded = radius.decode({
      packet: packet,
      secret: nasClient.secret
    });
    
    const username = decoded.attributes['User-Name'];
    const acctStatusType = decoded.attributes['Acct-Status-Type'];
    const sessionId = decoded.attributes['Acct-Session-Id'];
    
    logger.info(`📊 Accounting-Request from ${rinfo.address}: ${username} (${acctStatusType})`);
    
    const sessionData = {
      username: username,
      sessionId: sessionId,
      uniqueId: decoded.attributes['Acct-Unique-Session-Id'] || `${sessionId}-${Date.now()}`,
      nasIp: rinfo.address,
      nasPortId: decoded.attributes['NAS-Port-Id'],
      nasPortType: decoded.attributes['NAS-Port-Type'],
      framedIp: decoded.attributes['Framed-IP-Address'],
      callingStationId: decoded.attributes['Calling-Station-Id'],
      calledStationId: decoded.attributes['Called-Station-Id'],
      sessionTime: decoded.attributes['Acct-Session-Time'],
      inputOctets: decoded.attributes['Acct-Input-Octets'],
      outputOctets: decoded.attributes['Acct-Output-Octets'],
      terminateCause: decoded.attributes['Acct-Terminate-Cause']
    };
    
    // Handle berbagai tipe accounting
    switch (acctStatusType) {
      case 'Start':
        await radiusDb.accountingStart(sessionData);
        break;
      case 'Interim-Update':
        await radiusDb.accountingUpdate(sessionData);
        break;
      case 'Stop':
        await radiusDb.accountingStop(sessionData);
        break;
      default:
        logger.warn(`Unknown accounting status type: ${acctStatusType}`);
    }
    
    return createAccountingResponse(decoded, nasClient.secret);
  } catch (error) {
    logger.error(`Error handling accounting request: ${error.message}`);
    stats.errors++;
    return null;
  }
}

// Fungsi untuk membuat Access-Accept response
function createAccessAccept(request, secret, attributes = {}) {
  const response = radius.encode_response({
    packet: request,
    code: 'Access-Accept',
    secret: secret,
    attributes: attributes
  });
  
  return response;
}

// Fungsi untuk membuat Access-Reject response
function createAccessReject(request, secret, message = 'Authentication failed') {
  const response = radius.encode_response({
    packet: request,
    code: 'Access-Reject',
    secret: secret,
    attributes: {
      'Reply-Message': message
    }
  });
  
  return response;
}

// Fungsi untuk membuat Accounting-Response
function createAccountingResponse(request, secret) {
  const response = radius.encode_response({
    packet: request,
    code: 'Accounting-Response',
    secret: secret
  });
  
  return response;
}

// Fungsi untuk memulai RADIUS server
async function startRadiusServer() {
  if (isRunning) {
    logger.warn('⚠️  RADIUS server already running');
    return;
  }
  
  try {
    // Initialize database
    await radiusDb.initDatabase();
    
    // Load NAS clients from database
    await loadNasClients();
    
    // Get port dari settings
    const authPort = parseInt(getSetting('radius_auth_port', 1812));
    const acctPort = parseInt(getSetting('radius_acct_port', 1813));
    
    // Create authentication server
    authServer = dgram.createSocket('udp4');
    
    authServer.on('message', async (msg, rinfo) => {
      // Verify NAS client
      const nasClient = verifyNasClient(rinfo.address);
      if (!nasClient) {
        return;
      }
      
      // Handle request
      const response = await handleAccessRequest(msg, nasClient, rinfo);
      
      if (response) {
        authServer.send(response, 0, response.length, rinfo.port, rinfo.address, (err) => {
          if (err) {
            logger.error(`Error sending response: ${err.message}`);
          }
        });
      }
    });
    
    authServer.on('error', (err) => {
      logger.error(`Authentication server error: ${err.message}`);
      stats.errors++;
    });
    
    authServer.bind(authPort, () => {
      logger.info(`🔐 RADIUS Authentication Server listening on port ${authPort}`);
    });
    
    // Create accounting server
    acctServer = dgram.createSocket('udp4');
    
    acctServer.on('message', async (msg, rinfo) => {
      // Verify NAS client
      const nasClient = verifyNasClient(rinfo.address);
      if (!nasClient) {
        return;
      }
      
      // Handle request
      const response = await handleAccountingRequest(msg, nasClient, rinfo);
      
      if (response) {
        acctServer.send(response, 0, response.length, rinfo.port, rinfo.address, (err) => {
          if (err) {
            logger.error(`Error sending response: ${err.message}`);
          }
        });
      }
    });
    
    acctServer.on('error', (err) => {
      logger.error(`Accounting server error: ${err.message}`);
      stats.errors++;
    });
    
    acctServer.bind(acctPort, () => {
      logger.info(`📊 RADIUS Accounting Server listening on port ${acctPort}`);
    });
    
    server = {
      auth: authServer,
      acct: acctServer
    };
    
    isRunning = true;
    stats.startTime = new Date();
    
    logger.info('✅ RADIUS Server started successfully');
  } catch (error) {
    logger.error(`Failed to start RADIUS server: ${error.message}`);
    throw error;
  }
}

// Fungsi untuk menghentikan RADIUS server
async function stopRadiusServer() {
  if (!isRunning) {
    logger.warn('⚠️  RADIUS server is not running');
    return;
  }
  
  try {
    if (server) {
      if (server.auth) {
        server.auth.close();
      }
      if (server.acct) {
        server.acct.close();
      }
    }
    
    await radiusDb.closeDatabase();
    
    isRunning = false;
    server = null;
    authServer = null;
    acctServer = null;
    
    logger.info('✅ RADIUS Server stopped');
  } catch (error) {
    logger.error(`Error stopping RADIUS server: ${error.message}`);
    throw error;
  }
}

// Fungsi untuk mendapatkan status server
function getServerStatus() {
  return {
    running: isRunning,
    authServer: authServer !== null,
    acctServer: acctServer !== null,
    ports: {
      auth: getSetting('radius_auth_port', '1812'),
      acct: getSetting('radius_acct_port', '1813')
    },
    stats: {
      authRequests: stats.totalRequests || 0,
      authAccepted: stats.acceptedRequests || 0,
      authRejected: stats.rejectedRequests || 0,
      acctRequests: stats.accountingRequests || 0,
      errors: stats.errors || 0,
      uptime: stats.startTime ? Math.floor((Date.now() - stats.startTime) / 1000) : 0
    },
    nasClients: nasClients.map(c => ({
      ip: c.ip,
      name: c.name
    }))
  };
}

// Fungsi untuk reload NAS clients
async function reloadNasClients() {
  await loadNasClients();
  logger.info('✅ NAS clients reloaded from database');
}

module.exports = {
  startRadiusServer,
  stopRadiusServer,
  getServerStatus,
  reloadNasClients
};
