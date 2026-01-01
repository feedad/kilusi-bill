const { query } = require('../config/database');

async function addSampleDiscount() {
  try {
    console.log('🔄 Adding sample discount...');

    const result = await query(`
      INSERT INTO billing_discounts (
        name,
        description,
        discount_type,
        discount_value,
        target_type,
        compensation_reason,
        start_date,
        end_date,
        is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING *
    `, [
      'Kompensasi Gangguan Jaringan',
      'Kompensasi untuk pelanggan terdampak gangguan jaringan',
      'fixed',
      25000,
      'all',
      'Gangguan jaringan area X',
      '2025-11-17',
      '2025-11-30',
      true
    ]);

    console.log('✅ Sample discount added:', result.rows[0]);

    // Add a percentage discount too
    const result2 = await query(`
      INSERT INTO billing_discounts (
        name,
        description,
        discount_type,
        discount_value,
        target_type,
        compensation_reason,
        start_date,
        end_date,
        is_active,
        max_discount_amount
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING *
    `, [
      'Diskon Maintenance 20%',
      'Diskon untuk pelanggan terdampak maintenance sistem',
      'percentage',
      20,
      'all',
      'Maintenance sistem 2025',
      '2025-11-15',
      '2025-11-25',
      true,
      50000
    ]);

    console.log('✅ Percentage discount added:', result2.rows[0]);

    // Add area-specific discount
    const result3 = await query(`
      INSERT INTO billing_discounts (
        name,
        description,
        discount_type,
        discount_value,
        target_type,
        target_ids,
        compensation_reason,
        start_date,
        end_date,
        is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING *
    `, [
      'Kompensasi Area Jakarta',
      'Kompensasi khusus pelanggan area Jakarta',
      'fixed',
      35000,
      'area',
      ARRAY['Jakarta', 'Jakarta Pusat', 'Jakarta Utara'],
      'Gangguan fiber Jakarta',
      '2025-11-17',
      '2025-12-01',
      true
    ]);

    console.log('✅ Area-specific discount added:', result3.rows[0]);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding sample discounts:', error);
    process.exit(1);
  }
}

addSampleDiscount();