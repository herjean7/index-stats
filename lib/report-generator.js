const Table = require('cli-table3');
const chalk = require('chalk');
const fs = require('fs').promises;

class ReportGenerator {
  constructor() {
    this.colors = {
      primary: chalk.blue,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red,
      info: chalk.cyan,
      muted: chalk.gray
    };
  }

  /**
   * Generate comprehensive report from analysis results
   * @param {Array} allResults - Results from all analyzed instances
   * @param {string} outputFormat - Output format (table, json, csv)
   */
  async generateReport(allResults, outputFormat = 'table') {
    switch (outputFormat.toLowerCase()) {
      case 'json':
        await this._generateJSONReport(allResults);
        break;
      case 'csv':
        await this._generateCSVReport(allResults);
        break;
      case 'table':
      default:
        this._generateTableReport(allResults);
        break;
    }
  }

  /**
   * Generate console table report
   * @param {Array} allResults - Analysis results
   */
  _generateTableReport(allResults) {
    console.log(this.colors.primary.bold('📊 MongoDB Index Statistics Report'));
    console.log(this.colors.muted(`Generated at: ${new Date().toISOString()}\n`));

    allResults.forEach(result => {
      this._printInstanceSummary(result);
      this._printNodeSummary(result);
      this._printDatabaseIndexTable(result);
      this._printTTLIndexTable(result);
      this._printRecommendations(result);
      console.log('\n' + '='.repeat(80) + '\n');
    });

    this._printOverallSummary(allResults);
  }

  /**
   * Print instance summary
   * @param {Object} result - Instance analysis result
   */
  _printInstanceSummary(result) {
    console.log(this.colors.primary.bold(`🏢 Instance: ${result.instanceId}`));
    console.log(this.colors.info(`Description: ${result.description}`));
    console.log(this.colors.info(`Engine: ${result.engine} ${result.engineVersion}`));
    console.log(this.colors.muted(`Analysis Time: ${result.analysisTimestamp.toISOString()}\n`));
  }

  /**
   * Print node summary table
   * @param {Object} result - Instance analysis result
   */
  _printNodeSummary(result) {
    const nodeTable = new Table({
      head: [
        chalk.bold('Node ID'),
        chalk.bold('Type'),
        chalk.bold('Host:Port'),
        chalk.bold('Status'),
        chalk.bold('Last Restart'),
        chalk.bold('Uptime'),
        chalk.bold('Databases')
      ],
      style: { head: [], border: [] }
    });

    result.nodeResults.forEach(node => {
      if (node.success) {
        const uptime = node.serverStatus ? this._formatUptime(node.serverStatus.uptime) : 'Unknown';
        const lastRestart = node.lastRestart ? node.lastRestart.toISOString().split('T')[0] : 'Unknown';
        
        nodeTable.push([
          this.colors.success(node.nodeId),
          this._colorizeNodeType(node.type),
          `${node.host}:${node.port}`,
          this.colors.success('✓ Connected'),
          lastRestart,
          uptime,
          node.databases.length.toString()
        ]);
      } else {
        nodeTable.push([
          this.colors.error(node.endpoint.nodeId),
          this._colorizeNodeType(node.endpoint.type),
          `${node.endpoint.host}:${node.endpoint.port}`,
          this.colors.error('✗ Failed'),
          'N/A',
          'N/A',
          'N/A'
        ]);
      }
    });

    console.log(this.colors.primary.bold('🔗 Node Summary:'));
    console.log(nodeTable.toString());
    console.log();
  }

