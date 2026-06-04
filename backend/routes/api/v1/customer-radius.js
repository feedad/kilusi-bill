const express = require('express');
const router = express.Router();
const { getPool } = require('../../../config/database');
const radiusDb = require('../../../config/radius-postgres');
const { validateSessionToken } = require('./customer-auth-nextjs');

// Middleware to verify customer token (JWT only for OTP login)
const verifyCustomerToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak ditemukan'
      });
    }

    require('fs').appendFileSync('/tmp/auth-token.log', `[Radius] ${new Date().toISOString()} Token: ${token}\n`);

    // 1. Try validating as Session Token (Next.js Frontend)
    try {
      const sessionValidation = await validateSessionToken(token);
      if (sessionValidation.valid && sessionValidation.customer) {
        console.log('✅ Session Token Validated for:', sessionValidation.customer.name);

        // Ensure we have the latest data from DB if needed, but session usually has enough
        // Or we can just use the customer object from session
        req.customer = sessionValidation.customer;

        // Fetch pppoe_username from DB if missing in session
        if (!req.customer.pppoe_username) {
          try {
            const { getOne } = require('../../../config/database');
            const dbCustomer = await getOne(`
              SELECT t.pppoe_username
              FROM services s
              LEFT JOIN technical_details t ON s.id = t.service_id
              WHERE s.customer_id::text = $1
              LIMIT 1
            `, [req.customer.id || req.customer.customer_id]);
            if (dbCustomer && dbCustomer.pppoe_username) {
              req.customer.pppoe_username = dbCustomer.pppoe_username;
              console.log(`✅ Fetched pppoe_username from DB: ${dbCustomer.pppoe_username}`);
            } else {
              console.log(`⚠️ No pppoe_username found in DB for customer ${req.customer.id || req.customer.customer_id}`);
            }
          } catch (dbError) {
            console.error('❌ Failed to fetch pppoe_username from DB:', dbError.message);
          }
        }

        return next();
      }
    } catch (sessionError) {
      console.log('Session validation check failed (continuing to JWT):', sessionError.message);
    }

    // Use the database from config
    const pool = getPool();

    // JWT token validation only (for phone/OTP login)
    try {
      const jwt = require('jsonwebtoken');
      const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'your-customer-jwt-secret-key-change-in-production';
      const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);

      if (decoded.type === 'customer' && decoded.customerId) {
        // Get customer by ID from customers_view to include pppoe_username
        const query = `
          SELECT c.*
          FROM customers_view c
          WHERE c.id = $1
        `;
        const result = await pool.query(query, [decoded.customerId]);

        if (result.rows.length > 0) {
          req.customer = result.rows[0];
          console.log('✅ JWT Customer found:', result.rows[0].name, 'Username:', result.rows[0].pppoe_username);
          return next();
        } else {
          console.log('Customer not found for JWT ID:', decoded.customerId);
          return res.status(401).json({
            success: false,
            message: 'Customer tidak ditemukan'
          });
        }
      } else {
        console.log('Invalid JWT token type');
        return res.status(401).json({
          success: false,
          message: 'Token tidak valid'
        });
      }
    } catch (jwtError) {
      console.log('❌ JWT validation failed:', jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Token tidak valid atau kadaluarsa'
      });
    }

    // If we reach here, JWT authentication failed
    return res.status(401).json({
      success: false,
      message: 'Token tidak valid atau kadaluarsa'
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifikasi token'
    });
  }
};

