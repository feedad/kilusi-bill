const fs = require('fs');
const path = require('path');

/**
 * Migration script untuk menambahkan field RADIUS ke customer data
 * Run: node scripts/migrate-customer-radius.js
 */

const customersPath = path.join(__dirname, '../logs/customers.json');

function migrateCustomers() {
  console.log('🔄 Starting customer migration for RADIUS...');
  
  try {
    // Read existing customers
    if (!fs.existsSync(customersPath)) {
      console.log('❌ customers.json not found');
      return;
    }
    
    const data = fs.readFileSync(customersPath, 'utf8');
    const customers = JSON.parse(data);
    
    console.log(`📊 Found ${customers.length} customers`);
    
    let updatedCount = 0;
    
    // Update each customer with RADIUS fields if not exist
    customers.forEach(customer => {
      let updated = false;
      
      // Add username if not exist (use phone number or generate)
      if (!customer.username) {
        // Generate username from name or phone
        const baseUsername = customer.name 
          ? customer.name.toLowerCase().replace(/\s+/g, '_') 
          : `user_${customer.phone}`;
        customer.username = baseUsername;
        updated = true;
      }
      
      // Add password if not exist (generate random)
      if (!customer.password) {
        customer.password = generateRandomPassword();
        updated = true;
      }
      
      // Add package_speed if not exist (from package name)
      if (!customer.package_speed && customer.package_name) {
        // Extract speed from package name (e.g., "Paket 10 Mbps" -> "10 Mbps")
        const speedMatch = customer.package_name.match(/(\d+\s*(?:Kbps|Mbps|Gbps))/i);
        if (speedMatch) {
          customer.package_speed = speedMatch[1];
          updated = true;
        }
      }
      
      // Add isolir_status if not exist
      if (!customer.isolir_status) {
        customer.isolir_status = 'active';
        updated = true;
      }
      
      // Add enable_isolir if not exist
      if (customer.enable_isolir === undefined) {
        customer.enable_isolir = true;
        updated = true;
      }
      
      // Add radius_synced flag
      if (customer.radius_synced === undefined) {
        customer.radius_synced = false;
        updated = true;
      }
      
      // Add radius_synced_at timestamp
      if (!customer.radius_synced_at) {
        customer.radius_synced_at = null;
        updated = true;
      }
      
      if (updated) {
        updatedCount++;
      }
    });
    
    // Save updated customers
    fs.writeFileSync(customersPath, JSON.stringify(customers, null, 2));
    
    console.log(`✅ Migration completed: ${updatedCount} customers updated`);
    
    // Print summary
    console.log('\n📊 Summary:');
    console.log(`- Total customers: ${customers.length}`);
    console.log(`- Customers with username: ${customers.filter(c => c.username).length}`);
    console.log(`- Customers with password: ${customers.filter(c => c.password).length}`);
    console.log(`- Customers with package_speed: ${customers.filter(c => c.package_speed).length}`);
    
    // Show sample customer data
    if (customers.length > 0) {
      console.log('\n📝 Sample customer data:');
      console.log(JSON.stringify({
        name: customers[0].name,
        username: customers[0].username,
        password: customers[0].password ? '***' : undefined,
        package_speed: customers[0].package_speed,
        isolir_status: customers[0].isolir_status
      }, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

function generateRandomPassword(length = 8) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Run migration
migrateCustomers();