  /**
   * Print database and index statistics table
   * @param {Object} result - Instance analysis result
   */
  _printDatabaseIndexTable(result) {
    if (!result.consolidatedStats.databaseStats || 
        Object.keys(result.consolidatedStats.databaseStats).length === 0) {
      console.log(this.colors.warning('No database statistics available\n'));
      return;
    }

    console.log(this.colors.primary.bold('📋 Index Usage Statistics:'));

    Object.entries(result.consolidatedStats.databaseStats).forEach(([dbName, db]) => {
      console.log(this.colors.info.bold(`\n📁 Database: ${dbName}`));
      
      Object.entries(db.collections).forEach(([collName, coll]) => {
        console.log(this.colors.muted(`  📄 Collection: ${collName}`));
        
        const indexTable = new Table({
          head: [
            chalk.bold('Index Name'),
            chalk.bold('Keys'),
            ...Object.keys(coll.indexUsageByNode).map(nodeId => 
              chalk.bold(`${nodeId} (Ops)`)
            ),
            chalk.bold('Total Ops'),
            chalk.bold('Avg Ops/Day')
          ],
          style: { head: [], border: [] }
        });

        // Create a map of all indexes and their usage across nodes
        const indexMap = new Map();
        
        Object.entries(coll.indexUsageByNode).forEach(([nodeId, nodeData]) => {
          nodeData.indexStats.forEach(indexStat => {
            if (!indexMap.has(indexStat.name)) {
              indexMap.set(indexStat.name, {
                name: indexStat.name,
                key: indexStat.key,
                usageByNode: {}
              });
            }
            indexMap.get(indexStat.name).usageByNode[nodeId] = indexStat.accesses || { ops: 0 };
          });
        });

        // Add rows for each index
        Array.from(indexMap.values()).forEach(indexInfo => {
          const row = [
            this._colorizeIndexName(indexInfo.name),
            this._formatIndexKey(indexInfo.key)
          ];

          let totalOps = 0;
          Object.keys(coll.indexUsageByNode).forEach(nodeId => {
            const usage = indexInfo.usageByNode[nodeId] || { ops: 0 };
            const ops = usage.ops || 0;
            totalOps += ops;
            
            row.push(this._colorizeUsage(ops));
          });

          // Calculate average operations per day
          const avgOpsPerDay = this._calculateAverageOpsPerDay(indexInfo.usageByNode, coll.indexUsageByNode);
          
          row.push(this._colorizeUsage(totalOps));
          row.push(avgOpsPerDay > 0 ? avgOpsPerDay.toFixed(1) : '0');

          indexTable.push(row);
        });

        console.log(indexTable.toString());
      });
    });

    console.log();
  }

  /**
   * Print TTL indexes table
   * @param {Object} result - Instance analysis result
   */
  _printTTLIndexTable(result) {
    const ttlIndexes = this._collectTTLIndexes(result);
    
    if (ttlIndexes.length === 0) {
      console.log(this.colors.info('🕒 No TTL indexes found\n'));
      return;
    }

    console.log(this.colors.primary.bold('🕒 TTL Indexes:'));

    const ttlTable = new Table({
      head: [
        chalk.bold('Database'),
        chalk.bold('Collection'),
        chalk.bold('Index Name'),
        chalk.bold('Field'),
        chalk.bold('Expire After'),
        chalk.bold('Node'),
        chalk.bold('Warnings')
      ],
      style: { head: [], border: [] }
    });

    ttlIndexes.forEach(ttl => {
      const warnings = ttl.analysis?.warnings?.length > 0 
        ? this.colors.warning(ttl.analysis.warnings.join(', '))
        : this.colors.success('None');

      ttlTable.push([
        ttl.database,
        ttl.collection,
        this.colors.info(ttl.name),
        ttl.field,
        this.colors.warning(ttl.expireAfterDisplay),
        ttl.nodeId,
        warnings
      ]);
    });

    console.log(ttlTable.toString());
    console.log();
  }

  /**
   * Print recommendations
   * @param {Object} result - Instance analysis result
   */
  _printRecommendations(result) {
    if (!result.recommendations || result.recommendations.length === 0) {
      console.log(this.colors.success('✅ No specific recommendations\n'));
      return;
    }

    console.log(this.colors.primary.bold('💡 Recommendations:'));

    result.recommendations.forEach((rec, index) => {
      const icon = this._getRecommendationIcon(rec.severity);
      const color = this._getRecommendationColor(rec.severity);
      
      console.log(`${icon} ${color.bold(rec.message)}`);
      
      if (rec.database && rec.collection) {
        console.log(`   📍 Location: ${rec.database}.${rec.collection}`);
      }
      
      if (rec.indexes && rec.indexes.length > 0) {
        console.log(`   📋 Indexes: ${rec.indexes.join(', ')}`);
      }
      
      if (rec.action) {
        console.log(`   🔧 Action: ${rec.action}`);
      }
      
      if (index < result.recommendations.length - 1) {
        console.log();
      }
    });

    console.log();
  }

