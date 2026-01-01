#!/bin/bash
set -e

# ===========================================
# Database Initialization Script
# ===========================================

echo "🚀 Starting database initialization..."

# Database connection parameters
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${POSTGRES_DB:-kilusi_bill}
DB_USER=${POSTGRES_USER:-kilusi_user}
DB_PASSWORD=${POSTGRES_PASSWORD:-kilusi1234}

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"; do
    echo "PostgreSQL is not ready yet. Waiting..."
    sleep 2
done

echo "✅ PostgreSQL is ready!"

# Create additional databases if needed
echo "📝 Creating additional databases..."

# Create radius database if it doesn't exist
psql -v ON_ERROR_STOP=1 --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" <<-EOSQL
    CREATE DATABASE radius
    WITH
        OWNER = $DB_USER
        ENCODING = 'UTF8'
        CONNECTION LIMIT = -1;

    \c radius;

    -- Create extension in radius database
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EOSQL

echo "✅ Databases created successfully!"

# Apply schemas
echo "📋 Applying database schemas..."

# Apply RADIUS schema to radius database
echo "  📋 Applying RADIUS schema..."
psql -v ON_ERROR_STOP=1 --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="radius" --file=/schema/01-radius-schema.sql

# Apply Kilusi Bill schema to main database
echo "  📋 Applying Kilusi Bill schema..."
psql -v ON_ERROR_STOP=1 --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" --file=/schema/02-kilusi-bill-schema.sql

echo "✅ Database schemas applied successfully!"

# Create sample data (optional)
if [ "$CREATE_SAMPLE_DATA" = "true" ]; then
    echo "📝 Creating sample data..."
    psql -v ON_ERROR_STOP=1 --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" <<-EOSQL
        -- Insert sample customers
        INSERT INTO customers (username, password, full_name, email, phone, package_id, status, due_date) VALUES
            ('user001', 'password123', 'Ahmad Wijaya', 'ahmad@example.com', '62812345678', 1, 'active', CURRENT_DATE + INTERVAL '30 days'),
            ('user002', 'password123', 'Siti Nurhaliza', 'siti@example.com', '62823456789', 2, 'active', CURRENT_DATE + INTERVAL '30 days'),
            ('user003', 'password123', 'Budi Santoso', 'budi@example.com', '62834567890', 3, 'active', CURRENT_DATE + INTERVAL '30 days')
        ON CONFLICT (username) DO NOTHING;

        -- Insert corresponding RADIUS users
        INSERT INTO radcheck (username, attribute, op, value) VALUES
            ('user001', 'Cleartext-Password', ':=', 'password123'),
            ('user002', 'Cleartext-Password', ':=', 'password123'),
            ('user003', 'Cleartext-Password', ':=', 'password123')
        ON CONFLICT DO NOTHING;

        -- Insert user group mappings
        INSERT INTO radusergroup (username, groupname, priority) VALUES
            ('user001', 'default', 1),
            ('user002', 'default', 1),
            ('user003', 'default', 1)
        ON CONFLICT DO NOTHING;

        -- Insert sample payments
        INSERT INTO payments (customer_id, amount, payment_method, payment_status, description, invoice_number) VALUES
            ((SELECT id FROM customers WHERE username = 'user001'), 150000, 'transfer', 'confirmed', 'Payment for Basic Package', 'INV/2024/001'),
            ((SELECT id FROM customers WHERE username = 'user002'), 250000, 'cash', 'confirmed', 'Payment for Standard Package', 'INV/2024/002'),
            ((SELECT id FROM customers WHERE username = 'user003'), 450000, 'ewallet', 'confirmed', 'Payment for Premium Package', 'INV/2024/003')
        ON CONFLICT (invoice_number) DO NOTHING;

        -- Insert sample invoices
        INSERT INTO invoices (invoice_number, customer_id, amount, due_date, status, package_info) VALUES
            ('INV/2024/004', (SELECT id FROM customers WHERE username = 'user001'), 150000, CURRENT_DATE + INTERVAL '30 days', 'unpaid', '{"name": "Paket Basic", "price": 150000}'),
            ('INV/2024/005', (SELECT id FROM customers WHERE username = 'user002'), 250000, CURRENT_DATE + INTERVAL '30 days', 'unpaid', '{"name": "Paket Standard", "price": 250000}'),
            ('INV/2024/006', (SELECT id FROM customers WHERE username = 'user003'), 450000, CURRENT_DATE + INTERVAL '30 days', 'unpaid', '{"name": "Paket Premium", "price": 450000}')
        ON CONFLICT (invoice_number) DO NOTHING;

        -- Insert sample network devices
        INSERT INTO network_devices (name, ip_address, device_type, model, location, snmp_community, username, password) VALUES
            ('Mikrotik Main', '192.168.88.1', 'mikrotik', 'RB1100AHx4', 'Main Office', 'public', 'admin', 'admin'),
            ('OLT Main', '192.168.88.10', 'olt', 'Huawei MA5608T', 'Main Office', 'public', 'admin', 'admin'),
            ('Switch Office', '192.168.88.20', 'switch', 'TP-Link TL-SG1024D', 'Main Office', 'public', NULL, NULL)
        ON CONFLICT (ip_address) DO NOTHING;

        -- Insert OLT device reference
        INSERT INTO olt_devices (device_id, vendor, main_interface) VALUES
            ((SELECT id FROM network_devices WHERE ip_address = '192.168.88.10'), 'Huawei', 'eth0')
        ON CONFLICT DO NOTHING;

        -- Insert sample ONU devices
        INSERT INTO onu_devices (olt_id, serial_number, name, customer_id, port, rx_power, status) VALUES
            ((SELECT id FROM olt_devices), 'HWTC12345678', 'ONU-Ahmad', (SELECT id FROM customers WHERE username = 'user001'), '1', -15.5, 'active'),
            ((SELECT id FROM olt_devices), 'HWTC87654321', 'ONU-Siti', (SELECT id FROM customers WHERE username = 'user002'), '2', -18.2, 'active'),
            ((SELECT id FROM olt_devices), 'HWTC11112222', 'ONU-Budi', (SELECT id FROM customers WHERE username = 'user003'), '3', -22.1, 'active')
        ON CONFLICT (serial_number) DO NOTHING;
