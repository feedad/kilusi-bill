const { query } = require('../config/database');

exports.up = async function() {
  try {
    console.log('🔄 Changing customer ID to 5-digit format (00001, 00002, 00003...)...');

    // Step 1: Check if there are any customers first
    const customerCount = await query('SELECT COUNT(*) as count FROM customers');
    const totalCustomers = parseInt(customerCount.rows[0].count);

    console.log(`📋 Found ${totalCustomers} customers to migrate`);

    if (totalCustomers > 0) {
      // Step 2: Backup existing customer data with new IDs
      const customersData = await query(`
        SELECT
          ROW_NUMBER() OVER (ORDER BY created_at) as new_id,
          name,
          phone,
          pppoe_username,
          email,
          address,
          latitude,
          longitude,
          package_id,
          pppoe_profile,
          status,
          install_date,
          cable_type,
          cable_length,
          port_number,
          cable_status,
          cable_notes,
          device_id,
          created_at,
          updated_at,
          pppoe_password,
          area,
          payment_status,
          active_date,
          isolir_date,
          enable_isolir,
          customer_id,
          nik,
          deleted_at,
          siklus,
          billing_type,
          trial_expires_at,
          trial_active,
          odp_id,
          router,
          odp_name,
          odp_address,
          odp_port,
          portal_access_token,
          token_expires_at,
          region_id
        FROM customers
        ORDER BY created_at
      `);

      // Step 3: Create ID mapping (old ID -> new 5-digit ID)
      const oldCustomersData = await query('SELECT id FROM customers ORDER BY created_at');
      const idMapping = {};
      oldCustomersData.rows.forEach((customer, index) => {
        const newId = String(index + 1).padStart(5, '0'); // 00001, 00002, etc
        idMapping[customer.id] = newId;
      });

      // Step 4: Find and update all tables that reference customer_id
      const tablesToUpdate = [
        'invoices',
        'payments',
        'installation_fees',
        'customer_billing_cycles',
        'notifications',
        'support_tickets'
      ];

      for (const tableName of tablesToUpdate) {
        try {
          const tableCheck = await query(`
            SELECT EXISTS (
              SELECT FROM information_schema.columns
              WHERE table_name = '${tableName}'
              AND column_name = 'customer_id'
            ) as exists
          `);

          if (tableCheck.rows[0].exists) {
            console.log(`📝 Updating ${tableName} table...`);

            // Check for foreign key constraints
            const fkCheck = await query(`
              SELECT constraint_name
              FROM information_schema.table_constraints
              WHERE table_name = '${tableName}'
              AND constraint_type = 'FOREIGN KEY'
              AND constraint_name LIKE '%customer%'
            `);

            // Drop foreign key if exists
            for (const fk of fkCheck.rows) {
              await query(`
                ALTER TABLE ${tableName}
                DROP CONSTRAINT ${fk.constraint_name}
              `);
            }

            // Update customer_id references
            const recordsToUpdate = await query(`
              SELECT id, customer_id
              FROM ${tableName}
              WHERE customer_id IS NOT NULL
            `);

            for (const record of recordsToUpdate.rows) {
              if (idMapping[record.customer_id]) {
                await query(`
                  UPDATE ${tableName}
                  SET customer_id = $1
                  WHERE id = $2
                `, [idMapping[record.customer_id], record.id]);
              }
            }
          }
        } catch (error) {
          console.log(`⚠️ Skipping ${tableName}: ${error.message}`);
        }
      }

      // Step 5: Drop the original customers table
      await query(`DROP TABLE customers`);

      // Step 6: Create new customers table with VARCHAR(5) ID
      await query(`
        CREATE TABLE customers (
          id VARCHAR(5) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          pppoe_username VARCHAR(255),
          email VARCHAR(255),
          address TEXT,
          latitude DECIMAL,
          longitude DECIMAL,
          package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
          pppoe_profile VARCHAR(255),
          status VARCHAR(50) DEFAULT 'active',
          install_date TIMESTAMP,
          cable_type VARCHAR(50),
          cable_length INTEGER,
          port_number INTEGER,
          cable_status VARCHAR(50),
          cable_notes TEXT,
          device_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          pppoe_password VARCHAR(255),
          area VARCHAR(255),
          payment_status VARCHAR(50),
          active_date TIMESTAMP,
          isolir_date TIMESTAMP,
          enable_isolir BOOLEAN DEFAULT false,
          customer_id VARCHAR(255),
          nik VARCHAR(50),
          deleted_at TIMESTAMP,
          siklus VARCHAR(50),
          billing_type VARCHAR(50),
          trial_expires_at TIMESTAMP,
          trial_active BOOLEAN DEFAULT false,
          odp_id INTEGER REFERENCES odps(id) ON DELETE SET NULL,
          router VARCHAR(255),
          odp_name VARCHAR(255),
          odp_address TEXT,
          odp_port VARCHAR(50),
          portal_access_token VARCHAR(255),
          token_expires_at TIMESTAMP,
          region_id INTEGER REFERENCES regions(id) ON DELETE SET NULL
        )
      `);

      // Step 7: Insert data with new 5-digit IDs
      for (const customer of customersData.rows) {
        const newId = String(customer.new_id).padStart(5, '0');
        await query(`
          INSERT INTO customers (
            id, name, phone, pppoe_username, email, address, latitude, longitude,
            package_id, pppoe_profile, status, install_date, cable_type, cable_length,
            port_number, cable_status, cable_notes, device_id, created_at, updated_at,
            pppoe_password, area, payment_status, active_date, isolir_date,
            enable_isolir, customer_id, nik, deleted_at, siklus, billing_type,
            trial_expires_at, trial_active, odp_id, router, odp_name, odp_address,
            odp_port, portal_access_token, token_expires_at, region_id
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
            $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40
          )
        `, [
          newId,
          customer.name,
          customer.phone,
          customer.pppoe_username,
          customer.email,
          customer.address,
          customer.latitude,
          customer.longitude,
          customer.package_id,
          customer.pppoe_profile,
          customer.status,
          customer.install_date,
          customer.cable_type,
          customer.cable_length,
          customer.port_number,
          customer.cable_status,
          customer.cable_notes,
          customer.device_id,
          customer.created_at,
          customer.updated_at,
          customer.pppoe_password,
          customer.area,
          customer.payment_status,
          customer.active_date,
          customer.isolir_date,
          customer.enable_isolir,
          customer.customer_id,
          customer.nik,
          customer.deleted_at,
          customer.siklus,
          customer.billing_type,
          customer.trial_expires_at,
          customer.trial_active,
          customer.odp_id,
          customer.router,
          customer.odp_name,
          customer.odp_address,
          customer.odp_port,
          customer.portal_access_token,
          customer.token_expires_at,
          customer.region_id
        ]);
      }

      // Step 8: Re-create foreign key constraints
      for (const tableName of tablesToUpdate) {
        try {
          const tableCheck = await query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_name = '${tableName}'
            ) as exists
          `);

          if (tableCheck.rows[0].exists) {
            await query(`
              ALTER TABLE ${tableName}
              ADD CONSTRAINT fk_${tableName}_customer_id
              FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
            `);
          }
        } catch (error) {
          console.log(`⚠️ Could not recreate FK for ${tableName}: ${error.message}`);
        }
      }

      console.log(`✅ Migrated ${totalCustomers} customers to 5-digit ID format`);
    } else {
      // No customers to migrate, just modify the table structure
      console.log('📝 No customers found, updating table structure only...');

      // Drop and recreate table with new structure
      await query(`DROP TABLE IF EXISTS customers CASCADE`);

      await query(`
        CREATE TABLE customers (
          id VARCHAR(5) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          pppoe_username VARCHAR(255),
          email VARCHAR(255),
          address TEXT,
          latitude DECIMAL,
          longitude DECIMAL,
          package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
          pppoe_profile VARCHAR(255),
          status VARCHAR(50) DEFAULT 'active',
          install_date TIMESTAMP,
          cable_type VARCHAR(50),
          cable_length INTEGER,
          port_number INTEGER,
          cable_status VARCHAR(50),
          cable_notes TEXT,
          device_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          pppoe_password VARCHAR(255),
          area VARCHAR(255),
          payment_status VARCHAR(50),
          active_date TIMESTAMP,
          isolir_date TIMESTAMP,
          enable_isolir BOOLEAN DEFAULT false,
          customer_id VARCHAR(255),
          nik VARCHAR(50),
          deleted_at TIMESTAMP,
          siklus VARCHAR(50),
          billing_type VARCHAR(50),
          trial_expires_at TIMESTAMP,
          trial_active BOOLEAN DEFAULT false,
          odp_id INTEGER REFERENCES odps(id) ON DELETE SET NULL,
          router VARCHAR(255),
          odp_name VARCHAR(255),
          odp_address TEXT,
          odp_port VARCHAR(50),
          portal_access_token VARCHAR(255),
          token_expires_at TIMESTAMP,
          region_id INTEGER REFERENCES regions(id) ON DELETE SET NULL
        )
      `);

      console.log('✅ Customers table structure updated with 5-digit ID format');
    }

    // Step 9: Create sequence for auto-generating 5-digit IDs
    await query(`
      CREATE SEQUENCE customers_id_seq
      START WITH 1
      INCREMENT BY 1
    `);

    // Step 10: Create function for next 5-digit ID
    await query(`
      CREATE OR REPLACE FUNCTION generate_customer_id()
      RETURNS TEXT AS $$
      DECLARE
        next_id INTEGER;
      BEGIN
        next_id := nextval('customers_id_seq');
        RETURN LPAD(next_id::TEXT, 5, '0');
      END;
      $$ LANGUAGE plpgsql
    `);

    console.log('✅ Successfully changed customer ID to 5-digit format (00001, 00002, 00003...)');

  } catch (error) {
    console.error('❌ Error changing customer ID:', error);
    throw error;
  }
};

exports.down = async function() {
  try {
    console.log('🔄 Reverting customer ID back to original format...');

    // Step 1: Check current customers
    const customerCount = await query('SELECT COUNT(*) as count FROM customers');
    const totalCustomers = parseInt(customerCount.rows[0].count);

    if (totalCustomers > 0) {
      // Step 2: Backup current data
      const customersData = await query(`
        SELECT * FROM customers ORDER BY created_at
      `);

      // Step 3: Drop foreign key constraints
      const tablesToUpdate = ['invoices', 'payments', 'installation_fees', 'customer_billing_cycles', 'notifications', 'support_tickets'];

      for (const tableName of tablesToUpdate) {
        try {
          const tableCheck = await query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_name = '${tableName}'
            ) as exists
          `);

          if (tableCheck.rows[0].exists) {
            const fkCheck = await query(`
              SELECT constraint_name
              FROM information_schema.table_constraints
              WHERE table_name = '${tableName}'
              AND constraint_type = 'FOREIGN KEY'
              AND constraint_name LIKE '%customer%'
            `);

            for (const fk of fkCheck.rows) {
              await query(`
                ALTER TABLE ${tableName}
                DROP CONSTRAINT ${fk.constraint_name}
              `);
            }

            // Clear customer_id references (simplified rollback)
            await query(`
              UPDATE ${tableName}
              SET customer_id = NULL
              WHERE customer_id IS NOT NULL
            `);
          }
        } catch (error) {
          console.log(`⚠️ Skipping ${tableName}: ${error.message}`);
        }
      }

      // Step 4: Drop table and recreate with original structure
      await query(`DROP TABLE customers`);

      await query(`
        CREATE TABLE customers (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          pppoe_username VARCHAR(255),
          email VARCHAR(255),
          address TEXT,
          latitude DECIMAL,
          longitude DECIMAL,
          package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
          pppoe_profile VARCHAR(255),
          status VARCHAR(50) DEFAULT 'active',
          install_date TIMESTAMP,
          cable_type VARCHAR(50),
          cable_length INTEGER,
          port_number INTEGER,
          cable_status VARCHAR(50),
          cable_notes TEXT,
          device_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          pppoe_password VARCHAR(255),
          area VARCHAR(255),
          payment_status VARCHAR(50),
          active_date TIMESTAMP,
          isolir_date TIMESTAMP,
          enable_isolir BOOLEAN DEFAULT false,
          customer_id VARCHAR(255),
          nik VARCHAR(50),
          deleted_at TIMESTAMP,
          siklus VARCHAR(50),
          billing_type VARCHAR(50),
          trial_expires_at TIMESTAMP,
          trial_active BOOLEAN DEFAULT false,
          odp_id INTEGER REFERENCES odps(id) ON DELETE SET NULL,
          router VARCHAR(255),
          odp_name VARCHAR(255),
          odp_address TEXT,
          odp_port VARCHAR(50),
          portal_access_token VARCHAR(255),
          token_expires_at TIMESTAMP,
          region_id INTEGER REFERENCES regions(id) ON DELETE SET NULL
        )
      `);

      // Step 5: Restore data with UUID IDs (simplified)
      for (const customer of customersData.rows) {
        await query(`
          INSERT INTO customers (
            id, name, phone, pppoe_username, email, address, latitude, longitude,
            package_id, pppoe_profile, status, install_date, cable_type, cable_length,
            port_number, cable_status, cable_notes, device_id, created_at, updated_at,
            pppoe_password, area, payment_status, active_date, isolir_date,
            enable_isolir, customer_id, nik, deleted_at, siklus, billing_type,
            trial_expires_at, trial_active, odp_id, router, odp_name, odp_address,
            odp_port, portal_access_token, token_expires_at, region_id
          ) VALUES (
            gen_random_uuid(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
            $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40
          )
        `, [
          customer.name,
          customer.phone,
          customer.pppoe_username,
          customer.email,
          customer.address,
          customer.latitude,
          customer.longitude,
          customer.package_id,
          customer.pppoe_profile,
          customer.status,
          customer.install_date,
          customer.cable_type,
          customer.cable_length,
          customer.port_number,
          customer.cable_status,
          customer.cable_notes,
          customer.device_id,
          customer.created_at,
          customer.updated_at,
          customer.pppoe_password,
          customer.area,
          customer.payment_status,
          customer.active_date,
          customer.isolir_date,
          customer.enable_isolir,
          customer.customer_id,
          customer.nik,
          customer.deleted_at,
          customer.siklus,
          customer.billing_type,
          customer.trial_expires_at,
          customer.trial_active,
          customer.odp_id,
          customer.router,
          customer.odp_name,
          customer.odp_address,
          customer.odp_port,
          customer.portal_access_token,
          customer.token_expires_at,
          customer.region_id
        ]);
      }
    }

    // Step 6: Clean up
    await query(`DROP SEQUENCE IF EXISTS customers_id_seq`);
    await query(`DROP FUNCTION IF EXISTS generate_customer_id()`);

    console.log('✅ Successfully reverted customer ID to original format');

  } catch (error) {
    console.error('❌ Error reverting customer ID:', error);
    throw error;
  }
};