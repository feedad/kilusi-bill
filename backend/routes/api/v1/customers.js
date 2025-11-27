const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const { getActivePPPoEConnections } = require('../../../config/mikrotik');
const { jwtAuth } = require('../../../middleware/jwtAuth');

// Helper function to generate customer ID with sequence
function generateCustomerID(sequence) {
    const today = new Date();
    const dateStr = today.getFullYear().toString().slice(-2) +                   // YY
                   (today.getMonth() + 1).toString().padStart(2, '0') +           // MM
                   today.getDate().toString().padStart(2, '0');                    // DD
    const sequenceStr = sequence.toString().padStart(5, '0');                     // 5 digit sequence
    return dateStr + sequenceStr;
}

// GET /api/v1/customers - Get all customers with pagination and search
router.get('/', jwtAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (search) {
            whereClause += ` AND (c.name ILIKE $${queryParams.length + 1} OR c.phone ILIKE $${queryParams.length + 1} OR c.email ILIKE $${queryParams.length + 1} OR c.pppoe_username ILIKE $${queryParams.length + 1} OR c.customer_id ILIKE $${queryParams.length + 1})`;
            queryParams.push(`%${search}%`);
        }

        if (status) {
            whereClause += ` AND c.status = $${queryParams.length + 1}`;
            queryParams.push(status);
        }

        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM customers c
            ${whereClause}
        `;

        const countResult = await query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Data query
        const dataQuery = `
            SELECT
                c.id,
                c.customer_id,
                c.name,
                c.phone,
                c.nik,
                c.address,
                c.area,
                c.region_id,
                c.odp_id,
                c.odp_name,
                c.odp_address,
                c.odp_port,
                c.router,
                r.name as region_name,
                r.id as region_uuid,
                c.latitude,
                c.longitude,
                c.pppoe_username,
                c.pppoe_password,
                c.status,
                c.created_at,
                c.updated_at,
                c.install_date,
                c.active_date,
                c.isolir_date,
                c.package_id,
                c.siklus,
                c.billing_type,
                c.trial_active,
                c.trial_expires_at,
                -- Package information
                p.name as package_name,
                p.price as package_price,
                p.speed as package_speed,
                -- Router/NAS information
                COALESCE(nas.shortname, nas.nasname) as router_name,
                nas.nasname as router_ip,
                -- Billing status
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
                -- Last invoice date
                (SELECT MAX(created_at) FROM invoices WHERE customer_id = c.id) as last_invoice_date,
                -- Online status (default to false since customer_sessions table doesn't exist)
                false as is_online
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
            LEFT JOIN regions r ON c.region_id = r.id
            -- Join with NAS table to get router info
            LEFT JOIN nas ON (c.router != 'all' AND c.router::text = nas.id::text)
            ${whereClause}
            ORDER BY c.created_at DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
        `;

        queryParams.push(limit, offset);
        const result = await query(dataQuery, queryParams);

        // Calculate automatic isolir dates for customers
        const customersWithAutoIsolir = result.rows.map((customer) => {
            try {
                // Calculate isolir date only if customer has active_date and siklus
                if (customer.active_date && customer.siklus) {
                    let calculatedIsolirDate;

                    // Simple isolir date calculation based on siklus
                    const activeDate = new Date(customer.active_date);

                    switch (customer.siklus) {
                        case 'profile':
                        case 'tetap':
                            // Add 30 days for profile/tetap cycle
                            calculatedIsolirDate = new Date(activeDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                            break;
                        case 'fixed':
                            // Same day next month
                            calculatedIsolirDate = new Date(activeDate);
                            calculatedIsolirDate.setMonth(calculatedIsolirDate.getMonth() + 1);
                            break;
                        case 'monthly':
                        case 'bulan':
                            // 20th of next month
                            calculatedIsolirDate = new Date(activeDate.getFullYear(), activeDate.getMonth() + 1, 20);
                            break;
                        default:
                            // Default to 30 days
                            calculatedIsolirDate = new Date(activeDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                    }

                    // Format as YYYY-MM-DD
                    const formattedDate = calculatedIsolirDate.toISOString().split('T')[0];

                    return {
                        ...customer,
                        calculated_isolir_date: formattedDate
                    };
                }
                return customer;
            } catch (error) {
                logger.error(`Error calculating isolir date for customer ${customer.id}:`, error);
                return customer;
            }
        });

        res.json({
            success: true,
            data: {
                customers: customersWithAutoIsolir,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching customers:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data pelanggan'
        });
    }
});

// GET /api/v1/customers/next-sequence - Get next customer sequence number
router.get('/next-sequence', jwtAuth, async (req, res) => {
    try {
        // Get total count of customers for sequence
        const countResult = await query('SELECT COUNT(*) as total FROM customers');
        const totalCount = parseInt(countResult.rows[0].total);
        const nextSequence = totalCount + 1;

        res.json({
            success: true,
            data: {
                sequence: nextSequence,
                customer_id: generateCustomerID(nextSequence)
            }
        });

    } catch (error) {
        logger.error('Error getting next customer sequence:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil nomor urut customer'
        });
    }
});

// GET /api/v1/customers/:id - Get customer by ID
router.get('/:id', jwtAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const customerQuery = `
            SELECT
                c.*,
                p.name as package_name,
                p.price as package_price,
                p.speed as package_speed,
                p.description as package_description,
                r.name as region_name,
                COALESCE(nas.shortname, nas.nasname) as router_name,
                nas.nasname as router_ip
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
            LEFT JOIN regions r ON c.region_id = r.id
            -- Join with NAS table to get router info
            LEFT JOIN nas ON (c.router != 'all' AND c.router::text = nas.id::text)
            WHERE c.id = $1
        `;

        const result = await query(customerQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pelanggan tidak ditemukan'
            });
        }

        const customer = result.rows[0];

        // Calculate automatic isolir date for this customer
        try {
            if (customer.active_date && customer.siklus) {
                let calculatedIsolirDate;

                // Simple isolir date calculation based on siklus
                const activeDate = new Date(customer.active_date);

                switch (customer.siklus) {
                    case 'profile':
                    case 'tetap':
                        // Add 30 days for profile/tetap cycle
                        calculatedIsolirDate = new Date(activeDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                        break;
                    case 'fixed':
                        // Same day next month
                        calculatedIsolirDate = new Date(activeDate);
                        calculatedIsolirDate.setMonth(calculatedIsolirDate.getMonth() + 1);
                        break;
                    case 'monthly':
                    case 'bulan':
                        // 20th of next month
                        calculatedIsolirDate = new Date(activeDate.getFullYear(), activeDate.getMonth() + 1, 20);
                        break;
                    default:
                        // Default to 30 days
                        calculatedIsolirDate = new Date(activeDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                }

                // Format as YYYY-MM-DD
                customer.calculated_isolir_date = calculatedIsolirDate.toISOString().split('T')[0];
            }
        } catch (error) {
            logger.error(`Error calculating isolir date for customer ${customer.id}:`, error);
        }

        // Get connection status from RADIUS
        const radiusDb = require('../../../config/radius-postgres');
        const connectionStatus = await radiusDb.getUserConnectionStatus(customer.pppoe_username);

        // Get customer invoices
        const invoicesQuery = `
            SELECT
                id,
                invoice_number,
                amount,
                status,
                due_date,
                created_at,
                paid_at
            FROM invoices
            WHERE customer_id = $1
            ORDER BY created_at DESC
            LIMIT 12
        `;

        const invoicesResult = await query(invoicesQuery, [id]);

        // Get customer sessions (if exists)
        const sessionsQuery = `
            SELECT
                id,
                session_id,
                username,
                ip_address,
                mac_address,
                start_time,
                stop_time,
                active,
                data_used,
                session_time
            FROM customer_sessions
            WHERE username = $1
            ORDER BY start_time DESC
            LIMIT 10
        `;

        const sessionsResult = await query(sessionsQuery, [customer.pppoe_username]);

        res.json({
            success: true,
            data: {
                customer: {
                    ...customer,
                    connection_status: connectionStatus || { online: false, status: 'offline' },
                    invoices: invoicesResult.rows,
                    sessions: sessionsResult.rows
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching customer:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data pelanggan'
        });
    }
});

// POST /api/v1/customers - Create new customer
router.post('/', async (req, res) => {
    try {
        const {
            name,
            phone,
            email,
            address,
            area,
            region,  // Accept 'region' from frontend (region name)
            region_id, // Accept 'region_id' from frontend (preferred)
            package_id,
            pppoe_username,
            pppoe_password,
            siklus = 'profile',
            billing_cycle, // Support legacy field name
            billing_type = 'postpaid', // Add billing type support
            status = 'active'
        } = req.body;

        // Handle siklus mapping (support both field names and value mapping)
        let finalSiklus = siklus || billing_cycle || 'profile';

        // Map frontend values to backend values
        const siklusMapping = {
            'profile': 'profile',
            'tetap': 'fixed',
            'bulan': 'monthly'
        };

        finalSiklus = siklusMapping[finalSiklus] || finalSiklus;

        // Validation
        if (!name || !phone || !package_id) {
            return res.status(400).json({
                success: false,
                message: 'Nama, nomor telepon, dan paket harus diisi'
            });
        }

        // Check if phone already exists
        const existingPhone = await query(
            'SELECT id FROM customers WHERE phone = $1',
            [phone]
        );

        if (existingPhone.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Nomor telepon sudah terdaftar'
            });
        }

        // Check if PPPoE username already exists
        if (pppoe_username) {
            const existingUsername = await query(
                'SELECT id FROM customers WHERE pppoe_username = $1',
                [pppoe_username]
            );

            if (existingUsername.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Username PPPoE sudah terdaftar'
                });
            }
        }

        // Priority system for region data (same as PUT endpoint)
        let finalArea = area;
        let finalRegionId = region_id;

        if (region_id) {
            // New system: use region_id directly and update area from region_categories
            console.log('✅ Using region_id (new system):', region_id);

            // Update area field from regions table
            const regionResult = await query('SELECT name FROM regions WHERE id = $1', [region_id]);
            if (regionResult.rows.length > 0) {
                finalArea = regionResult.rows[0].name;
                console.log('🔄 Updated area from region_categories:', finalArea);
            }
        } else if (region && region !== area) {
            // Old system: region contains selected region name, update area field and try to find region_id
            finalArea = region;
            console.log('🔄 Using region name as area (old system):', region);

            // Try to find matching region_id from regions
            const regionMatch = await query('SELECT id FROM regions WHERE name = $1', [region]);
            if (regionMatch.rows.length > 0) {
                finalRegionId = regionMatch.rows[0].id;
                console.log('🔄 Found matching region_id:', finalRegionId);
            }
        } else {
            console.log('🔄 Using original area field:', area);

            // Try to find region_id from existing area
            if (area) {
                const regionMatch = await query('SELECT id FROM regions WHERE name = $1', [area]);
                if (regionMatch.rows.length > 0) {
                    finalRegionId = regionMatch.rows[0].id;
                    console.log('🔄 Found existing region_id for area:', finalRegionId);
                }
            }
        }

        // Insert customer
        const result = await query(`
            INSERT INTO customers (
                name, phone, email, address, area, region_id, package_id,
                pppoe_username, pppoe_password, siklus, billing_type, status, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP
            ) RETURNING *
        `, [name, phone, email, address, finalArea, finalRegionId, package_id, pppoe_username, pppoe_password, finalSiklus, billing_type, status]);

        const customer = result.rows[0];

        // Create invoice based on billing type
        const billingService = require('../services/billing-service');
        const invoiceResult = await billingService.createCustomerInvoice(
            customer.id,
            package_id,
            billing_type
        );

        // Emit event for RADIUS sync
        if (global.appEvents && pppoe_username && pppoe_password) {
            global.appEvents.emit('customer:upsert', customer);
        }

        res.status(201).json({
            success: true,
            data: {
                customer,
                invoice: invoiceResult.invoice,
                billingInfo: {
                    type: billing_type,
                    message: invoiceResult.message
                }
            },
            message: `Pelanggan berhasil ditambahkan (${billing_type === 'prepaid' ? 'Prabayar' : 'Pascabayar'})`
        });

    } catch (error) {
        logger.error('Error creating customer:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menambah pelanggan'
        });
    }
});

// PUT /api/v1/customers/:id - Update customer
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            phone,
            email,
            address,
            area,
            region,  // Accept 'region' from frontend (region name)
            region_id, // Accept 'region_id' from frontend (preferred)
            package_id,
            pppoe_username,
            pppoe_password,
            siklus,
            billing_cycle, // Support legacy field name
            billing_type, // Support direct billing_type field
            status,
            latitude,
            longitude,
            odp_id,
            odp_name,
            odp_address,
            odp_port
        } = req.body;

        // Handle siklus mapping (support both field names and value mapping)
        let finalSiklus = siklus || billing_cycle;

        // Map frontend values to backend values (if provided)
        if (finalSiklus) {
            const siklusMapping = {
                'profile': 'profile',
                'tetap': 'fixed',
                'bulan': 'monthly'
            };

            finalSiklus = siklusMapping[finalSiklus] || finalSiklus;
        }

        // Debug logging untuk field mapping
        console.log('🔍 DEBUG: Processing customer update');
        console.log('📝 Original area field:', area);
        console.log('📍 Original region field (name):', region);
        console.log('🆔 Original region_id field:', region_id);

        // Priority system for region data:
        // 1. Use region_id if provided (new system)
        // 2. Fallback to region name mapping (old system)
        // 3. Fallback to area field (legacy)
        let finalArea = area;
        let finalRegionId = region_id;

        if (region_id) {
            // New system: use region_id directly and update area from region_categories
            console.log('✅ Using region_id (new system):', region_id);

            // Update area field from regions table
            const regionResult = await query('SELECT name FROM regions WHERE id = $1', [region_id]);
            if (regionResult.rows.length > 0) {
                finalArea = regionResult.rows[0].name;
                console.log('🔄 Updated area from region_categories:', finalArea);
            }
        } else if (region && region !== area) {
            // Old system: region contains selected region name, update area field and try to find region_id
            finalArea = region;
            console.log('🔄 Using region name as area (old system):', region);

            // Try to find matching region_id from regions
            const regionMatch = await query('SELECT id FROM regions WHERE name = $1', [region]);
            if (regionMatch.rows.length > 0) {
                finalRegionId = regionMatch.rows[0].id;
                console.log('🔄 Found matching region_id:', finalRegionId);
            }
        } else {
            console.log('🔄 Using original area field:', area);

            // Try to find region_id from existing area
            if (area) {
                const regionMatch = await query('SELECT id FROM regions WHERE name = $1', [area]);
                if (regionMatch.rows.length > 0) {
                    finalRegionId = regionMatch.rows[0].id;
                    console.log('🔄 Found existing region_id for area:', finalRegionId);
                }
            }
        }

        console.log('✅ Final area to save:', finalArea);
        console.log('✅ Final region_id to save:', finalRegionId);

        // Check if customer exists
        const existingCustomer = await query(
            'SELECT * FROM customers WHERE id = $1::varchar',
            [id]
        );

        if (existingCustomer.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pelanggan tidak ditemukan'
            });
        }

        // Check if phone already exists (excluding current customer)
        if (phone && phone !== existingCustomer.rows[0].phone) {
            const existingPhone = await query(
                'SELECT id FROM customers WHERE phone = $1 AND id != $2',
                [phone, id]
            );

            if (existingPhone.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Nomor telepon sudah terdaftar'
                });
            }
        }

        // Check if PPPoE username already exists (excluding current customer)
        if (pppoe_username && pppoe_username !== existingCustomer.rows[0].pppoe_username) {
            const existingUsername = await query(
                'SELECT id FROM customers WHERE pppoe_username = $1 AND id != $2',
                [pppoe_username, id]
            );

            if (existingUsername.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Username PPPoE sudah terdaftar'
                });
            }
        }

    
        console.log('🔍 UPDATE DEBUG - Parameters being sent to database:');
        console.log(`  - latitude: ${latitude} (type: ${typeof latitude})`);
        console.log(`  - longitude: ${longitude} (type: ${typeof longitude})`);
        console.log(`  - customer_id: ${id}`);

        // Update customer
        const result = await query(`
            UPDATE customers SET
                name = COALESCE($1, name),
                phone = COALESCE($2, phone),
                email = COALESCE($3, email),
                address = COALESCE($4, address),
                area = COALESCE($5, area),
                region_id = COALESCE($6, region_id),
                package_id = COALESCE($7, package_id),
                pppoe_username = COALESCE($8, pppoe_username),
                pppoe_password = COALESCE($9, pppoe_password),
                siklus = COALESCE($10, siklus),
                billing_type = COALESCE($11, billing_type),
                status = COALESCE($12, status),
                latitude = COALESCE($13, latitude),
                longitude = COALESCE($14, longitude),
                odp_id = COALESCE($15, odp_id),
                odp_name = COALESCE($16, odp_name),
                odp_address = COALESCE($17, odp_address),
                odp_port = COALESCE($18, odp_port),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $19::varchar
            RETURNING *
        `, [name, phone, email, address, finalArea, finalRegionId, package_id, pppoe_username, pppoe_password, finalSiklus, billing_type, status, latitude, longitude, odp_id, odp_name, odp_address, odp_port, id]);

        const customer = result.rows[0];
        console.log('✅ UPDATE DEBUG - Database result:');
        console.log(`  - New latitude: ${customer.latitude}`);
        console.log(`  - New longitude: ${customer.longitude}`);
        console.log(`  - Updated at: ${customer.updated_at}`);

        // Emit event for RADIUS sync
        if (global.appEvents && customer.pppoe_username && customer.pppoe_password) {
            global.appEvents.emit('customer:upsert', customer);
        }

        res.json({
            success: true,
            data: { customer },
            message: 'Pelanggan berhasil diperbarui'
        });

    } catch (error) {
        logger.error('Error updating customer:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui pelanggan'
        });
    }
});

// DELETE /api/v1/customers/:id - Soft delete customer
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if customer exists
        const existingCustomer = await query(
            'SELECT * FROM customers WHERE id = $1',
            [id]
        );

        if (existingCustomer.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pelanggan tidak ditemukan'
            });
        }

        // Check for dependencies before deleting
        const invoiceCheck = await query(
            'SELECT COUNT(*) as count FROM invoices WHERE customer_id = $1',
            [id]
        );

        if (parseInt(invoiceCheck.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus pelanggan yang masih memiliki invoice'
            });
        }

        // Hard delete customer
        await query(
            'DELETE FROM customers WHERE id = $1',
            [id]
        );

        res.json({
            success: true,
            message: 'Pelanggan berhasil dihapus'
        });

    } catch (error) {
        logger.error('Error deleting customer:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghapus pelanggan'
        });
    }
});

module.exports = router;