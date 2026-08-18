const { query, getOne } = require('../config/database');
const { logger } = require('../config/logger');
const RadiusCommentService = require('./radius-comment-service');
const radiusDb = require('../config/radius-postgres');
const billingService = require('../services/billing-service');
const BillingCycleService = require('../config/billing-cycle-service');
const kilusiOmnichat = require('../config/kilusi-whatsapp');
const MikrotikService = require('./mikrotik-service');

class CustomerService {
    /**
     * Normalize phone to 62 format
     */
    static normalizePhone(phone) {
        if (!phone) return '';
        const cleaned = String(phone).replace(/\D/g, '');
        if (cleaned.startsWith('0')) return '62' + cleaned.slice(1);
        if (!cleaned.startsWith('62')) return '62' + cleaned;
        return cleaned;
    }

    /**
     * Generate customer ID string (YYMMDD + 5-digit id)
     * @param {string|number} customerId 
     * @returns {string}
     */
    static generateCustomerIdString(customerId) {
        const today = new Date();
        const dateStr = today.getFullYear().toString().slice(-2) +                   // YY
            (today.getMonth() + 1).toString().padStart(2, '0') +           // MM
            today.getDate().toString().padStart(2, '0');                    // DD
        return dateStr + customerId;
    }

    /**
     * Calculate isolir date based on cycle
     * Delegates to BillingCycleService for consistency
     */
    static async calculateIsolirDate(customer) {
        const BillingCycleService = require('../config/billing-cycle-service');
        try {
            if (customer.active_date) {
                const isolirDate = await BillingCycleService.calculateIsolirDate(
                    customer.id,
                    customer.active_date,
                    customer.profile_period || null
                );
                const y = isolirDate.getFullYear();
                const m = String(isolirDate.getMonth() + 1).padStart(2, '0');
                const d = String(isolirDate.getDate()).padStart(2, '0');
                customer.calculated_isolir_date = `${y}-${m}-${d}`;
            }
        } catch (error) {
            logger.error(`Error calculating isolir date for customer ${customer.id}:`, error);
        }
        return customer;
    }

    /**
     * Get all customers with pagination and filtering
     */
    static async getAllCustomers({ page = 1, limit = 10, search = '', status = '', has_service = null, exclude_status = null, sort_field = 'created_at', sort_direction = 'desc', region_id = '', package_id = '', router_id = '', mitra_id = '' }) {
        const offset = (page - 1) * limit;
        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (search) {
            whereClause += ` AND (c.name ILIKE $${queryParams.length + 1} OR c.phone ILIKE $${queryParams.length + 1} OR c.email ILIKE $${queryParams.length + 1} OR c.pppoe_username ILIKE $${queryParams.length + 1} OR c.service_number ILIKE $${queryParams.length + 1} OR c.nik ILIKE $${queryParams.length + 1} OR c.id ILIKE $${queryParams.length + 1})`;
            queryParams.push(`%${search}%`);
        }

        if (status) {
            whereClause += ` AND c.status = $${queryParams.length + 1}`;
            queryParams.push(status);
        }

        if (exclude_status) {
            const excluded = Array.isArray(exclude_status) ? exclude_status : [exclude_status];
            // logic for SQL NOT IN with arrays is != ALL or NOT (x = ANY(..))
            whereClause += ` AND c.status != ALL($${queryParams.length + 1}::text[])`;
            queryParams.push(excluded);
        }
        // Filter for customers with/without service
        if (has_service === true || has_service === 'true') {
            whereClause += ` AND c.package_id IS NOT NULL`;
        } else if (has_service === false || has_service === 'false') {
            whereClause += ` AND c.package_id IS NULL`;
        }

        if (region_id) {
            whereClause += ` AND c.region_id = $${queryParams.length + 1}`;
            queryParams.push(region_id);
        }

        if (package_id) {
            whereClause += ` AND c.package_id = $${queryParams.length + 1}`;
            queryParams.push(package_id);
        }

        if (router_id) {
            whereClause += ` AND c.nas_id = $${queryParams.length + 1}`;
            queryParams.push(router_id);
        }

        if (mitra_id) {
            whereClause += ` AND c.region_id IN (SELECT id FROM regions WHERE mitra_id = $${queryParams.length + 1}::uuid)`;
            queryParams.push(mitra_id);
        }

        // Count query
        const countQuery = `SELECT COUNT(*) as total FROM customers_view c ${whereClause}`;
        const countResult = await query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Determine sort field logic
        let orderByClause = 'c.created_at DESC'; // Default
        const direction = sort_direction === 'asc' ? 'ASC' : 'DESC';

        if (sort_field) {
            switch (sort_field) {
                case 'name':
                    orderByClause = `c.name ${direction}`;
                    break;
                case 'service_number':
                    orderByClause = `c.service_number ${direction}`;
                    break;
                case 'isolir_date':
                    orderByClause = `c.isolir_date ${direction}`;
                    break;
                case 'region':
                    orderByClause = `r.name ${direction}`; // Sort by region name instead of ID for better UX
                    break;
                case 'customer_id':
                    orderByClause = `c.customer_id ${direction}`;
                    break;
                case 'created_at':
                    orderByClause = `c.created_at ${direction}`;
                    break;
                default:
                    // Keep default
                    break;
            }
        }

        // Data query - Reading from View
        const dataQuery = `
            SELECT
                c.id, c.customer_id, c.name, c.phone, c.email, c.nik, c.address, c.billing_address,
                c.installation_address, c.latitude, c.longitude,
                c.pppoe_username, c.pppoe_password,
                c.status, c.created_at, c.updated_at,
                c.installation_date, c.active_date, c.isolir_date,
                c.package_id, c.service_number, c.siklus, c.billing_type,
                c.cable_type, c.cable_length_meters as cable_length, c.port_number,
                c.device_model as router,
                c.region_id, c.area,
                c.odp_code, c.service_id,
                
                -- Joined fields from packages
                p.name as package_name, p.price as package_price, p.speed as package_speed,
                
                -- Region name from regions table
                r.name as region_name,
                
                -- Mitra name via regions
                m.name as mitra_name,
                
                -- Derived fields
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM invoices inv
                        WHERE inv.customer_id = c.id
                        AND inv.status = 'unpaid'
                        AND inv.due_date < CURRENT_DATE
                    ) THEN 'overdue'
                    WHEN EXISTS (
                        SELECT 1 FROM invoices inv
                        WHERE inv.customer_id = c.id
                        AND inv.status = 'unpaid'
                        AND inv.due_date >= CURRENT_DATE
                    ) THEN 'pending'
                    ELSE 'paid'
                END as billing_status,
                (SELECT MAX(created_at) FROM invoices WHERE customer_id = c.id) as last_invoice_date,
                false as is_online,
                
                -- ODP Details
                o.id as odp_id,
                o.name as odp_name,
                o.address as odp_address,
                c.port_number as odp_port
            FROM customers_view c
            LEFT JOIN packages p ON c.package_id = p.id
            LEFT JOIN regions r ON c.region_id = r.id
            LEFT JOIN mitra m ON m.id = r.mitra_id
            LEFT JOIN odps o ON c.odp_code = o.id::text
            ${whereClause}
            ORDER BY ${orderByClause}
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
        `;

        queryParams.push(limit, offset);
        console.log('Executing getAllCustomers query:', dataQuery)
        console.log('Params:', queryParams)
        const result = await query(dataQuery, queryParams);
        console.log('Result count:', result.rows.length)

        // Calculate auto isolir dates
        const customers = await Promise.all(result.rows.map(c => this.calculateIsolirDate(c)));

        return {
            data: customers,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        };
    }

