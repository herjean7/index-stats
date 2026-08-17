#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function setup() {
  console.log('🚀 MongoDB Index Stats Tool Setup');
  console.log('===================================\n');

  // Check if .env already exists
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const overwrite = await question('⚠️  .env file already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }

  console.log('Please provide your configuration details:\n');

  const providerRaw = await question('Provider (alicloud/atlas/self-managed) [alicloud]: ');
  const provider = (providerRaw || 'alicloud').trim().toLowerCase();

  let accessKeyId = '';
  let accessKeySecret = '';
  let region = 'cn-hangzhou';
  let atlasUri = '';
  let mongodbUri = '';
  let mongodbHosts = '';
  let mongodbTls = 'false';

  if (provider === 'alicloud') {
    accessKeyId = await question('AliCloud Access Key ID: ');
    accessKeySecret = await question('AliCloud Access Key Secret: ');
    region = await question('AliCloud Region (default: cn-hangzhou): ') || 'cn-hangzhou';
  } else if (provider === 'atlas') {
    atlasUri = await question('Atlas MongoDB URI (mongodb+srv://...): ');
  } else if (provider === 'self-managed') {
    mongodbUri = await question('Self-managed MongoDB URI (optional): ');
    if (!mongodbUri) {
      mongodbHosts = await question('Self-managed hosts (comma-separated host:port): ');
      const tlsInput = await question('Enable TLS for static host mode? (y/N): ');
      mongodbTls = tlsInput.toLowerCase() === 'y' ? 'true' : 'false';
    }
  } else {
    console.log(`Unsupported provider: ${provider}`);
    rl.close();
    return;
  }

  console.log();

  // Collect MongoDB credentials
  const mongoUsername = await question('MongoDB Username: ');
  const mongoPassword = await question('MongoDB Password: ');
  const authSource = await question('MongoDB Auth Source (default: admin): ') || 'admin';

  console.log();

  // Optional settings
  const connectionTimeout = await question('Connection Timeout in ms (default: 30000): ') || '30000';
  const analysisTimeout = await question('Analysis Timeout in ms (default: 300000): ') || '300000';

  // Create .env file
  const envContent = `# Provider Selection
CLOUD_PROVIDER=${provider}

# AliCloud Configuration
ALICLOUD_ACCESS_KEY_ID=${accessKeyId}
ALICLOUD_ACCESS_KEY_SECRET=${accessKeySecret}
ALICLOUD_REGION=${region}

# Atlas Configuration
ATLAS_CONNECTION_URI=${atlasUri}

# Self-Managed Configuration
MONGODB_CONNECTION_URI=${mongodbUri}
MONGODB_HOSTS=${mongodbHosts}
MONGODB_TLS=${mongodbTls}

# MongoDB Configuration
MONGODB_USERNAME=${mongoUsername}
MONGODB_PASSWORD=${mongoPassword}
MONGODB_AUTH_SOURCE=${authSource}

# Optional Configuration
CONNECTION_TIMEOUT=${connectionTimeout}
ANALYSIS_TIMEOUT=${analysisTimeout}
`;

  fs.writeFileSync(envPath, envContent);
  console.log('\n✅ Configuration saved to .env file');

  // Install dependencies
  console.log('\n📦 Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed successfully');
  } catch (error) {
    console.error('❌ Failed to install dependencies:', error.message);
    rl.close();
    return;
  }

  console.log('\n🎉 Setup completed successfully!');
  console.log('\nYou can now run the tool with:');
  if (provider === 'alicloud') {
    console.log('  node index.js --provider alicloud --instance-id <your-mongodb-instance-id>');
  } else if (provider === 'atlas') {
    console.log('  node index.js --provider atlas --atlas-uri "mongodb+srv://..."');
  } else {
    console.log('  node index.js --provider self-managed --connection-uri "mongodb://..."');
  }
  console.log('\nFor help and options:');
  console.log('  node index.js --help');

  rl.close();
}

setup().catch(error => {
  console.error('Setup failed:', error);
  rl.close();
  process.exit(1);
});