  /**
   * Print overall summary across all instances
   * @param {Array} allResults - All analysis results
   */
  _printOverallSummary(allResults) {
    console.log(this.colors.primary.bold('📈 Overall Summary'));

    const summaryTable = new Table({
      head: [
        chalk.bold('Metric'),
        chalk.bold('Value')
      ],
      style: { head: [], border: [] }
    });

    const totalInstances = allResults.length;
    const successfulInstances = allResults.filter(r => r.nodeResults.some(n => n.success)).length;
    const totalNodes = allResults.reduce((sum, r) => sum + r.nodeResults.length, 0);
    const successfulNodes = allResults.reduce((sum, r) => 
      sum + r.nodeResults.filter(n => n.success).length, 0);
    
    let totalDatabases = 0;
    let totalCollections = 0;
    let totalIndexes = 0;
    let totalTTLIndexes = 0;
    let totalRecommendations = 0;

    allResults.forEach(result => {
      if (result.consolidatedStats.databaseStats) {
        totalDatabases += Object.keys(result.consolidatedStats.databaseStats).length;
        
        Object.values(result.consolidatedStats.databaseStats).forEach(db => {
          totalCollections += Object.keys(db.collections).length;
          
          Object.values(db.collections).forEach(coll => {
            totalIndexes += coll.allIndexes.length;
          });
        });
      }
      
      totalTTLIndexes += this._collectTTLIndexes(result).length;
      totalRecommendations += (result.recommendations || []).length;
    });

    summaryTable.push(
      ['Total Instances', this.colors.info(totalInstances.toString())],
      ['Successful Instances', this.colors.success(successfulInstances.toString())],
      ['Total Nodes', this.colors.info(totalNodes.toString())],
      ['Successful Node Connections', this.colors.success(successfulNodes.toString())],
      ['Total Databases Analyzed', this.colors.info(totalDatabases.toString())],
      ['Total Collections Analyzed', this.colors.info(totalCollections.toString())],
      ['Total Indexes Found', this.colors.info(totalIndexes.toString())],
      ['Total TTL Indexes', this.colors.warning(totalTTLIndexes.toString())],
      ['Total Recommendations', this.colors.warning(totalRecommendations.toString())]
    );

    console.log(summaryTable.toString());
  }

  /**
   * Generate JSON report and save to file
   * @param {Array} allResults - Analysis results
   */
  async _generateJSONReport(allResults) {
    const reportData = {
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
      results: allResults
    };

    const filename = `mongodb-index-report-${new Date().toISOString().slice(0, 10)}.json`;
    
    try {
      await fs.writeFile(filename, JSON.stringify(reportData, null, 2));
      console.log(this.colors.success(`✅ JSON report saved to: ${filename}`));
    } catch (error) {
      console.error(this.colors.error(`❌ Failed to save JSON report: ${error.message}`));
    }
  }