    /**
     * Get customer by ID with full details
     */
    static async getCustomerById(id) {
        const customerQuery = `
            SELECT
                c.*, c.id as customer_id, c.device_model as router, c.cable_length_meters as cable_length,
                p.name as package_name, p.price as package_price, p.speed as package_speed, p.description as package_description, p.group as package_group,
                
                -- ODP Details
                o.id as odp_id,
                o.name as odp_name,
                o.address as odp_address,
                c.port_number as odp_port
            FROM customers_view c
            LEFT JOIN packages p ON c.package_id = p.id
            LEFT JOIN odps o ON c.odp_code = o.id::text
            WHERE c.id = $1
        `;

        const result = await query(customerQuery, [id]);
        if (result.rows.length === 0) return null;

        const customer = await this.calculateIsolirDate(result.rows[0]);

        // Get RADIUS status
        const connectionStatus = await radiusDb.getUserConnectionStatus(customer.pppoe_username);

        // Get invoices
        const invoicesResult = await query(`
            SELECT id, invoice_number, amount, status, due_date, created_at, payment_date as paid_at
            FROM invoices WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 12
        `, [id]);

        // Get sessions
        const sessionsResult = await query(`
            SELECT id, username, ip_address, mac_address, start_time, last_seen as stop_time, active, session_time
            FROM customer_sessions WHERE username = $1 ORDER BY start_time DESC LIMIT 10
        `, [customer.pppoe_username]);

        return {
            customer: {
                ...customer,
                connection_status: connectionStatus || { online: false, status: 'offline' },
                invoices: invoicesResult.rows,
                sessions: sessionsResult.rows
            },
            stats: {
                invoicesCount: invoicesResult.rows.length,
                sessionsCount: sessionsResult.rows.length
            }
        };
    }

    /**
     * Get next sequence for customer ID
     */
    /**
     * Get next sequence for customer ID
     */
    static async getNextSequence() {
        // Get the last created customer ID that matches 5-digit format
        // We filter for numeric IDs to avoid legacy format issues if mixed
        const lastCustomer = await query("SELECT id FROM customers WHERE id ~ '^[0-9]{5}$' ORDER BY id DESC LIMIT 1");

        let nextId = 1;

        if (lastCustomer.rows.length > 0) {
            const lastId = lastCustomer.rows[0].id;
            const currentNum = parseInt(lastId);
            if (!isNaN(currentNum)) {
                nextId = currentNum + 1;
            }
        }

        const nextIdFormatted = String(nextId).padStart(5, '0');

        return {
            nextId: nextIdFormatted,
            customerId: nextIdFormatted, // Now strictly 5 digits (00001)
            totalCustomers: 0 // Not critically used in frontend logic currently
        };
    }

