#!/usr/bin/env node

/**
 * Example usage script for MongoDB Index Stats Tool
 */

const { main } = require('./index');

async function runExamples() {
  console.log('🔍 MongoDB Index Stats Tool - Example Usage');
  console.log('=============================================\n');

  console.log('Example 1: Basic usage (analyze all instances)');
  console.log('Command: node index.js\n');

  console.log('Example 2: Analyze specific instance');
  console.log('Command: node index.js --instance-id dds-xxxxxxxxx\n');

  console.log('Example 3: Generate JSON report');
  console.log('Command: node index.js --output json\n');

  console.log('Example 4: Include system databases');
  console.log('Command: node index.js --include-system-dbs\n');

  console.log('Example 5: Custom unused index threshold');
  console.log('Command: node index.js --min-ops 100\n');

  console.log('Example 6: Specific region');
  console.log('Command: node index.js --region cn-shanghai\n');

  console.log('Example 7: Combined options');
  console.log('Command: node index.js --region cn-hangzhou --output csv --min-ops 50\n');

  // Check if environment is configured
  if (!process.env.ALICLOUD_ACCESS_KEY_ID) {
    console.log('⚠️  Environment not configured. Run setup first:');
    console.log('   node setup.js\n');
    return;
  }

  // Run a quick validation
  console.log('🧪 Testing configuration...');
  try {
    // This would normally run the full analysis, but for demo purposes,
    // we'll just validate the environment
    const AliCloudClient = require('./lib/alicloud-client');
    
    const client = new AliCloudClient({
      accessKeyId: process.env.ALICLOUD_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALICLOUD_ACCESS_KEY_SECRET,
      region: process.env.ALICLOUD_REGION || 'cn-hangzhou'
    });

    console.log('✅ Configuration appears valid');
    console.log('\nTo run the actual analysis, use:');
    console.log('   npm start');
    
  } catch (error) {
    console.error('❌ Configuration error:', error.message);
    console.log('\nPlease check your .env file configuration');
  }
}

if (require.main === module) {
  runExamples().catch(console.error);
}