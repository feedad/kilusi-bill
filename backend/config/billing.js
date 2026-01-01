/**
 * Billing Manager with PostgreSQL Database
 * Handles packages, customers, invoices, and payments
 */

const { query, getOne, getAll, transaction, initializePool } = require('./database');
const { logger } = require('./logger');
const { getSetting } = require('./settingsManager');
const CustomerService = require('../services/customer-service');

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
        const sql =
            'INSERT INTO packages (' +
            '    name, speed, price, tax_rate, description, pppoe_profile, ' +
            '    is_active, "group", rate_limit, shared, hpp, commission' +
            ') ' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ' +
            'RETURNING *';
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
        const sql =
            'UPDATE packages ' +
            'SET name = $1, speed = $2, price = $3, tax_rate = $4, ' +
            '    description = $5, pppoe_profile = $6, is_active = $7, ' +
            '    "group" = $8, rate_limit = $9, shared = $10, ' +
            '    hpp = $11, commission = $12 ' +
            'WHERE id = $13 ' +
            'RETURNING *';
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
            FROM customers_view c
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
            FROM customers_view c
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
            FROM customers_view c
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
            FROM customers_view c
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
 * Generate 5-digit customer ID (00001-99999)
 */
async function generateCustomerId() {
    try {
        // Get the highest existing customer ID
        const sql = 'SELECT CAST(username AS INTEGER) as max_id FROM customers WHERE username ~ \'^\\d{5}$\' ORDER BY CAST(username AS INTEGER) DESC LIMIT 1';
        const result = await getAll(sql);

        let nextId = 1;
        if (result && result.length > 0 && result[0].max_id) {
            nextId = result[0].max_id + 1;
        }

        // Ensure we don't exceed 99999
        if (nextId > 99999) {
            throw new Error('Maximum customer ID reached (99999)');
        }

        return nextId.toString().padStart(5, '0');
    } catch (error) {
        logger.error('Error generating customer ID:', error);
        // Fallback to timestamp-based ID
        return Date.now().toString().slice(-5).padStart(5, '0');
    }
}

/**
 * Create new customer
 */
async function createCustomer(customerData) {
    try {
        return await CustomerService.createCustomer(customerData);
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
        return await CustomerService.updateCustomer(id, customerData);
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

/**
 * Delete customer by phone number
 */
async function deleteCustomerByPhone(phone) {
    try {
        const sql = 'DELETE FROM customers WHERE phone = $1';
        const result = await query(sql, [phone]);
        logger.info('Customer deleted by phone:', phone);
        return true;
    } catch (error) {
        logger.error('Error deleting customer by phone:', error);
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
 * Get invoices by phone number
 */
async function getInvoicesByPhone(phone) {
    try {
        // Normalize phone number
        const normalizedPhone = normalizePhone(phone);

        const sql = `
            SELECT i.*, 
                   c.name as customer_name, c.phone as customer_phone,
                   p.name as package_name
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            JOIN packages p ON i.package_id = p.id
            WHERE c.phone = $1
            ORDER BY i.created_at DESC
        `;
        return await getAll(sql, [normalizedPhone]);
    } catch (error) {
        logger.error('Error getting invoices by phone:', error);
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


/**
 * Update customer isolir status
 */
async function updateCustomerIsolirStatus(phone, status) {
    try {
        const customer = await getCustomerByPhone(phone);
        if (!customer) {
            throw new Error('Customer not found');
        }

        // Map 'normal' back to 'active' for services table
        // 'isolated' stays 'isolated'
        const serviceStatus = status === 'isolated' ? 'isolated' : 'active';

        // Update services table
        await query('UPDATE services SET status = $1, updated_at = NOW() WHERE customer_id = $2', [serviceStatus, customer.id]);
        
        logger.info(`Customer ${phone} isolir status updated to ${status}`);
        return true;
    } catch (error) {
        logger.error('Error updating customer isolir status:', error);
        throw error;
    }
}

/**
 * Switch customer package
 */
async function switchCustomerPackage(phone, packageId, saveHistory = true) {
    try {
        const customer = await getCustomerByPhone(phone);
        if (!customer) {
            throw new Error('Customer not found');
        }

        // Use CustomerService to update package which handles transactions
        // We only need to pass the field we want to update if CustomerService supports partial updates.
        // Looking at CustomerService.updateCustomer, it updates ALL fields from the passed object.
        // So we need to reconstruct the object or update CustomerService to handle partials.
        // The implementation above passed all fields.
        
        const updateData = {
           name: customer.name,
           phone: customer.phone,
           pppoe_username: customer.pppoe_username,
           email: customer.email,
           address: customer.address,
           latitude: customer.latitude,
           longitude: customer.longitude,
           package_id: packageId,
           pppoe_profile: customer.pppoe_profile,
           status: customer.status,
           cable_type: customer.cable_type,
           cable_length: customer.cable_length,
           port_number: customer.port_number,
           cable_status: customer.cable_status || 'connected',
           cable_notes: customer.cable_notes,
           device_id: customer.device_id
        };

        await CustomerService.updateCustomer(customer.id, updateData);
        
        logger.info(`Customer ${phone} package switched to ${packageId}`);
        return true;
    } catch (error) {
        logger.error('Error switching customer package:', error);
        throw error;
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
    generateCustomerId,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    deleteCustomerByPhone,
    getAllCustomers, // alias
    getOverdueCustomers,
    getActiveCustomers,
    updateCustomerIsolirStatus,
    switchCustomerPackage,

    // Invoices
    getInvoices,
    getInvoiceById,
    getCustomerInvoices,
    getInvoicesByPhone,
    createInvoice,
    updateInvoice,
    markInvoicePaid,
    getAllInvoices, // alias

    // Statistics
    getBillingStats,
    getMonthlyRevenue
};
