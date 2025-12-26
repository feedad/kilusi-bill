const { query } = require('../config/database');
const logger = require('../config/logger');

async function createSampleODPData() {
  try {
    console.log('Creating sample ODP data...');

    // Sample ODP data with Jakarta coordinates
    const sampleODPs = [
      {
        name: 'ODP Jakarta Pusat',
        code: 'JKT-P-001',
        address: 'Jl. MH Thamrin No. 1, Jakarta Pusat',
        latitude: -6.2088,
        longitude: 106.8456,
        capacity: 64,
        used_ports: 0,
        status: 'active'
      },
      {
        name: 'ODP Jakarta Selatan',
        code: 'JKT-S-001',
        address: 'Jl. Sudirman No. 12, Jakarta Selatan',
        latitude: -6.2615,
        longitude: 106.8106,
        capacity: 64,
        used_ports: 12,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Jakarta Utara',
        code: 'JKT-N-001',
        address: 'Jl. Yos Sudarso No. 25, Jakarta Utara',
        latitude: -6.1384,
        longitude: 106.8759,
        capacity: 48,
        used_ports: 8,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Jakarta Barat',
        code: 'JKT-W-001',
        address: 'Jl. Gatot Subroto No. 8, Jakarta Barat',
        latitude: -6.1754,
        longitude: 106.8272,
        capacity: 64,
        used_ports: 24,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Jakarta Timur',
        code: 'JKT-E-001',
        address: 'Jl. Jenderal Ahmad Yani No. 15, Jakarta Timur',
        latitude: -6.2382,
        longitude: 106.8856,
        capacity: 48,
        used_ports: 6,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'Sub ODP Jakarta Selatan 1',
        code: 'JKT-S-001-01',
        address: 'Jl. Tebet Barat Dalam No. 45, Jakarta Selatan',
        latitude: -6.2654,
        longitude: 106.8254,
        capacity: 24,
        used_ports: 8,
        status: 'active',
        parent_odp_id: 2
      },
      {
        name: 'Sub ODP Jakarta Selatan 2',
        code: 'JKT-S-001-02',
        address: 'Jl. Kemang Raya No. 88, Jakarta Selatan',
        latitude: -6.2554,
        longitude: 106.7954,
        capacity: 24,
        used_ports: 4,
        status: 'active',
        parent_odp_id: 2
      },
      {
        name: 'Sub ODP Jakarta Barat 1',
        code: 'JKT-W-001-01',
        address: 'Jl. Palmerah Barat No. 67, Jakarta Barat',
        latitude: -6.1854,
        longitude: 106.8172,
        capacity: 16,
        used_ports: 5,
        status: 'maintenance',
        parent_odp_id: 4
      },
      {
        name: 'Sub ODP Jakarta Barat 2',
        code: 'JKT-W-001-02',
        address: 'Jl. Hj. Mas Mansyur No. 112, Jakarta Barat',
        latitude: -6.1654,
        longitude: 106.8372,
        capacity: 16,
        used_ports: 7,
        status: 'active',
        parent_odp_id: 4
      },
      {
        name: 'Sub ODP Jakarta Timur 1',
        code: 'JKT-E-001-01',
        address: 'Jl. Jatinegara Barat No. 134, Jakarta Timur',
        latitude: -6.2482,
        longitude: 106.8756,
        capacity: 24,
        used_ports: 3,
        status: 'active',
        parent_odp_id: 5
      },
      {
        name: 'Sub ODP Jakarta Utara 1',
        code: 'JKT-N-001-01',
        address: 'Jl. Kelapa Gading Boulevard No. 78, Jakarta Utara',
        latitude: -6.1284,
        longitude: 106.8859,
        capacity: 24,
        used_ports: 12,
        status: 'active',
        parent_odp_id: 3
      },
      {
        name: 'Sub ODP Jakarta Utara 2',
        code: 'JKT-N-001-02',
        address: 'Jl. Sunter Podomoro No. 34, Jakarta Utara',
        latitude: -6.1484,
        longitude: 106.8659,
        capacity: 24,
        used_ports: 6,
        status: 'active',
        parent_odp_id: 3
      },
      {
        name: 'ODP Bogor',
        code: 'BG-001',
        address: 'Jl. Raya Bogor No. 234, Bogor',
        latitude: -6.5944,
        longitude: 106.7892,
        capacity: 64,
        used_ports: 15,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Tangerang',
        code: 'TG-001',
        address: 'Jl. Jendral Sudirman No. 12, Tangerang',
        latitude: -6.1704,
        longitude: 106.6408,
        capacity: 48,
        used_ports: 22,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Depok',
        code: 'DP-001',
        address: 'Jl. Margonda Raya No. 88, Depok',
        latitude: -6.4025,
        longitude: 106.7942,
        capacity: 48,
        used_ports: 10,
        status: 'active',
        parent_odp_id: null
      },
      {
        name: 'ODP Bekasi',
        code: 'BK-001',
        address: 'Jl. Ahmad Yani No. 234, Bekasi',
        latitude: -6.2419,
        longitude: 106.9758,
        capacity: 64,
        used_ports: 28,
        status: 'active',
        parent_odp_id: null
      }
    ];

    // Insert sample ODPs
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
      console.log(`Created/Updated ODP: ${odp.name} (ID: ${result.rows[0].id})`);
    }

    // Create sample customers first (if they don't exist)
    const sampleCustomers = [
      { customer_id: 'CUST001', name: 'PT. Maju Jaya', address: 'Jl. Thamrin No. 15, Jakarta Pusat', latitude: -6.2088, longitude: 106.8456, phone: '021-123456' },
      { customer_id: 'CUST002', name: 'CV. Teknologi Digital', address: 'Jl. Sudirman No. 25, Jakarta Selatan', latitude: -6.2615, longitude: 106.8106, phone: '021-234567' },
      { customer_id: 'CUST003', name: 'PT. Karya Mandiri', address: 'Jl. Kelapa Gading No. 10, Jakarta Utara', latitude: -6.1384, longitude: 106.8759, phone: '021-345678' },
      { customer_id: 'CUST004', name: 'PT. Inovasi Kreatif', address: 'Jl. Gatot Subroto No. 5, Jakarta Barat', latitude: -6.1754, longitude: 106.8272, phone: '021-456789' },
      { customer_id: 'CUST005', name: 'CV. Solusi Bisnis', address: 'Jl. Ahmad Yani No. 20, Jakarta Timur', latitude: -6.2382, longitude: 106.8856, phone: '021-567890' },
      { customer_id: 'CUST006', name: 'PT. Data Komunikasi', address: 'Jl. Tebet Barat No. 12, Jakarta Selatan', latitude: -6.2654, longitude: 106.8254, phone: '021-678901' },
      { customer_id: 'CUST007', name: 'CV. Network Solutions', address: 'Jl. Palmerah No. 8, Jakarta Barat', latitude: -6.1854, longitude: 106.8172, phone: '021-789012' },
      { customer_id: 'CUST008', name: 'PT. Connect Indonesia', address: 'Jl. Jatinegara No. 18, Jakarta Timur', latitude: -6.2482, longitude: 106.8756, phone: '021-890123' }
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

    // Create sample cable routes (ODP to Customer connections) using ODP codes
    const sampleCableRoutes = [
      { odp_code: 'JKT-P-001', customer_id: 'CUST001', cable_length: 50, port_number: 1, status: 'connected', installation_date: '2024-01-15', notes: 'Main office connection' },
      { odp_code: 'JKT-S-001', customer_id: 'CUST002', cable_length: 120, port_number: 2, status: 'connected', installation_date: '2024-01-20', notes: 'Corporate client' },
      { odp_code: 'JKT-N-001', customer_id: 'CUST003', cable_length: 80, port_number: 1, status: 'connected', installation_date: '2024-02-01', notes: 'Residential complex' },
      { odp_code: 'JKT-W-001', customer_id: 'CUST004', cable_length: 200, port_number: 3, status: 'connected', installation_date: '2024-02-10', notes: 'Industrial area' },
      { odp_code: 'JKT-E-001', customer_id: 'CUST005', cable_length: 150, port_number: 2, status: 'connected', installation_date: '2024-02-15', notes: 'Business district' },
      { odp_code: 'JKT-S-001-01', customer_id: 'CUST006', cable_length: 30, port_number: 1, status: 'connected', installation_date: '2024-03-01', notes: 'Sub ODP connection' },
      { odp_code: 'JKT-W-001-01', customer_id: 'CUST007', cable_length: 45, port_number: 2, status: 'maintenance', installation_date: '2024-03-05', notes: 'Scheduled maintenance' },
      { odp_code: 'JKT-E-001-01', customer_id: 'CUST008', cable_length: 90, port_number: 1, status: 'connected', installation_date: '2024-03-10', notes: 'Sub ODP connection' }
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

    console.log('Sample ODP data creation completed!');

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
    console.log('ODP Statistics:', statsResult.rows[0]);

  } catch (error) {
    console.error('Error creating sample ODP data:', error);
    throw error;
  }
}

// Run if this script is executed directly
if (require.main === module) {
  createSampleODPData()
    .then(() => {
      console.log('Sample data creation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to create sample data:', error);
      process.exit(1);
    });
}

module.exports = { createSampleODPData };