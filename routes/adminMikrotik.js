const express = require('express');
const router = express.Router();
const { adminAuth } = require('./adminAuth');
const { 
    getPPPoEUsers, 
    addPPPoEUser, 
    editPPPoEUser, 
    deletePPPoEUser, 
    getPPPoEProfiles, 
    addPPPoEProfile, 
    editPPPoEProfile, 
    deletePPPoEProfile, 
    getPPPoEProfileDetail,
    getHotspotProfiles,
    addHotspotProfile,
    editHotspotProfile,
    deleteHotspotProfile,
    getHotspotProfileDetail,
    kickPPPoEUser
} = require('../config/mikrotik');
const radiusDb = require('../config/radius-postgres');
const radiusSync = require('../config/radius-sync');
const billing = require('../config/billing');
const { getSetting } = require('../config/settingsManager');
const fs = require('fs');
const path = require('path');

// GET: List User PPPoE - From RADIUS Database
router.get('/mikrotik', adminAuth, async (req, res) => {
  try {
    const useRadius = getSetting('user_auth_mode', 'mikrotik') === 'radius';
    let users = [];
    
    if (useRadius) {
      // Get users from RADIUS database
      const radiusUsers = await radiusDb.getAllRadiusUsers();
      const customers = await billing.getAllCustomers();
      const activeSessions = await radiusDb.getActiveSessions();
      
      // Map RADIUS users with customer data and session info
      users = radiusUsers.map(user => {
        const customer = customers.find(c => c.username === user.username);
        const session = activeSessions.find(s => s.username === user.username);
        
        return {
          '.id': user.username,
          name: user.username,
          password: user.password,
          profile: customer?.package_name || 'N/A',
          service: 'pppoe',
          caller_id: session?.callingstationid || '',
          address: session?.framedipaddress || customer?.static_ip || '',
          uptime: session?.acctsessiontime ? formatUptime(session.acctsessiontime) : 'offline',
          encoding: '',
          disabled: customer?.isolir_status === 'isolated' ? 'true' : 'false',
          comment: customer?.name || '',
          last_logged_out: session?.acctstoptime || '',
          // Additional info
          customerName: customer?.name || '',
          customerPhone: customer?.phone || '',
          packageSpeed: customer?.package_speed || '',
          sessionActive: !!session,
          sessionStartTime: session?.acctstarttime || '',
          inputOctets: session?.acctinputoctets || 0,
          outputOctets: session?.acctoutputoctets || 0
        };
      });
    } else {
      // Get users from Mikrotik (original behavior)
      users = await getPPPoEUsers();
    }
    
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    res.render('adminMikrotik', { users, settings, useRadius });
  } catch (err) {
    console.error('Error getting PPPoE users:', err);
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    const useRadius = getSetting('user_auth_mode', 'mikrotik') === 'radius';
    res.render('adminMikrotik', { users: [], error: 'Gagal mengambil data user PPPoE.', settings, useRadius });
  }
});

// Helper function to format uptime
function formatUptime(seconds) {
  if (!seconds || seconds === 0) return 'offline';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  let result = '';
  if (days > 0) result += `${days}d `;
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0) result += `${minutes}m `;
  if (secs > 0 || result === '') result += `${secs}s`;
  
  return result.trim();
}