    /**
     * Create new customer identity (Basic Info Only)
     */
    static async createIdentity(data, client = null) {
        const {
            id, name: rawName, phone, email, address: rawAddress, area: rawArea, region, region_id
        } = data;

        const name = rawName?.toUpperCase() || null;
        const address = rawAddress?.toUpperCase() || null;
        const normalizedPhone = this.normalizePhone(phone);

        // Validation - Check duplicates (Phone)
        if (normalizedPhone) {
            const existingPhone = await query('SELECT id FROM customers WHERE phone = $1', [normalizedPhone]);
            if (existingPhone.rows.length > 0) {
                throw { code: 'RESOURCE_CONFLICT', message: 'Nomor telepon sudah terdaftar', field: 'phone' };
            }
        }

        // Validation - Check duplicates (NIK)
        const normalizedNik = data.nik?.toUpperCase() || null;
        if (normalizedNik) {
            const existingNik = await query('SELECT id FROM customers WHERE nik = $1', [normalizedNik]);
            if (existingNik.rows.length > 0) {
                throw { code: 'RESOURCE_CONFLICT', message: 'NIK sudah terdaftar', field: 'nik' };
            }
        }

        let customerId = id;

        // 1. Handle Manual ID
        if (customerId) {
            // Check if ID already exists
            const existingId = await query('SELECT id FROM customers WHERE id = $1', [customerId]);
            if (existingId.rows.length > 0) {
                throw { code: 'RESOURCE_CONFLICT', message: 'ID Pelanggan sudah digunakan', field: 'id' };
            }
        } else {
            // 2. Generate Auto ID if not provided
            const nextSeqRes = await this.getNextSequence();
            customerId = nextSeqRes.customerId;
        }

        const finalRegionId = region_id || null;
        const finalArea = (rawArea || region || null)?.toUpperCase() || null;

        const executeInsert = async (dbClient) => {
            const insertCustomerQuery = `
                INSERT INTO customers (id, name, phone, email, address, nik, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING *
            `;
            const custRes = await dbClient.query(insertCustomerQuery, [customerId, name, normalizedPhone, email, address, normalizedNik]);
            return custRes.rows[0];
        };

        if (client) {
            return await executeInsert(client);
        } else {
            const poolClient = await require('../config/database').getPool().connect();
            try {
                await poolClient.query('BEGIN');
                const customer = await executeInsert(poolClient);
                await poolClient.query('COMMIT');
                return customer;
            } catch (e) {
                await poolClient.query('ROLLBACK');
                throw e;
            } finally {
                poolClient.release();
            }
        }
    }

