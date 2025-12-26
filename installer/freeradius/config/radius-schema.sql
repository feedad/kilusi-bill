-- =====================================================================
-- FreeRADIUS Database Schema for PostgreSQL
-- =====================================================================
-- This script creates the necessary database schema for FreeRADIUS
-- to integrate with the Kilusi Bill ISP billing system.
--
-- Compatible with FreeRADIUS 3.x
-- =====================================================================

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- NAS (Network Access Server) Configuration
-- =====================================================================

-- Table to store NAS clients
CREATE TABLE IF NOT EXISTS nas (
    id SERIAL PRIMARY KEY,
    nasname VARCHAR(128) NOT NULL UNIQUE,
    shortname VARCHAR(32),
    type VARCHAR(30) DEFAULT 'other',
    ports INTEGER,
    secret VARCHAR(60) DEFAULT 'secret',
    server VARCHAR(64),
    community VARCHAR(50),
    description VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for nas table
CREATE INDEX IF NOT EXISTS idx_nas_nasname ON nas(nasname);

-- =====================================================================
-- RADIUS User Authentication Tables
-- =====================================================================

-- User check attributes table
CREATE TABLE IF NOT EXISTS radcheck (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for radcheck
CREATE INDEX IF NOT EXISTS idx_radcheck_username ON radcheck(username);
CREATE INDEX IF NOT EXISTS idx_radcheck_attribute ON radcheck(attribute);

-- User reply attributes table
CREATE TABLE IF NOT EXISTS radreply (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for radreply
CREATE INDEX IF NOT EXISTS idx_radreply_username ON radreply(username);
CREATE INDEX IF NOT EXISTS idx_radreply_attribute ON radreply(attribute);

-- Group check attributes table
CREATE TABLE IF NOT EXISTS radgroupcheck (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for radgroupcheck
CREATE INDEX IF NOT EXISTS idx_radgroupcheck_groupname ON radgroupcheck(groupname);
CREATE INDEX IF NOT EXISTS idx_radgroupcheck_attribute ON radgroupcheck(attribute);

-- Group reply attributes table
CREATE TABLE IF NOT EXISTS radgroupreply (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for radgroupreply
CREATE INDEX IF NOT EXISTS idx_radgroupreply_groupname ON radgroupreply(groupname);
CREATE INDEX IF NOT EXISTS idx_radgroupreply_attribute ON radgroupreply(attribute);

-- User group membership table
CREATE TABLE IF NOT EXISTS radusergroup (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    groupname VARCHAR(64) NOT NULL,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for radusergroup
CREATE INDEX IF NOT EXISTS idx_radusergroup_username ON radusergroup(username);
CREATE INDEX IF NOT EXISTS idx_radusergroup_groupname ON radusergroup(groupname);

-- =====================================================================
-- RADIUS Accounting Tables
-- =====================================================================

-- Accounting table
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
);

-- Indexes for radacct
CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_acctsessionid ON radacct(acctsessionid);
CREATE INDEX IF NOT EXISTS idx_radacct_acctuniqueid ON radacct(acctuniqueid);
CREATE INDEX IF NOT EXISTS idx_radacct_nasipaddress ON radacct(nasipaddress);
CREATE INDEX IF NOT EXISTS idx_radacct_acctstarttime ON radacct(acctstarttime);
CREATE INDEX IF NOT EXISTS idx_radacct_acctstoptime ON radacct(acctstoptime);

-- =====================================================================
-- Post-Authentication Table
-- =====================================================================

-- Post authentication logging table
CREATE TABLE IF NOT EXISTS radpostauth (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    pass VARCHAR(64),
    reply VARCHAR(32) NOT NULL,
    authdate TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for radpostauth
CREATE INDEX IF NOT EXISTS idx_radpostauth_username ON radpostauth(username);
CREATE INDEX IF NOT EXISTS idx_radpostauth_authdate ON radpostauth(authdate);

-- =====================================================================
-- Additional RADIUS Tables (Optional but Recommended)
-- =====================================================================

-- Table for storing user information
CREATE TABLE IF NOT EXISTS userinfo (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    firstname VARCHAR(64),
    lastname VARCHAR(64),
    email VARCHAR(64),
    department VARCHAR(64),
    company VARCHAR(64),
    workphone VARCHAR(20),
    homephone VARCHAR(20),
    mobilephone VARCHAR(20),
    address VARCHAR(200),
    city VARCHAR(50),
    state VARCHAR(50),
    zip VARCHAR(10),
    country VARCHAR(50),
    notes TEXT,
    changeui BIGINT DEFAULT 0,
    creationdate TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    creationby VARCHAR(64),
    updatedate TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updateby VARCHAR(64)
);

-- Index for userinfo
CREATE INDEX IF NOT EXISTS idx_userinfo_username ON userinfo(username);

-- =====================================================================
-- Triggers for updated_at timestamps
-- =====================================================================

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for tables that have updated_at columns
CREATE TRIGGER update_nas_updated_at BEFORE UPDATE ON nas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_radcheck_updated_at BEFORE UPDATE ON radcheck
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_radreply_updated_at BEFORE UPDATE ON radreply
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_radusergroup_updated_at BEFORE UPDATE ON radusergroup
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_userinfo_updated_at BEFORE UPDATE ON userinfo
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- Default Data
-- =====================================================================

-- Insert default NAS client (localhost)
INSERT INTO nas (nasname, shortname, type, secret, description)
VALUES ('127.0.0.1', 'localhost', 'other', 'testing123', 'Localhost NAS')
ON CONFLICT (nasname) DO NOTHING;

-- Insert default Mikrotik NAS (adjust IP as needed)
INSERT INTO nas (nasname, shortname, type, secret, description)
VALUES ('192.168.88.1', 'mikrotik-main', 'other', 'testing123', 'Main Mikrotik Router')
ON CONFLICT (nasname) DO NOTHING;

-- Insert default user groups
INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES
    ('active', 'Auth-Type', ':=', 'Accept')
ON CONFLICT DO NOTHING;

INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
    ('active', 'Service-Type', ':=', 'Framed-User'),
    ('active', 'Framed-Protocol', ':=', 'PPP'),
    ('active', 'Framed-Compression', ':=', 'Van-Jacobson-TCP-IP')
ON CONFLICT DO NOTHING;

-- Insert default test user
INSERT INTO radcheck (username, attribute, op, value) VALUES
    ('testuser', 'Cleartext-Password', ':=', 'test123')
ON CONFLICT (username, attribute) DO NOTHING;

-- Add test user to active group
INSERT INTO radusergroup (username, groupname, priority) VALUES
    ('testuser', 'active', 1)
ON CONFLICT (username, groupname) DO NOTHING;

-- =====================================================================
-- Views for Common Queries
-- =====================================================================

-- View for active RADIUS sessions
CREATE OR REPLACE VIEW active_sessions AS
SELECT
    r.radacctid,
    r.acctsessionid,
    r.username,
    r.acctstarttime,
    r.nasipaddress,
    r.framedipaddress,
    r.calledstationid,
    r.callingstationid,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - r.acctstarttime))/3600 as session_hours,
    r.acctinputoctets,
    r.acctoutputoctets
FROM radacct r
WHERE r.acctstarttime IS NOT NULL
  AND r.acctstoptime IS NULL;

-- View for user authentication history
CREATE OR REPLACE VIEW user_auth_history AS
SELECT
    p.username,
    p.reply,
    p.authdate,
    r.nasname,
    r.shortname
FROM radpostauth p
LEFT JOIN nas r ON p.reply = 'Access-Accept'
ORDER BY p.authdate DESC;

-- =====================================================================
-- Completion Message
-- =====================================================================

DO $$
BEGIN
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'FreeRADIUS Database Schema Created Successfully!';
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'Created tables:';
    RAISE NOTICE '- nas (Network Access Server configuration)';
    RAISE NOTICE '- radcheck (User check attributes)';
    RAISE NOTICE '- radreply (User reply attributes)');
    RAISE NOTICE '- radgroupcheck (Group check attributes)');
    RAISE NOTICE '- radgroupreply (Group reply attributes)');
    RAISE NOTICE '- radusergroup (User group membership)');
    RAISE NOTICE '- radacct (Accounting records)');
    RAISE NOTICE '- radpostauth (Post-authentication logging)');
    RAISE NOTICE '- userinfo (Extended user information)');
    RAISE NOTICE '';
    RAISE NOTICE 'Default data inserted:';
    RAISE NOTICE '- localhost NAS client (127.0.0.1)');
    RAISE NOTICE '- Mikrotik NAS client (192.168.88.1)');
    RAISE NOTICE '- Active user group with default attributes');
    RAISE NOTICE '- Test user: testuser / test123');
    RAISE NOTICE '';
    RAISE NOTICE 'Views created:');
    RAISE NOTICE '- active_sessions (Currently active RADIUS sessions)');
    RAISE NOTICE '- user_auth_history (User authentication history)');
    RAISE NOTICE '';
    RAISE NOTICE 'Database is ready for FreeRADIUS integration!';
    RAISE NOTICE '====================================================================';
END $$;