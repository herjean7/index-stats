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

  console.log('Example 1: AliCloud basic usage');
  console.log('Command: node index.js --provider alicloud --instance-id dds-xxxxxxxxx\n');

  console.log('Example 2: Atlas usage via URI');
  console.log('Command: node index.js --provider atlas --atlas-uri "mongodb+srv://user:pass@cluster.mongodb.net/admin?tls=true"\n');

  console.log('Example 3: Self-managed usage via URI');
  console.log('Command: node index.js --provider self-managed --connection-uri "mongodb://user:pass@host1:27017,host2:27017/admin?replicaSet=rs0"\n');

  console.log('Example 4: Self-managed static host mode');
  console.log('Command: node index.js --provider self-managed --hosts host1:27017,host2:27017 --tls\n');

  console.log('Example 5: Generate JSON report');
  console.log('Command: node index.js --provider alicloud --instance-id dds-xxxxxxxxx --output json\n');

  console.log('Example 6: Combined options');
  console.log('Command: node index.js --provider atlas --atlas-uri "mongodb+srv://..." --output csv --min-ops 50\n');

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
    
    const provider = (process.env.CLOUD_PROVIDER || 'alicloud').toLowerCase();
    console.log(`✅ Configuration loaded (provider: ${provider})`);
    console.log('\nTo run the actual analysis, use one of:');
    console.log('   node index.js --provider alicloud --instance-id <instance-id>');
    console.log('   node index.js --provider atlas --atlas-uri "mongodb+srv://..."');
    console.log('   node index.js --provider self-managed --connection-uri "mongodb://..."');
    
  } catch (error) {
    console.error('❌ Configuration error:', error.message);
    console.log('\nPlease check your .env file configuration');
  }
}

if (require.main === module) {
  runExamples().catch(console.error);
}