    /**
     * Create new service for existing customer
     */
    static async createService(customerId, data, client = null) {
        let {
            package_id, pppoe_username, pppoe_password,
            status = 'pending', billing_type = 'postpaid',
            active_date = new Date(), isolir_date, siklus,
            odp_id, odp_port, cable_type, cable_length,
            address, installation_address, latitude, longitude,
            region_id, area, region, router, pppoe_suffix
        } = data;

        // Map 'installation_address' to 'address_installation' for DB, fallback to 'address'
        const address_installation = (installation_address || address || data.address_installation || null)?.toUpperCase() || null;
        const finalRegionId = region_id || null;
        const finalArea = (area || region || null)?.toUpperCase() || null;
        const nasId = router || 'all';

        const executeServiceInsert = async (dbClient) => {
            // 0. Generate Service Number
            // Format: YYMM + CustID (5 digit) + Index (2 digit)
            const date = new Date();
            const yy = date.getFullYear().toString().slice(-2);
            const mm = (date.getMonth() + 1).toString().padStart(2, '0');

            const countRes = await dbClient.query('SELECT COUNT(*) as total FROM services WHERE customer_id = $1', [customerId]);
            const nextIndex = parseInt(countRes.rows[0].total) + 1;
            const indexStr = String(nextIndex).padStart(2, '0');

            // Ensure Customer ID part is simple
            const serviceNumber = `${yy}${mm}${customerId}${indexStr}`;

            // Auto-generate PPPoE Username if empty
            if (!pppoe_username) {
                pppoe_username = serviceNumber;
                if (pppoe_suffix) {
                    pppoe_username += '@' + pppoe_suffix;
                }
            }

            // Validation - PPPoE Uniqueness check inside execution context
            if (pppoe_username) {
                const existingUsername = await dbClient.query(
                    `SELECT t.service_id, s.customer_id, s.status, s.package_id, s.billing_type
                     FROM technical_details t
                     JOIN services s ON t.service_id = s.id
                     WHERE t.pppoe_username = $1`, [pppoe_username]);
                if (existingUsername.rows.length > 0) {
                    const existing = existingUsername.rows[0];
                    if (existing.customer_id === customerId) {
                        // Same customer — skip, return existing service
                        return existing.service_id;
                    }
                    // Different customer — conflict
                    throw { code: 'RESOURCE_CONFLICT', message: 'Username PPPoE sudah terdaftar', field: 'pppoe_username' };
                }
            }

            // 1. Insert Service (with service_number, billing fields, and address/coords)
            const insertServiceQuery = `
                INSERT INTO services (customer_id, package_id, status, service_number, installation_date, active_date, isolir_date, siklus, billing_type, address_installation, latitude, longitude, region_id, area, nas_id)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING id
            `;
            const serviceRes = await dbClient.query(insertServiceQuery, [
                customerId, package_id, status, serviceNumber,
                active_date, isolir_date || null, siklus || null, billing_type,
                address_installation, latitude, longitude, finalRegionId, finalArea, nasId
            ]);
            const serviceId = serviceRes.rows[0].id;

            // 2. Insert Technical Details
            const insertTechQuery = `
                INSERT INTO technical_details (service_id, pppoe_username, pppoe_password)
                VALUES ($1, $2, $3)
            `;
            await dbClient.query(insertTechQuery, [serviceId, pppoe_username, pppoe_password]);

            // 3. Insert Network Infrastructure
            const insertNetQuery = `
                INSERT INTO network_infrastructure (service_id, odp_code, port_number, cable_type, cable_length_meters)
                VALUES ($1, $2, $3, $4, $5)
            `;
            await dbClient.query(insertNetQuery, [serviceId, String(odp_id || ''), odp_port, cable_type, cable_length]);

            return serviceId;
        };

        // Calculate isolir_date if not provided, based on billing cycle
        if (!isolir_date && siklus) {
            const calcActiveDate = active_date instanceof Date ? active_date : new Date(active_date);
            if (!isNaN(calcActiveDate.getTime())) {
                try {
                    const calculated = await BillingCycleService.calculateIsolirDate(
                        customerId, calcActiveDate, null, siklus
                    );
                    isolir_date = calculated;
                } catch (e) {
                    logger.warn(`Failed to calculate isolir date for customer ${customerId}: ${e.message}`);
                }
            }
        }

        let serviceId;
        if (client) {
            serviceId = await executeServiceInsert(client);
        } else {
            const poolClient = await require('../config/database').getPool().connect();
            try {
                await poolClient.query('BEGIN');
                serviceId = await executeServiceInsert(poolClient);
                await poolClient.query('COMMIT');
            } catch (e) {
                await poolClient.query('ROLLBACK');
                throw e;
            } finally {
                poolClient.release();
            }
        }

        // Post-creation tasks (Invoice, Radius) - usually done outside DB transaction to prevent locking/delays
        // But if client is passed, we assume caller handles transaction. 
        // We will return data needed for post-tasks.

        return { serviceId, pppoe_username, pppoe_password, billing_type, package_id };
    }

