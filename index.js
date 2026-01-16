#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const AliCloudClient = require('./lib/alicloud-client');
const MongoDBAnalyzer = require('./lib/mongodb-analyzer');
const ReportGenerator = require('./lib/report-generator');

const program = new Command();

program
  .name('mongodb-index-stats')
  .description('MongoDB index statistics tool for AliCloud instances')
  .version('1.0.0')
  .option('-r, --region <region>', 'AliCloud region', process.env.ALICLOUD_REGION || 'cn-hangzhou')
  .option('-i, --instance-id <id>', 'Specific MongoDB instance ID to analyze')
  .option('-o, --output <format>', 'Output format (table|json|csv)', 'table')
  .option('--include-system-dbs', 'Include system databases in analysis', false)
  .option('--min-ops <number>', 'Minimum operations threshold for unused index detection', '10')
  .parse();

const options = program.opts();

async function main() {
  console.log(chalk.blue.bold('🔍 MongoDB Index Stats Tool'));
  console.log(chalk.gray('Analyzing MongoDB instances across all cluster nodes...\n'));

  // Validate environment variables
  const requiredEnvVars = ['ALICLOUD_ACCESS_KEY_ID', 'ALICLOUD_ACCESS_KEY_SECRET'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error(chalk.red('❌ Missing required environment variables:'));
    missingVars.forEach(varName => console.error(chalk.red(`   - ${varName}`)));
    console.error(chalk.yellow('Please configure your .env file. See .env.example for reference.'));
    process.exit(1);
  }

  let spinner = ora('Initializing AliCloud client...').start();

  try {
    // Initialize AliCloud client
    const alicloudClient = new AliCloudClient({
      accessKeyId: process.env.ALICLOUD_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALICLOUD_ACCESS_KEY_SECRET,
      region: options.region
    });

    // Get MongoDB instances
    spinner.text = 'Fetching MongoDB instances...';
    const instances = await alicloudClient.getDBInstances(options.instanceId);
    
    if (instances.length === 0) {
      spinner.fail('No MongoDB instances found');
      return;
    }

    spinner.succeed(`Found ${instances.length} MongoDB instance(s)`);
    console.log();

    // Analyze each instance
    const allResults = [];
    
    //HARDCODE
    let i = 0;
    for (const instance of instances) {
      if (i > 1) { break; };
      console.log(chalk.cyan(`📊 Analyzing instance: ${instance.DBInstanceId} (${instance.DBInstanceDescription})`));
      
      spinner = ora('Getting instance connection details...').start();
      
      // Get detailed instance information
      //HARDCODE FOR TESTING
      const instanceDetails = await alicloudClient.getDBInstanceAttribute("dds-gs532f7312d8b254");

      spinner.text = 'Connecting to MongoDB nodes...';
      
      // Initialize MongoDB analyzer
      const mongoAnalyzer = new MongoDBAnalyzer({
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD,
        authSource: process.env.MONGODB_AUTH_SOURCE || 'admin',
        connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT) || 30000,
        includeSystemDbs: options.includeSystemDbs,
        minOpsThreshold: parseInt(options.minOps)
      });

      try {
        // Analyze the instance (all nodes)
        spinner.text = 'Analyzing index statistics across all nodes...';
        const analysisResult = await mongoAnalyzer.analyzeInstance(instanceDetails);
        
        analysisResult.instanceId = instance.DBInstanceId;
        analysisResult.instanceDescription = instance.DBInstanceDescription;
        allResults.push(analysisResult);
        
        spinner.succeed(`Completed analysis for ${instance.DBInstanceId}`);
        
      } catch (error) {
        spinner.fail(`Failed to analyze ${instance.DBInstanceId}: ${error.message}`);
        console.error(chalk.red(`Error details: ${error.stack}`));
      }
      
      console.log();

      i++;
    }

    // Generate and display report
    if (allResults.length > 0) {
      console.log(chalk.green.bold('📋 Generating consolidated report...\n'));
      
      const reportGenerator = new ReportGenerator();
      await reportGenerator.generateReport(allResults, options.output);
      
      console.log(chalk.green.bold('\n✅ Analysis completed successfully!'));
    } else {
      console.log(chalk.yellow('⚠️  No successful analyses to report'));
    }

  } catch (error) {
    spinner.fail(`Analysis failed: ${error.message}`);
    console.error(chalk.red(`Error details: ${error.stack}`));
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Received interrupt signal. Shutting down gracefully...'));
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:', promise, 'reason:', reason));
  process.exit(1);
});

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

module.exports = { main };