#!/usr/bin/env node

/**
 * Example usage script for MongoDB Index Stats Tool
 */

// Only import for configuration validation
const fs = require('fs');
const path = require('path');

async function runExamples() {
  console.log('🔍 MongoDB Index Stats Tool - Example Usage');
  console.log('=============================================\n');

  console.log('Example 1: Basic usage (instance ID required)');
  console.log('Command: node index.js --instance-id dds-xxxxxxxxx\n');

  console.log('Example 2: Generate JSON report');
  console.log('Command: node index.js --instance-id dds-xxxxxxxxx --output json\n');

  console.log('Example 3: Include system databases');
  console.log('Command: node index.js --instance-id dds-xxxxxxxxx --include-system-dbs\n');

  console.log('Example 4: Custom unused index threshold');
  console.log('Command: node index.js --instance-id dds-xxxxxxxxx --min-ops 100\n');

  console.log('Example 5: Specific region');
  console.log('Command: node index.js --instance-id dds-xxxxxxxxx --region cn-shanghai\n');

  console.log('Example 6: Combined options');
  console.log('Command: node index.js --instance-id dds-xxxxxxxxx --region cn-hangzhou --output csv --min-ops 50\n');

  // Check if environment is configured
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.log('⚠️  Environment not configured. Run setup first:');
    console.log('   node setup.js\n');
    return;
  }

  // Run a quick validation
  console.log('🧪 Testing configuration...');
  try {
    // Load environment variables
    require('dotenv').config();
    
    // Basic validation - just check if AliCloud client can be created
    const AliCloudClient = require('./lib/alicloud-client');
    
    const client = new AliCloudClient({
      accessKeyId: process.env.ALICLOUD_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALICLOUD_ACCESS_KEY_SECRET,
      region: process.env.ALICLOUD_REGION || 'cn-hangzhou'
    });

    console.log('✅ Configuration appears valid');
    console.log('\nTo run the actual analysis, use:');
    console.log('   node index.js --instance-id <your-mongodb-instance-id>');
    
  } catch (error) {
    console.error('❌ Configuration error:', error.message);
    console.log('\nPlease check your .env file configuration');
  }
}

if (require.main === module) {
  runExamples().catch(console.error);
}