// Get customer RADIUS information
router.get('/info', verifyCustomerToken, async (req, res) => {
  try {
    const customer = req.customer;

    // Get real RADIUS connection status
    let radiusConnection = { online: false };
    if (customer.pppoe_username) {
      radiusConnection = await radiusDb.getUserConnectionStatus(customer.pppoe_username);
    }

    console.log(`[DEBUG] Customer API: RADIUS connection for ${customer.pppoe_username}:`, JSON.stringify(radiusConnection, null, 2));
    console.log(`[DEBUG] Session start from radiusConnection:`, radiusConnection.session_start);
    console.log(`[DEBUG] Session time from radiusConnection:`, radiusConnection.session_time);
    console.log(`[DEBUG] Online status from radiusConnection:`, radiusConnection.online);

    // Get traffic data from active session
    let uploadBytes = 0;
    let downloadBytes = 0;
    let uploadPackets = 0;
    let downloadPackets = 0;

    if (radiusConnection.online) {
      try {
        const { getOne } = require('../../../config/database');
        const activeSession = await getOne(`
          SELECT acctinputoctets, acctoutputoctets, acctsessionid, acctstarttime
          FROM radacct
          WHERE username = $1 AND acctstoptime IS NULL
          ORDER BY acctstarttime DESC
          LIMIT 1
        `, [customer.pppoe_username]);

        if (activeSession) {
          uploadBytes = parseInt(activeSession.acctinputoctets) || 0;
          downloadBytes = parseInt(activeSession.acctoutputoctets) || 0;
          uploadPackets = 0; // Packet data not available in current schema
          downloadPackets = 0; // Packet data not available in current schema

          console.log('📊 Active session found for', customer.pppoe_username);
          console.log('📊 Upload bytes:', uploadBytes);
          console.log('📊 Download bytes:', downloadBytes);
        } else {
          console.log('❌ No active session found for', customer.pppoe_username);
        }
      } catch (error) {
        console.error('Error fetching traffic data:', error.message);
      }
    }

    // Calculate real-time session duration for active connections
    let realTimeSessionDuration = 0;
    if (radiusConnection.online && radiusConnection.session_start) {
      const sessionStart = new Date(radiusConnection.session_start);
      const now = new Date();
      realTimeSessionDuration = Math.floor((now - sessionStart) / 1000); // in seconds
      console.log(`[DEBUG] Calculated real-time session duration: ${realTimeSessionDuration} seconds`);
    }

    // Use real RADIUS data if available, fallback to customer data
    const radiusData = {
      radius_username: customer.pppoe_username,
      radius_attribute: 'Cleartext-Password',
      radius_password: customer.pppoe_password || '********',
      radius_op: ':=',
      session_start: radiusConnection.session_start || null,
      session_end: null,
      session_duration: realTimeSessionDuration, // Use calculated real-time duration
      assigned_ip: radiusConnection.online ? radiusConnection.ip_address : null,
      nas_ip: radiusConnection.online ? radiusConnection.nas_ip : null,
      connection_type: 'Wireless-802.11',
      upload_bytes: uploadBytes,
      download_bytes: downloadBytes,
      upload_packets: uploadPackets,
      download_packets: downloadPackets,
      disconnect_reason: null,
      status: radiusConnection.online ? 'online' : 'offline'
    };

    // Get traffic data from RADIUS accounting
    const totalUploadBytes = radiusData.upload_bytes || 0;
    const totalDownloadBytes = radiusData.download_bytes || 0;

    // Convert bytes to GB for display
    const totalUploadGB = (totalUploadBytes / (1024 * 1024 * 1024)).toFixed(2);
    const totalDownloadGB = (totalDownloadBytes / (1024 * 1024 * 1024)).toFixed(2);

    // Calculate current speeds with better logic
    let currentUploadSpeed = 0;
    let currentDownloadSpeed = 0;

    if (radiusConnection.online && realTimeSessionDuration > 0) {
      // For demonstration, show realistic speeds if no real traffic data
      if (totalUploadBytes === 0 && totalDownloadBytes === 0) {
        // Show estimated speeds based on package (this could be made dynamic)
        currentUploadSpeed = (Math.random() * 2 + 0.5).toFixed(2); // 0.5-2.5 Mbps
        currentDownloadSpeed = (Math.random() * 10 + 5).toFixed(2); // 5-15 Mbps
      } else {
        // Calculate real speeds if traffic data exists
        currentUploadSpeed = (totalUploadBytes / realTimeSessionDuration * 8 / 1024 / 1024).toFixed(2);
        currentDownloadSpeed = (totalDownloadBytes / realTimeSessionDuration * 8 / 1024 / 1024).toFixed(2);
      }
    }

    // Get device information from RADIUS and GenieACS
    let acsDevice = null;
    let acsDeviceId = null;
    const genieacs = require('../../../config/genieacs');

    try {
      // Try multiple search strategies
      const searchStrategies = [
        { query: { '_tags': `id:${customer.id}` }, label: 'customer_id' },
        { query: { '_tags': customer.phone }, label: 'phone' },
        { query: { '_tags': `pppoe:${customer.pppoe_username}` }, label: 'pppoe' }
      ];

      for (const strategy of searchStrategies) {
        try {
          const axiosInstance = genieacs.getAxiosInstance();
          const acsResponse = await axiosInstance.get('/devices', {
            params: { 'query': JSON.stringify(strategy.query) }
          });

          if (acsResponse.data && acsResponse.data.length > 0) {
            acsDevice = acsResponse.data[0];
            acsDeviceId = acsDevice._id;
            console.log(`✅ Found ACS device by ${strategy.label}: ${acsDeviceId}`);
            break;
          }
        } catch (e) {
          console.log(`⚠️ Search by ${strategy.label} failed:`, e.message);
        }
      }

      if (!acsDevice) {
        console.log(`⚠️ GenieACS returned no devices for customer ${customer.id}`);
      }
    } catch (acsError) {
      console.warn(`❌ Error searching ACS for customer ${customer.id}:`, acsError.message);
    }

    // Parse SSID and connected devices directly from acsDevice (list endpoint object)
    let acsSSID = null;
    let acsConnectedDevices = [];
    if (acsDevice) {
      try {
        // Log available top-level keys for debugging
        console.log(`🔍 GenieACS device keys: ${Object.keys(acsDevice).join(', ')}`);
        if (acsDevice.InternetGatewayDevice) {
          console.log(`🔍 IGD keys: ${Object.keys(acsDevice.InternetGatewayDevice).join(', ')}`);
          const lanDev = acsDevice.InternetGatewayDevice.LANDevice;
          if (lanDev) {
            console.log(`🔍 LANDevice keys: ${Object.keys(lanDev).join(', ')}`);
            if (lanDev['1']) {
              console.log(`🔍 LANDevice.1 keys: ${Object.keys(lanDev['1']).join(', ')}`);
              if (lanDev['1'].Hosts) {
                console.log(`🔍 Hosts keys: ${Object.keys(lanDev['1'].Hosts).join(', ')}`);
                console.log(`🔍 HostNumberOfEntries: ${lanDev['1'].Hosts.HostNumberOfEntries?._value || 'N/A'}`);
                if (lanDev['1'].Hosts.Host) {
                  console.log(`🔍 Host entries keys: ${Object.keys(lanDev['1'].Hosts.Host).slice(0, 10).join(', ')}`);
                  const firstHost = lanDev['1'].Hosts.Host['1'];
                  console.log(`🔍 firstHost type: ${typeof firstHost}, isNull: ${firstHost === null}`);
                  if (firstHost) {
                    console.log(`🔍 Sample Host entry keys: ${Object.keys(firstHost).slice(0, 15).join(', ')}`);
                    console.log(`🔍 Sample Host entry: ${JSON.stringify(firstHost).substring(0, 200)}`);
                  }
                }
              }
              if (lanDev['1'].WLANConfiguration) {
                console.log(`🔍 WLANConfiguration keys: ${Object.keys(lanDev['1'].WLANConfiguration).join(', ')}`);
                const wlan1 = lanDev['1'].WLANConfiguration['1'];
                if (wlan1) {
                  console.log(`🔍 WLAN.1 keys: ${Object.keys(wlan1).slice(0, 15).join(', ')}`);
                }
              }
            }
          }
        }
        if (acsDevice.Device) {
          console.log(`🔍 Device keys: ${Object.keys(acsDevice.Device).join(', ')}`);
        }

        acsSSID = genieacs.parseSSID(acsDevice);
        acsConnectedDevices = genieacs.parseConnectedDevices(acsDevice);
        console.log(`📡 GenieACS SSID: ${acsSSID}, Connected devices: ${acsConnectedDevices.length}`);
      } catch (e) {
        console.warn('Error parsing GenieACS device data:', e.message);
      }
    }

    // Validasi MAC Address (harus format 00:00:00:00:00:00)
    const isValidMac = (mac) => /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac);

    // SSID: ambil dari GenieACS (real-time), fallback ke DB, then fallback ke default
    let finalSSID = acsSSID || customer.ssid || null;
    if (!finalSSID && customer.pppoe_username) {
      finalSSID = 'KilusiNet-' + customer.pppoe_username.split('@')[0];
    }

    // Auto-sync SSID dari GenieACS ke DB: selalu sync kalau GenieACS punya data yang berbeda dari DB
    if (acsSSID && acsSSID !== customer.ssid) {
      try {
        const { query } = require('../../../config/database');
        await query(`UPDATE customers SET ssid = $1, updated_at = NOW() WHERE id = $2`, [acsSSID, customer.id]);
        console.log(`🔄 Auto-synced SSID from GenieACS to DB: ${acsSSID} (was: ${customer.ssid})`);
      } catch (syncErr) {
        console.warn('Failed to sync SSID to DB:', syncErr.message);
      }
    }

    // Password WiFi: dari DATABASE (GenieACS tidak expose password via API)
    const dbWiFiPassword = customer.wifi_password || '********';

    const deviceInfo = {
      ipAddress: radiusConnection.online ? (radiusConnection.ip_address || '-') : '-',
      macAddress: (radiusConnection.online && isValidMac(radiusConnection.mac_address))
        ? radiusConnection.mac_address
        : (customer.mac_address || '-'),
      ssid: finalSSID || 'KilusiNet',
      wifiPassword: dbWiFiPassword,
      status: radiusData.status,
      uptime: radiusData.status === 'online' ? formatUptime(realTimeSessionDuration) : '-',
      lastSeen: radiusConnection.online && radiusData.session_start ? new Date(radiusData.session_start).toLocaleString('id-ID') : (acsDevice?._lastInform ? new Date(acsDevice._lastInform).toLocaleString('id-ID') : '-'),
      radiusUsername: radiusData.radius_username,
      connectionType: radiusConnection.online ? (radiusData.connection_type || 'Wireless') : (acsDevice ? 'TR-069' : '-'),
      nasIP: radiusConnection.online ? radiusData.nas_ip : '-',
      sessionStartTime: radiusConnection.online ? radiusData.session_start : null,
      model: acsDevice?.DeviceID?.ProductClass || acsDevice?.InternetGatewayDevice?.DeviceInfo?.ProductClass?._value || '-',
      serialNumber: acsDevice?.DeviceID?.SerialNumber || acsDevice?.InternetGatewayDevice?.DeviceInfo?.SerialNumber?._value || '-',
      rxPower: acsDevice?.VirtualParameters?.RXPower?._value || acsDevice?.InternetGatewayDevice?.WANDevice?.['1']?.WANPONInterfaceConfig?.RXPower?._value || '-'
    };

    console.log(`[DEBUG] Device Info sessionStartTime:`, deviceInfo.sessionStartTime);
    console.log(`[DEBUG] Device Info status:`, deviceInfo.status);

    // Connected devices from GenieACS (real LAN hosts / AssociatedDevice)
    let connectedDevices = [];
    if (acsConnectedDevices.length > 0) {
      connectedDevices = acsConnectedDevices.map(dev => ({
        mac: dev.mac || '-',
        ip: dev.ip || '-',
        name: dev.name || 'Unknown Device',
        deviceType: 'other',
        connectionTime: '-',
        uploadSpeed: 0,
        downloadSpeed: 0,
        signalStrength: dev.signalStrength || -50,
        status: 'online'
      }));
    }

    // If no ACS data, fallback to RADIUS device entry
    if (connectedDevices.length === 0 && radiusConnection.online) {
      connectedDevices.push({
        mac: radiusConnection.mac_address || customer.mac_address || '-',
        ip: radiusData.assigned_ip || '-',
        name: 'Customer Device',
        deviceType: 'laptop',
        connectionTime: formatConnectionTime(radiusData.session_start),
        uploadSpeed: parseFloat(currentUploadSpeed) || 0,
        downloadSpeed: parseFloat(currentDownloadSpeed) || 0,
        signalStrength: -45,
        status: radiusData.status
      });
    }

    // Traffic statistics with real-time session duration
    const trafficStats = {
      uploadSpeed: radiusConnection.online ? parseFloat(currentUploadSpeed) || 0 : 0,
      downloadSpeed: radiusConnection.online ? parseFloat(currentDownloadSpeed) || 0 : 0,
      totalUpload: radiusConnection.online ? (totalUploadGB + ' GB') : '0 GB',
      totalDownload: radiusConnection.online ? (totalDownloadGB + ' GB') : '0 GB',
      connectedDevices: connectedDevices.length,
      sessionDuration: radiusConnection.online ? formatUptime(realTimeSessionDuration) : '0 menit',
      dataUsage: {
        uploadBytes: radiusConnection.online ? totalUploadBytes : 0,
        downloadBytes: radiusConnection.online ? totalDownloadBytes : 0,
        totalBytes: radiusConnection.online ? (totalUploadBytes + totalDownloadBytes) : 0
      }
    };

    console.log(`[DEBUG] Traffic Stats sessionDuration:`, trafficStats.sessionDuration);
    console.log(`[DEBUG] Final response data being sent to frontend`);

    res.json({
      success: true,
      data: {
        radiusInfo: {
          username: radiusData.radius_username,
          attribute: radiusData.radius_attribute,
          password: radiusData.radius_password,
          sessionActive: radiusData.status === 'online',
          sessionStart: radiusData.session_start,
          nasIP: radiusData.nas_ip
        },
        deviceInfo: {
          ...deviceInfo,
          radiusPassword: radiusData.radius_password
        },
        connectedDevices,
        trafficStats,
        customer: {
          id: customer.id,
          customer_id: customer.customer_id,
          name: customer.name,
          package: customer.package_name,
          status: customer.status
        }
      }
    });

  } catch (error) {
    console.error('Error fetching RADIUS info:', error);
    res.status(500).json({
      success: false,
      message: 'Error mengambil data RADIUS',
      error: error.message
    });
  }
});

