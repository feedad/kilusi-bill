/**
 * PostgreSQL Database Configuration
 * Manages connection pool and provides database utilities
 */

const { Pool } = require('pg');
const { getSetting } = require('./settingsManager');
const { logger } = require('./logger');

let pool = null;

/**
 * Initialize PostgreSQL connection pool
 */
function initializePool() {
    if (pool) {
        return pool;
    }

    const config = {
        host: getSetting('postgres_host') || 'localhost',
        port: parseInt(getSetting('postgres_port')) || 5432,
        database: getSetting('postgres_database') || 'kilusi_bill',
        user: getSetting('postgres_user') || 'postgres',
        password: getSetting('postgres_password') || '',
        max: parseInt(getSetting('postgres_pool_max')) || 20,
        idleTimeoutMillis: parseInt(getSetting('postgres_idle_timeout')) || 30000,
        connectionTimeoutMillis: parseInt(getSetting('postgres_connection_timeout')) || 5000,
    };

    pool = new Pool(config);

    // Handle pool errors
    pool.on('error', (err) => {
        logger.error('Unexpected PostgreSQL pool error:', err);
    });

    pool.on('connect', () => {
        logger.debug('PostgreSQL client connected to pool');
    });

    pool.on('remove', () => {
        logger.debug('PostgreSQL client removed from pool');
    });

    logger.info(`PostgreSQL pool initialized: ${config.database}@${config.host}:${config.port}`);

    return pool;
}

/**
 * Get database pool instance
 */
function getPool() {
    if (!pool) {
        return initializePool();
    }
    return pool;
}

/**
 * Execute a query with automatic connection handling
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
async function query(text, params = []) {
    const start = Date.now();
    try {
        const res = await getPool().query(text, params);
        const duration = Date.now() - start;

        // Log slow queries (threshold: 2 seconds)
        if (duration > 2000) {
            logger.warn('Slow query detected', {
                query: text.substring(0, 100),
                duration: `${duration}ms`,
                rows: res.rowCount
            });
        }

        return res;
    } catch (error) {
        logger.error(`Database query error: ${error.message}`);
        logger.error(`Query: ${text.substring(0, 200)}`);
        logger.error(`Params: ${JSON.stringify(params)}`);
        logger.error(`Full error: ${error.stack}`);
        throw error;
    }
}

/**
 * Execute a transaction with automatic rollback on error
 * @param {Function} callback - Transaction callback function
 * @returns {Promise} Transaction result
 */
async function transaction(callback) {
    const client = await getPool().connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Transaction rolled back:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Get a single row from query result
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} Single row or null
 */
async function getOne(text, params = []) {
    const result = await query(text, params);
    return result.rows[0] || null;
}

/**
 * Get all rows from query result
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Array of rows
 */
async function getAll(text, params = []) {
    const result = await query(text, params);
    return result.rows;
}

/**
 * Check if database connection is alive
 * @returns {Promise<boolean>} Connection status
 */
async function isConnected() {
    try {
        await query('SELECT 1');
        return true;
    } catch (error) {
        logger.error('Database connection check failed:', error);
        return false;
    }
}

/**
 * Close database pool gracefully
 */
async function close() {
    if (pool) {
        await pool.end();
        pool = null;
        logger.info('PostgreSQL pool closed');
    }
}

/**
 * Get database statistics
 */
async function getStats() {
    try {
        const result = await query(`
            SELECT 
                (SELECT COUNT(*) FROM customers) as total_customers,
                (SELECT COUNT(*) FROM customers WHERE status = 'active') as active_customers,
                (SELECT COUNT(*) FROM packages) as total_packages,
                (SELECT COUNT(*) FROM invoices) as total_invoices,
                (SELECT COUNT(*) FROM invoices WHERE status = 'unpaid') as unpaid_invoices,
                (SELECT SUM(amount) FROM invoices WHERE status = 'unpaid') as total_unpaid_amount
        `);
        return result.rows[0];
    } catch (error) {
        logger.error('Error fetching database stats:', error);
        return null;
    }
}

module.exports = {
    initializePool,
    getPool,
    query,
    transaction,
    getOne,
    getAll,
    isConnected,
    close,
    getStats
};
