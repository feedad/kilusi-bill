/**
 * RADIUS PostgreSQL Database Configuration
 * Manages RADIUS authentication and accounting with PostgreSQL
 */

const { query, getOne, getAll, transaction } = require('./database');
const { logger } = require('./logger');

let initialized = false;

/**
 * Initialize RADIUS database tables
 */
async function initializeRadiusTables() {
    if (initialized) {
        return true;
    }

    try {
        // Create RADIUS group table
        await query(`
            CREATE TABLE IF NOT EXISTS radgroup (
                id SERIAL PRIMARY KEY,
                groupname VARCHAR(64) UNIQUE NOT NULL,
                description TEXT,
                priority INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create RADIUS group check table
        await query(`
            CREATE TABLE IF NOT EXISTS radgroupcheck (
                id SERIAL PRIMARY KEY,
                groupname VARCHAR(64) NOT NULL REFERENCES radgroup(groupname) ON DELETE CASCADE,
                attribute VARCHAR(64) NOT NULL,
                op VARCHAR(2) NOT NULL DEFAULT ':=',
                value VARCHAR(253) NOT NULL
            )
        `);

        // Create RADIUS group reply table
        await query(`
            CREATE TABLE IF NOT EXISTS radgroupreply (
                id SERIAL PRIMARY KEY,
                groupname VARCHAR(64) NOT NULL REFERENCES radgroup(groupname) ON DELETE CASCADE,
                attribute VARCHAR(64) NOT NULL,
                op VARCHAR(2) NOT NULL DEFAULT ':=',
                value VARCHAR(253) NOT NULL
            )
        `);

        // Create RADIUS check table (user authentication)
        await query(`
            CREATE TABLE IF NOT EXISTS radcheck (
                id SERIAL PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                attribute VARCHAR(64) NOT NULL,
                op VARCHAR(2) NOT NULL DEFAULT ':=',
                value VARCHAR(253) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(username, attribute, op, value)
            )
        `);

        // Create RADIUS reply table (user attributes)
        await query(`
            CREATE TABLE IF NOT EXISTS radreply (
                id SERIAL PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                attribute VARCHAR(64) NOT NULL,
                op VARCHAR(2) NOT NULL DEFAULT ':=',
                value VARCHAR(253) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create RADIUS accounting table
        await query(`
            CREATE TABLE IF NOT EXISTS radacct (
                radacctid BIGSERIAL PRIMARY KEY,
                acctsessionid VARCHAR(32) NOT NULL,
                acctuniqueid VARCHAR(32) NOT NULL UNIQUE,
                username VARCHAR(64),
                groupname VARCHAR(64),
                realm VARCHAR(64),
                nasipaddress INET NOT NULL,
                nasportid VARCHAR(15),
                nasporttype VARCHAR(32),
                acctstarttime TIMESTAMP WITH TIME ZONE,
                acctstoptime TIMESTAMP WITH TIME ZONE,
                acctsessiontime BIGINT DEFAULT 0,
                acctauthentic VARCHAR(32),
                connectinfo_start VARCHAR(50),
                connectinfo_stop VARCHAR(50),
                acctinputoctets BIGINT DEFAULT 0,
                acctoutputoctets BIGINT DEFAULT 0,
                calledstationid VARCHAR(50),
                callingstationid VARCHAR(50),
                acctterminatecause VARCHAR(32),
                servicetype VARCHAR(32),
                framedprotocol VARCHAR(32),
                framedipaddress INET,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create RADIUS user group mapping
        await query(`
            CREATE TABLE IF NOT EXISTS radusergroup (
                id SERIAL PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                groupname VARCHAR(64) NOT NULL REFERENCES radgroup(groupname) ON DELETE CASCADE,
                priority INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for performance
        await query(`CREATE INDEX IF NOT EXISTS idx_radcheck_username ON radcheck(username)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_radreply_username ON radreply(username)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_radacct_acctsessionid ON radacct(acctsessionid)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_radacct_starttime ON radacct(acctstarttime)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_radacct_stoptime ON radacct(acctstoptime)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_radusergroup_username ON radusergroup(username)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_radusergroup_groupname ON radusergroup(groupname)`);

        // Insert default groups if they don't exist
        await query(`
            INSERT INTO radgroup (groupname, description, priority) VALUES
            ('default', 'Default user group', 1),
            ('vip', 'VIP user group', 2),
            ('isolir', 'Isolated users group', 3)
            ON CONFLICT (groupname) DO NOTHING
        `);

        // Insert default group attributes for 'isolir' group
        await query(`
            INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
            ('isolir', 'Framed-Pool', ':=', 'isolir')
            ON CONFLICT DO NOTHING
        `);

        initialized = true;
        logger.info('✅ RADIUS PostgreSQL tables initialized successfully');
        return true;

    } catch (error) {
        logger.error(`❌ Error initializing RADIUS tables: ${error.message}`);
        return false;
    }
}

/**
 * Get RADIUS user by username
 */
async function getRadiusUser(username) {
    if (!username) return null;

    try {
        const user = await getOne(
            'SELECT * FROM radcheck WHERE username = $1 AND attribute = $2',
            [username, 'Cleartext-Password']
        );
        return user;
    } catch (error) {
        logger.error(`Error getting RADIUS user ${username}: ${error.message}`);
        return null;
    }
}

/**
 * Get all RADIUS users
 */
async function getAllRadiusUsers() {
    try {
        const users = await getAll(`
            SELECT DISTINCT username FROM radcheck WHERE attribute = 'Cleartext-Password'
        `);
        return users;
    } catch (error) {
        logger.error(`Error getting all RADIUS users: ${error.message}`);
        return [];
    }
}

/**
 * Create or update RADIUS user
 */
async function createOrUpdateRadiusUser(username, password, groupname = 'default') {
    if (!username || !password) {
        throw new Error('Username and password are required');
    }

    try {
        await transaction(async (client) => {
            // Insert or update password
            await client.query(`
                INSERT INTO radcheck (username, attribute, op, value)
                VALUES ($1, 'Cleartext-Password', ':=', $2)
                ON CONFLICT (username, attribute, op, value)
                DO UPDATE SET value = EXCLUDED.value
            `, [username, password]);

            // Add user to group
            await client.query(`
                INSERT INTO radusergroup (username, groupname, priority)
                VALUES ($1, $2, 1)
                ON CONFLICT (username, groupname)
                DO UPDATE SET priority = EXCLUDED.priority
            `, [username, groupname]);
        });

        logger.info(`✅ RADIUS user ${username} created/updated`);
        return true;
    } catch (error) {
        logger.error(`Error creating/updating RADIUS user ${username}: ${error.message}`);
        throw error;
    }
}

/**
 * Delete RADIUS user
 */
async function deleteRadiusUser(username) {
    if (!username) {
        throw new Error('Username is required');
    }

    try {
        await transaction(async (client) => {
            await client.query('DELETE FROM radcheck WHERE username = $1', [username]);
            await client.query('DELETE FROM radreply WHERE username = $1', [username]);
            await client.query('DELETE FROM radusergroup WHERE username = $1', [username]);
        });

        logger.info(`✅ RADIUS user ${username} deleted`);
        return true;
    } catch (error) {
        logger.error(`Error deleting RADIUS user ${username}: ${error.message}`);
        throw error;
    }
}

/**
 * Get active PPPoE connections (from radacct)
 */
async function getActivePPPoEConnections() {
    try {
        const connections = await getAll(`
            SELECT
                username AS name,
                nasipaddress AS address,
                acctsessiontime AS uptime,
                framedipaddress,
                callingstationid,
                acctstarttime
            FROM radacct
            WHERE acctstoptime IS NULL
            ORDER BY acctstarttime DESC
        `);

        return connections;
    } catch (error) {
        logger.error(`Error getting active PPPoE connections: ${error.message}`);
        return [];
    }
}

/**
 * Get user connection status by username
 */
async function getUserConnectionStatus(username) {
    console.log(`[RADIUS-DEBUG] getUserConnectionStatus called for username: ${username}`);

    if (!username) {
        console.log(`[RADIUS-DEBUG] No username provided, returning offline`);
        return { online: false, status: 'offline', last_seen: null };
    }

    try {
        // Check if user has active session in radacct
        const activeSession = await getOne(`
            SELECT
                username,
                nasipaddress,
                framedipaddress,
                acctstarttime,
                acctsessiontime,
                callingstationid
            FROM radacct
            WHERE username = $1 AND acctstoptime IS NULL
            ORDER BY acctstarttime DESC
            LIMIT 1
        `, [username]);

        console.log(`[RADIUS-DEBUG] Active session query result:`, activeSession);

        if (activeSession) {
            // Session is active - return real data without auto-stale detection
            // RADIUS accounting only updates traffic data on session stop
            const result = {
                online: true,
                status: 'online',
                ip_address: activeSession.framedipaddress,
                nas_ip: activeSession.nasipaddress,
                session_start: activeSession.acctstarttime,
                session_time: activeSession.acctsessiontime,
                mac_address: activeSession.callingstationid
            };
            console.log(`[RADIUS-DEBUG] Returning active session:`, result);
            return result;
        }

        // Check last session time
        const lastSession = await getOne(`
            SELECT acctstarttime, acctstoptime
            FROM radacct
            WHERE username = $1
            ORDER BY acctstoptime DESC
            LIMIT 1
        `, [username]);

        return {
            online: false,
            status: 'offline',
            last_seen: lastSession?.acctstoptime || null
        };

    } catch (error) {
        logger.error(`Error getting connection status for ${username}: ${error.message}`);
        return { online: false, status: 'offline', last_seen: null };
    }
}

/**
 * Get active sessions (alias for getActivePPPoEConnections)
 */
async function getActiveSessions() {
    return await getActivePPPoEConnections();
}

/**
 * Get user reply attributes
 */
async function getUserReplyAttributes(username) {
    if (!username) return [];

    try {
        const attributes = await getAll(
            'SELECT attribute, op, value FROM radreply WHERE username = $1',
            [username]
        );
        return attributes;
    } catch (error) {
        logger.error(`Error getting reply attributes for ${username}: ${error.message}`);
        return [];
    }
}

/**
 * Get accounting start records
 */
async function accountingStart(sessionData) {
    try {
        await query(`
            INSERT INTO radacct (
                acctsessionid, acctuniqueid, username, nasipaddress,
                nasportid, nasporttype, framedipaddress, callingstationid,
                calledstationid, acctstarttime, connectinfo_start, servicetype,
                framedprotocol, framedipaddress
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            )
        `, [
            sessionData.sessionId,
            sessionData.uniqueId,
            sessionData.username,
            sessionData.nasIp,
            sessionData.nasPortId,
            sessionData.nasPortType,
            sessionData.framedIp,
            sessionData.callingStationId,
            sessionData.calledStationId,
            new Date(),
            'RADIUS',
            'Framed-User',
            'PPP'
        ]);

        logger.info(`✅ Accounting start recorded for ${sessionData.username}`);
        return true;
    } catch (error) {
        logger.error(`Error recording accounting start: ${error.message}`);
        return false;
    }
}

/**
 * Get accounting update records
 */
async function accountingUpdate(sessionData) {
    try {
        await query(`
            UPDATE radacct SET
                acctsessiontime = EXTRACT(EPOCH FROM (NOW() - acctstarttime))::BIGINT,
                acctinputoctets = COALESCE($1, acctinputoctets),
                acctoutputoctets = COALESCE($2, acctoutputoctets)
            WHERE acctuniqueid = $3
        `, [
            sessionData.inputOctets,
            sessionData.outputOctets,
            sessionData.uniqueId
        ]);

        logger.debug(`✅ Accounting update recorded for ${sessionData.username}`);
        return true;
    } catch (error) {
        logger.error(`Error recording accounting update: ${error.message}`);
        return false;
    }
}

/**
 * Get accounting stop records
 */
async function accountingStop(sessionData) {
    try {
        await query(`
            UPDATE radacct SET
                acctstoptime = NOW(),
                acctsessiontime = COALESCE($1, acctsessiontime),
                acctinputoctets = COALESCE($2, acctinputoctets),
                acctoutputoctets = COALESCE($3, acctoutputoctets),
                acctterminatecause = COALESCE($4, 'User-Request'),
                connectinfo_stop = $5
            WHERE acctuniqueid = $6
        `, [
            sessionData.sessionTime,
            sessionData.inputOctets,
            sessionData.outputOctets,
            sessionData.terminateCause,
            'RADIUS',
            sessionData.uniqueId
        ]);

        logger.info(`✅ Accounting stop recorded for ${sessionData.username}`);
        return true;
    } catch (error) {
        logger.error(`Error recording accounting stop: ${error.message}`);
        return false;
    }
}

/**
 * Get online users by group
 */
async function getOnlineUsersByGroup() {
    try {
        const onlineUsers = await getAll(`
            SELECT
                rg.groupname,
                COUNT(ra.username) as online_count
            FROM radacct ra
            JOIN radusergroup rug ON ra.username = rug.username
            JOIN radgroup rg ON rug.groupname = rg.groupname
            WHERE ra.acctstoptime IS NULL
            GROUP BY rg.groupname
            ORDER BY rg.groupname
        `);

        const result = {};
        onlineUsers.forEach(row => {
            result[row.groupname] = parseInt(row.online_count);
        });

        return result;
    } catch (error) {
        logger.error(`Error getting online users by group: ${error.message}`);
        return {};
    }
}

/**
 * Get all NAS clients
 */
async function getAllNasClients() {
    try {
        const nasClients = await getAll(`
            SELECT id, ip_address as nasname, short_name as shortname, secret
            FROM nas_servers
            WHERE is_active = true
        `);
        return nasClients;
    } catch (error) {
        logger.error(`Error getting NAS clients: ${error.message}`);
        return [];
    }
}

/**
 * Add new NAS client
 */
async function addNasClient(nasname, shortname, secret, type = 'other', description = '') {
    if (!nasname || !shortname || !secret) {
        throw new Error('NAS name, short name, and secret are required');
    }

    try {
        const result = await query(
            `INSERT INTO nas_servers (nas_name, short_name, ip_address, secret, type, description, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING id`,
            [nasname, shortname, nasname, secret, type, description]
        );

        if (result.rows.length > 0) {
            const newId = result.rows[0].id;
            logger.info(`✅ NAS client "${shortname}" added successfully with ID: ${newId}`);
            return true;
        } else {
            logger.error(`❌ Failed to add NAS client "${shortname}"`);
            return false;
        }
    } catch (error) {
        logger.error(`Error adding NAS client "${shortname}": ${error.message}`);
        throw error;
    }
}

/**
 * Upsert (create or update) RADIUS user - alias for createOrUpdateRadiusUser
 */
async function upsertRadiusUser(username, password, groupname = 'default') {
    return await createOrUpdateRadiusUser(username, password, groupname);
}

/**
 * Delete NAS client by ID
 */
async function deleteNasClient(id) {
    if (!id) {
        throw new Error('NAS client ID is required');
    }

    try {
        const result = await query(
            'DELETE FROM nas_servers WHERE id = $1',
            [id]
        );

        if (result.rowCount > 0) {
            logger.info(`✅ NAS client with ID ${id} deleted successfully`);
            return true;
        } else {
            logger.warn(`❌ No NAS client found with ID ${id}`);
            return false;
        }
    } catch (error) {
        logger.error(`Error deleting NAS client with ID ${id}: ${error.message}`);
        throw error;
    }
}

/**
 * Close database connection (cleanup)
 */
async function closeDatabase() {
    // PostgreSQL uses connection pooling, so we don't need explicit close
    logger.info('RADIUS PostgreSQL connection cleanup completed');
}

module.exports = {
    initializeRadiusTables,
    getRadiusUser,
    getAllRadiusUsers,
    createOrUpdateRadiusUser,
    upsertRadiusUser,
    deleteRadiusUser,
    getActivePPPoEConnections,
    getActiveSessions,
    getUserConnectionStatus,
    getUserReplyAttributes,
    accountingStart,
    accountingUpdate,
    accountingStop,
    getOnlineUsersByGroup,
    getAllNasClients,
    addNasClient,
    deleteNasClient,
    closeDatabase,

    // Legacy compatibility methods
    query,
    initDatabase: initializeRadiusTables
};