// Update WiFi Password
router.put('/wifi-password', verifyCustomerToken, async (req, res) => {
  try {
    const customer = req.customer;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password minimal 8 karakter'
      });
    }

    const genieacs = require('../../../config/genieacs');
    const customerIdTag = `id:${customer.id}`;

    // Find device
    const axiosInstance = genieacs.getAxiosInstance();
    const acsResponse = await axiosInstance.get('/devices', {
        params: { 'query': JSON.stringify({ '_tags': customerIdTag }) }
    });

    if (!acsResponse.data || acsResponse.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Perangkat modem tidak ditemukan di sistem ACS. Pastikan modem sudah online.'
      });
    }

    const deviceId = acsResponse.data[0]._id;

    // Perform update on GenieACS
    await genieacs.setParameterValues(deviceId, {
        'Password': newPassword
    });

    // Also save to database so customer can reveal it later in portal
    const { query } = require('../../../config/database');
    await query(`
      UPDATE customers
      SET wifi_password = $1, updated_at = NOW()
      WHERE id = $2
    `, [newPassword, customer.id]);

    return res.json({
      success: true,
      message: 'Password WiFi sedang diperbarui. Modem akan sinkronisasi dalam beberapa saat.'
    });

  } catch (error) {
    console.error('Error updating WiFi password:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui password WiFi',
      error: error.message
    });
  }
});

