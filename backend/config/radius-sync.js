const { logger } = require('./logger');
const radiusDb = require('./radius-postgres');
const billing = require('./billing');

/**
 * Sync customer data dari billing system ke RADIUS database
 * Fungsi ini akan membuat/update user RADIUS berdasarkan data pelanggan
 */
async function syncCustomersToRadius() {
  try {
    logger.info('🔄 Starting customer sync to RADIUS...');
    
    const customers = await billing.getAllCustomers();
    let syncCount = 0;
    let errorCount = 0;
    
    for (const customer of customers) {
      try {
        // Gunakan kredensial PPPoE bila tersedia; fallback ke username/password umum
        const uname = customer.pppoe_username || customer.username;
        const pwd = customer.pppoe_password || customer.password;
        // Skip jika customer tidak memiliki username atau password
        if (!uname || !pwd) {
          logger.warn(`⚠️  Skipping customer ${customer.name}: missing PPPoE/portal username or password`);
          continue;
        }
        
        // Tentukan group berdasarkan status
        let groupName;
        if (customer.status === 'suspended') {
          // Suspended customer masuk group ISOLIR
          groupName = 'ISOLIR';
        } else if (!customer.status || customer.status === 'pending' || customer.status === 'waiting') {
          // No status, pending, waiting → should NOT have active RADIUS
          groupName = 'ISOLIR';
        } else {
          // Active customer gunakan package group
          groupName = customer.package_group || 'default';
        }

        // Upsert user ke RADIUS dengan group yang sesuai
        const success = await radiusDb.upsertRadiusUser(
          uname,
          pwd,
          groupName
        );

        if (success) {
          syncCount++;
          
          // Set reply attributes jika ada package_speed
          if (customer.package_speed) {
            // Parse speed (contoh: "10 Mbps" -> 10000000)
            const speedMatch = customer.package_speed.match(/(\d+)\s*(Mbps|Kbps|Gbps)/i);
            if (speedMatch) {
              const speedValue = parseInt(speedMatch[1]);
              const speedUnit = speedMatch[2].toLowerCase();
              
              let speedInBps = speedValue;
              if (speedUnit === 'kbps') {
                speedInBps = speedValue * 1000;
              } else if (speedUnit === 'mbps') {
                speedInBps = speedValue * 1000000;
              } else if (speedUnit === 'gbps') {
                speedInBps = speedValue * 1000000000;
              }
              
              // Set Mikrotik rate limit attributes
              await radiusDb.setRadiusReplyAttribute(
                uname,
                'Mikrotik-Rate-Limit',
                `${speedInBps}/${speedInBps}`
              );
            }
          }
          
          // Set Framed-IP-Address jika ada static IP
          if (customer.static_ip) {
            await radiusDb.setRadiusReplyAttribute(
              uname,
              'Framed-IP-Address',
              customer.static_ip
            );
          }
          
          // Set session timeout jika ada
          if (customer.session_timeout) {
            await radiusDb.setRadiusReplyAttribute(
              uname,
              'Session-Timeout',
              customer.session_timeout.toString()
            );
          }
        } else {
          errorCount++;
        }
      } catch (error) {
        const uname = customer?.pppoe_username || customer?.username || '-';
        logger.error(`Error syncing customer ${uname}: ${error.message}`);
        errorCount++;
      }
    }
    
    logger.info(`✅ Customer sync completed: ${syncCount} synced, ${errorCount} errors`);
    
    // Cleanup orphaned RADIUS users (users in RADIUS but not in active customer database)
    let orphansDeleted = 0;
    try {
      logger.info('🔍 Checking for orphaned RADIUS users...');
      const radiusUsers = await radiusDb.getAllRadiusUsers();
      
      // Build list of active customer usernames with PPPoE credentials
      const activeUsernames = customers
        .filter(c => c.isolir_status !== 'isolated')
        .map(c => c.pppoe_username || c.username)
        .filter(Boolean); // Remove undefined/null values
      
      for (const radiusUser of radiusUsers) {
        // If RADIUS user not found in active customers, delete
        if (!activeUsernames.includes(radiusUser.username)) {
          logger.info(`🗑️  Removing orphaned RADIUS user: ${radiusUser.username}`);
          const deleted = await radiusDb.deleteRadiusUser(radiusUser.username);
          if (deleted) {
            orphansDeleted++;
          }
        }
      }
      
      if (orphansDeleted > 0) {
        logger.info(`✅ Orphan cleanup completed: ${orphansDeleted} users removed`);
      } else {
        logger.info('✅ No orphaned RADIUS users found');
      }
    } catch (cleanupError) {
      logger.error(`Error cleaning up orphaned RADIUS users: ${cleanupError.message}`);
    }
    
    return {
      success: true,
      synced: syncCount,
      errors: errorCount,
      orphansDeleted: orphansDeleted,
      total: customers.length
    };
  } catch (error) {
    logger.error(`Error syncing customers to RADIUS: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sync single customer ke RADIUS
 */
async function syncCustomerToRadius(customerData) {
  try {
    // Prioritaskan PPPoE kredensial bila ada
    const uname = customerData.pppoe_username || customerData.username;
    const pwd = customerData.pppoe_password || customerData.password;
    if (!uname || !pwd) {
      logger.warn('Cannot sync customer: missing PPPoE/portal username or password');
      return false;
    }

    // Skip jika customer di-isolir
    if (customerData.isolir_status === 'isolated') {
      logger.info(`Removing isolated customer from RADIUS: ${uname}`);
      await radiusDb.deleteRadiusUser(uname);
      return true;
    }

    // Tentukan group berdasarkan status dan package
    let groupName;
    if (customerData.status === 'suspended') {
      groupName = 'ISOLIR';
    } else if (!customerData.status || customerData.status === 'pending' || customerData.status === 'waiting') {
      // No status, pending or waiting → should NOT have active RADIUS access
      groupName = 'ISOLIR';
    } else {
      // Gunakan package_group atau default ke UPTO-10M
      groupName = customerData.package_group || 'UPTO-10M';
    }

    // Upsert user ke RADIUS dengan group yang sesuai
    const success = await radiusDb.upsertRadiusUser(uname, pwd, groupName);
    
    if (success) {
      // Set reply attributes
      if (customerData.package_speed) {
        const speedMatch = customerData.package_speed.match(/(\d+)\s*(Mbps|Kbps|Gbps)/i);
        if (speedMatch) {
          const speedValue = parseInt(speedMatch[1]);
          const speedUnit = speedMatch[2].toLowerCase();
          
          let speedInBps = speedValue;
          if (speedUnit === 'kbps') {
            speedInBps = speedValue * 1000;
          } else if (speedUnit === 'mbps') {
            speedInBps = speedValue * 1000000;
          } else if (speedUnit === 'gbps') {
            speedInBps = speedValue * 1000000000;
          }
          
          await radiusDb.setRadiusReplyAttribute(
            uname,
            'Mikrotik-Rate-Limit',
            `${speedInBps}/${speedInBps}`
          );
        }
      }
      
      if (customerData.static_ip) {
        await radiusDb.setRadiusReplyAttribute(
          uname,
          'Framed-IP-Address',
          customerData.static_ip
        );
      }
      
      if (customerData.session_timeout) {
        await radiusDb.setRadiusReplyAttribute(
          uname,
          'Session-Timeout',
          customerData.session_timeout.toString()
        );
      }
      
      logger.info(`✅ Customer synced to RADIUS: ${uname}`);
    }
    
    return success;
  } catch (error) {
    logger.error(`Error syncing customer to RADIUS: ${error.message}`);
    return false;
  }
}

/**
 * Remove customer dari RADIUS
 */
async function removeCustomerFromRadius(username) {
  try {
    const success = await radiusDb.deleteRadiusUser(username);
    if (success) {
      logger.info(`✅ Customer removed from RADIUS: ${username}`);
    }
    return success;
  } catch (error) {
    logger.error(`Error removing customer from RADIUS: ${error.message}`);
    return false;
  }
}

/**
 * Update customer status di RADIUS (isolir/aktivasi)
 */
async function updateCustomerRadiusStatus(username, isActive) {
  try {
    if (isActive) {
      // Cari customer data dan sync
      const customers = await billing.getAllCustomers();
      const customer = customers.find(c => c.username === username);
      
      if (customer) {
        return await syncCustomerToRadius(customer);
      } else {
        logger.warn(`Customer not found: ${username}`);
        return false;
      }
    } else {
      // Remove dari RADIUS
      return await removeCustomerFromRadius(username);
    }
  } catch (error) {
    logger.error(`Error updating customer RADIUS status: ${error.message}`);
    return false;
  }
}

/**
 * Get sync status - membandingkan customer di billing vs RADIUS
 */
async function getSyncStatus() {
  try {
    const customers = await billing.getAllCustomers();
    const radiusUsers = await radiusDb.getAllRadiusUsers();
    
    const customersWithAuth = customers.filter(c => c.username && c.password);
    const activeCustomers = customersWithAuth.filter(c => c.isolir_status !== 'isolated');
    
    const radiusUsernames = radiusUsers.map(u => u.username);
    const customerUsernames = activeCustomers.map(c => c.username);
    
    // Customers yang ada di billing tapi tidak di RADIUS
    const notInRadius = customerUsernames.filter(u => !radiusUsernames.includes(u));
    
    // Users yang ada di RADIUS tapi tidak di billing
    const notInBilling = radiusUsernames.filter(u => !customerUsernames.includes(u));
    
    // Users yang ada di kedua sistem
    const inSync = radiusUsernames.filter(u => customerUsernames.includes(u));
    
    return {
      totalCustomers: customers.length,
      customersWithAuth: customersWithAuth.length,
      activeCustomers: activeCustomers.length,
      radiusUsers: radiusUsers.length,
      inSync: inSync.length,
      notInRadius: notInRadius,
      notInBilling: notInBilling,
      syncPercentage: activeCustomers.length > 0 
        ? Math.round((inSync.length / activeCustomers.length) * 100) 
        : 0
    };
  } catch (error) {
    logger.error(`Error getting sync status: ${error.message}`);
    return null;
  }
}

/**
 * Auto sync - dipanggil secara periodik
 */
async function autoSync() {
  try {
    logger.info('🔄 Running auto-sync...');
    const result = await syncCustomersToRadius();
    logger.info(`✅ Auto-sync completed: ${result.synced} synced, ${result.errors} errors`);
    return result;
  } catch (error) {
    logger.error(`Error in auto-sync: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Sync packages ke RADIUS sebagai groups dengan bandwidth attributes
 */
async function syncPackagesToRadius() {
  try {
    logger.info('🔄 Starting packages sync to RADIUS...');
    
    const packages = await billing.getAllPackages();
    let syncCount = 0;
    let errorCount = 0;
    
    for (const pkg of packages) {
      try {
        // Skip inactive packages
        if (pkg.status !== 'active') {
          logger.info(`⏭️  Skipping inactive package: ${pkg.name}`);
          continue;
        }
        
        const groupName = `package_${pkg.id}`;
        
        // Parse speed (contoh: "10 Mbps" -> 10000000 bps)
        let speedInBps = 0;
        if (pkg.speed) {
          const speedMatch = pkg.speed.match(/(\d+)\s*(Mbps|Kbps|Gbps)/i);
          if (speedMatch) {
            const speedValue = parseInt(speedMatch[1]);
            const speedUnit = speedMatch[2].toLowerCase();
            
            if (speedUnit === 'kbps') {
              speedInBps = speedValue * 1000;
            } else if (speedUnit === 'mbps') {
              speedInBps = speedValue * 1000000;
            } else if (speedUnit === 'gbps') {
              speedInBps = speedValue * 1000000000;
            }
          }
        }
        
        // Upsert group dengan Mikrotik-Rate-Limit attribute
        if (speedInBps > 0) {
          await radiusDb.setRadiusGroupReplyAttribute(
            groupName,
            'Mikrotik-Rate-Limit',
            `${speedInBps}/${speedInBps}`
          );
          syncCount++;
          logger.info(`✅ Package synced to RADIUS group: ${pkg.name} -> ${groupName} (${pkg.speed})`);
        } else {
          logger.warn(`⚠️  Package ${pkg.name} has no valid speed, skipping`);
        }
      } catch (error) {
        logger.error(`Error syncing package ${pkg.name}: ${error.message}`);
        errorCount++;
      }
    }
    
    logger.info(`✅ Packages sync completed: ${syncCount} synced, ${errorCount} errors`);
    
    return {
      success: true,
      synced: syncCount,
      errors: errorCount,
      total: packages.length
    };
  } catch (error) {
    logger.error(`Error syncing packages to RADIUS: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sync single package ke RADIUS group
 */
async function syncPackageToRadius(packageData) {
  try {
    // Skip inactive packages
    if (!packageData.is_active) {
      logger.info(`Skipping inactive package: ${packageData.name}`);
      return false;
    }
    
    // Use package's group if specified, otherwise fallback to package_ID
    const groupName = packageData.group || `package_${packageData.id}`;
    
    // Determine rate limit source
    let rateLimitValue = null;
    
    // Priority 1: Use rate_limit from package if specified
    if (packageData.rate_limit) {
      rateLimitValue = packageData.rate_limit;
      logger.info(`Using rate limit from package: ${rateLimitValue}`);
    } else {
      // Priority 2: Parse speed and convert to rate limit format
      if (packageData.speed) {
        const speedMatch = packageData.speed.match(/(\d+)\s*(Mbps|Kbps|Gbps)/i);
        if (speedMatch) {
          const speedValue = parseInt(speedMatch[1]);
          const speedUnit = speedMatch[2].toLowerCase();
          
          let speedInBps = 0;
          if (speedUnit === 'kbps') {
            speedInBps = speedValue * 1000;
          } else if (speedUnit === 'mbps') {
            speedInBps = speedValue * 1000000;
          } else if (speedUnit === 'gbps') {
            speedInBps = speedValue * 1000000000;
          }
          
          if (speedInBps > 0) {
            rateLimitValue = `${speedInBps}/${speedInBps}`;
          }
        }
      }
    }
    
    // Set group reply attribute if rate limit is defined
    if (rateLimitValue) {
      await radiusDb.setRadiusGroupReplyAttribute(
        groupName,
        'Mikrotik-Rate-Limit',
        rateLimitValue
      );
      logger.info(`✅ Package synced to RADIUS: ${packageData.name} -> ${groupName} (${rateLimitValue})`);
      return true;
    } else {
      // No rate limit - MikroTik PPPoE profile will handle it
      logger.info(`✅ Package synced to RADIUS: ${packageData.name} -> ${groupName} (No rate limit, using PPPoE profile)`);
      // Create empty group for user assignment
      await radiusDb.setRadiusGroupReplyAttribute(groupName, 'Service-Type', 'Framed-User');
      return true;
    }
  } catch (error) {
    logger.error(`Error syncing package to RADIUS: ${error.message}`);
    return false;
  }
}

/**
 * Remove package dari RADIUS groups
 */
async function removePackageFromRadius(packageId) {
  try {
    const groupName = `package_${packageId}`;
    const success = await radiusDb.deleteRadiusGroup(groupName);
    if (success) {
      logger.info(`✅ Package group removed from RADIUS: ${groupName}`);
    }
    return success;
  } catch (error) {
    logger.error(`Error removing package from RADIUS: ${error.message}`);
    return false;
  }
}

/**
 * Voucher Support Functions
 * These functions handle RADIUS entries for hotspot vouchers
 */

/**
 * Add entry to radcheck for voucher authentication
 */
async function addVoucherRadCheck({ username, attribute, op, value }) {
  try {
    await radiusDb.query(`
      INSERT INTO radcheck (username, attribute, op, value)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username, attribute, op, value) DO UPDATE SET value = EXCLUDED.value
    `, [username, attribute, op, value]);
    logger.debug(`✅ RADIUS radcheck added for voucher: ${username}`);
    return true;
  } catch (error) {
    logger.error(`Error adding radcheck for voucher ${username}: ${error.message}`);
    return false;
  }
}

/**
 * Add entry to radreply for voucher attributes (rate limit, session timeout)
 */
async function addVoucherRadReply({ username, attribute, op, value }) {
  try {
    // Delete existing entry if any, then insert (upsert without unique constraint)
    await radiusDb.query(
      'DELETE FROM radreply WHERE username = $1 AND attribute = $2',
      [username, attribute]
    );
    await radiusDb.query(
      'INSERT INTO radreply (username, attribute, op, value) VALUES ($1, $2, $3, $4)',
      [username, attribute, op, value]
    );
    logger.debug(`✅ RADIUS radreply added for voucher: ${username} - ${attribute}: ${value}`);
    return true;
  } catch (error) {
    logger.error(`Error adding radreply for voucher ${username}: ${error.message}`);
    return false;
  }
}

/**
 * Add voucher user to RADIUS group
 */
async function addVoucherToGroup({ username, groupname }) {
  try {
    await radiusDb.query(`
      INSERT INTO radusergroup (username, groupname, priority)
      VALUES ($1, $2, 1)
      ON CONFLICT (username, groupname) DO NOTHING
    `, [username, groupname]);
    logger.debug(`✅ Voucher ${username} added to group: ${groupname}`);
    return true;
  } catch (error) {
    logger.error(`Error adding voucher to group: ${error.message}`);
    return false;
  }
}

/**
 * Delete voucher user from RADIUS (cleanup)
 */
async function deleteVoucherUser(username) {
  try {
    await radiusDb.query('DELETE FROM radcheck WHERE username = $1', [username]);
    await radiusDb.query('DELETE FROM radreply WHERE username = $1', [username]);
    await radiusDb.query('DELETE FROM radusergroup WHERE username = $1', [username]);
    logger.info(`✅ Voucher user deleted from RADIUS: ${username}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting voucher user from RADIUS: ${error.message}`);
    return false;
  }
}

/**
 * Create complete RADIUS entries for hotspot voucher
 * This creates all necessary entries for voucher authentication
 */
async function createVoucherRadiusEntries(voucher) {
  try {
    const { username, password, speed_limit, duration_hours, mikrotik_profile = 'HOTSPOT_DEFAULT' } = voucher;

    // 1. Add authentication (username/password)
    await addVoucherRadCheck({
      username,
      attribute: 'Cleartext-Password',
      op: ':=',
      value: password
    });

    // 2. Set Auth-Type to Accept
    await addVoucherRadCheck({
      username,
      attribute: 'Auth-Type',
      op: ':=',
      value: 'Accept'
    });

    // 3. Set rate limit if specified
    if (speed_limit) {
      // Parse speed_limit like "10M/10M" or "10M/5M"
      await addVoucherRadReply({
        username,
        attribute: 'Mikrotik-Rate-Limit',
        op: ':=',
        value: speed_limit
      });
    }

    // 4. Set session timeout (use provided session_timeout or calculate from duration_hours)
    const sessionTimeout = voucher.session_timeout || (duration_hours * 3600);
    await addVoucherRadReply({
      username,
      attribute: 'Session-Timeout',
      op: ':=',
      value: sessionTimeout.toString()
    });

    // 5. Add to hotspot group
    await addVoucherToGroup({
      username,
      groupname: mikrotik_profile
    });

    // Convert session timeout to readable format
    const hours = Math.floor(sessionTimeout / 3600);
    const days = Math.floor(hours / 24);
    let durationText = hours > 24 ? `${days} hari` : `${hours} jam`;

    logger.info(`✅ Voucher RADIUS entries created: ${username} (${durationText}, ${speed_limit})`);
    return true;
  } catch (error) {
    logger.error(`Error creating voucher RADIUS entries: ${error.message}`);
    return false;
  }
}

module.exports = {
  syncCustomersToRadius,
  syncCustomerToRadius,
  removeCustomerFromRadius,
  updateCustomerRadiusStatus,
  getSyncStatus,
  autoSync,
  syncPackagesToRadius,
  syncPackageToRadius,
  removePackageFromRadius,
  // Voucher support
  addVoucherRadCheck,
  addVoucherRadReply,
  addVoucherToGroup,
  deleteVoucherUser,
  createVoucherRadiusEntries
};
