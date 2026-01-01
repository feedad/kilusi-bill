const { query } = require('../config/database');

exports.up = async function() {
  try {
    console.log('🔄 Changing regions.id from UUID to SERIAL (1, 2, 3...)...');

    // Step 1: Create backup of regions data with new IDs
    const regionsData = await query(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY created_at) as new_id,
        name,
        district,
        regency,
        province,
        created_at,
        updated_at,
        disabled_at
      FROM regions
      ORDER BY created_at
    `);
    console.log(`📋 Found ${regionsData.rows.length} regions to migrate`);

    // Step 2: Create ID mapping (old UUID -> new SERIAL)
    const oldRegionsData = await query(`SELECT id FROM regions ORDER BY created_at`);
    const idMapping = {};
    oldRegionsData.rows.forEach((region, index) => {
      idMapping[region.id] = index + 1; // SERIAL starts from 1
    });

    // Step 3: Drop foreign key constraint
    await query(`
      ALTER TABLE customers
      DROP CONSTRAINT IF EXISTS fk_customers_regions
    `);

    // Step 4: Store customer-region relationships
    const customersWithRegions = await query(`
      SELECT id, region_id
      FROM customers
      WHERE region_id IS NOT NULL
    `);

    const customerRegionMapping = [];
    for (const customer of customersWithRegions.rows) {
      if (idMapping[customer.region_id]) {
        customerRegionMapping.push({
          customer_id: customer.id,
          new_region_id: idMapping[customer.region_id]
        });
      }
    }

    // Step 5: Drop the original regions table
    await query(`DROP TABLE regions`);

    // Step 6: Create new regions table with SERIAL ID
    await query(`
      CREATE TABLE regions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        district VARCHAR(255),
        regency VARCHAR(255),
        province VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        disabled_at TIMESTAMP
      )
    `);

    // Step 7: Insert data with new SERIAL IDs
    for (const region of regionsData.rows) {
      await query(`
        INSERT INTO regions (id, name, district, regency, province, created_at, updated_at, disabled_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        region.new_id,
        region.name,
        region.district,
        region.regency,
        region.province,
        region.created_at,
        region.updated_at,
        region.disabled_at
      ]);
    }

    // Step 8: Drop and recreate region_id column as INTEGER
    await query(`
      ALTER TABLE customers
      DROP COLUMN IF EXISTS region_id
    `);

    await query(`
      ALTER TABLE customers
      ADD COLUMN region_id INTEGER
    `);

    // Step 9: Restore customer-region relationships
    for (const mapping of customerRegionMapping) {
      await query(`
        UPDATE customers
        SET region_id = $1
        WHERE id = $2
      `, [mapping.new_region_id, mapping.customer_id]);
    }

    // Step 10: Re-create foreign key constraint
    await query(`
      ALTER TABLE customers
      ADD CONSTRAINT fk_customers_regions
      FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL
    `);

    // Step 11: Reset sequence to start after max ID
    await query(`
      SELECT setval('regions_id_seq', (SELECT MAX(id) FROM regions))
    `);

    console.log('✅ Successfully changed regions.id to SERIAL (1, 2, 3...)');

  } catch (error) {
    console.error('❌ Error changing regions ID:', error);
    throw error;
  }
};

exports.down = async function() {
  try {
    console.log('🔄 Reverting regions.id back to UUID...');

    // Step 1: Add UUID column back
    await query(`
      ALTER TABLE regions
      ADD COLUMN id_new UUID DEFAULT gen_random_uuid()
    `);

    // Step 2: Generate UUIDs for existing records
    await query(`
      UPDATE regions
      SET id_new = gen_random_uuid()
    `);

    // Step 3: Drop foreign key constraint
    await query(`
      ALTER TABLE customers
      DROP CONSTRAINT IF EXISTS fk_customers_regions
    `);

    // Step 4: Update customers table reference to use UUID
    await query(`
      UPDATE customers
      SET region_id = (SELECT id_new FROM regions WHERE regions.id = customers.region_id)
    `);

    // Step 5: Drop SERIAL id and restore UUID
    await query(`
      ALTER TABLE regions
      DROP COLUMN id,
      RENAME COLUMN id_new TO id
    `);

    // Step 6: Set as primary key
    await query(`
      ALTER TABLE regions
      ADD PRIMARY KEY (id)
    `);

    // Step 7: Re-create foreign key constraint with UUID
    await query(`
      ALTER TABLE customers
      ADD CONSTRAINT fk_customers_regions
      FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL
    `);

    // Step 8: Update customers column type to UUID
    await query(`
      ALTER TABLE customers
      ALTER COLUMN region_id TYPE UUID USING region_id::uuid
    `);

    console.log('✅ Successfully reverted regions.id back to UUID');

  } catch (error) {
    console.error('❌ Error reverting regions ID:', error);
    throw error;
  }
};
