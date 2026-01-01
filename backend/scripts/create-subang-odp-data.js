const { query } = require('../config/database');
const logger = require('../config/logger');

async function createSubangODPData() {
  try {
    console.log('Creating sample ODP data around Subang area...');

    // Sample ODP data with Subang coordinates (Prima Talaga Sunda Dangdeur area)
    // Subang coordinates: -6.5715, 107.7547
    const sampleODPs = [
      // Main ODPs in Prima Talaga Sunda Dangdeur area
      {
        name: 'ODP Prima Talaga Central',
        code: 'SUB-PTC-001',
        address: 'Jl. Prima Talaga Sunda, Dangdeur, Subang',
        latitude: -6.5715,
        longitude: 107.7547,
        capacity: 64,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Dangdeur Utama',
        code: 'SUB-DDU-001',
        address: 'Jl. Dangdeur Raya No. 45, Subang',
        latitude: -6.5698,
        longitude: 107.7562,
        capacity: 48,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Subang Kota',
        code: 'SUB-SKT-001',
        address: 'Jl. Agus Salim No. 12, Subang',
        latitude: -6.5743,
        longitude: 107.7518,
        capacity: 64,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Pasar Subang',
        code: 'SUB-PSR-001',
        address: 'Jl. Pasar Baru No. 89, Subang',
        latitude: -6.5721,
        longitude: 107.7589,
        capacity: 32,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Pendidikan',
        code: 'SUB-PND-001',
        address: 'Jl. Pendidikan No. 23, Subang',
        latitude: -6.5687,
        longitude: 107.7524,
        capacity: 48,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },

      // Sub ODPs connected to main ODPs
      {
        name: 'Sub ODP Dangdeur 1',
        code: 'SUB-DDU-001-01',
        address: 'Jl. Dangdeur Permai Blok A No. 5, Subang',
        latitude: -6.5702,
        longitude: 107.7571,
        capacity: 24,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null // Will be updated after getting parent ID
      },
      {
        name: 'Sub ODP Dangdeur 2',
        code: 'SUB-DDU-001-02',
        address: 'Jl. Dangdeur Asri Blok B No. 12, Subang',
        latitude: -6.5694,
        longitude: 107.7553,
        capacity: 24,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'Sub ODP Prima Talaga 1',
        code: 'SUB-PTC-001-01',
        address: 'Jl. Prima Talaga Indah Blok C No. 8, Subang',
        latitude: -6.5728,
        longitude: 107.7539,
        capacity: 16,
        used_ports: 0,
        status: 'maintenance',
        parent_odp_id: null
      },
      {
        name: 'Sub ODP Prima Talaga 2',
        code: 'SUB-PTC-001-02',
        address: 'Jl. Prima Talaga Jaya Blok D No. 15, Subang',
        latitude: -6.5711,
        longitude: 107.7558,
        capacity: 16,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'Sub ODP Subang Kota 1',
        code: 'SUB-SKT-001-01',
        address: 'Jl. Kartini No. 34, Subang',
        latitude: -6.5751,
        longitude: 107.7526,
        capacity: 24,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },

      // Extended coverage ODPs
      {
        name: 'ODP Cigugur',
        code: 'SUB-CGG-001',
        address: 'Jl. Cigugur Raya No. 56, Subang',
        latitude: -6.5665,
        longitude: 107.7598,
        capacity: 32,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Parungkuda',
        code: 'SUB-PRK-001',
        address: 'Jl. Parungkuda No. 78, Subang',
        latitude: -6.5779,
        longitude: 107.7492,
        capacity: 32,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Kalijati',
        code: 'SUB-KLT-001',
        address: 'Jl. Kalijati Indah No. 91, Subang',
        latitude: -6.5623,
        longitude: 107.7615,
        capacity: 48,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Pamanukan',
        code: 'SUB-PMK-001',
        address: 'Jl. Pamanukan No. 23, Subang',
        latitude: -6.5804,
        longitude: 107.7467,
        capacity: 32,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Ciater',
        code: 'SUB-CTR-001',
        address: 'Jl. Ciater No. 67, Subang',
        latitude: -6.5589,
        longitude: 107.7643,
        capacity: 48,
        used_ports: 0,
        status: 'active',
        parent_odp_id: null
      }
    ];

    // Insert sample ODPs and store their IDs
    const odpIdMap = {};

    for (const odp of sampleODPs) {
      const queryText = `
        INSERT INTO odps (name, code, address, latitude, longitude, capacity, used_ports, status, parent_odp_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          address = EXCLUDED.address,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          capacity = EXCLUDED.capacity,
          used_ports = EXCLUDED.used_ports,
          status = EXCLUDED.status,
          parent_odp_id = EXCLUDED.parent_odp_id,
          updated_at = NOW()
        RETURNING id;
      `;

      const values = [
        odp.name,
        odp.code,
        odp.address,
        odp.latitude,
        odp.longitude,
        odp.capacity,
        odp.used_ports,
        odp.status,
        odp.parent_odp_id
      ];

      const result = await query(queryText, values);
      const odpId = result.rows[0].id;
      odpIdMap[odp.code] = odpId;
      console.log(`Created/Updated ODP: ${odp.name} (ID: ${odpId})`);
    }

    // Update parent relationships for sub-ODPs
    const parentRelationships = [
      { subCode: 'SUB-DDU-001-01', parentCode: 'SUB-DDU-001' },
      { subCode: 'SUB-DDU-001-02', parentCode: 'SUB-DDU-001' },
      { subCode: 'SUB-PTC-001-01', parentCode: 'SUB-PTC-001' },
      { subCode: 'SUB-PTC-001-02', parentCode: 'SUB-PTC-001' },
      { subCode: 'SUB-SKT-001-01', parentCode: 'SUB-SKT-001' }
    ];

    for (const rel of parentRelationships) {
      if (odpIdMap[rel.subCode] && odpIdMap[rel.parentCode]) {
        await query(
          'UPDATE odps SET parent_odp_id = $1 WHERE code = $2',
          [odpIdMap[rel.parentCode], rel.subCode]
        );
        console.log(`Updated parent relationship: ${rel.subCode} -> ${rel.parentCode}`);
      }
    }

    // Create sample customers in Subang area
    const sampleCustomers = [
      { customer_id: 'SUB001', name: 'PT. Subang Teknologi', address: 'Jl. Prima Talaga Sunda No. 15, Subang', latitude: -6.5713, longitude: 107.7545, phone: '0260-411234' },
      { customer_id: 'SUB002', name: 'CV. Dangdeur Digital', address: 'Jl. Dangdeur Raya No. 25, Subang', latitude: -6.5696, longitude: 107.7560, phone: '0260-412345' },
      { customer_id: 'SUB003', name: 'PT. Subang Makmur', address: 'Jl. Agus Salim No. 8, Subang', latitude: -6.5741, longitude: 107.7516, phone: '0260-413456' },
      { customer_id: 'SUB004', name: 'UD. Pasar Subang', address: 'Jl. Pasar Baru No. 45, Subang', latitude: -6.5719, longitude: 107.7587, phone: '0260-414567' },
      { customer_id: 'SUB005', name: 'PT. Pendidikan Mandiri', address: 'Jl. Pendidikan No. 12, Subang', latitude: -6.5685, longitude: 107.7522, phone: '0260-415678' },
      { customer_id: 'SUB006', name: 'CV. Cigugur Jaya', address: 'Jl. Cigugur Raya No. 34, Subang', latitude: -6.5663, longitude: 107.7596, phone: '0260-416789' },
      { customer_id: 'SUB007', name: 'PT. Kalijati Indah', address: 'Jl. Kalijati Indah No. 56, Subang', latitude: -6.5621, longitude: 107.7613, phone: '0260-417890' },
      { customer_id: 'SUB008', name: 'CV. Ciater Asri', address: 'Jl. Ciater No. 23, Subang', latitude: -6.5587, longitude: 107.7641, phone: '0260-418901' },
      { customer_id: 'SUB009', name: 'PT. Parungkuda Sejahtera', address: 'Jl. Parungkuda No. 67, Subang', latitude: -6.5777, longitude: 107.7490, phone: '0260-419012' },
      { customer_id: 'SUB010', name: 'UD. Pamanukan Makmur', address: 'Jl. Pamanukan No. 12, Subang', latitude: -6.5802, longitude: 107.7465, phone: '0260-420123' }
    ];

    // Insert sample customers
    for (const customer of sampleCustomers) {
      const queryText = `
        INSERT INTO customers (customer_id, name, address, latitude, longitude, phone, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
        ON CONFLICT (customer_id) DO UPDATE SET
          name = EXCLUDED.name,
          address = EXCLUDED.address,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          phone = EXCLUDED.phone,
          updated_at = NOW()
        RETURNING customer_id;
      `;

      const values = [
        customer.customer_id,
        customer.name,
        customer.address,
        customer.latitude,
        customer.longitude,
        customer.phone
      ];

      await query(queryText, values);
      console.log(`Created/Updated Customer: ${customer.name} (${customer.customer_id})`);
    }

    // Create sample cable routes (ODP to Customer connections)
    const sampleCableRoutes = [
      { odp_code: 'SUB-PTC-001', customer_id: 'SUB001', cable_length: 25, port_number: 1, status: 'connected', installation_date: '2024-01-15', notes: 'Main office connection' },
      { odp_code: 'SUB-DDU-001', customer_id: 'SUB002', cable_length: 35, port_number: 2, status: 'connected', installation_date: '2024-01-20', notes: 'Corporate client' },
      { odp_code: 'SUB-SKT-001', customer_id: 'SUB003', cable_length: 45, port_number: 1, status: 'connected', installation_date: '2024-02-01', notes: 'Business district' },
      { odp_code: 'SUB-PSR-001', customer_id: 'SUB004', cable_length: 30, port_number: 3, status: 'connected', installation_date: '2024-02-10', notes: 'Market area' },
      { odp_code: 'SUB-PND-001', customer_id: 'SUB005', cable_length: 20, port_number: 2, status: 'connected', installation_date: '2024-02-15', notes: 'Education area' },
      { odp_code: 'SUB-CGG-001', customer_id: 'SUB006', cable_length: 50, port_number: 1, status: 'connected', installation_date: '2024-03-01', notes: 'Residential area' },
      { odp_code: 'SUB-KLT-001', customer_id: 'SUB007', cable_length: 60, port_number: 2, status: 'connected', installation_date: '2024-03-05', notes: 'Industrial area' },
      { odp_code: 'SUB-CTR-001', customer_id: 'SUB008', cable_length: 70, port_number: 1, status: 'connected', installation_date: '2024-03-10', notes: 'Tourism area' },
      { odp_code: 'SUB-PRK-001', customer_id: 'SUB009', cable_length: 40, port_number: 2, status: 'maintenance', installation_date: '2024-03-15', notes: 'Scheduled maintenance' },
      { odp_code: 'SUB-PMK-001', customer_id: 'SUB010', cable_length: 55, port_number: 1, status: 'connected', installation_date: '2024-03-20', notes: 'Commercial area' }
    ];

    // Insert sample cable routes
    for (const route of sampleCableRoutes) {
      try {
        // Get ODP ID from code
        const odpResult = await query('SELECT id FROM odps WHERE code = $1', [route.odp_code]);
        if (odpResult.rows.length === 0) {
          console.log(`ODP not found: ${route.odp_code}, skipping cable route`);
          continue;
        }

        const odpId = odpResult.rows[0].id;

        const queryText = `
          INSERT INTO cable_routes (odp_id, customer_id, cable_length, port_number, status, installation_date, notes, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          RETURNING id;
        `;

        const values = [
          odpId,
          route.customer_id,
          route.cable_length,
          route.port_number,
          route.status,
          route.installation_date,
          route.notes
        ];

        const result = await query(queryText, values);
        console.log(`Created Cable Route: ${route.odp_code} to ${route.customer_id} (ID: ${result.rows[0].id})`);
      } catch (error) {
        // If duplicate, just log and continue
        if (error.message.includes('duplicate key')) {
          console.log(`Cable Route already exists: ${route.odp_code} to ${route.customer_id}`);
        } else {
          throw error;
        }
      }
    }

    console.log('Sample Subang ODP data creation completed!');

    // Get statistics
    const statsQuery = `
      SELECT
        COUNT(*) as total_odps,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_odps,
        COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenance_odps,
        SUM(used_ports) as total_used_ports,
        SUM(capacity) as total_capacity
      FROM odps;
    `;

    const statsResult = await query(statsQuery);
    console.log('Subang ODP Statistics:', statsResult.rows[0]);

  } catch (error) {
    console.error('Error creating Subang ODP data:', error);
    throw error;
  }
}

// Run if this script is executed directly
if (require.main === module) {
  createSubangODPData()
    .then(() => {
      console.log('Subang sample data creation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to create Subang sample data:', error);
      process.exit(1);
    });
}

module.exports = { createSubangODPData };