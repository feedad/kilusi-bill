const logger = require('./logger');
const billingManager = require('./billing');
//const { getMikrotikConnection } = require('./mikrotik');
const MikrotikService = require('../services/mikrotik-service');
const { findDeviceByPhoneNumber, findDeviceByPPPoE, setParameterValues } = require('./genieacs');
const { getSetting } = require('./settingsManager');
const staticIPSuspension = require('./staticIPSuspension');

class ServiceSuspensionManager {
    constructor() {
        this.isRunning = false;
    }

    /**
     * Pastikan profile isolir (berdasarkan setting) tersedia di Mikrotik jika perlu
     * Hanya auto-create bila nama profil = 'isolir'
     */
    async ensureIsolirProfile() {
        return MikrotikService.ensureIsolirProfile();
    }

    /**
     * Suspend layanan pelanggan (blokir internet)
     * Mendukung PPPoE dan IP statik
     */
    async suspendCustomerService(customer, reason = 'Telat bayar') {
        try {
            logger.info(`Suspending service for customer: ${customer.username} (${reason})`);

            const results = {
                mikrotik: false,
                genieacs: false,
                billing: false,
                suspension_type: null
            };

            // Tentukan tipe koneksi pelanggan
            const hasPPPoE = customer.pppoe_username && customer.pppoe_username.trim();
            const hasStaticIP = customer.static_ip || customer.ip_address || customer.assigned_ip;
            const hasMacAddress = customer.mac_address;

            // 1. Prioritas suspend PPPoE jika tersedia
            if (hasPPPoE) {
                results.suspension_type = 'pppoe';
                try {
                    // Tentukan profile isolir dari setting
                    const selectedProfile = getSetting('isolir_profile', 'isolir');
                    // Pastikan profile isolir ada (auto-create hanya jika 'isolir')
                    await this.ensureIsolirProfile();

                    // Update PPPoE user dengan profile isolir
                    await MikrotikService.setPPPoESecretProfile(customer.pppoe_username, selectedProfile, `SUSPENDED - ${reason}`);
                    logger.info(`Mikrotik: Set profile to '${selectedProfile}' for ${customer.pppoe_username}`);

                    // Update RADIUS group to ISOLIR directly in the database
                    const { query } = require('./database');
                    const baseUsername = customer.pppoe_username.split('@')[0];
                    await query(`DELETE FROM radusergroup WHERE username LIKE $1`, [`${baseUsername}%`]);
                    await query(`
                        INSERT INTO radusergroup (username, groupname, priority)
                        VALUES ($1, 'ISOLIR', 1)
                    `, [customer.pppoe_username]);
                    logger.info(`RADIUS: Updated ${customer.pppoe_username} to ISOLIR group in suspendCustomerService`);

                    // Disconnect active session via MikrotikService disconnectRadiusUser (CoA)
                    try {
                        await MikrotikService.disconnectRadiusUser(customer.pppoe_username);
                        logger.info(`Mikrotik: Disconnected session via CoA for ${customer.pppoe_username}`);
                    } catch (coaErr) {
                        logger.warn(`Mikrotik: CoA disconnect failed, falling back to active session removal: ${coaErr.message}`);
                        await MikrotikService.removeActiveSession(customer.pppoe_username);
                    }

                    results.mikrotik = true;
                    logger.info(`Mikrotik: Successfully suspended PPPoE user ${customer.pppoe_username} with isolir profile`);
                } catch (mikrotikError) {
                    logger.error(`Mikrotik PPPoE suspension failed for ${customer.username}:`, mikrotikError.message);
                }
            }
            // 2. Jika tidak ada PPPoE, coba suspend IP statik
            else if (hasStaticIP || hasMacAddress) {
                    results.suspension_type = 'static_ip';
                    try {
                        // Tentukan metode suspend dari setting (default: address_list)
                        const suspensionMethod = getSetting('static_ip_suspension_method', 'address_list');

                        const staticResult = await staticIPSuspension.suspendStaticIPCustomer(
                            customer,
                            reason,
                            suspensionMethod
                        );

                        if (staticResult.success) {
                            results.mikrotik = true;
                            results.static_ip_method = staticResult.results?.method_used;
                            logger.info(`Static IP suspension successful for ${customer.username} using ${staticResult.results?.method_used}`);
                        } else {
                            logger.error(`Static IP suspension failed for ${customer.username}: ${staticResult.error}`);
                        }
                    } catch (staticIPError) {
                        logger.error(`Static IP suspension failed for ${customer.username}:`, staticIPError.message);
                    }
                }
                // 3. Jika tidak ada PPPoE atau IP statik, coba cari device untuk suspend WAN
                else {
                    results.suspension_type = 'wan_disable';
                    logger.warn(`Customer ${customer.username} has no PPPoE username or static IP, trying WAN disable method`);
                }

                // 2. Suspend via GenieACS (disable WAN connection)
                if (customer.phone || customer.pppoe_username) {
                    try {
                        let device = null;

                        // Coba cari device by phone number dulu
                        if (customer.phone) {
                            try {
                                device = await findDeviceByPhoneNumber(customer.phone);
                            } catch (phoneError) {
                                logger.warn(`Device not found by phone ${customer.phone}, trying PPPoE...`);
                            }
                        }

                        // Jika tidak ketemu, coba by PPPoE username
                        if (!device && customer.pppoe_username) {
                            try {
                                device = await findDeviceByPPPoE(customer.pppoe_username);
                            } catch (pppoeError) {
                                logger.warn(`Device not found by PPPoE ${customer.pppoe_username}`);
                            }
                        }

                        if (device) {
                            // Disable WAN connection di modem
                            const parameters = [
                                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Enable", false, "xsd:boolean"],
                                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable", false, "xsd:boolean"]
                            ];

                            await setParameterValues(device._id, parameters);
                            results.genieacs = true;
                            logger.info(`GenieACS: Successfully suspended device ${device._id} for customer ${customer.username}`);
                        } else {
                            logger.warn(`GenieACS: No device found for customer ${customer.username}`);
                        }
                    } catch (genieacsError) {
                        logger.error(`GenieACS suspension failed for ${customer.username}:`, genieacsError.message);
                    }
                }

                // 3. Update status di billing database
                try {
                    if (customer.id) {
                        logger.info(`[SUSPEND] Updating billing status by id=${customer.id} to 'suspended' (username=${customer.username || customer.pppoe_username || '-'})`);
                        await billingManager.setCustomerStatusById(customer.id, 'suspended');
                    } else {
                        // Resolve by username first, then phone, to obtain reliable id
                        let resolved = null;
                        if (customer.pppoe_username) {
                            try { resolved = await billingManager.getCustomerByUsername(customer.pppoe_username); } catch (_) { }
                        }
                        if (!resolved && customer.username) {
                            try { resolved = await billingManager.getCustomerByUsername(customer.username); } catch (_) { }
                        }
                        if (!resolved && customer.phone) {
                            try { resolved = await billingManager.getCustomerByPhone(customer.phone); } catch (_) { }
                        }
                        if (resolved && resolved.id) {
                            logger.info(`[SUSPEND] Resolved customer id=${resolved.id} (username=${resolved.pppoe_username || resolved.username || '-'}) → set 'suspended'`);
                            await billingManager.setCustomerStatusById(resolved.id, 'suspended');
                        } else if (customer.phone) {
                            logger.warn(`[SUSPEND] Falling back to update by phone=${customer.phone} (no id resolved)`);
                            await billingManager.updateCustomer(customer.phone, { ...customer, status: 'suspended' });
                        } else {
                            logger.error(`[SUSPEND] Unable to resolve customer identifier for status update`);
                        }
                    }
                } catch (billingError) {
                    logger.error(`Billing update failed for ${customer.username}:`, billingError.message);
                }

                // 4. Send WhatsApp notification (only once)
                try {
                    const { query } = require('./database');
                    const notifCheck = await query(
                        'SELECT suspension_notified_at FROM services WHERE customer_id = $1 AND suspension_notified_at IS NOT NULL LIMIT 1',
                        [customer.id]
                    );
                    if (notifCheck.rows.length > 0) {
                        logger.info(`Suspension notification already sent for ${customer.username} - skipping whatsapp`);
                    } else {
                        const whatsappNotifications = require('./whatsapp-notifications');
                        await whatsappNotifications.sendServiceSuspensionNotification(customer, reason);
                        await query(
                            'UPDATE services SET suspension_notified_at = NOW() WHERE customer_id = $1',
                            [customer.id]
                        );
                        logger.info(`WhatsApp suspension notification sent to ${customer.username}`);
                    }
                } catch (notificationError) {
                    logger.error(`WhatsApp notification failed for ${customer.username}:`, notificationError.message);
                }

                return {
                    success: results.mikrotik || results.genieacs || results.billing,
                    results,
                    customer: customer.username,
                    reason
                };

            } catch (error) {
                logger.error(`Error suspending service for ${customer.username}:`, error);
                throw error;
            }
        }