// Update SSID
router.put('/ssid', verifyCustomerToken, async (req, res) => {
  try {
    const customer = req.customer;
    const { newSSID } = req.body;

    if (!newSSID || newSSID.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'SSID minimal 3 karakter'
      });
    }

    const genieacs = require('../../../config/genieacs');
    const customerIdTag = `id:${customer.id}`;

    // Find device
    const axiosInstance = genieacs.getAxiosInstance();
    const acsResponse = await axiosInstance.get('/devices', {
        params: { 'query': JSON.stringify({ '_tags': customerIdTag }) }
    });

    if (!acsResponse.data || acsResponse.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Perangkat modem tidak ditemukan di sistem ACS.'
      });
    }

    const deviceId = acsResponse.data[0]._id;

    // Perform update on GenieACS
    await genieacs.setParameterValues(deviceId, {
        'SSID': newSSID.trim()
    });

    // Also save to database
    const { query } = require('../../../config/database');
    await query(`
      UPDATE customers
      SET ssid = $1, updated_at = NOW()
      WHERE id = $2
    `, [newSSID.trim(), customer.id]);

    return res.json({
      success: true,
      message: 'Nama WiFi (SSID) sedang diperbarui.'
    });

  } catch (error) {
    console.error('Error updating SSID:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui SSID',
      error: error.message
    });
  }
});

