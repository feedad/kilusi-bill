const radiusDb = require('./config/radius-postgres');

async function updatePassword() {
  try {
    console.log('🔧 Updating apptest password...');

    // Direct query to delete existing entries
    const { query } = require('./config/database');
    await query('DELETE FROM radcheck WHERE username = $1', ['apptest']);

    // Insert new password
    await query(
      'INSERT INTO radcheck (username, attribute, op, value) VALUES ($1, $2, $3, $4)',
      ['apptest', 'Cleartext-Password', ':=', '1234567']
    );

    console.log('✅ Password updated to 1234567');

    // Verify
    const user = await radiusDb.getRadiusUser('apptest');
    console.log('Verification:', user ? user.value : 'Not found');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  process.exit(0);
}

updatePassword();