// POST: Tambah User PPPoE
router.post('/mikrotik/add-user', adminAuth, async (req, res) => {
  try {
    const { username, password, profile } = req.body;
    await addPPPoEUser({ username, password, profile });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST: Edit User PPPoE
router.post('/mikrotik/edit-user', adminAuth, async (req, res) => {
  try {
    const { id, username, password, profile } = req.body;
    await editPPPoEUser({ id, username, password, profile });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST: Hapus User PPPoE
router.post('/mikrotik/delete-user', adminAuth, async (req, res) => {
  try {
    const { id } = req.body;
    await deletePPPoEUser(id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET: List Profile PPPoE
router.get('/mikrotik/profiles', adminAuth, async (req, res) => {
  try {
    const useRadius = getSetting('user_auth_mode', 'mikrotik') === 'radius';
    const result = await getPPPoEProfiles();
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    if (result.success) {
      res.render('adminMikrotikProfiles', { profiles: result.data, settings, useRadius });
    } else {
      res.render('adminMikrotikProfiles', { profiles: [], error: useRadius ? null : result.message, settings, useRadius });
    }
  } catch (err) {
    const useRadius = getSetting('user_auth_mode', 'mikrotik') === 'radius';
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    res.render('adminMikrotikProfiles', { profiles: [], error: useRadius ? null : 'Gagal mengambil data profile PPPoE.', settings, useRadius });
  }
});

// GET: API Daftar Profile PPPoE (untuk dropdown)
router.get('/mikrotik/profiles/api', adminAuth, async (req, res) => {
  try {
    const result = await getPPPoEProfiles();
    if (result.success) {
      res.json({ success: true, profiles: result.data });
    } else {
      res.json({ success: false, profiles: [], message: result.message });
    }
  } catch (err) {
    res.json({ success: false, profiles: [], message: err.message });
  }
});

// GET: API Detail Profile PPPoE
router.get('/mikrotik/profile/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getPPPoEProfileDetail(id);
    if (result.success) {
      res.json({ success: true, profile: result.data });
    } else {
      res.json({ success: false, profile: null, message: result.message });
    }
  } catch (err) {
    res.json({ success: false, profile: null, message: err.message });
  }
});

// POST: Tambah Profile PPPoE
router.post('/mikrotik/add-profile', adminAuth, async (req, res) => {
  try {
    const result = await addPPPoEProfile(req.body);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: result.message });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST: Edit Profile PPPoE
router.post('/mikrotik/edit-profile', adminAuth, async (req, res) => {
  try {
    const result = await editPPPoEProfile(req.body);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: result.message });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST: Hapus Profile PPPoE
router.post('/mikrotik/delete-profile', adminAuth, async (req, res) => {
  try {
    const { id } = req.body;
    const result = await deletePPPoEProfile(id);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: result.message });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET: List Profile Hotspot
router.get('/mikrotik/hotspot-profiles', adminAuth, async (req, res) => {
  try {
    const useRadius = getSetting('user_auth_mode', 'mikrotik') === 'radius';
    const result = await getHotspotProfiles();
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    if (result.success) {
      res.render('adminMikrotikHotspotProfiles', { profiles: result.data, settings, useRadius });
    } else {
      res.render('adminMikrotikHotspotProfiles', { profiles: [], error: useRadius ? null : result.message, settings, useRadius });
    }
  } catch (err) {
    const useRadius = getSetting('user_auth_mode', 'mikrotik') === 'radius';
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    res.render('adminMikrotikHotspotProfiles', { profiles: [], error: useRadius ? null : 'Gagal mengambil data profile Hotspot.', settings, useRadius });
  }
});

// GET: API Daftar Profile Hotspot
router.get('/mikrotik/hotspot-profiles/api', adminAuth, async (req, res) => {
  try {
    const useRadius = getSetting('user_auth_mode', 'mikrotik') === 'radius';
    
    // Return empty array if in RADIUS mode
    if (useRadius) {
      return res.json({ success: true, profiles: [], message: 'RADIUS mode - profiles not available from MikroTik' });
    }
    
    const result = await getHotspotProfiles();
    if (result.success) {
      res.json({ success: true, profiles: result.data });
    } else {
      res.json({ success: false, profiles: [], message: result.message });
    }
  } catch (err) {
    const useRadius = getSetting('user_auth_mode', 'mikrotik') === 'radius';
    res.json({ success: false, profiles: [], message: useRadius ? 'RADIUS mode - profiles not available' : err.message });
  }
});

// GET: API Detail Profile Hotspot
router.get('/mikrotik/hotspot-profiles/detail/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getHotspotProfileDetail(id);
    if (result.success) {
      res.json({ success: true, profile: result.data });
    } else {
      res.json({ success: false, profile: null, message: result.message });
    }
  } catch (err) {
    res.json({ success: false, profile: null, message: err.message });
  }
});

// POST: Tambah Profile Hotspot
router.post('/mikrotik/hotspot-profiles/add', adminAuth, async (req, res) => {
  try {
    const result = await addHotspotProfile(req.body);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: result.message });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST: Edit Profile Hotspot
router.post('/mikrotik/hotspot-profiles/edit', adminAuth, async (req, res) => {
  try {
    const result = await editHotspotProfile(req.body);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: result.message });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST: Hapus Profile Hotspot
router.post('/mikrotik/hotspot-profiles/delete', adminAuth, async (req, res) => {
  try {
    const { id } = req.body;
    const result = await deleteHotspotProfile(id);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: result.message });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST: Putuskan sesi PPPoE user
router.post('/mikrotik/disconnect-session', adminAuth, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.json({ success: false, message: 'Username tidak boleh kosong' });
    const result = await kickPPPoEUser(username);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET: Get PPPoE user statistics
router.get('/mikrotik/user-stats', adminAuth, async (req, res) => {
  try {
    const users = await getPPPoEUsers();
    const totalUsers = Array.isArray(users) ? users.length : (users ? 1 : 0);
    const activeUsers = Array.isArray(users) ? users.filter(u => u.active).length : (users && users.active ? 1 : 0);
    const offlineUsers = totalUsers - activeUsers;
    
    res.json({ 
      success: true, 
      totalUsers, 
      activeUsers, 
      offlineUsers 
    });
  } catch (err) {
    console.error('Error getting PPPoE user stats:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message,
      totalUsers: 0,
      activeUsers: 0,
      offlineUsers: 0
    });
  }
});

// GET: Get active PPPoE connections
router.get('/mikrotik/pppoe-active', adminAuth, async (req, res) => {
  try {
    const { getActivePPPoEConnections } = require('../config/mikrotik');
    const result = await getActivePPPoEConnections();
    
    if (result && result.success) {
      res.json({ 
        success: true, 
        activeUsers: result.data || []
      });
    } else {
      res.json({ 
        success: false, 
        message: result?.message || 'Gagal mendapatkan data PPPoE',
        activeUsers: []
      });
    }
  } catch (err) {
    console.error('Error getting active PPPoE connections:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message,
      activeUsers: []
    });
  }
});

// POST: Restart Mikrotik
router.post('/mikrotik/restart', adminAuth, async (req, res) => {
  try {
    const { restartRouter } = require('../config/mikrotik');
    const result = await restartRouter();
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.json({ success: false, message: result.message });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET: Get PPPoE Users from RADIUS (API endpoint)
router.get('/mikrotik/pppoe-users-radius', adminAuth, async (req, res) => {
  try {
    const radiusUsers = await radiusDb.getAllRadiusUsers();
    const customers = await billing.getAllCustomers();
    const activeSessions = await radiusDb.getActiveSessions();
    
    // Map RADIUS users with customer data and session info
    const users = radiusUsers.map(user => {
      const customer = customers.find(c => c.username === user.username);
      const session = activeSessions.find(s => s.username === user.username);
      
      return {
        username: user.username,
        password: user.password,
        created_at: user.created_at,
        updated_at: user.updated_at,
        customer: customer ? {
          name: customer.name,
          phone: customer.phone,
          package_name: customer.package_name,
          package_speed: customer.package_speed,
          static_ip: customer.static_ip,
          isolir_status: customer.isolir_status
        } : null,
        session: session ? {
          sessionId: session.acctsessionid,
          nasIp: session.nasipaddress,
          framedIp: session.framedipaddress,
          startTime: session.acctstarttime,
          sessionTime: session.acctsessiontime,
          inputOctets: session.acctinputoctets,
          outputOctets: session.acctoutputoctets,
          callingStationId: session.callingstationid
        } : null,
        isActive: !!session,
        isIsolated: customer?.isolir_status === 'isolated'
      };
    });
    
    res.json({
      success: true,
      users: users,
      total: users.length,
      active: users.filter(u => u.isActive).length,
      isolated: users.filter(u => u.isIsolated).length
    });
  } catch (err) {
    console.error('Error getting RADIUS users:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal mengambil data user RADIUS',
      error: err.message 
    });
  }
});

// POST: Sync Customer to RADIUS
router.post('/mikrotik/sync-to-radius', adminAuth, async (req, res) => {
  try {
    const { username } = req.body;
    
    if (username) {
      // Sync single customer
      const customers = await billing.getAllCustomers();
      const customer = customers.find(c => c.username === username);
      
      if (!customer) {
        return res.json({ success: false, message: 'Customer tidak ditemukan' });
      }
      
      const success = await radiusSync.syncCustomerToRadius(customer);
      
      if (success) {
        res.json({ success: true, message: `Customer ${username} berhasil di-sync ke RADIUS` });
      } else {
        res.json({ success: false, message: 'Gagal sync customer ke RADIUS' });
      }
    } else {
      // Sync all customers
      const result = await radiusSync.syncCustomersToRadius();
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: `Sync selesai: ${result.synced} synced, ${result.errors} errors`,
          synced: result.synced,
          errors: result.errors,
          total: result.total
        });
      } else {
        res.json({ success: false, message: 'Gagal sync customers ke RADIUS' });
      }
    }
  } catch (err) {
    console.error('Error syncing to RADIUS:', err);
    res.json({ success: false, message: err.message });
  }
});

// POST: Delete User from RADIUS
router.post('/mikrotik/delete-radius-user', adminAuth, async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.json({ success: false, message: 'Username diperlukan' });
    }
    
    const success = await radiusSync.removeCustomerFromRadius(username);
    
    if (success) {
      res.json({ success: true, message: `User ${username} berhasil dihapus dari RADIUS` });
    } else {
      res.json({ success: false, message: 'Gagal menghapus user dari RADIUS' });
    }
  } catch (err) {
    console.error('Error deleting RADIUS user:', err);
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;
