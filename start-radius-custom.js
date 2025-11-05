const dgram = require('dgram');
const radius = require('radius');
const { logger } = require('./config/logger');
const radiusDb = require('./config/radius-postgres');

// Konfigurasi custom ports
const AUTH_PORT = 11812;
const ACCT_PORT = 11813;

let authServer = null;
let acctServer = null;
let nasClients = [];
let stats = {
  startTime: null,
  totalRequests: 0,
  acceptedRequests: 0,
  rejectedRequests: 0
};

// Load NAS clients
async function loadNasClients() {
  try {
    const dbClients = await radiusDb.getAllNasClients();

    if (dbClients && dbClients.length > 0) {
      nasClients = dbClients.map(c => ({
        ip: c.nasname,
        secret: c.secret,
        name: c.shortname
      }));
      logger.info(`✅ Loaded ${nasClients.length} NAS clients from database`);
    } else {
      nasClients = [];
      logger.warn('⚠️  No NAS clients configured');
    }
  } catch (error) {
    logger.error(`Error loading NAS clients: ${error.message}`);
    nasClients = [];
  }
}

// Verify NAS client
function verifyNasClient(remoteAddress) {
  const ip = remoteAddress.split(':')[0];
  const client = nasClients.find(c => c.ip === ip || c.ip === '0.0.0.0' || c.ip === '127.0.0.1');
  if (client) {
    return client;
  }

  logger.warn(`⚠️  Unauthorized NAS client: ${ip}`);
  return null;
}

// Authenticate user
async function authenticateUser(username, password) {
  try {
    const user = await radiusDb.getRadiusUser(username);

    if (!user) {
      logger.warn(`❌ User not found: ${username}`);
      return { success: false, reason: 'User not found' };
    }

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

// Handle Access-Request
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
      return radius.encode_response({
        packet: decoded,
        code: 'Access-Reject',
        secret: nasClient.secret,
        attributes: {
          'Reply-Message': 'Missing username or password'
        }
      });
    }

    const authResult = await authenticateUser(username, password);

    if (authResult.success) {
      stats.acceptedRequests++;
      return radius.encode_response({
        packet: decoded,
        code: 'Access-Accept',
        secret: nasClient.secret,
        attributes: {
          'Reply-Message': 'Authentication successful'
        }
      });
    } else {
      stats.rejectedRequests++;
      return radius.encode_response({
        packet: decoded,
        code: 'Access-Reject',
        secret: nasClient.secret,
        attributes: {
          'Reply-Message': authResult.reason
        }
      });
    }
  } catch (error) {
    logger.error(`Error handling access request: ${error.message}`);
    stats.errors++;
    return null;
  }
}

async function startRadiusServer() {
  try {
    console.log(`🔐 Starting Custom RADIUS Server on ports ${AUTH_PORT}/${ACCT_PORT}...`);

    await radiusDb.initDatabase();
    await loadNasClients();

    // Create authentication server
    authServer = dgram.createSocket('udp4');

    authServer.on('message', async (msg, rinfo) => {
      const nasClient = verifyNasClient(rinfo.address);
      if (!nasClient) {
        return;
      }

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
    });

    authServer.bind(AUTH_PORT, () => {
      console.log(`🔐 RADIUS Authentication Server listening on port ${AUTH_PORT}`);
    });

    stats.startTime = new Date();

    console.log('✅ Custom RADIUS Server started successfully!');
    console.log('\n📊 Server Configuration:');
    console.log(`- Auth Port: ${AUTH_PORT}`);
    console.log(`- Acct Port: ${ACCT_PORT}`);
    console.log(`- NAS Clients: ${nasClients.length}`);

    nasClients.forEach(nas => {
      console.log(`  - ${nas.name} (${nas.ip})`);
    });

    console.log('\n🎯 Ready for authentication!');
    console.log('Press Ctrl+C to stop...');

    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping RADIUS Server...');
      if (authServer) authServer.close();
      if (acctServer) acctServer.close();
      console.log('✅ RADIUS Server stopped');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start RADIUS Server:', error.message);
    process.exit(1);
  }
}

startRadiusServer();