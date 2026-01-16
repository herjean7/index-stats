# MongoDB Index Stats Tool - Complete Guide

## Overview

This tool addresses the critical issue of MongoDB index analysis in clustered environments. When running `$indexStats` on a MongoDB SRV connection string, you typically only get results from the primary node. However, with different read preferences (secondary/secondaryPreferred), your application might be using indexes differently across nodes.

## Key Features

### 🎯 Solves Core Problems
- **Multi-Node Analysis**: Connects directly to each MongoDB node (primary, secondary, shards)
- **TTL Index Detection**: Identifies TTL indexes that don't show usage in `$indexStats`
- **Restart Tracking**: Shows when each node was last restarted (important because `$indexStats` resets on restart)
- **Cross-Node Comparison**: Highlights usage differences between nodes

### 📊 Comprehensive Reporting
- **Unused Index Detection**: Finds indexes with low or no usage
- **Redundant Index Analysis**: Identifies potentially duplicate indexes
- **TTL Index Monitoring**: Special handling for TTL indexes
- **Multiple Output Formats**: Table, JSON, CSV

## Installation & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
npm run setup
```

Or manually create a `.env` file:
```env
ALICLOUD_ACCESS_KEY_ID=your_access_key_id
ALICLOUD_ACCESS_KEY_SECRET=your_access_key_secret
ALICLOUD_REGION=cn-hangzhou
MONGODB_USERNAME=your_mongodb_username
MONGODB_PASSWORD=your_mongodb_password
```

## Usage Examples

### Basic Analysis
```bash
# Analyze all MongoDB instances in the region
npm start

# Or with node directly
node index.js
```

### Advanced Options
```bash
# Analyze specific instance
node index.js --instance-id dds-xxxxxxxxx

# Different output formats
node index.js --output json
node index.js --output csv

# Include system databases
node index.js --include-system-dbs

# Custom unused index threshold (default: 10 operations)
node index.js --min-ops 100

# Specific region
node index.js --region cn-shanghai

# Combined options
node index.js --region cn-hangzhou --output json --min-ops 50 --include-system-dbs
```

## Understanding the Output

### 1. Instance Summary
Shows basic information about each MongoDB instance found:
- Instance ID and description
- Engine version
- Analysis timestamp

### 2. Node Summary Table
For each instance, displays:
- **Node ID**: Unique identifier for the node
- **Type**: primary, secondary, mongos, or shard
- **Host:Port**: Connection endpoint
- **Status**: Connection success/failure
- **Last Restart**: When the MongoDB process was last started
- **Uptime**: How long the process has been running
- **Databases**: Number of databases found

### 3. Index Usage Statistics
Detailed breakdown by database and collection:
- **Index Name**: Name of the index
- **Keys**: Index key specification
- **Node Usage**: Operations count for each node
- **Total Ops**: Sum across all nodes
- **Avg Ops/Day**: Average daily operations (calculated from restart time)

### 4. TTL Indexes
Special section for TTL (Time To Live) indexes:
- **Field**: Which field the TTL applies to
- **Expire After**: Human-readable expiration time
- **Warnings**: Potential issues (very short/long TTL, etc.)

### 5. Recommendations
Actionable insights including:
- **Unused Indexes**: Indexes with minimal usage
- **Inconsistent Usage**: Indexes used very differently across nodes
- **TTL Considerations**: TTL-specific recommendations

## Key Insights & Interpretations

### 🔍 Index Usage Patterns

**Primary vs Secondary Differences**:
- If an index shows high usage on secondary but low on primary, your application likely uses `readPreference: secondary`
- Significant differences might indicate unbalanced read distribution

**Zero Usage Indexes**:
- `_id_` indexes always show 0 usage (this is normal)
- Other indexes with 0 usage are candidates for removal
- Consider the restart time - recent restarts reset counters

### ⏰ TTL Index Behavior

**Important Notes**:
- TTL indexes perform automatic deletions that don't appear in `$indexStats`
- Usage statistics only show query operations, not TTL cleanup operations
- TTL cleanup runs approximately every 60 seconds

**Recommendations**:
- Monitor TTL indexes through database logs, not usage statistics
- Consider compound indexes if you query by TTL field + other fields
- Be aware that very short TTL values might cause performance issues

### 🚨 Restart Impact

**Why This Matters**:
- `$indexStats` counters reset to 0 when MongoDB restarts
- A node restarted yesterday will show much lower usage than one running for weeks
- Compare usage relative to uptime, not absolute numbers

## Troubleshooting

### Common Issues

**1. Connection Failures**
```
❌ Failed to analyze node-xxx: Connection refused
```
- Check if the MongoDB instance is running
- Verify network connectivity to the specific node
- Ensure credentials are correct

**2. Authentication Errors**
```
❌ Authentication failed
```
- Verify username and password in `.env`
- Check if user has required permissions on all databases
- Ensure `authSource` is correct (usually `admin`)

**3. No Instances Found**
```
❌ No MongoDB instances found
```
- Check if your AliCloud credentials have the right permissions
- Verify the region setting
- Ensure you have MongoDB instances in the specified region

**4. Timeout Issues**
```
❌ Analysis timed out
```
- Large collections may take time to analyze
- Increase timeout values in `.env`:
  ```env
  CONNECTION_TIMEOUT=60000
  ANALYSIS_TIMEOUT=600000
  ```

### Required Permissions

**AliCloud IAM Permissions**:
- `dds:DescribeDBInstances`
- `dds:DescribeDBInstanceAttribute`

**MongoDB User Permissions**:
```javascript
// Minimum required roles
db.grantRolesToUser("your_user", [
  { role: "readAnyDatabase", db: "admin" },
  { role: "clusterMonitor", db: "admin" }
])
```

## Advanced Configuration

### Environment Variables
```env
# Required
ALICLOUD_ACCESS_KEY_ID=xxx
ALICLOUD_ACCESS_KEY_SECRET=xxx
ALICLOUD_REGION=cn-hangzhou
MONGODB_USERNAME=xxx
MONGODB_PASSWORD=xxx