EOSQL

    echo "✅ Sample data created successfully!"
fi

# Create database views and functions
echo "🔧 Creating database views and functions..."
psql -v ON_ERROR_STOP=1 --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" <<-EOSQL
    -- Create function for customer balance calculation
    CREATE OR REPLACE FUNCTION calculate_customer_balance(customer_uuid UUID)
    RETURNS DECIMAL(10,2) AS \$\$
    DECLARE
        total_payments DECIMAL(10,2) := 0;
        total_invoices DECIMAL(10,2) := 0;
        balance DECIMAL(10,2);
    BEGIN
        SELECT COALESCE(SUM(amount), 0) INTO total_payments
        FROM payments
        WHERE customer_id = customer_uuid AND payment_status = 'confirmed';

        SELECT COALESCE(SUM(amount), 0) INTO total_invoices
        FROM invoices
        WHERE customer_id = customer_uuid AND status != 'cancelled';

        balance := total_payments - total_invoices;
        RETURN balance;
    END;
    \$\$ LANGUAGE plpgsql;

    -- Create view for active sessions summary
    CREATE OR REPLACE VIEW active_sessions_summary AS
    SELECT
        COUNT(*) as total_sessions,
        COUNT(DISTINCT nas_ip) as connected_nas,
        SUM(data_up) as total_upload,
        SUM(data_down) as total_download,
        AVG(upload_speed) as avg_upload_speed,
        AVG(download_speed) as avg_download_speed
    FROM online_sessions
    WHERE status = 'online';

    -- Grant permissions
    GRANT EXECUTE ON FUNCTION calculate_customer_balance(UUID) TO kilusi_user;
    GRANT SELECT ON active_sessions_summary TO kilusi_user;
EOSQL

echo "✅ Database views and functions created successfully!"

# Set up database user permissions for RADIUS database
echo "🔐 Setting up RADIUS database permissions..."
psql -v ON_ERROR_STOP=1 --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="radius" <<-EOSQL
    -- Create radius user if it doesn't exist
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'radius') THEN
            CREATE ROLE radius WITH LOGIN PASSWORD 'radius_password';
        END IF;
    END
    \$\$;

    -- Grant permissions to radius user
    GRANT SELECT, INSERT, UPDATE, DELETE ON radcheck, radreply, radgroupcheck, radgroupreply, radusergroup, radacct, radpostauth, nas TO radius;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO radius;

    -- Grant permissions to application user
    GRANT SELECT, INSERT, UPDATE, DELETE ON radcheck, radreply, radgroupcheck, radgroupreply, radusergroup, radacct, radpostauth, nas TO $DB_USER;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
EOSQL

echo "✅ RADIUS database permissions configured successfully!"

echo ""
echo "🎉 Database initialization completed successfully!"
echo "📊 Database: $DB_NAME"
echo "🌐 RADIUS Database: radius"
echo "👤 User: $DB_USER"
echo "🔗 Host: $DB_HOST:$DB_PORT"
echo ""
echo "🚀 You can now start your application!"