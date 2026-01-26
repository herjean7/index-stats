#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const config = require('./config/default');
const AliCloudClient = require('./lib/alicloud-client');
const MongoDBAnalyzer = require('./lib/mongodb-analyzer');
const ReportGenerator = require('./lib/report-generator');

const program = new Command();

program
  .name('mongodb-index-stats')
  .description('MongoDB index statistics tool for AliCloud instances')
  .version('1.0.0')
  .option('-r, --region <region>', 'AliCloud region', process.env.ALICLOUD_REGION || 'cn-hangzhou')
  .requiredOption('-i, --instance-id <id>', 'MongoDB instance ID to analyze (required)')
  .option('-o, --output <format>', 'Output format (table|json|csv)', 'table')
  .option('--include-system-dbs', 'Include system databases in analysis', false)
  .option('--min-ops <number>', 'Minimum operations threshold for unused index detection', '10')
  .option('--unused-days <number>', 'Days threshold for considering an index unused', config.analysis.unusedDaysThreshold.toString())
  .parse();

const options = program.opts();

async function main() {
  console.log(chalk.blue.bold('🔍 MongoDB Index Stats Tool'));
  console.log(chalk.gray(`Analyzing MongoDB instance: ${options.instanceId}\n`));

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

    // Get specific MongoDB instance details directly
    spinner.text = 'Fetching MongoDB instance details...';
    
    const instanceDetails = await alicloudClient.getDBInstanceAttribute(options.instanceId);
    
    spinner.succeed(`Found MongoDB instance: ${instanceDetails.instanceId}`);
    console.log();

    console.log(chalk.cyan(`📊 Analyzing instance: ${instanceDetails.instanceId} (${instanceDetails.description})`));
    
    spinner = ora('Connecting to MongoDB nodes...').start();
    
    // Initialize MongoDB analyzer
    const mongoAnalyzer = new MongoDBAnalyzer({
      username: process.env.MONGODB_USERNAME,
      password: process.env.MONGODB_PASSWORD,
      authSource: process.env.MONGODB_AUTH_SOURCE || config.mongodb.authSource,
      connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT) || config.mongodb.connectionTimeout,
      includeSystemDbs: options.includeSystemDbs || config.analysis.includeSystemDbs,
      minOpsThreshold: parseInt(options.minOps) || config.analysis.minOpsThreshold,
      unusedDaysThreshold: parseInt(options.unusedDays) || config.analysis.unusedDaysThreshold
    });

    try {
      // Analyze the instance (all nodes)
      spinner.text = 'Analyzing index statistics across all nodes...';
      const analysisResult = await mongoAnalyzer.analyzeInstance(instanceDetails);
      
      analysisResult.instanceId = instanceDetails.instanceId;
      analysisResult.instanceDescription = instanceDetails.description;
      
      spinner.succeed(`Completed analysis for ${instanceDetails.instanceId}`);
      
      console.log();
      
      // Generate and display report
      console.log(chalk.green.bold('📋 Generating report...\n'));
      
      const reportGenerator = new ReportGenerator();
      await reportGenerator.generateReport([analysisResult], options.output);
      
      console.log(chalk.green.bold('\n✅ Analysis completed successfully!'));
      
    } catch (error) {
      spinner.fail(`Failed to analyze ${instanceDetails.instanceId}: ${error.message}`);
      console.error(chalk.red(`Error details: ${error.stack}`));
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