// Reboot Device
router.post('/reboot', verifyCustomerToken, async (req, res) => {
  try {
    const customer = req.customer;
    const genieacs = require('../../../config/genieacs');
    const customerIdTag = `id:${customer.id}`;
    
    const axiosInstance = genieacs.getAxiosInstance();
    const acsResponse = await axiosInstance.get('/devices', {
        params: { 'query': JSON.stringify({ '_tags': customerIdTag }) }
    });

    if (!acsResponse.data || acsResponse.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Modem tidak ditemukan.'
      });
    }

    const deviceId = acsResponse.data[0]._id;
    await genieacs.reboot(deviceId);

    return res.json({
      success: true,
      message: 'Perintah reboot telah dikirim ke modem. Modem akan restart dalam beberapa saat.'
    });

  } catch (error) {
    console.error('Error rebooting device:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal melakukan reboot modem',
      error: error.message
    });
  }
});

// Helper functions
function formatUptime(seconds) {
  if (!seconds || seconds === 0) return '0 menit';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days} hari, ${hours} jam`;
  } else if (hours > 0) {
    return `${hours} jam, ${minutes} menit`;
  } else {
    return `${minutes} menit`;
  }
}

function formatConnectionTime(startTime) {
  if (!startTime) return 'Unknown';

  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now - start;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} hari ${diffHours % 24} jam lalu`;
  } else if (diffHours > 0) {
    return `${diffHours} jam ${diffMins % 60} menit lalu`;
  } else {
    return `${diffMins} menit lalu`;
  }
}

function getDeviceName(macAddress, deviceType) {
  if (!macAddress || macAddress === 'Unknown') {
    return deviceType || 'Unknown Device';
  }

  // Try to identify device based on MAC prefix (OUI)
  const macPrefix = macAddress.substring(0, 8).toUpperCase();

  const deviceNames = {
    '00:1A:2B': 'Router Device',
    '00:11:22': 'Access Point',
    '00:0C:29': 'VMware Device',
    '08:00:27': 'VirtualBox Device',
    '52:54:00': 'QEMU/KVM Device'
  };

  return deviceNames[macPrefix] || `${deviceType || 'Network'} Device`;
}

function getDeviceCategory(portType) {
  if (!portType) return 'other';

  const type = portType.toLowerCase();

  if (type.includes('wireless') || type.includes('wifi')) {
    return 'smartphone';
  } else if (type.includes('ethernet') || type.includes('wired')) {
    return 'laptop';
  } else if (type.includes('virtual') || type.includes('vpn')) {
    return 'desktop';
  } else {
    return 'other';
  }
}

module.exports = router;