# Optional
MONGODB_AUTH_SOURCE=admin
CONNECTION_TIMEOUT=30000      # Connection timeout in ms
ANALYSIS_TIMEOUT=300000       # Total analysis timeout in ms
```

### Programmatic Usage

```javascript
const { main } = require('./index');
const AliCloudClient = require('./lib/alicloud-client');
const MongoDBAnalyzer = require('./lib/mongodb-analyzer');

// Custom usage
async function customAnalysis() {
  const client = new AliCloudClient({
    accessKeyId: 'xxx',
    accessKeySecret: 'xxx',
    region: 'cn-hangzhou'
  });

  const instances = await client.getDBInstances();
  // ... custom analysis logic
}
```

## Best Practices

### 1. Regular Monitoring
- Run analysis weekly to track index usage trends
- Compare results over time to identify patterns
- Monitor after application changes

### 2. Index Optimization
- Remove indexes with consistently zero usage (except `_id_`)
- Consider consolidating similar indexes
- Review compound index order based on usage patterns

### 3. Cross-Node Analysis
- Pay attention to usage differences between primary and secondary
- Ensure your read preferences align with index usage patterns
- Consider separate indexes for different read patterns if needed

### 4. TTL Index Management
- Monitor TTL index effectiveness through application metrics
- Use database profiling to track TTL delete operations
- Consider the impact of TTL operations on overall performance

## Output Files

### JSON Format
```bash
node index.js --output json
# Creates: mongodb-index-report-YYYY-MM-DD.json
```

### CSV Format
```bash
node index.js --output csv
# Creates: mongodb-index-report-YYYY-MM-DD.csv
```

Both formats include all collected data and can be used for:
- Historical trend analysis
- Integration with monitoring systems
- Custom reporting and visualization

## Support

### Getting Help
```bash
# Show all available options
node index.js --help

# Run configuration examples
npm run examples

# Test configuration
node setup.js
```

### Common Commands
```bash
# Quick start
npm run setup && npm start

# Analyze specific instance with detailed output
node index.js --instance-id dds-xxx --output json --include-system-dbs

# Focus on unused indexes
node index.js --min-ops 1 --output table
```