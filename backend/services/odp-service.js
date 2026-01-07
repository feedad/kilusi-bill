/**
 * ODP (Optical Distribution Point) Management Service
 * Handles all ODP-related operations including CRUD, statistics, and cable routes
 */

const { query, getOne, getAll, transaction } = require('../config/database');
const { logger } = require('../config/logger');

// ============================================
// ODP MANAGEMENT FUNCTIONS
// ============================================

/**
 * Get all ODPs with statistics
 */
async function getAllODPs(filters = {}) {
    try {
        let sql = `
            SELECT
                o.*,
                p.name as parent_name,
                p.code as parent_code,
                COALESCE(c.connected_customers, 0) as connected_customers,
                COALESCE(c.active_connections, 0) as active_connections,
                CASE
                    WHEN o.capacity = 0 THEN 0
                    ELSE CAST(ROUND((COALESCE(c.connected_customers, 0)::decimal / o.capacity * 100), 2) AS NUMERIC)
                END as utilization_percentage
            FROM odps o
            LEFT JOIN odps p ON o.parent_odp_id = p.id
            LEFT JOIN (
                SELECT
                    cv.odp_code as odp_id,
                    COUNT(*) as connected_customers,
                    COUNT(CASE WHEN cv.status = 'active' THEN 1 END) as active_connections
                FROM customers_view cv
                WHERE cv.odp_code IS NOT NULL AND cv.odp_code != ''
                GROUP BY cv.odp_code
            ) c ON o.id::text = c.odp_id
        `;

        const conditions = [];
        const values = [];

        if (filters.status) {
            conditions.push(`o.status = $${values.length + 1}`);
            values.push(filters.status);
        }

        if (filters.parent_odp_id) {
            conditions.push(`o.parent_odp_id = $${values.length + 1}`);
            values.push(filters.parent_odp_id);
        }

        if (filters.search) {
            conditions.push(`(
                o.name ILIKE $${values.length + 1} OR
                o.code ILIKE $${values.length + 1} OR
                o.address ILIKE $${values.length + 1}
            )`);
            values.push(`%${filters.search}%`);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY o.created_at DESC';

        return await getAll(sql, values);
    } catch (error) {
        logger.error('Error getting ODPs:', error);
        return [];
    }
}

/**
 * Get ODP by ID with full details
 */
async function getODPById(id) {
    try {
        const sql = `
            SELECT
                o.*,
                p.name as parent_name,
                p.code as parent_code,
                COALESCE(c.connected_customers, 0) as connected_customers,
                COALESCE(c.active_connections, 0) as active_connections,
                CASE
                    WHEN o.capacity = 0 THEN 0
                    ELSE CAST(ROUND((COALESCE(c.connected_customers, 0)::decimal / o.capacity * 100), 2) AS NUMERIC)
                END as utilization_percentage
            FROM odps o
            LEFT JOIN odps p ON o.parent_odp_id = p.id
            LEFT JOIN (
                SELECT
                    cv.odp_code as odp_id,
                    COUNT(*) as connected_customers,
                    COUNT(CASE WHEN cv.status = 'active' THEN 1 END) as active_connections
                FROM customers_view cv
                WHERE cv.odp_code IS NOT NULL AND cv.odp_code != ''
                GROUP BY cv.odp_code
            ) c ON o.id::text = c.odp_id
            WHERE o.id = $1
        `;

        return await getOne(sql, [id]);
    } catch (error) {
        logger.error('Error getting ODP by ID:', error);
        return null;
    }
}

/**
 * Get ODP by code
 */
async function getODPByCode(code) {
    try {
        const sql = `
            SELECT
                o.*,
                p.name as parent_name,
                p.code as parent_code,
                COALESCE(c.connected_customers, 0) as connected_customers,
                COALESCE(c.active_connections, 0) as active_connections
            FROM odps o
            LEFT JOIN odps p ON o.parent_odp_id = p.id
            LEFT JOIN (
                SELECT
                    odp_id,
                    COUNT(*) as connected_customers,
                    COUNT(CASE WHEN cr.status = 'connected' THEN 1 END) as active_connections
                FROM cable_routes cr
                GROUP BY odp_id
            ) c ON o.id = c.odp_id
            WHERE o.code = $1
        `;

        return await getOne(sql, [code]);
    } catch (error) {
        logger.error('Error getting ODP by code:', error);
        return null;
    }
}

/**
 * Create new ODP
 */
async function createODP(odpData) {
    try {
        return await transaction(async (client) => {
            // Validate parent ODP exists
            if (odpData.parent_odp_id) {
                const parentExists = await client.query(
                    'SELECT id FROM odps WHERE id = $1',
                    [odpData.parent_odp_id]
                );

                if (parentExists.rows.length === 0) {
                    throw new Error('Parent ODP not found');
                }
            }

            // Check if code already exists
            const codeExists = await client.query(
                'SELECT id FROM odps WHERE code = $1',
                [odpData.code]
            );

            if (codeExists.rows.length > 0) {
                throw new Error('ODP code already exists');
            }

            const sql = `
                INSERT INTO odps (
                    name, code, address, latitude, longitude, capacity,
                    status, parent_odp_id, notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `;

            const values = [
                odpData.name,
                odpData.code,
                odpData.address || null,
                odpData.latitude || null,
                odpData.longitude || null,
                odpData.capacity || 64,
                odpData.status || 'active',
                odpData.parent_odp_id || null,
                odpData.notes || null
            ];

            const result = await client.query(sql, values);
            logger.info('ODP created:', result.rows[0]);
            return result.rows[0];
        });
    } catch (error) {
        logger.error('Error creating ODP:', error);
        throw error;
    }
}

/**
 * Update ODP
 */
async function updateODP(id, odpData) {
    try {
        return await transaction(async (client) => {
            // Validate parent ODP exists
            if (odpData.parent_odp_id) {
                // Prevent circular reference
                if (parseInt(odpData.parent_odp_id) === parseInt(id)) {
                    throw new Error('ODP cannot be its own parent');
                }

                const parentExists = await client.query(
                    'SELECT id FROM odps WHERE id = $1',
                    [odpData.parent_odp_id]
                );

                if (parentExists.rows.length === 0) {
                    throw new Error('Parent ODP not found');
                }
            }

            // Check if code already exists (excluding current ODP)
            if (odpData.code) {
                const codeExists = await client.query(
                    'SELECT id FROM odps WHERE code = $1 AND id != $2',
                    [odpData.code, id]
                );

                if (codeExists.rows.length > 0) {
                    throw new Error('ODP code already exists');
                }
            }

            const sql = `
                UPDATE odps
                SET name = $1, code = $2, address = $3, latitude = $4,
                    longitude = $5, capacity = $6, status = $7,
                    parent_odp_id = $8, notes = $9, updated_at = CURRENT_TIMESTAMP
                WHERE id = $10
                RETURNING *
            `;

            const values = [
                odpData.name,
                odpData.code,
                odpData.address || null,
                odpData.latitude || null,
                odpData.longitude || null,
                odpData.capacity,
                odpData.status,
                odpData.parent_odp_id || null,
                odpData.notes || null,
                id
            ];

            const result = await client.query(sql, values);

            if (result.rows.length === 0) {
                throw new Error('ODP not found');
            }

            logger.info('ODP updated:', result.rows[0]);
            return result.rows[0];
        });
    } catch (error) {
        logger.error('Error updating ODP:', error);
        throw error;
    }
}

/**
 * Delete ODP
 */
async function deleteODP(id) {
    try {
        return await transaction(async (client) => {
            // Check if ODP has connected customers
            const connectedCustomers = await client.query(
                'SELECT COUNT(*) as count FROM cable_routes WHERE odp_id = $1',
                [id]
            );

            if (parseInt(connectedCustomers.rows[0].count) > 0) {
                throw new Error('Cannot delete ODP with connected customers');
            }

            // Check if ODP has child ODPs
            const childODPs = await client.query(
                'SELECT COUNT(*) as count FROM odps WHERE parent_odp_id = $1',
                [id]
            );

            if (parseInt(childODPs.rows[0].count) > 0) {
                throw new Error('Cannot delete ODP that has child ODPs');
            }

            const sql = 'DELETE FROM odps WHERE id = $1';
            const result = await client.query(sql, [id]);

            if (result.rowCount === 0) {
                throw new Error('ODP not found');
            }

            logger.info('ODP deleted:', id);
            return true;
        });
    } catch (error) {
        logger.error('Error deleting ODP:', error);
        throw error;
    }
}

/**
 * Get parent ODPs (for dropdown selection)
 */
async function getParentODPs() {
    try {
        const sql = `
            SELECT id, name, code, used_ports, capacity, status
            FROM odps
            WHERE parent_odp_id IS NULL
            ORDER BY name ASC
        `;

        return await getAll(sql);
    } catch (error) {
        logger.error('Error getting parent ODPs:', error);
        return [];
    }
}

/**
 * Get ODP statistics
 */
async function getODPStats() {
    try {
        const stats = await getOne(`
            SELECT
                (SELECT COUNT(*) FROM odps) as total_odps,
                (SELECT COUNT(*) FROM odps WHERE status = 'active') as active_odps,
                (SELECT COUNT(*) FROM odps WHERE status = 'maintenance') as maintenance_odps,
                (SELECT COUNT(*) FROM odps WHERE status = 'inactive') as inactive_odps,
                (SELECT COUNT(*) FROM network_infrastructure WHERE odp_code IS NOT NULL AND odp_code != '') as total_cable_routes,
                (SELECT COUNT(*) FROM customers_view cv JOIN network_infrastructure ni ON cv.service_id = ni.service_id WHERE ni.odp_code IS NOT NULL AND cv.status = 'active') as connected_routes,
                0 as disconnected_routes,
                0 as maintenance_routes,
                (SELECT COALESCE(SUM(capacity), 0) FROM odps) as total_capacity,
                (SELECT COUNT(*) FROM customers_view WHERE odp_code IS NOT NULL AND odp_code != '') as total_used_ports,
                (SELECT COUNT(*) FROM customers_view WHERE odp_code IS NOT NULL) as total_connected_customers,
                (SELECT COUNT(*) FROM customers_view WHERE odp_code IS NOT NULL AND status = 'active') as total_active_customers,
                (SELECT COUNT(*) FROM customers_view WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as mapped_customers
        `);

        return stats;
    } catch (error) {
        logger.error('Error getting ODP stats:', error);
        return null;
    }
}

// ============================================
// CABLE ROUTES MANAGEMENT FUNCTIONS
// ============================================

/**
 * Get cable routes for an ODP
 */
async function getODPCableRoutes(odpId, filters = {}) {
    try {
        // Query from customers_view which gets data from network_infrastructure
        let sql = `
            SELECT
                n.id,
                n.service_id,
                n.odp_code as odp_id,
                n.port_number,
                n.cable_length_meters as cable_length,
                n.cable_type,
                cv.id as customer_id,
                cv.name as customer_name,
                cv.phone as customer_phone,
                cv.address as customer_address,
                cv.latitude as customer_latitude,
                cv.longitude as customer_longitude,
                cv.status,
                p.name as package_name,
                n.created_at
            FROM network_infrastructure n
            JOIN services s ON n.service_id = s.id
            JOIN customers_view cv ON s.customer_id = cv.id
            LEFT JOIN packages p ON cv.package_id = p.id
            WHERE n.odp_code = $1::text
        `;

        const conditions = [];
        const values = [odpId];

        if (filters.status) {
            conditions.push(`cv.status = $${values.length + 1}`);
            values.push(filters.status);
        }

        if (conditions.length > 0) {
            sql += ' AND ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY n.port_number ASC';

        return await getAll(sql, values);
    } catch (error) {
        logger.error('Error getting ODP cable routes:', error);
        return [];
    }
}

/**
 * Create cable route
 */
async function createCableRoute(routeData) {
    try {
        return await transaction(async (client) => {
            // Validate ODP exists
            const odpExists = await client.query(
                'SELECT id, capacity, used_ports FROM odps WHERE id = $1',
                [routeData.odp_id]
            );

            if (odpExists.rows.length === 0) {
                throw new Error('ODP not found');
            }

            // Check customer exists
            const customerExists = await client.query(
                'SELECT customer_id FROM customers WHERE customer_id = $1',
                [routeData.customer_id]
            );

            if (customerExists.rows.length === 0) {
                throw new Error('Customer not found');
            }

            // Check if route already exists
            const existingRoute = await client.query(
                'SELECT id FROM cable_routes WHERE odp_id = $1 AND customer_id = $2',
                [routeData.odp_id, routeData.customer_id]
            );

            if (existingRoute.rows.length > 0) {
                throw new Error('Cable route already exists for this ODP and customer');
            }

            // Check port number availability
            if (routeData.port_number) {
                const portExists = await client.query(
                    'SELECT id FROM cable_routes WHERE odp_id = $1 AND port_number = $2 AND status = \'connected\'',
                    [routeData.odp_id, routeData.port_number]
                );

                if (portExists.rows.length > 0) {
                    throw new Error('Port number already in use');
                }
            }

            const sql = `
                INSERT INTO cable_routes (
                    odp_id, customer_id, cable_length, port_number,
                    status, installation_date, notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;

            const values = [
                routeData.odp_id,
                routeData.customer_id,
                routeData.cable_length || null,
                routeData.port_number || null,
                routeData.status || 'connected',
                routeData.installation_date || null,
                routeData.notes || null
            ];

            const result = await client.query(sql, values);
            logger.info('Cable route created:', result.rows[0]);
            return result.rows[0];
        });
    } catch (error) {
        logger.error('Error creating cable route:', error);
        throw error;
    }
}

/**
 * Update cable route
 */
async function updateCableRoute(id, routeData) {
    try {
        return await transaction(async (client) => {
            // Check port number availability
            if (routeData.port_number) {
                const existingRoute = await client.query(
                    'SELECT odp_id, port_number FROM cable_routes WHERE id = $1',
                    [id]
                );

                if (existingRoute.rows.length > 0) {
                    const route = existingRoute.rows[0];

                    if (routeData.port_number !== route.port_number) {
                        const portExists = await client.query(
                            'SELECT id FROM cable_routes WHERE odp_id = $1 AND port_number = $2 AND status = \'connected\' AND id != $3',
                            [route.odp_id, routeData.port_number, id]
                        );

                        if (portExists.rows.length > 0) {
                            throw new Error('Port number already in use');
                        }
                    }
                }
            }

            const sql = `
                UPDATE cable_routes
                SET cable_length = $1, port_number = $2, status = $3,
                    installation_date = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
                WHERE id = $6
                RETURNING *
            `;

            const values = [
                routeData.cable_length || null,
                routeData.port_number || null,
                routeData.status,
                routeData.installation_date || null,
                routeData.notes || null,
                id
            ];

            const result = await client.query(sql, values);

            if (result.rows.length === 0) {
                throw new Error('Cable route not found');
            }

            logger.info('Cable route updated:', result.rows[0]);
            return result.rows[0];
        });
    } catch (error) {
        logger.error('Error updating cable route:', error);
        throw error;
    }
}

/**
 * Delete cable route
 */
async function deleteCableRoute(id) {
    try {
        const sql = 'DELETE FROM cable_routes WHERE id = $1';
        const result = await query(sql, [id]);

        if (result.rowCount === 0) {
            throw new Error('Cable route not found');
        }

        logger.info('Cable route deleted:', id);
        return true;
    } catch (error) {
        logger.error('Error deleting cable route:', error);
        throw error;
    }
}

module.exports = {
    // ODP Management
    getAllODPs,
    getODPById,
    getODPByCode,
    createODP,
    updateODP,
    deleteODP,
    getParentODPs,
    getODPStats,

    // Cable Routes Management
    getODPCableRoutes,
    createCableRoute,
    updateCableRoute,
    deleteCableRoute
};