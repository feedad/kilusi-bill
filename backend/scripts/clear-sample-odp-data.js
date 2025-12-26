const { query } = require('../config/database');
const logger = require('../config/logger');

async function clearSampleODPData() {
  try {
    console.log('Menghapus semua data ODP contoh...');

    // Delete cable routes first (due to foreign key constraint)
    const cableRouteResult = await query('DELETE FROM cable_routes RETURNING id');
    console.log(`Menghapus ${cableRouteResult.rowCount} cable routes`);

    // Delete customers with CUST prefix (sample customers)
    const customerResult = await query("DELETE FROM customers WHERE customer_id LIKE 'CUST%' RETURNING customer_id");
    console.log(`Menghapus ${customerResult.rowCount} sample customers`);

    // Delete ODPs with JKT, BG, TG, DP, BK prefixes (sample ODPs)
    const odpResult = await query("DELETE FROM odps WHERE code LIKE 'JKT%' OR code LIKE 'BG%' OR code LIKE 'TG%' OR code LIKE 'DP%' OR code LIKE 'BK%' RETURNING code");
    console.log(`Menghapus ${odpResult.rowCount} sample ODPs`);

    console.log('Sample ODP data berhasil dihapus!');

    // Get remaining statistics
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
    console.log('Remaining ODP Statistics:', statsResult.rows[0]);

  } catch (error) {
    console.error('Error menghapus sample ODP data:', error);
    throw error;
  }
}

// Run if this script is executed directly
if (require.main === module) {
  clearSampleODPData()
    .then(() => {
      console.log('Sample data deletion completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to delete sample data:', error);
      process.exit(1);
    });
}

module.exports = { clearSampleODPData };