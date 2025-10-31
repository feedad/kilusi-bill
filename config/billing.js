/**
 * Billing Manager with PostgreSQL Database
 * Handles packages, customers, invoices, and payments
 */

const { query, getOne, getAll, transaction, initializePool } = require('./database');
const { logger } = require('./logger');
const { getSetting } = require('./settingsManager');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Normalize phone number to 62xxxxxxxxx format
 */
function normalizePhone(phone) {
    if (!phone) return '';
    let p = String(phone).replace(/\D/g, '');
    if (p.startsWith('0')) {
        p = '62' + p.slice(1);
    } else if (!p.startsWith('62')) {
        p = '62' + p;
    }
    return p;
}

/**
 * Generate invoice number
 */
function generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}-${random}`;
}

/**
 * Generate ticket number
 */
function generateTicketNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `TKT-${year}${month}${day}-${random}`;
}

// ============================================
// PACKAGES MANAGEMENT
// ============================================

/**
 * Get all packages
 */
async function getPackages(activeOnly = false) {
    try {
        let sql = 'SELECT * FROM packages';
        if (activeOnly) {
            sql += ' WHERE is_active = true';
        }
        sql += ' ORDER BY price ASC';
        
        const packages = await getAll(sql);
        return packages;
    } catch (error) {
        logger.error('Error getting packages:', error);
        return [];
    }
}

/**
 * Get package by ID
 */
async function getPackageById(id) {
    try {
        const sql = 'SELECT * FROM packages WHERE id = $1';
        return await getOne(sql, [id]);
    } catch (error) {
        logger.error('Error getting package by ID:', error);
        return null;
    }
}

/**
 * Create new package
 */
async function createPackage(packageData) {
    try {
        const sql = `
            INSERT INTO packages (
                name, speed, price, tax_rate, description, pppoe_profile, 
                is_active, "group", rate_limit, shared, hpp, commission
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `;
        const values = [
            packageData.name,
            packageData.speed,
            packageData.price,
            packageData.tax_rate || 11.00,
            packageData.description || '',
            packageData.pppoe_profile || 'default',
            packageData.is_active !== false,
            packageData.group || null,
            packageData.rate_limit || null,
            packageData.shared || 0,
            packageData.hpp || 0,
            packageData.commission || 0
        ];
        
        const result = await query(sql, values);
        logger.info('Package created:', result.rows[0]);
        return result.rows[0];
    } catch (error) {
        logger.error('Error creating package:', error);
        throw error;
    }
}

/**
 * Update package
 */
async function updatePackage(id, packageData) {
    try {
        const sql = `
            UPDATE packages 
            SET name = $1, speed = $2, price = $3, tax_rate = $4, 
                description = $5, pppoe_profile = $6, is_active = $7,
                "group" = $8, rate_limit = $9, shared = $10, 
                hpp = $11, commission = $12
            WHERE id = $13
            RETURNING *
        `;
        const values = [
            packageData.name,
            packageData.speed,
            packageData.price,
            packageData.tax_rate,
            packageData.description,
            packageData.pppoe_profile,
            packageData.is_active,
            packageData.group || null,
            packageData.rate_limit || null,
            packageData.shared || 0,
            packageData.hpp || 0,
            packageData.commission || 0,
            id
        ];
        
        const result = await query(sql, values);
        logger.info('Package updated:', result.rows[0]);
        return result.rows[0];
    } catch (error) {
        logger.error('Error updating package:', error);
        throw error;
    }
}

/**
 * Delete package
 */
async function deletePackage(id) {
    try {
        const sql = 'DELETE FROM packages WHERE id = $1';
        await query(sql, [id]);
        logger.info('Package deleted:', id);
        return true;
    } catch (error) {
        logger.error('Error deleting package:', error);
        throw error;
    }
}

// ============================================
// CUSTOMERS MANAGEMENT
// ============================================

/**
 * Get all customers
 */
async function getCustomers(filters = {}) {
    try {
        let sql = `
            SELECT c.*, p.name as package_name, p.price as package_price 
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
        `;
        const conditions = [];
        const values = [];
        
        if (filters.status) {
            conditions.push(`c.status = $${values.length + 1}`);
            values.push(filters.status);
        }
        
        if (filters.package_id) {
            conditions.push(`c.package_id = $${values.length + 1}`);
            values.push(filters.package_id);
        }
        
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        
        sql += ' ORDER BY c.created_at DESC';
        
        return await getAll(sql, values);
    } catch (error) {
        logger.error('Error getting customers:', error);
        return [];
    }
}

/**
 * Get customer by ID
 */
async function getCustomerById(id) {
    try {
        const sql = `
            SELECT c.*, p.name as package_name, p.price as package_price, p.speed
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
            WHERE c.id = $1
        `;
        return await getOne(sql, [id]);
    } catch (error) {
        logger.error('Error getting customer by ID:', error);
        return null;
    }
}

/**
 * Get customer by phone
 */
async function getCustomerByPhone(phone) {
    try {
        const normalizedPhone = normalizePhone(phone);
        const sql = `
            SELECT c.*, p.name as package_name, p.price as package_price
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
            WHERE c.phone = $1
        `;
        return await getOne(sql, [normalizedPhone]);
    } catch (error) {
        logger.error('Error getting customer by phone:', error);
        return null;
    }
}

/**
 * Get customer by PPPoE username
 */
async function getCustomerByPPPoE(pppoeUsername) {
    try {
        const sql = `
            SELECT c.*, p.name as package_name, p.price as package_price
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
            WHERE c.pppoe_username = $1
        `;
        return await getOne(sql, [pppoeUsername]);
    } catch (error) {
        logger.error('Error getting customer by PPPoE:', error);
        return null;
    }
}

/**
 * Create new customer
 */
async function createCustomer(customerData) {
    try {
        // Validate required fields
        if (!customerData.username || !customerData.name || !customerData.phone) {
            throw new Error('Missing required fields: username, name, and phone are required');
        }
        
        const sql = `
            INSERT INTO customers (
                username, name, phone, pppoe_username, pppoe_password, email, address,
                latitude, longitude, package_id, pppoe_profile, status,
                cable_type, cable_length, port_number, cable_status, cable_notes, device_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *
        `;
        
        const normalizedPhone = normalizePhone(customerData.phone);
        
        const values = [
            customerData.username.trim(),
            customerData.name.trim(),
            normalizedPhone,
            customerData.pppoe_username || null,
            customerData.pppoe_password || null,
            customerData.email || null,
            customerData.address || null,
            customerData.latitude || null,
            customerData.longitude || null,
            customerData.package_id || null,
            customerData.pppoe_profile || null,
            customerData.status || 'active',
            customerData.cable_type || null,
            customerData.cable_length || null,
            customerData.port_number || null,
            customerData.cable_status || 'connected',
            customerData.cable_notes || null,
            customerData.device_id || null
        ];
        
        const result = await query(sql, values);
        const customer = result.rows[0];
        logger.info('Customer created:', customer);
        
        // Auto-sync ke RADIUS jika ada pppoe_username
        if (customer.pppoe_username && customer.pppoe_password) {
            try {
                const radiusDb = require('./radius-database');
                
                // 1. Insert ke radcheck (username/password)
                await radiusDb.upsertRadiusUser(customer.pppoe_username, customer.pppoe_password);
                logger.info(`✅ Customer synced to radcheck: ${customer.pppoe_username}`);
                
                // 2. Get package info untuk assign group
                if (customer.package_id) {
                    const packageInfo = await getPackageById(customer.package_id);
                    if (packageInfo && packageInfo.group) {
                        // Assign user ke group RADIUS
                        await radiusDb.assignUserToGroup(customer.pppoe_username, packageInfo.group);
                        logger.info(`✅ Customer assigned to RADIUS group: ${packageInfo.group}`);
                        
                        // 3. Set rate limit jika ada di package (override group)
                        if (packageInfo.rate_limit) {
                            await radiusDb.setRadiusReplyAttribute(
                                customer.pppoe_username,
                                'Mikrotik-Rate-Limit',
                                packageInfo.rate_limit
                            );
                            logger.info(`✅ Rate limit set for customer: ${packageInfo.rate_limit}`);
                        }
                    }
                }
            } catch (radiusError) {
                logger.error('Error syncing customer to RADIUS:', radiusError);
                // Don't throw, customer sudah dibuat di billing database
            }
        }
        
        return customer;
    } catch (error) {
        logger.error('Error creating customer:', error);
        throw error;
    }
}

/**
 * Update customer
 */
async function updateCustomer(id, customerData) {
    try {
        const sql = `
            UPDATE customers 
            SET name = $1, phone = $2, pppoe_username = $3, email = $4, 
                address = $5, latitude = $6, longitude = $7, package_id = $8,
                pppoe_profile = $9, status = $10, cable_type = $11, 
                cable_length = $12, port_number = $13, cable_status = $14, 
                cable_notes = $15, device_id = $16
            WHERE id = $17
            RETURNING *
        `;
        
        const normalizedPhone = normalizePhone(customerData.phone);
        
        const values = [
            customerData.name,
            normalizedPhone,
            customerData.pppoe_username,
            customerData.email,
            customerData.address,
            customerData.latitude,
            customerData.longitude,
            customerData.package_id,
            customerData.pppoe_profile,
            customerData.status,
            customerData.cable_type,
            customerData.cable_length,
            customerData.port_number,
            customerData.cable_status,
            customerData.cable_notes,
            customerData.device_id,
            id
        ];
        
        const result = await query(sql, values);
        logger.info('Customer updated:', result.rows[0]);
        return result.rows[0];
    } catch (error) {
        logger.error('Error updating customer:', error);
        throw error;
    }
}

/**
 * Delete customer
 */
async function deleteCustomer(id) {
    try {
        const sql = 'DELETE FROM customers WHERE id = $1';
        await query(sql, [id]);
        logger.info('Customer deleted:', id);
        return true;
    } catch (error) {
        logger.error('Error deleting customer:', error);
        throw error;
    }
}

// ============================================
// INVOICES MANAGEMENT
// ============================================

/**
 * Get all invoices
 */
async function getInvoices(filters = {}) {
    try {
        let sql = `
            SELECT i.*, 
                   c.name as customer_name, c.phone as customer_phone,
                   p.name as package_name
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            JOIN packages p ON i.package_id = p.id
        `;
        
        const conditions = [];
        const values = [];
        
        if (filters.status) {
            conditions.push(`i.status = $${values.length + 1}`);
            values.push(filters.status);
        }
        
        if (filters.customer_id) {
            conditions.push(`i.customer_id = $${values.length + 1}`);
            values.push(filters.customer_id);
        }
        
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        
        sql += ' ORDER BY i.created_at DESC';
        
        return await getAll(sql, values);
    } catch (error) {
        logger.error('Error getting invoices:', error);
        return [];
    }
}

/**
 * Get invoice by ID
 */
async function getInvoiceById(id) {
    try {
        const sql = `
            SELECT i.*, 
                   c.name as customer_name, c.phone as customer_phone,
                   p.name as package_name
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            JOIN packages p ON i.package_id = p.id
            WHERE i.id = $1
        `;
        return await getOne(sql, [id]);
    } catch (error) {
        logger.error('Error getting invoice by ID:', error);
        return null;
    }
}

/**
 * Get customer invoices
 */
async function getCustomerInvoices(customerId) {
    try {
        const sql = `
            SELECT i.*, p.name as package_name
            FROM invoices i
            JOIN packages p ON i.package_id = p.id
            WHERE i.customer_id = $1
            ORDER BY i.created_at DESC
        `;
        return await getAll(sql, [customerId]);
    } catch (error) {
        logger.error('Error getting customer invoices:', error);
        return [];
    }
}

/**
 * Create invoice
 */
async function createInvoice(invoiceData) {
    try {
        const invoiceNumber = invoiceData.invoice_number || generateInvoiceNumber();
        
        const sql = `
            INSERT INTO invoices (
                customer_id, package_id, invoice_number, amount, due_date, 
                status, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        
        const values = [
            invoiceData.customer_id,
            invoiceData.package_id,
            invoiceNumber,
            invoiceData.amount,
            invoiceData.due_date,
            invoiceData.status || 'unpaid',
            invoiceData.notes || null
        ];
        
        const result = await query(sql, values);
        logger.info('Invoice created:', result.rows[0]);
        return result.rows[0];
    } catch (error) {
        logger.error('Error creating invoice:', error);
        throw error;
    }
}

/**
 * Update invoice
 */
async function updateInvoice(id, invoiceData) {
    try {
        const sql = `
            UPDATE invoices 
            SET status = $1, payment_date = $2, payment_method = $3, 
                payment_gateway = $4, payment_token = $5, payment_url = $6, notes = $7
            WHERE id = $8
            RETURNING *
        `;
        
        const values = [
            invoiceData.status,
            invoiceData.payment_date || null,
            invoiceData.payment_method || null,
            invoiceData.payment_gateway || null,
            invoiceData.payment_token || null,
            invoiceData.payment_url || null,
            invoiceData.notes || null,
            id
        ];
        
        const result = await query(sql, values);
        logger.info('Invoice updated:', result.rows[0]);
        return result.rows[0];
    } catch (error) {
        logger.error('Error updating invoice:', error);
        throw error;
    }
}

/**
 * Mark invoice as paid
 */
async function markInvoicePaid(invoiceId, paymentData) {
    try {
        return await transaction(async (client) => {
            // Update invoice status
            const invoiceSql = `
                UPDATE invoices 
                SET status = 'paid', 
                    payment_date = $1, 
                    payment_method = $2
                WHERE id = $3
                RETURNING *
            `;
            const invoiceResult = await client.query(invoiceSql, [
                new Date(),
                paymentData.payment_method || 'manual',
                invoiceId
            ]);
            
            // Create payment record
            const paymentSql = `
                INSERT INTO payments (invoice_id, amount, payment_method, reference_number, notes)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;
            const paymentResult = await client.query(paymentSql, [
                invoiceId,
                paymentData.amount,
                paymentData.payment_method || 'manual',
                paymentData.reference_number || null,
                paymentData.notes || null
            ]);
            
            logger.info('Invoice marked as paid:', invoiceResult.rows[0]);
            
            return {
                invoice: invoiceResult.rows[0],
                payment: paymentResult.rows[0]
            };
        });
    } catch (error) {
        logger.error('Error marking invoice as paid:', error);
        throw error;
    }
}

// ============================================
// STATISTICS & REPORTS
// ============================================

/**
 * Get billing statistics
 */
async function getBillingStats() {
    try {
        const stats = await getOne(`
            SELECT 
                (SELECT COUNT(*) FROM customers WHERE status = 'active') as active_customers,
                (SELECT COUNT(*) FROM customers) as total_customers,
                (SELECT COUNT(*) FROM invoices WHERE status = 'unpaid') as unpaid_invoices,
                (SELECT COUNT(*) FROM invoices WHERE status = 'paid') as paid_invoices,
                (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE status = 'unpaid') as total_unpaid,
                (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE status = 'paid' 
                 AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)) as monthly_revenue
        `);
        
        return stats;
    } catch (error) {
        logger.error('Error getting billing stats:', error);
        return null;
    }
}

/**
 * Get monthly revenue report
 */
async function getMonthlyRevenue(year, month) {
    try {
        const sql = `
            SELECT 
                DATE(payment_date) as date,
                COUNT(*) as total_payments,
                SUM(amount) as total_amount
            FROM invoices
            WHERE status = 'paid'
                AND EXTRACT(YEAR FROM payment_date) = $1
                AND EXTRACT(MONTH FROM payment_date) = $2
            GROUP BY DATE(payment_date)
            ORDER BY date ASC
        `;
        
        return await getAll(sql, [year, month]);
    } catch (error) {
        logger.error('Error getting monthly revenue:', error);
        return [];
    }
}

/**
 * Initialize billing system
 * Ensures database pool is initialized and ready
 */
async function initializeBilling() {
    try {
        // Initialize database pool
        initializePool();
        
        // Test connection
        const testResult = await query('SELECT 1 as test');
        if (!testResult || !testResult.rows || testResult.rows[0].test !== 1) {
            throw new Error('Database connection test failed');
        }
        
        logger.info('✅ Billing system initialized (PostgreSQL)');
        return true;
    } catch (error) {
        logger.error('❌ Failed to initialize billing system:', error);
        return false;
    }
}

/**
 * Get all customers (alias for getCustomers for backward compatibility)
 */
async function getAllCustomers() {
    return getCustomers();
}

/**
 * Get all packages (alias for getPackages for backward compatibility)
 */
async function getAllPackages() {
    return getPackages();
}

/**
 * Get all invoices (alias for getInvoices for backward compatibility)
 */
async function getAllInvoices() {
    return getInvoices();
}

/**
 * Get overdue customers (customers with unpaid invoices past due date)
 */
async function getOverdueCustomers() {
    try {
        const customers = await getCustomers();
        const overdueCustomers = [];
        
        for (const customer of customers) {
            const invoices = await getCustomerInvoices(customer.id);
            const hasOverdue = invoices.some(inv => {
                if (inv.status !== 'paid') {
                    const dueDate = new Date(inv.due_date);
                    return dueDate < new Date();
                }
                return false;
            });
            
            if (hasOverdue) {
                overdueCustomers.push(customer);
            }
        }
        
        return overdueCustomers;
    } catch (error) {
        logger.error('Error getting overdue customers:', error);
        return [];
    }
}

/**
 * Get active customers (customers with status 'active')
 */
async function getActiveCustomers() {
    try {
        const customers = await getCustomers();
        return customers.filter(c => c.status === 'active');
    } catch (error) {
        logger.error('Error getting active customers:', error);
        return [];
    }
}

module.exports = {
    // Utilities
    normalizePhone,
    generateInvoiceNumber,
    generateTicketNumber,
    initializeBilling,
    
    // Packages
    getPackages,
    getPackageById,
    createPackage,
    updatePackage,
    deletePackage,
    getAllPackages, // alias
    
    // Customers
    getCustomers,
    getCustomerById,
    getCustomerByPhone,
    getCustomerByPPPoE,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getAllCustomers, // alias
    getOverdueCustomers,
    getActiveCustomers,
    
    // Invoices
    getInvoices,
    getInvoiceById,
    getCustomerInvoices,
    createInvoice,
    updateInvoice,
    markInvoicePaid,
    getAllInvoices, // alias
    
    // Statistics
    getBillingStats,
    getMonthlyRevenue
};