    /**
     * Restore service by service ID dengan data lengkap
     * Ini adalah fungsi utama untuk restore yang menggunakan RADIUS username yang benar
     */
    async restoreServiceByServiceId(serviceId, serviceData, reason = 'Automatic restore') {
        try {
            const { query } = require('./database');
            const BillingCycleService = require('../config/billing-cycle-service');

            logger.info(`Restoring service for: ${serviceData.name} (${reason})`);

            // Find the actual RADIUS username via service_number prefix match
            const radiusUsernameResult = await query(`
                SELECT username FROM radcheck
                WHERE LOWER(username) LIKE LOWER($1 || '%')
                LIMIT 1
            `, [serviceData.service_number]);

            const radiusUsername = radiusUsernameResult.rows[0]?.username;

            if (!radiusUsername) {
                logger.warn(`No RADIUS user found for service_number ${serviceData.service_number}`);
                return { success: false, message: 'RADIUS user not found' };
            }

            // Get the package group for RADIUS
            const packageGroup = serviceData.package_group || 'UPTO-10M';
            const pppoeProfile = serviceData.pppoe_profile || 'default';

            logger.info(`RADIUS username: ${radiusUsername}, Package group: ${packageGroup}, PPPoE profile: ${pppoeProfile}`);

            // Get billing settings and current service data for reconnection
            const settings = await BillingCycleService.getBillingSettings();
            const method = settings.reconnection_method || 'payment_date';

            const updateFields = { status: 'active' };

            // Get invoice data to check payment date vs due date
            const invoiceData = await query(`
                SELECT due_date, payment_date
                FROM invoices
                WHERE customer_id = (SELECT customer_id FROM services WHERE id = $1)
                  AND status = 'paid'
                ORDER BY payment_date DESC
                LIMIT 1
            `, [serviceId]);

            // Handle reconnection method - recalculate dates if needed
            if (method === 'payment_date') {
                logger.info(`[RESTORE] Reconnection method is 'payment_date'. Calculating active_date based on payment date vs due date.`);

                let newActiveDate;

                if (invoiceData.rows.length > 0) {
                    const invoice = invoiceData.rows[0];
                    const dueDate = new Date(invoice.due_date);
                    const paymentDate = new Date(invoice.payment_date || new Date()); // Use actual payment date or now

                    // LOGIKA:
                    // 1. Jika bayar SEBELUM/SAMA DENGAN due date → active_date = due_date
                    // 2. Jika bayar SETELAH due date → active_date = payment_date

                    if (paymentDate <= dueDate) {
                        // Bayar sebelum atau tepat di due date
                        newActiveDate = dueDate;
                        logger.info(`[RESTORE] Payment on/before due date. active_date set to due_date: ${newActiveDate.toISOString()}`);
                    } else {
                        // Bayar setelah due date
                        newActiveDate = paymentDate;
                        logger.info(`[RESTORE] Payment after due date. active_date set to payment_date: ${newActiveDate.toISOString()}`);
                    }
                } else {
                    // Fallback: use current date
                    newActiveDate = new Date();
                    logger.warn(`[RESTORE] No invoice found, using current date as active_date: ${newActiveDate.toISOString()}`);
                }

                updateFields.active_date = newActiveDate;

                // Get customer billing cycle
                const customerResult = await query(`
                    SELECT siklus, billing_type
                    FROM services
                    WHERE id = $1
                `, [serviceId]);

                if (customerResult.rows.length > 0) {
                    const dbCycle = customerResult.rows[0].siklus || settings.billing_cycle_type;

                    // Map Indonesian billing cycle names to internal types
                    // TETAP = fixed (same day each month)
                    // BULANAN = monthly (fixed day each month)
                    // PROFILE = profile (fixed period from active_date)
                    const cycleMap = {
                        'TETAP': 'fixed',
                        'BULANAN': 'monthly',
                        'PROFILE': 'profile',
                        'tetap': 'fixed',
                        'bulan': 'monthly',
                        'profile': 'profile',
                        'monthly': 'monthly',
                        'fixed': 'fixed'
                    };

                    const cycle = cycleMap[dbCycle] || settings.billing_cycle_type;
                    logger.info(`[RESTORE] Mapped siklus '${dbCycle}' to cycle '${cycle}'`);

                    // Calculate new isolir date
                    if (cycle === 'profile') {
                        const period = settings.profile_default_period;
                        updateFields.isolir_date = await BillingCycleService.calculateProfileIsolirDate(newActiveDate, period);
                        logger.info(`[RESTORE] Profile cycle: isolir_date = active_date + ${period} days`);
                    } else if (cycle === 'monthly') {
                        updateFields.isolir_date = await BillingCycleService.calculateMonthlyIsolirDate(newActiveDate);
                        logger.info(`[RESTORE] Monthly cycle: isolir_date calculated from monthly settings`);
                    } else if (cycle === 'fixed') {
                        const fixedDay = newActiveDate.getDate();
                        updateFields.isolir_date = await BillingCycleService.calculateFixedIsolirDate(newActiveDate, fixedDay);
                        logger.info(`[RESTORE] Fixed cycle: isolir_date calculated from fixed day ${fixedDay}`);
                    }

                    logger.info(`[RESTORE] New active_date: ${newActiveDate.toISOString()}, New isolir_date: ${updateFields.isolir_date?.toISOString() || 'null'}`);
                }
            } else {
                logger.info(`[RESTORE] Reconnection method is 'isolate_date'. Keeping existing dates.`);
            }

            // 1. Update service status and dates
            const setClause = Object.keys(updateFields).map((key, idx) => `${key} = $${idx + 2}`).join(', ');
            await query(`
                UPDATE services
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [serviceId, ...Object.values(updateFields)]);

            // 2. Update RADIUS group to package group (clean ALL entries for this user)
            const baseUsername = radiusUsername.split('@')[0];
            await query(`DELETE FROM radusergroup WHERE username LIKE $1`, [`${baseUsername}%`]);
            await query(`
                INSERT INTO radusergroup (username, groupname, priority)
                VALUES ($1, $2, 1)
            `, [radiusUsername, packageGroup]);
            logger.info(`RADIUS: Updated ${radiusUsername} to ${packageGroup} group`);

            // 3. Update MikroTik PPPoE profile dan kick user via CoA
            try {
                // Force CoA disconnect — ensures user reconnects with active profile
                await MikrotikService.disconnectRadiusUser(radiusUsername);
                logger.info(`Mikrotik: Disconnected session via CoA for ${radiusUsername} after restoration`);
            } catch (coaErr) {
                logger.warn(`Mikrotik: CoA disconnect failed for ${radiusUsername}, falling back to session removal: ${coaErr.message}`);
                // Fallback: remove active session from MikroTik tracking
                await MikrotikService.removeActiveSession(radiusUsername);
            }

            logger.info(`✅ Service restored for ${serviceData.name} (${radiusUsername})`);
            return { success: true, message: 'Service restored successfully' };

        } catch (error) {
            logger.error(`Error restoring service for ${serviceData?.name}:`, error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Restore layanan pelanggan (aktifkan kembali internet)
     * Mendukung PPPoE dan IP statik
     * @deprecated Use restoreServiceByServiceId instead
     */
    async restoreCustomerService(customer, reason = 'Manual restore') {
            try {
                logger.info(`Restoring service for customer: ${customer.username} (${reason})`);

                const results = {
                    mikrotik: false,
                    genieacs: false,
                    billing: false,
                    restoration_type: null
                };

                // Tentukan tipe koneksi pelanggan
                const hasPPPoE = customer.pppoe_username && customer.pppoe_username.trim();
                const hasStaticIP = customer.static_ip || customer.ip_address || customer.assigned_ip;
                const hasMacAddress = customer.mac_address;

                // 1. Prioritas restore PPPoE jika tersedia
                if (hasPPPoE) {
                    results.restoration_type = 'pppoe';
                    try {
                        // Ambil profile dari customer atau package, fallback ke default
                        let profileToUse = customer.pppoe_profile;
                        if (!profileToUse) {
                            // Coba ambil dari package
                            const packageData = await billingManager.getPackageById(customer.package_id);
                            profileToUse = packageData?.pppoe_profile || getSetting('default_pppoe_profile', 'default');
                        }

                        // Update PPPoE user dengan profile normal
                        await MikrotikService.setPPPoESecretProfile(customer.pppoe_username, profileToUse, `ACTIVE - ${reason}`);
                        logger.info(`Mikrotik: Restored profile to '${profileToUse}' for ${customer.pppoe_username}`);

                        // Disconnect active session agar client reconnect dengan profile baru
                        await MikrotikService.removeActiveSession(customer.pppoe_username);
                        logger.info(`Mikrotik: Disconnected session for ${customer.pppoe_username} to apply new profile`);

                        results.mikrotik = true;
                        logger.info(`Mikrotik: Successfully restored PPPoE user ${customer.pppoe_username} with ${profileToUse} profile`);
                    } catch (mikrotikError) {
                        logger.error(`Mikrotik PPPoE restoration failed for ${customer.username}:`, mikrotikError.message);
                    }
                }
                // 2. Jika tidak ada PPPoE, coba restore IP statik
            else if (hasStaticIP || hasMacAddress) {
                        results.restoration_type = 'static_ip';
                        try {
                            const staticResult = await staticIPSuspension.restoreStaticIPCustomer(customer, reason);

                            if (staticResult.success) {
                                results.mikrotik = true;
                                results.static_ip_methods = staticResult.results?.methods_tried;
                                logger.info(`Static IP restoration successful for ${customer.username}. Methods: ${staticResult.results?.methods_tried?.join(', ')}`);
                            } else {
                                logger.error(`Static IP restoration failed for ${customer.username}: ${staticResult.error}`);
                            }
                        } catch (staticIPError) {
                            logger.error(`Static IP restoration failed for ${customer.username}:`, staticIPError.message);
                        }
                    }
                    // 3. Jika tidak ada PPPoE atau IP statik, coba enable WAN
                    else {
                        results.restoration_type = 'wan_enable';
                        logger.warn(`Customer ${customer.username} has no PPPoE username or static IP, trying WAN enable method`);
                    }

                    // 2. Restore via GenieACS (enable WAN connection)
                    if (customer.phone || customer.pppoe_username) {
                        try {
                            let device = null;

                            // Coba cari device by phone number dulu
                            if (customer.phone) {
                                try {
                                    device = await findDeviceByPhoneNumber(customer.phone);
                                } catch (phoneError) {
                                    logger.warn(`Device not found by phone ${customer.phone}, trying PPPoE...`);
                                }
                            }

                            // Jika tidak ketemu, coba by PPPoE username
                            if (!device && customer.pppoe_username) {
                                try {
                                    device = await findDeviceByPPPoE(customer.pppoe_username);
                                } catch (pppoeError) {
                                    logger.warn(`Device not found by PPPoE ${customer.pppoe_username}`);
                                }
                            }

                            if (device) {
                                // Enable WAN connection di modem
                                const parameters = [
                                    ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Enable", true, "xsd:boolean"],
                                    ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable", true, "xsd:boolean"]
                                ];

                                await setParameterValues(device._id, parameters);
                                results.genieacs = true;
                                logger.info(`GenieACS: Successfully restored device ${device._id} for customer ${customer.username}`);
                            } else {
                                logger.warn(`GenieACS: No device found for customer ${customer.username}`);
                            }
                        } catch (genieacsError) {
                            logger.error(`GenieACS restoration failed for ${customer.username}:`, genieacsError.message);
                        }
                    }

                    // 3. Update status di billing database
                    try {
                        let customerId = customer.id;

                        // Attempt to resolve ID if missing
                        if (!customerId) {
                            let resolved = null;
                            if (customer.pppoe_username) {
                                try { resolved = await billingManager.getCustomerByUsername(customer.pppoe_username); } catch (_) { }
                            }
                            if (!resolved && customer.username) {
                                try { resolved = await billingManager.getCustomerByUsername(customer.username); } catch (_) { }
                            }
                            if (!resolved && customer.phone) {
                                try { resolved = await billingManager.getCustomerByPhone(customer.phone); } catch (_) { }
                            }
                            if (resolved && resolved.id) {
                                customerId = resolved.id;
                            }
                        }

                        if (customerId) {
                            logger.info(`[RESTORE] Updating billing status by id=${customerId} to 'active'`);

                            // IMPLEMENT RECONNECTION LOGIC
                            // 1. Get reconnection method setting
                            const BillingCycleService = require('../config/billing-cycle-service');
                            const settings = await BillingCycleService.getBillingSettings();
                            const method = settings.reconnection_method || 'payment_date';

                            const updateData = { status: 'active' };

                            if (method === 'payment_date') {
                                // If method is 'payment_date', reset active_date to NOW
                                // and recalculate isolir_date based on billing cycle
                                logger.info(`[RESTORE] Reconnection method is 'payment_date'. Resetting active_date and recalculating isolir.`);

                                const newActiveDate = new Date();
                                updateData.active_date = newActiveDate;

                                // Need to get current customer data to know cycle
                                const currentData = await billingManager.getCustomerById(customerId);
                                const dbCycle = currentData.siklus || settings.billing_cycle_type;

                                // Map Indonesian billing cycle names to internal types
                                const cycleMap = {
                                    'TETAP': 'fixed',
                                    'BULANAN': 'monthly',
                                    'PROFILE': 'profile',
                                    'tetap': 'fixed',
                                    'bulan': 'monthly',
                                    'profile': 'profile',
                                    'monthly': 'monthly',
                                    'fixed': 'fixed'
                                };
                                const cycle = cycleMap[dbCycle] || settings.billing_cycle_type;
                                logger.info(`[RESTORE] Mapped siklus '${dbCycle}' to cycle '${cycle}'`);

                                // Calculate new isolir date
                                if (cycle === 'profile') {
                                    // Need period, fallback to default if not in customer (it should be)
                                    const period = settings.profile_default_period;
                                    updateData.isolir_date = await BillingCycleService.calculateProfileIsolirDate(newActiveDate, period);
                                    logger.info(`[RESTORE] Profile cycle: isolir_date = active_date + ${period} days`);
                                } else if (cycle === 'monthly') {
                                    updateData.isolir_date = await BillingCycleService.calculateMonthlyIsolirDate(newActiveDate);
                                    logger.info(`[RESTORE] Monthly cycle: isolir_date calculated from monthly settings`);
                                } else if (cycle === 'fixed') {
                                    const fixedDay = newActiveDate.getDate();
                                    updateData.isolir_date = await BillingCycleService.calculateFixedIsolirDate(newActiveDate, fixedDay);
                                    logger.info(`[RESTORE] Fixed cycle: isolir_date calculated from fixed day ${fixedDay}`);
                                }

                                logger.info(`[RESTORE] New active_date: ${newActiveDate.toISOString()}, New isolir_date: ${updateData.isolir_date.toISOString()}`);
                            } else {
                                logger.info(`[RESTORE] Reconnection method is 'isolate_date'. Keeping existing dates.`);
                            }

                            // Perform update
                            // Use updateCustomer helper if available or specific status update
                            // billingManager.setCustomerStatusById only updates status.
                            // We need to update dates too.
                            await billingManager.updateCustomer(customerId, updateData); // Assuming updateCustomer takes (id, data) - checking signature...

                        } else if (customer.phone) {
                            // Legacy fallback
                            logger.warn(`[RESTORE] Falling back to update by phone=${customer.phone} (no id resolved)`);
                            await billingManager.updateCustomer(customer.phone, { ...customer, status: 'active' });
                        } else {
                            logger.error(`[RESTORE] Unable to resolve customer identifier for status update`);
                        }
                    } catch (billingError) {
                        logger.error(`Billing restore update failed for ${customer.username}:`, billingError.message);
                    }

                    // 4. Skip WhatsApp notification (payment confirmation already covers this)
                    // Service restoration notification removed - redundant with payment_confirmation

                    return {
                        success: results.mikrotik || results.genieacs || results.billing,
                        results,
                        customer: customer.username,
                        reason
                    };

                } catch (error) {
                    logger.error(`Error restoring service for ${customer.username}:`, error);
                    throw error;
                }
            }

    /**
     * Suspend customers whose isolir_date has passed (regardless of invoice status)
     * This ensures no active customers have past isolir dates
     */
    async suspendCustomersWithPastIsolirDate() {
        try {
            this.isRunning = true;
            logger.info('Checking for customers with past isolir dates...');

            const { query } = require('./database');
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Get active customers with past isolir_date
            const result = await query(`
                SELECT
                    s.id as service_id,
                    s.customer_id,
                    c.name,
                    c.phone,
                    s.service_number,
                    s.service_identifier,
                    s.isolir_date,
                    s.siklus,
                    s.enable_isolir,
                    p.pppoe_profile,
                    p.id as package_id,
                    p.group as package_group
                FROM services s
                LEFT JOIN customers c ON s.customer_id = c.id
                LEFT JOIN packages p ON s.package_id = p.id
                WHERE s.status = 'active'
                    AND s.isolir_date IS NOT NULL
                    AND s.suspension_notified_at IS NULL
                    AND DATE(s.isolir_date) <= CURRENT_DATE
                ORDER BY s.isolir_date
            `);

            logger.info(`Found ${result.rows.length} active customers with past isolir dates`);

            let suspended = 0;
            let errors = 0;

            for (const customer of result.rows) {
                try {
                    if (customer.enable_isolir === false) {
                        logger.info(`Customer ${customer.name} has enable_isolir disabled - skipping`);
                        continue;
                    }

                    const isolirDate = customer.isolir_date ? new Date(customer.isolir_date) : null;
                    const daysOverdue = isolirDate ? Math.floor((today - isolirDate) / (1000 * 60 * 60 * 24)) : 0;

                    // Safety check: fixed/tetap cycle — pastikan isolir_date ≈ active_date + 1 bulan
                    // Skip jika selisih > 3 hari (kemungkinan data bug, jangan suspend salah)
                    if ((customer.siklus === 'fixed' || customer.siklus === 'TETAP') && customer.active_date) {
                        const expectedIsolir = new Date(customer.active_date);
                        expectedIsolir.setMonth(expectedIsolir.getMonth() + 1);
                        const actualIsolirDate = isolirDate || new Date(0);
                        const diffDays = Math.abs(Math.round((actualIsolirDate - expectedIsolir) / (1000 * 60 * 60 * 24)));
                        if (diffDays > 3) {
                            logger.warn(`[SAFETY] ${customer.name}: isolir=${customer.isolir_date?.toISOString?.()?.split('T')[0] || 'null'} expected≈${expectedIsolir.toISOString().split('T')[0]} diff=${diffDays}d — SKIPPING suspension (possible data bug)`);
                            continue;
                        }
                    }

                    logger.info(`Suspending ${customer.name} (isolir: ${isolirDate?.toISOString().split('T')[0]}, ${daysOverdue} days overdue)`);

                    // Find the actual RADIUS username via service_number prefix match
                    const radiusUsernameResult = await query(`
                        SELECT username FROM radcheck
                        WHERE LOWER(username) LIKE LOWER($1 || '%')
                        LIMIT 1
                    `, [customer.service_number]);

                    const radiusUsername = radiusUsernameResult.rows[0]?.username;
                    const baseUsername = radiusUsername ? radiusUsername.split('@')[0] : customer.service_number;

                    if (!radiusUsername) {
                        logger.warn(`No RADIUS user found for ${customer.name} (tried: ${customer.name}, ${customer.service_number}, ${customer.service_identifier})`);
                        // Continue with MikroTik suspension even if RADIUS user not found
                    }

                    // 1. Update service status to suspended
                    await query(`
                        UPDATE services
                        SET status = 'suspended',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                    `, [customer.service_id]);

                    // 2. Update RADIUS group to ISOLIR (only if RADIUS user exists)
                    if (radiusUsername) {
                        // Clean ALL radusergroup entries for this user (with and without suffix)
                        await query(`DELETE FROM radusergroup WHERE username LIKE $1`, [`${baseUsername}%`]);
                        await query(`
                            INSERT INTO radusergroup (username, groupname, priority)
                            VALUES ($1, 'ISOLIR', 1)
                        `, [radiusUsername]);
                        logger.info(`RADIUS: Updated ${radiusUsername} to ISOLIR group`);
                    }

                    // 3. Also suspend in MikroTik (change PPPoE profile)
                    const pppoeUsername = radiusUsername || customer.service_number;
                    try {
                        const isolirProfile = getSetting('isolir_profile', 'isolir');
                        await MikrotikService.setPPPoESecretProfile(pppoeUsername, isolirProfile, `SUSPENDED - Isolir date passed`);
                        try {
                            await MikrotikService.disconnectRadiusUser(pppoeUsername);
                            logger.info(`Mikrotik: Disconnected session via CoA for ${pppoeUsername}`);
                        } catch (coaErr) {
                            logger.warn(`Mikrotik: CoA disconnect failed, falling back to active session removal: ${coaErr.message}`);
                            await MikrotikService.removeActiveSession(pppoeUsername);
                        }
                        logger.info(`Mikrotik: Suspended PPPoE user ${pppoeUsername}`);
                    } catch (mikrotikError) {
                        logger.warn(`MikroTik suspension failed for ${customer.name}:`, mikrotikError.message);
                    }

                    // 4. Send WhatsApp notification BEFORE updating invoice status
                    try {
                        const whatsappNotifications = require('./whatsapp-notifications');
                        const reason = `Layanan dihentikan karena tagihan melewati isolir date (${customer.isolir_date ? new Date(customer.isolir_date).toLocaleDateString('id-ID') : '-'})`;
                        await whatsappNotifications.sendServiceSuspensionNotification(customer, reason);
                        logger.info(`WhatsApp suspension notification sent to ${customer.name}`);
                        // Mark notification as sent so it won't be resent next cron run
                        await query(`UPDATE services SET suspension_notified_at = NOW() WHERE id = $1`, [customer.service_id]);
                    } catch (notifError) {
                        logger.warn(`WhatsApp suspension notification failed for ${customer.name}:`, notifError.message);
                    }

                    // 5. Update invoice status to 'suspended' AFTER notification
                    await query(`
                        UPDATE invoices
                        SET status = 'suspended',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE customer_id = $1 AND status IN ('unpaid', 'overdue')
                    `, [customer.customer_id]);

                    suspended++;

                } catch (err) {
                    logger.error(`Error suspending ${customer.name}:`, err.message);
                    errors++;
                }
            }

            logger.info(`Isolir date suspension check completed. Suspended: ${suspended}, Errors: ${errors}`);
            return { suspended, errors };

        } catch (error) {
            logger.error('Error in suspendCustomersWithPastIsolirDate:', error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Check dan suspend pelanggan yang telat bayar otomatis
     */
    async checkAndSuspendOverdueCustomers() {
        try {
            // First, check for customers with past isolir dates
            await this.suspendCustomersWithPastIsolirDate();

            // Then, check for overdue invoices
            logger.info('Starting automatic service suspension check for overdue invoices...');

            const { query } = require('./database');

            let gracePeriodDays = 0;
            try {
                const gpResult = await query('SELECT grace_period_days FROM billing_settings LIMIT 1');
                if (gpResult.rows.length > 0 && gpResult.rows[0].grace_period_days !== null) {
                    gracePeriodDays = parseInt(gpResult.rows[0].grace_period_days);
                }
            } catch (e) {
                logger.warn('Could not read grace_period_days from billing_settings, using default 0:', e.message);
            }

            // Get unpaid overdue invoices
            const overdueInvoicesResult = await query(`
                SELECT
                    i.id,
                    i.invoice_number,
                    i.customer_id,
                    i.due_date,
                    i.amount,
                    c.name as customer_name
                FROM invoices i
                LEFT JOIN customers c ON i.customer_id = c.id
                WHERE i.status = 'unpaid'
                    AND i.due_date <= CURRENT_DATE
                ORDER BY i.due_date ASC
            `);

            const overdueInvoices = overdueInvoicesResult.rows;

            const results = {
                checked: 0,
                suspended: 0,
                errors: 0,
                details: []
            };

            for (const invoice of overdueInvoices) {
                results.checked++;

                        try {
                            // Hitung berapa hari telat
                            const dueDate = new Date(invoice.due_date);
                            const today = new Date();
                            const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

                            // Skip jika belum melewati grace period
                            if (daysOverdue < gracePeriodDays) {
                                logger.info(`Customer ${invoice.customer_name} overdue ${daysOverdue} days, grace period ${gracePeriodDays} days - skipping`);
                                continue;
                            }

                            // Ambil data customer
                            const customer = await billingManager.getCustomerById(invoice.customer_id);
                            if (!customer) {
                                logger.warn(`Customer not found for invoice ${invoice.invoice_number}`);
                                continue;
                            }

                            // Skip jika sudah suspended
                            if (customer.status === 'suspended') {
                                logger.info(`Customer ${customer.username} already suspended - skipping`);
                                continue;
                            }

                            // Skip jika enable_isolir === false (tidak diisolir otomatis)
                            if (customer.enable_isolir === false) {
                                logger.info(`Customer ${customer.username} has enable_isolir disabled - skipping`);
                                continue;
                            }

                            // Suspend layanan
                            const suspensionResult = await this.suspendCustomerService(customer, `Telat bayar ${daysOverdue} hari`);

                            if (suspensionResult.success) {
                                // Update invoice status to 'suspended'
                                await query(`
                                    UPDATE invoices
                                    SET status = 'suspended',
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = $1
                                `, [invoice.id]);

                                results.suspended++;
                                results.details.push({
                                    customer: customer.username,
                                    invoice: invoice.invoice_number,
                                    daysOverdue,
                                    status: 'suspended'
                                });
                                logger.info(`Successfully suspended service for ${customer.username} (${daysOverdue} days overdue)`);
                            } else {
                                results.errors++;
                                results.details.push({
                                    customer: customer.username,
                                    invoice: invoice.invoice_number,
                                    daysOverdue,
                                    status: 'failed'
                                });
                                logger.error(`Failed to suspend service for ${customer.username}`);
                            }

                        } catch (customerError) {
                            results.errors++;
                            logger.error(`Error processing customer for invoice ${invoice.invoice_number}:`, customerError);
                        }
                    }

                    logger.info(`Service suspension check completed. Checked: ${results.checked}, Suspended: ${results.suspended}, Errors: ${results.errors}`);
                    return results;

                } catch (error) {
                    logger.error('Error in automatic service suspension check:', error);
                    throw error;
                } finally {
                    this.isRunning = false;
                }
            }

    /**
     * Check dan restore pelanggan yang sudah bayar
     */
    async checkAndRestorePaidCustomers() {
        try {
            logger.info('Starting automatic service restoration check...');

            const { query } = require('./database');

            // Get suspended services from database (NOT customers table!)
            const result = await query(`
                SELECT
                    s.id as service_id,
                    s.customer_id,
                    c.name,
                    c.phone,
                    s.service_number,
                    s.service_identifier,
                    s.package_id,
                    p.group as package_group,
                    p.pppoe_profile
                FROM services s
                LEFT JOIN customers c ON s.customer_id = c.id
                LEFT JOIN packages p ON p.id = s.package_id
                WHERE s.status = 'suspended'
            `);

            const suspendedServices = result.rows;

            const results = {
                checked: suspendedServices.length,
                restored: 0,
                errors: 0,
                details: []
            };

            for (const service of suspendedServices) {
                try {
                    // Cek apakah customer punya tagihan yang belum dibayar
                    const invoices = await billingManager.getInvoicesByCustomer(service.customer_id);
                    const unpaidInvoices = invoices.filter(i => i.status === 'unpaid' || i.status === 'suspended');

                    // Jika tidak ada tagihan yang belum dibayar, restore layanan
                    if (unpaidInvoices.length === 0) {
                        const restorationResult = await this.restoreServiceByServiceId(service.service_id, service);

                        if (restorationResult.success) {
                            results.restored++;
                            results.details.push({
                                customer: service.name,
                                status: 'restored'
                            });
                            logger.info(`Successfully restored service for ${service.name}`);
                        } else {
                            results.errors++;
                            results.details.push({
                                customer: service.name,
                                status: 'failed'
                            });
                            logger.error(`Failed to restore service for ${service.name}`);
                        }
                    } else {
                        logger.info(`Customer ${service.name} still has ${unpaidInvoices.length} unpaid invoices - keeping suspended`);
                    }

                } catch (customerError) {
                    results.errors++;
                    logger.error(`Error processing suspended customer ${service.name}:`, customerError);
                }
            }

                    logger.info(`Service restoration check completed. Checked: ${results.checked}, Restored: ${results.restored}, Errors: ${results.errors}`);
                    return results;

                } catch (error) {
                    logger.error('Error in automatic service restoration check:', error);
                    throw error;
                }
            }
        }

        // Create singleton instance
        const serviceSuspensionManager = new ServiceSuspensionManager();

        module.exports = serviceSuspensionManager;