  /**
   * Generate CSV report and save to file
   * @param {Array} allResults - Analysis results
   */
  async _generateCSVReport(allResults) {
    const csvData = [];
    
    // CSV Headers
    csvData.push([
      'Instance ID',
      'Node ID',
      'Node Type',
      'Host',
      'Port',
      'Database',
      'Collection',
      'Index Name',
      'Index Keys',
      'Operations',
      'Operations Per Day',
      'Is TTL',
      'TTL Expire After',
      'Last Restart',
      'Recommendations'
    ]);

    allResults.forEach(result => {
      result.nodeResults.forEach(node => {
        if (node.success) {
          node.databases.forEach(database => {
            database.collections.forEach(collection => {
              collection.indexStats.forEach(indexStat => {
                const isTTL = collection.ttlIndexes.some(ttl => ttl.name === indexStat.name);
                const ttlInfo = isTTL ? 
                  collection.ttlIndexes.find(ttl => ttl.name === indexStat.name) : null;

                csvData.push([
                  result.instanceId,
                  node.nodeId,
                  node.type,
                  node.host,
                  node.port,
                  database.name,
                  collection.name,
                  indexStat.name,
                  JSON.stringify(indexStat.key),
                  indexStat.accesses?.ops || 0,
                  indexStat.opsPerDay || 0,
                  isTTL ? 'Yes' : 'No',
                  ttlInfo ? ttlInfo.expireAfterDisplay : '',
                  node.lastRestart ? node.lastRestart.toISOString() : '',
                  collection.recommendations.map(r => r.type).join('; ')
                ]);
              });
            });
          });
        }
      });
    });

    // Convert to CSV string
    const csvString = csvData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    const filename = `mongodb-index-report-${new Date().toISOString().slice(0, 10)}.csv`;
    
    try {
      await fs.writeFile(filename, csvString);
      console.log(this.colors.success(`✅ CSV report saved to: ${filename}`));
    } catch (error) {
      console.error(this.colors.error(`❌ Failed to save CSV report: ${error.message}`));
    }
  }

  /**
   * Helper methods
   */

  _colorizeNodeType(type) {
    switch (type) {
      case 'primary': return this.colors.success(type);
      case 'secondary': return this.colors.info(type);
      case 'mongos': return this.colors.warning(type);
      case 'shard': return this.colors.primary(type);
      default: return this.colors.muted(type);
    }
  }

  _colorizeIndexName(name) {
    if (name === '_id_') {
      return this.colors.muted(name);
    }
    return name;
  }

  _formatIndexKey(key) {
    if (!key) return 'N/A';
    return Object.entries(key)
      .map(([field, direction]) => `${field}: ${direction}`)
      .join(', ');
  }

  _colorizeUsage(ops) {
    if (ops === 0) {
      return this.colors.error(ops.toString());
    } else if (ops < 10) {
      return this.colors.warning(ops.toString());
    } else {
      return this.colors.success(ops.toString());
    }
  }

  _formatUptime(uptimeSeconds) {
    if (!uptimeSeconds) return 'Unknown';
    
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  _collectTTLIndexes(result) {
    const ttlIndexes = [];
    
    result.nodeResults.forEach(node => {
      if (node.success) {
        node.databases.forEach(database => {
          database.collections.forEach(collection => {
            collection.ttlIndexes.forEach(ttlIndex => {
              ttlIndexes.push({
                ...ttlIndex,
                database: database.name,
                collection: collection.name,
                nodeId: node.nodeId
              });
            });
          });
        });
      }
    });
    
    return ttlIndexes;
  }

  _calculateAverageOpsPerDay(indexUsageByNode, allNodeData) {
    let totalOps = 0;
    let totalDays = 0;

    Object.entries(indexUsageByNode).forEach(([nodeId, usage]) => {
      const nodeData = allNodeData[nodeId];
      if (nodeData && nodeData.lastRestart && usage.ops) {
        const daysSinceRestart = (Date.now() - nodeData.lastRestart.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceRestart > 0) {
          totalOps += usage.ops;
          totalDays += daysSinceRestart;
        }
      }
    });

    return totalDays > 0 ? totalOps / totalDays : 0;
  }

  _getRecommendationIcon(severity) {
    switch (severity) {
      case 'high': return '🚨';
      case 'medium': return '⚠️';
      case 'low': return '💡';
      default: return 'ℹ️';
    }
  }

  _getRecommendationColor(severity) {
    switch (severity) {
      case 'high': return this.colors.error;
      case 'medium': return this.colors.warning;
      case 'low': return this.colors.info;
      default: return this.colors.muted;
    }
  }
}

module.exports = ReportGenerator;