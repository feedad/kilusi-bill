-- RADIUS Hotspot Group Configuration
-- This creates the HOTSPOT_DEFAULT group for voucher authentication

-- Create hotspot group in radgroupcheck
INSERT INTO radgroupcheck (groupname, attribute, op, value)
VALUES ('HOTSPOT_DEFAULT', 'Auth-Type', ':=', 'Accept')
ON CONFLICT (groupname, attribute) DO UPDATE SET value = EXCLUDED.value;

-- Create default settings in radgroupreply for hotspot users
INSERT INTO radgroupreply (groupname, attribute, op, value)
VALUES
    ('HOTSPOT_DEFAULT', 'Mikrotik-Recv-Limit', ':=', '1073741824'),  -- 1GB default data limit
    ('HOTSPOT_DEFAULT', 'Acct-Interim-Interval', ':=', '60')  -- Accounting update every 60 seconds
ON CONFLICT (groupname, attribute) DO UPDATE SET value = EXCLUDED.value;

-- Verify
SELECT 'Hotspot group created successfully' as status;
