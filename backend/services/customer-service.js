const { query } = require('../config/database');
const { logger } = require('../config/logger');
const RadiusCommentService = require('./radius-comment-service');
const radiusDb = require('../config/radius-postgres');
const billingService = require('../services/billing-service');

class CustomerService {
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
                customer.calculated_isolir_date = isolirDate.toISOString().split('T')[0];
            }
        } catch (error) {
            logger.error(`Error calculating isolir date for customer ${customer.id}:`, error);
        }
        return customer;
    }

    /**
     * Get all customers with pagination and filtering
     */
    static async getAllCustomers({ page = 1, limit = 10, search = '', status = '', has_service = null }) {
        const offset = (page - 1) * limit;
        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (search) {
            whereClause += ` AND (c.name ILIKE $${queryParams.length + 1} OR c.phone ILIKE $${queryParams.length + 1} OR c.email ILIKE $${queryParams.length + 1} OR c.pppoe_username ILIKE $${queryParams.length + 1} OR c.id ILIKE $${queryParams.length + 1})`;
            queryParams.push(`%${search}%`);
        }

        if (status) {
            whereClause += ` AND c.status = $${queryParams.length + 1}`;
            queryParams.push(status);
        }

        // Filter for customers with/without service
        if (has_service === true || has_service === 'true') {
            whereClause += ` AND c.package_id IS NOT NULL`;
        } else if (has_service === false || has_service === 'false') {
            whereClause += ` AND c.package_id IS NULL`;
        }

        // Count query
        const countQuery = `SELECT COUNT(*) as total FROM customers_view c ${whereClause}`;
        const countResult = await query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Data query - Reading from View
        const dataQuery = `
            SELECT
                c.id, c.customer_id, c.name, c.phone, c.nik, c.address, c.billing_address,
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
            LEFT JOIN odps o ON c.odp_code = o.id::text
            ${whereClause}
            ORDER BY c.created_at DESC
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
                p.name as package_name, p.price as package_price, p.speed as package_speed, p.description as package_description,
                
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
            SELECT id, session_id, username, ip_address, mac_address, start_time, last_seen as stop_time, active, session_time
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
            id, name, phone, email, address, area, region, region_id
        } = data;

        // Validation - Check duplicates (Phone)
        if (phone) {
            const existingPhone = await query('SELECT id FROM customers WHERE phone = $1', [phone]);
            if (existingPhone.rows.length > 0) {
                throw { code: 'RESOURCE_CONFLICT', message: 'Nomor telepon sudah terdaftar', field: 'phone' };
            }
        }

        // Validation - Check duplicates (NIK)
        if (data.nik) {
            const existingNik = await query('SELECT id FROM customers WHERE nik = $1', [data.nik]);
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
        const finalArea = area || region || null;

        const executeInsert = async (dbClient) => {
            const insertCustomerQuery = `
                INSERT INTO customers (id, name, phone, email, address, nik, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING *
            `;
            const custRes = await dbClient.query(insertCustomerQuery, [customerId, name, phone, email, address, data.nik || null]);
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
            status = 'active', billing_type = 'postpaid',
            active_date = new Date(), isolir_date, siklus,
            odp_id, odp_port, cable_type, cable_length,
            address, installation_address, latitude, longitude,
            region_id, area, region, router
        } = data;

        // Map 'installation_address' to 'address_installation' for DB, fallback to 'address'
        const address_installation = installation_address || address || data.address_installation || null;
        const finalRegionId = region_id || null;
        const finalArea = area || region || null;
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
            }

            // Validation - PPPoE Uniqueness check inside execution context to be safe
            if (pppoe_username) {
                const existingUsername = await dbClient.query('SELECT id FROM technical_details WHERE pppoe_username = $1', [pppoe_username]);
                if (existingUsername.rows.length > 0) {
                    // If conflicts, throw. (Frontend usually checks this, but for auto-gen safety)
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

        return { serviceId, pppoe_username, billing_type, package_id };
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

        // Create invoice
        let invoiceResult = { invoice: null, message: 'Invoice creation pending' };
        try {
            invoiceResult = await billingService.createCustomerInvoice(customer.id, serviceData.package_id, serviceData.billing_type);
        } catch (e) {
            logger.error('Failed to create initial invoice', e);
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
            invoiceResult,
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
            name, phone, email, address, installation_address, nik,
            package_id, pppoe_username, pppoe_password,
            status, region_id, area, region, router,
            active_date, isolir_date, siklus, billing_type,
            odp_code, odp_port, cable_type, cable_length,
            latitude, longitude
        } = data;

        logger.info(`[UpdateCustomer] ID: ${id}, Payload Lat/Long: ${latitude}/${longitude}, Type: ${typeof latitude}/${typeof longitude}`);

        const address_installation = installation_address || address || current.address_installation;
        const nasId = router || null;

        // Validation - duplicate checks
        if (phone && phone !== current.phone) {
            // Check in Identity table
            const exist = await query('SELECT id FROM customers WHERE phone = $1 AND id != $2', [phone, id]);
            if (exist.rows.length > 0) throw { code: 'RESOURCE_CONFLICT', message: 'Nomor telepon sudah terdaftar', field: 'phone' };
        }
        if (pppoe_username && pppoe_username !== current.pppoe_username) {
            const exist = await query('SELECT id FROM technical_details WHERE pppoe_username = $1', [pppoe_username]);
            if (exist.rows.length > 0) throw { code: 'RESOURCE_CONFLICT', message: 'Username PPPoE sudah terdaftar', field: 'pppoe_username' };
        }

        const finalRegionId = region_id || null;
        const finalArea = area || region || null;

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
            `, [name, phone, email, nik, address, id]);
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

                await client.query(`
                    UPDATE technical_details SET
                        pppoe_username = COALESCE($1, pppoe_username),
                        pppoe_password = COALESCE($2, pppoe_password),
                         updated_at = CURRENT_TIMESTAMP
                    WHERE service_id = $3
                `, [pppoe_username, pppoe_password, serviceId]);

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

        return {
            customer: updatedCustomer,
            changes: {
                radiusCommentUpdated
            }
        };
    }

    /**
     * Delete customer
     */
    static async deleteCustomer(id) {
        const currentRes = await query('SELECT * FROM customers WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) return null;
        const customer = currentRes.rows[0];

        // Check deps
        const invoiceCheck = await query('SELECT COUNT(*) as count FROM invoices WHERE customer_id = $1', [id]);
        if (parseInt(invoiceCheck.rows[0].count) > 0) {
            throw { code: 'RESOURCE_CONFLICT', message: 'Pelanggan masih memiliki invoice', count: invoiceCheck.rows[0].count };
        }

        const sessionCheck = await query('SELECT COUNT(*) as count FROM customer_sessions WHERE username = $1', [customer.pppoe_username]);
        if (parseInt(sessionCheck.rows[0].count) > 0) {
            throw { code: 'RESOURCE_CONFLICT', message: 'Pelanggan masih memiliki sesi aktif', count: sessionCheck.rows[0].count };
        }

        await query('DELETE FROM customers WHERE id = $1', [id]);
        return customer;
    }
}

module.exports = CustomerService;
