const { query, getOne, getAll, transaction } = require('../config/database');
const logger = require('../config/logger');

async function up() {
    try {
        await transaction(async (client) => {

        // Create odps table
        await client.query(`
            CREATE TABLE IF NOT EXISTS odps (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(50) UNIQUE NOT NULL,
                address TEXT,
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                capacity INTEGER DEFAULT 64,
                used_ports INTEGER DEFAULT 0,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
                parent_odp_id INTEGER NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_odp_id) REFERENCES odps(id) ON DELETE SET NULL
            );
        `);

        // Create cable_routes table
        await client.query(`
            CREATE TABLE IF NOT EXISTS cable_routes (
                id SERIAL PRIMARY KEY,
                odp_id INTEGER NOT NULL,
                customer_id VARCHAR NOT NULL,
                cable_length INTEGER, -- in meters
                port_number INTEGER,
                status VARCHAR(20) DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'maintenance', 'damaged')),
                installation_date DATE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (odp_id) REFERENCES odps(id) ON DELETE CASCADE,
                FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
            );
        `);

        // Create indexes for better performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_odps_code ON odps(code);
            CREATE INDEX IF NOT EXISTS idx_odps_status ON odps(status);
            CREATE INDEX IF NOT EXISTS idx_odps_parent ON odps(parent_odp_id);
            CREATE INDEX IF NOT EXISTS idx_odps_location ON odps(latitude, longitude);
            CREATE INDEX IF NOT EXISTS idx_cable_routes_odp ON cable_routes(odp_id);
            CREATE INDEX IF NOT EXISTS idx_cable_routes_customer ON cable_routes(customer_id);
            CREATE INDEX IF NOT EXISTS idx_cable_routes_status ON cable_routes(status);
        `);

        // Create function to update updated_at timestamp
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        // Create triggers for updated_at
        await client.query(`
            CREATE TRIGGER update_odps_updated_at BEFORE UPDATE ON odps
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

            CREATE TRIGGER update_cable_routes_updated_at BEFORE UPDATE ON cable_routes
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);

        // Create function to update ODP used_ports count
        await client.query(`
            CREATE OR REPLACE FUNCTION update_odp_used_ports()
            RETURNS TRIGGER AS $$
            BEGIN
                IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
                    UPDATE odps
                    SET used_ports = (
                        SELECT COUNT(*)
                        FROM cable_routes
                        WHERE odp_id = NEW.odp_id AND status = 'connected'
                    )
                    WHERE id = NEW.odp_id;
                    RETURN NEW;
                ELSIF TG_OP = 'DELETE' THEN
                    UPDATE odps
                    SET used_ports = (
                        SELECT COUNT(*)
                        FROM cable_routes
                        WHERE odp_id = OLD.odp_id AND status = 'connected'
                    )
                    WHERE id = OLD.odp_id;
                    RETURN OLD;
                END IF;
                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Create trigger for used_ports update
        await client.query(`
            CREATE TRIGGER update_odp_port_count
                AFTER INSERT OR UPDATE OR DELETE ON cable_routes
                FOR EACH ROW EXECUTE FUNCTION update_odp_used_ports();
        `);

            logger.info('ODP and cable routes tables created successfully');
        });

    } catch (error) {
        logger.error('Error creating ODP tables:', error);
        throw error;
    }
}

async function down() {
    try {
        await transaction(async (client) => {
            // Drop triggers
            await client.query(`DROP TRIGGER IF EXISTS update_odp_port_count ON cable_routes;`);
            await client.query(`DROP TRIGGER IF EXISTS update_odps_updated_at ON odps;`);
            await client.query(`DROP TRIGGER IF EXISTS update_cable_routes_updated_at ON cable_routes;`);

            // Drop functions
            await client.query(`DROP FUNCTION IF EXISTS update_odp_used_ports();`);
            await client.query(`DROP FUNCTION IF EXISTS update_updated_at_column();`);

            // Drop tables
            await client.query(`DROP TABLE IF EXISTS cable_routes;`);
            await client.query(`DROP TABLE IF EXISTS odps;`);

            logger.info('ODP and cable routes tables dropped successfully');
        });

    } catch (error) {
        logger.error('Error dropping ODP tables:', error);
        throw error;
    }
}

module.exports = { up, down };