    /**
     * Create new customer (Identity + Service Wrapper)
     * Preserves legacy behavior
     */
    static async createCustomer(data) {
        // Transactional Insert
        const client = await require('../config/database').getPool().connect();
        let customer;
        let serviceData;

        try {
            await client.query('BEGIN');

            // 1. Create Identity
            customer = await this.createIdentity(data, client);

            // 2. Create Service
            serviceData = await this.createService(customer.id, data, client);

            await client.query('COMMIT');

            // Attach fields for legacy response compatibility
            customer.pppoe_username = serviceData.pppoe_username;
            customer.billing_type = serviceData.billing_type;
            customer.package_id = serviceData.package_id;

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        // Update Mikrotik/RADIUS
        let radiusCommentUpdated = false;
        if (serviceData.pppoe_username && customer.name) {
            try {
                radiusCommentUpdated = await RadiusCommentService.updateMikrotikComment(serviceData.pppoe_username, customer.name);
                if (radiusCommentUpdated) logger.info(`✅ Added Mikrotik comment for ${serviceData.pppoe_username}`);
            } catch (e) {
                logger.error(`❌ Failed to add Mikrotik comment: ${e.message}`);
            }
        }

        return {
            customer,
            radiusCommentUpdated
        };
    }

    /**
     * Update customer
     */
    static async updateCustomer(id, data) {
        // Fetch current from VIEW
        const currentRes = await query('SELECT * FROM customers_view WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) return null;
        const current = currentRes.rows[0];

        const {
            name: rawName, phone, email, address: rawAddress, installation_address: rawInstAddr, nik: rawNik,
            package_id, pppoe_username, pppoe_password,
            status, region_id, area: rawArea, region, router,
            active_date, isolir_date, siklus, billing_type,
            odp_code, odp_port, cable_type, cable_length,
            latitude, longitude
        } = data;

        const name = rawName?.toUpperCase() || null;
        const address = rawAddress?.toUpperCase() || null;
        const installation_address = rawInstAddr?.toUpperCase() || null;
        const nik = rawNik?.toUpperCase() || null;
        const normalizedPhone = this.normalizePhone(phone);

        logger.info(`[UpdateCustomer] ID: ${id}, Payload Lat/Long: ${latitude}/${longitude}, Type: ${typeof latitude}/${typeof longitude}`);

        const address_installation = installation_address || address || current.address_installation?.toUpperCase();
        const nasId = router || null;

        // Validation - duplicate checks
        if (normalizedPhone && normalizedPhone !== current.phone) {
            const exist = await query('SELECT id FROM customers WHERE phone = $1 AND id != $2', [normalizedPhone, id]);
            if (exist.rows.length > 0) throw { code: 'RESOURCE_CONFLICT', message: 'Nomor telepon sudah terdaftar', field: 'phone' };
        }
        if (pppoe_username && pppoe_username !== current.pppoe_username) {
            const exist = await query('SELECT id FROM technical_details WHERE pppoe_username = $1', [pppoe_username]);
            if (exist.rows.length > 0) throw { code: 'RESOURCE_CONFLICT', message: 'Username PPPoE sudah terdaftar', field: 'pppoe_username' };
        }

        const finalRegionId = region_id || null;
        const finalArea = (rawArea || region || null)?.toUpperCase() || null;

        const client = await require('../config/database').getPool().connect();
        let updatedCustomer = {};

        try {
            await client.query('BEGIN');

            // 1. Update Identity (customers table - no latitude/longitude here)
            await client.query(`
                UPDATE customers SET
                    name = COALESCE($1, name),
                    phone = COALESCE($2, phone),
                    email = COALESCE($3, email),
                    nik = COALESCE($4, nik),
                    address = COALESCE($5, address),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $6
            `, [name, normalizedPhone, email, nik, address, id]);
            // Note: latitude and longitude are stored in services table, not customers table

            // 2. Update Service & Technical
            // Get Service ID
            const srvRes = await client.query('SELECT id FROM services WHERE customer_id = $1', [id]);
            if (srvRes.rows.length > 0) {
                const serviceId = srvRes.rows[0].id;

                await client.query(`
                    UPDATE services SET
                         package_id = COALESCE($1, package_id),
                         status = COALESCE($2, status),
                         active_date = COALESCE($3, active_date),
                         isolir_date = COALESCE($4, isolir_date),
                         siklus = COALESCE($5, siklus),
                         billing_type = COALESCE($6, billing_type),
                         address_installation = COALESCE($7, address_installation),
                         latitude = COALESCE($8, latitude),
                         longitude = COALESCE($9, longitude),
                         region_id = COALESCE($10, region_id),
                         area = COALESCE($11, area),
                         nas_id = COALESCE($12, nas_id),
                         updated_at = CURRENT_TIMESTAMP
                    WHERE id = $13
                `, [package_id, status, active_date, isolir_date, siklus, billing_type, address_installation, latitude, longitude, finalRegionId, finalArea, nasId, serviceId]);

                if (pppoe_username || pppoe_password) {
                    await client.query(`
                        UPDATE technical_details SET
                            pppoe_username = COALESCE($1, pppoe_username),
                            pppoe_password = COALESCE($2, pppoe_password),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE service_id = $3
                    `, [pppoe_username || null, pppoe_password || null, serviceId]);
                }

                await client.query(`
                    UPDATE network_infrastructure SET
                        odp_code = COALESCE($1, odp_code),
                        port_number = COALESCE($2, port_number),
                        cable_type = COALESCE($3, cable_type),
                        cable_length_meters = COALESCE($4, cable_length_meters),
                         updated_at = CURRENT_TIMESTAMP
                    WHERE service_id = $5
                `, [odp_code, odp_port, cable_type, cable_length, serviceId]);
            }

            await client.query('COMMIT');

            // Fetch updated view
            const reload = await client.query('SELECT * FROM customers_view WHERE id = $1', [id]);
            updatedCustomer = reload.rows[0];

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        // RADIUS cleanup + sync when PPPoE username changes
        const pppoeChanged = pppoe_username && pppoe_password && pppoe_username !== current.pppoe_username;
        if (pppoeChanged) {
            try {
                // 1. Hapus username lama dari RADIUS
                if (current.pppoe_username) {
                    await radiusDb.deleteRadiusUser(current.pppoe_username);
                    await MikrotikService.disconnectRadiusUser(current.pppoe_username);
                    logger.info(`✅ Old PPPoE removed from RADIUS: ${current.pppoe_username}`);
                }

                // 2. Sync username baru ke RADIUS
                const pkgRes = await query('SELECT "group" FROM packages WHERE id = $1', [package_id || current.package_id]);
                const packageGroup = pkgRes.rows[0]?.group || 'UPTO-10M';
                await radiusDb.upsertRadiusUser(pppoe_username, pppoe_password, packageGroup);
                logger.info(`✅ New PPPoE synced to RADIUS: ${pppoe_username} (group: ${packageGroup})`);
            } catch (err) {
                logger.error(`❌ RADIUS sync failed on PPPoE change: ${err.message}`);
            }
        }

        // Radius Comment
        let radiusCommentUpdated = false;
        if (updatedCustomer.pppoe_username && updatedCustomer.name) {
            const nameChanged = name && name !== current.name;
            const usernameChanged = pppoe_username && pppoe_username !== current.pppoe_username;

            if (nameChanged || usernameChanged) {
                try {
                    if (usernameChanged && current.pppoe_username) {
                        await RadiusCommentService.removeMikrotikComment(current.pppoe_username);
                    }
                    radiusCommentUpdated = await RadiusCommentService.updateMikrotikComment(updatedCustomer.pppoe_username, updatedCustomer.name);
                    if (radiusCommentUpdated) logger.info('✅ Updated Mikrotik comment');
                } catch (e) {
                    logger.error(`❌ Failed update Mikrotik comment: ${e.message}`);
                }
            }
        }

        // Package Change - Update RADIUS and Kick User
        let packageUpdated = false;
        let invoiceUpdated = false;
        const oldPkgId = current.package_id ? parseInt(current.package_id) : null;
        const newPkgId = package_id ? parseInt(package_id) : null;

        if (newPkgId && !isNaN(newPkgId) && oldPkgId !== newPkgId) {
            logger.info(`🔄 Package changed for customer ${id} from ${oldPkgId} to ${newPkgId}`);

            try {
                // Get both old and new package details
                const oldPkgRes = await query(`SELECT id, name, speed, price, "group", pppoe_profile FROM packages WHERE id = $1`, [oldPkgId]);
                const newPkgRes = await query(`SELECT id, name, speed, price, "group", pppoe_profile FROM packages WHERE id = $1`, [newPkgId]);

                const oldPackage = oldPkgRes.rows[0];
                const newPackage = newPkgRes.rows[0];

                if (oldPackage && newPackage) {
                    // Prepaid package change: block if paid invoice with future due_date exists
                    const billingType = updatedCustomer.billing_type || current.billing_type;

                    if (billingType === 'prepaid') {
                        const blockingCheck = await query(`
                            SELECT MAX(due_date) as max_due FROM invoices
                            WHERE customer_id = $1 AND status = 'paid' AND due_date > CURRENT_DATE
                              AND service_number = $2
                        `, [id, updatedCustomer.service_number]);
                        const maxDue = blockingCheck.rows[0]?.max_due;

                        if (maxDue) {
                            const dueStr = new Date(maxDue).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                            throw Object.assign(new Error(`Tidak dapat mengubah paket. Anda memiliki pembayaran di muka hingga ${dueStr}`), { code: 'BLOCKED_BY_PREPAID' });
                        }

                        // Find all unpaid invoices to update
                        const unpaidInvoicesRes = await query(`
                            SELECT id, invoice_number, due_date, unique_code, discount_amount, final_amount, notes
                            FROM invoices
                            WHERE customer_id = $1 AND status IN ('unpaid', 'sent', 'draft')
                              AND service_number = $2
                        `, [id, updatedCustomer.service_number]);

                        const unpaidInvoices = unpaidInvoicesRes.rows;
                        const uniqueCodeGenerator = require('../config/unique-code');
                        const autopayService = require('../services/autopay-service');
                        const isUniqueCodeEnabled = uniqueCodeGenerator.isEnabled();

                        const newPrice = parseFloat(newPackage.price);

                        for (const inv of unpaidInvoices) {
                            let uniqueCode = inv.unique_code;
                            if (isUniqueCodeEnabled && !uniqueCode) {
                                try {
                                    uniqueCode = await uniqueCodeGenerator.generateCode();
                                } catch (e) {
                                    logger.warn(`Failed to generate unique code for invoice ${inv.invoice_number}: ${e.message}`);
                                }
                            }

                            const discountAmount = parseFloat(inv.discount_amount || 0);
                            const finalAmount = Math.max(0, newPrice - discountAmount);
                            const amountWithCode = (isUniqueCodeEnabled && uniqueCode)
                                ? uniqueCodeGenerator.calculateAmountWithCode(finalAmount, uniqueCode)
                                : null;

                            await query(`
                                UPDATE invoices SET
                                    amount = $1,
                                    total_amount = $1,
                                    final_amount = $2,
                                    unique_code = $3,
                                    amount_with_code = $4,
                                    package_id = $5,
                                    updated_at = NOW()
                                WHERE id = $6
                            `, [newPrice, finalAmount, uniqueCode, amountWithCode, newPkgId, inv.id]);

                            // Re-push updated invoice to Autopay
                            try {
                                if (autopayService.isEnabled()) {
                                    const pushAmount = amountWithCode || finalAmount || newPrice;
                                    await autopayService.pushInvoice({
                                        id: inv.id,
                                        invoice_number: inv.invoice_number,
                                        customer_name: updatedCustomer.name || current.name || 'Unknown',
                                        amount: pushAmount,
                                        unique_code: uniqueCode || 0,
                                        due_date: inv.due_date
                                    });
                                    logger.info(`[Autopay] Re-pushed invoice ${inv.invoice_number} after package change (amount: ${pushAmount}, code: ${uniqueCode})`);
                                }
                            } catch (autopayErr) {
                                logger.error(`[Autopay] Failed to re-push invoice ${inv.invoice_number} after package change: ${autopayErr.message}`);
                            }
                        }

                        invoiceUpdated = unpaidInvoices.length > 0;
                    }

                    // Record package change history
                    await query(`
                        INSERT INTO package_change_history 
                        (customer_id, service_number, old_package_id, new_package_id, 
                         old_package_name, new_package_name, old_price, new_price,
                         billing_type, invoice_updated)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    `, [
                        id, updatedCustomer.service_number,
                        oldPackage.id, newPackage.id,
                        oldPackage.name, newPackage.name,
                        oldPackage.price, newPackage.price,
                        billingType, invoiceUpdated
                    ]);

                    // Get RADIUS username (try multiple possible usernames + prefix match)
                    const radiusUserResult = await query(`
                        SELECT username FROM radcheck
                        WHERE LOWER(username) = LOWER($1)
                           OR LOWER(username) = LOWER($2)
                           OR LOWER(username) = LOWER($3)
                           OR LOWER(username) LIKE LOWER($4 || '%')
                        LIMIT 1
                    `, [updatedCustomer.name, updatedCustomer.pppoe_username, updatedCustomer.service_number, updatedCustomer.service_number]);

                    if (radiusUserResult.rows.length > 0) {
                        const radiusUsername = radiusUserResult.rows[0].username;

                        // Update RADIUS group
                        await query(`DELETE FROM radusergroup WHERE username = $1`, [radiusUsername]);
                        await query(`INSERT INTO radusergroup (username, groupname, priority) VALUES ($1, $2, 1)`, [radiusUsername, newPackage.group]);

                        // Kick user via CoA — user reconnects with new RADIUS group
                        const MikrotikService = require('../services/mikrotik-service');
                        const coaResult = await MikrotikService.disconnectRadiusUser(radiusUsername);
                        if (coaResult.success) {
                            logger.info(`Mikrotik: CoA ${coaResult.message} for ${radiusUsername} after package change`);
                        } else {
                            logger.warn(`Mikrotik: CoA disconnect failed for ${radiusUsername} after package change: ${coaResult.message}`);
                            await MikrotikService.removeActiveSession(radiusUsername);
                        }

                        packageUpdated = true;
                        logger.info(`✅ Package updated for ${radiusUsername}: group=${newPackage.group}, user kicked`);

                        // Send WhatsApp notification for package change
                        await this.sendPackageChangeNotification(updatedCustomer, oldPackage, newPackage, billingType, invoiceUpdated);
                    } else {
                        logger.warn(`⚠️ No RADIUS user found for customer ${id}, skipping package update`);
                    }
                }
            } catch (e) {
                logger.error(`❌ Failed to update package for customer ${id}: ${e.message}`);
                // Re-throw BLOCKED_BY_PREPAID so the API can return a proper error
                if (e.code === 'BLOCKED_BY_PREPAID') throw e;
            }
        }

        // If package was updated, add package info to updatedCustomer for auto RADIUS sync
        if (packageUpdated && updatedCustomer) {
            const packageInfo = await query('SELECT "group" as package_group, pppoe_profile, speed as package_speed FROM packages WHERE id = $1', [updatedCustomer.package_id]);
            if (packageInfo.rows.length > 0) {
                updatedCustomer.package_group = packageInfo.rows[0].package_group;
                updatedCustomer.pppoe_profile = packageInfo.rows[0].pppoe_profile;
                updatedCustomer.package_speed = packageInfo.rows[0].package_speed;
            }
        }

        // Registration Approved Notification - when status changes from pending to active
        let registrationApprovedNotified = false;
        if (status && status === 'active' && current.status === 'pending') {
            try {
                // Get installation details
                const installationResult = await query(`
                  SELECT i.scheduled_date, u.name as technician_name, u.phone as technician_phone
                  FROM installations i
                  LEFT JOIN users u ON u.id = i.technician_id
                  WHERE i.customer_id = $1
                  ORDER BY i.created_at DESC
                  LIMIT 1
                `, [id]);

                // Get package details
                const packageResult = await query('SELECT name, speed FROM packages WHERE id = $1', [updatedCustomer.package_id]);
                const packageName = packageResult.rows[0]?.name || 'Paket Standard';
                const packageSpeed = packageResult.rows[0]?.speed || '-';

                // Format installation date/time
                let installationDate = 'Menunggu jadwal';
                let installationTime = '';
                let technicianName = 'Menunggu penugasan';
                let technicianPhone = '-';

                if (installationResult.rows.length > 0) {
                    const install = installationResult.rows[0];
                    if (install.scheduled_date) {
                        const dateObj = new Date(install.scheduled_date);
                        installationDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                        installationTime = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    }
                    if (install.technician_name) {
                        technicianName = install.technician_name;
                        technicianPhone = install.technician_phone || '-';
                    }
                }

                // Send notification
                const whatsappNotifications = require('../config/whatsapp-notifications');
                await whatsappNotifications.sendRegistrationApprovedNotification(
                  updatedCustomer.phone,
                  {
                    customerName: updatedCustomer.nama_customer || updatedCustomer.name,
                    packageName: packageName,
                    packageSpeed: packageSpeed,
                    installationDate: installationDate,
                    installationTime: installationTime,
                    technicianName: technicianName,
                    technicianPhone: technicianPhone
                  }
                );

                registrationApprovedNotified = true;
                logger.info(`📱 Registration approved notification sent to ${updatedCustomer.nama_customer || updatedCustomer.name} (${updatedCustomer.phone})`);
            } catch (error) {
                logger.error(`Failed to send registration approved notification to customer ${id}:`, error.message);
                // Don't throw - notification failure shouldn't break the update
            }
        }

        return {
            customer: updatedCustomer,
            changes: {
                radiusCommentUpdated,
                packageUpdated,
                invoiceUpdated,
                registrationApprovedNotified
            }
        };
    }

    /**
     * Send WhatsApp notification for package change
     */
    static async sendPackageChangeNotification(customer, oldPackage, newPackage, billingType, invoiceUpdated) {
        try {
            if (!customer.phone) {
                logger.warn(`No phone number for customer ${customer.id}, skipping package change notification`);
                return;
            }

            const whatsappNotifications = require('../config/whatsapp-notifications');
            await whatsappNotifications.sendPackageChangeNotification(
                customer.phone,
                customer,
                oldPackage,
                newPackage
            );
        } catch (error) {
            logger.error(`Failed to send package change notification to customer ${customer.id}:`, error.message);
            // Don't throw - notification failure shouldn't break the package update
        }
    }

    /**
     * Delete customer
     */
    static async deleteCustomer(id) {
        // DETEKSI: Jika ID panjangnya 11 digit, itu kemungkinan besar adalah service_number
        if (id.length >= 11) {
            return await this.deleteServiceByNumber(id);
        }

        const currentRes = await query('SELECT * FROM customers WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) return null;
        const customer = currentRes.rows[0];

        // Dapatkan semua pppoe_username dari semua layanan pelanggan ini
        const services = await query(`
            SELECT t.pppoe_username 
            FROM services s
            JOIN technical_details t ON s.id = t.service_id
            WHERE s.customer_id = $1
        `, [id]);

        // Bersihkan Radius & Kick untuk setiap layanan
        for (const srv of services.rows) {
            if (srv.pppoe_username) {
                try {
                    await radiusDb.deleteRadiusUser(srv.pppoe_username);
                    await MikrotikService.disconnectRadiusUser(srv.pppoe_username);
                    logger.info(`✅ Cleaned up Radius and kicked user ${srv.pppoe_username} (Customer Deletion)`);
                } catch (e) {
                    logger.error(`❌ Failed Radius cleanup for ${srv.pppoe_username}: ${e.message}`);
                }
            }
        }

        // Hapus semua invoice yang masih unpaid (admin bisa hapus pelanggan baru)
        await query('DELETE FROM invoices WHERE customer_id = $1 AND status IN (\'unpaid\', \'draft\')', [id]);

        // Cek masih ada invoice paid/sent — tetap blokir
        const invoiceCheck = await query('SELECT COUNT(*) as count FROM invoices WHERE customer_id = $1 AND status NOT IN (\'unpaid\', \'draft\')', [id]);
        if (parseInt(invoiceCheck.rows[0].count) > 0) {
            throw { code: 'RESOURCE_CONFLICT', message: 'Pelanggan masih memiliki invoice paid/sent', count: invoiceCheck.rows[0].count };
        }

        // Hapus semua data turunan agar ID reuse aman
        await query('DELETE FROM network_infrastructure WHERE service_id IN (SELECT id FROM services WHERE customer_id = $1)', [id]);
        await query('DELETE FROM technical_details WHERE service_id IN (SELECT id FROM services WHERE customer_id = $1)', [id]);
        await query('DELETE FROM services WHERE customer_id = $1', [id]);
        await query('DELETE FROM customers WHERE id = $1', [id]);
        return customer;
    }

    /**
     * Delete specific service by its number
     */
    static async deleteServiceByNumber(serviceNumber) {
        const srvRes = await query(`
            SELECT s.id, s.customer_id, s.service_number, t.pppoe_username 
            FROM services s
            LEFT JOIN technical_details t ON s.id = t.service_id
            WHERE s.service_number = $1
        `, [serviceNumber]);
        
        if (srvRes.rows.length === 0) return null;
        
        const service = srvRes.rows[0];
        const customerRes = await query('SELECT name FROM customers WHERE id = $1', [service.customer_id]);
        
        // Bersihkan Radius & Kick
        if (service.pppoe_username) {
            try {
                await radiusDb.deleteRadiusUser(service.pppoe_username);
                await MikrotikService.disconnectRadiusUser(service.pppoe_username);
                logger.info(`✅ Cleaned up Radius and kicked user ${service.pppoe_username} (Service Deletion)`);
            } catch (e) {
                logger.error(`❌ Failed Radius cleanup for ${service.pppoe_username}: ${e.message}`);
            }
        }

        // Hapus detail teknis dan infrastruktur (karena linked ke service_id)
        await query('DELETE FROM technical_details WHERE service_id = $1', [service.id]);
        await query('DELETE FROM network_infrastructure WHERE service_id = $1', [service.id]);
        
        // Hapus layanan itu sendiri
        await query('DELETE FROM services WHERE id = $1', [service.id]);
        
        return {
            id: service.customer_id,
            name: customerRes.rows[0]?.name || 'Unknown',
            service_number: service.service_number
        };
    }
}

module.exports = CustomerService;
