const { MongoClient } = require('mongodb');
const IndexStatsCollector = require('./index-stats-collector');
const TTLDetector = require('./ttl-detector');

class MongoDBAnalyzer {
  constructor(config) {
    this.username = config.username;
    this.password = config.password;
    this.authSource = config.authSource || 'admin';
    this.connectionTimeout = config.connectionTimeout || 30000;
    this.includeSystemDbs = config.includeSystemDbs || false;
    this.minOpsThreshold = config.minOpsThreshold || 10;
    
    this.indexStatsCollector = new IndexStatsCollector();
    this.ttlDetector = new TTLDetector();
  }

  /**
   * Analyze a MongoDB instance across all its nodes
   * @param {Object} instanceDetails - Instance details from AliCloud
   * @returns {Promise<Object>} Comprehensive analysis results
   */
  async analyzeInstance(instanceDetails) {
    const results = {
      instanceId: instanceDetails.instanceId,
      description: instanceDetails.description,
      engine: instanceDetails.engine,
      engineVersion: instanceDetails.engineVersion,
      analysisTimestamp: new Date(),
      nodeResults: [],
      consolidatedStats: {},
      recommendations: []
    };

    // Analyze each connection endpoint (node)
    for (const endpoint of instanceDetails.connectionEndpoints) {
      try {
        const nodeResult = await this.analyzeNode(endpoint);
        console.log(`results: ` + JSON.stringify(nodeResult));
        nodeResult.endpoint = endpoint;
        results.nodeResults.push(nodeResult);
      } catch (error) {
        console.warn(`Failed to analyze node ${endpoint.nodeId}: ${error.message}`);
        results.nodeResults.push({
          endpoint: endpoint,
          error: error.message,
          success: false
        });
      }
    }

    // Consolidate statistics across all nodes
    results.consolidatedStats = this._consolidateStats(results.nodeResults);
    
    // Generate recommendations
    results.recommendations = this._generateRecommendations(results.consolidatedStats);

    return results;
  }

  /**
   * Analyze a single MongoDB node
   * @param {Object} endpoint - Connection endpoint details
   * @returns {Promise<Object>} Node analysis results
   */
  async analyzeNode(endpoint) {
    const connectionString = this._getConnectionString(endpoint);
    const client = new MongoClient(connectionString, {
      connectTimeoutMS: this.connectionTimeout,
      serverSelectionTimeoutMS: this.connectionTimeout,
      directConnection: true
    });

    try {
      await client.connect();
      
      const nodeResult = {
        nodeId: endpoint.nodeId,
        type: endpoint.type,
        host: endpoint.host,
        port: endpoint.port,
        success: true,
        databases: [],
        serverStatus: null,
        lastRestart: null
      };

      // Get server status for restart time and other metadata
      try {
        const admin = client.db('admin');
        const serverStatus = await admin.command({ serverStatus: 1 });
        nodeResult.serverStatus = {
          version: serverStatus.version,
          uptime: serverStatus.uptime,
          uptimeMillis: serverStatus.uptimeMillis,
          localTime: serverStatus.localTime,
          host: serverStatus.host,
          process: serverStatus.process
        };

        // Calculate last restart time
        const uptimeMs = serverStatus.uptimeMillis || (serverStatus.uptime * 1000);
        nodeResult.lastRestart = new Date(Date.now() - uptimeMs);

      } catch (error) {
        console.warn(`Could not get server status for ${endpoint.nodeId}: ${error.message}`);
      }

      // Get list of databases
      const adminDb = client.db('admin');
      const dbList = await adminDb.admin().listDatabases();
      
      // Filter databases based on configuration
      const databasesToAnalyze = dbList.databases.filter(db => {
        if (!this.includeSystemDbs && this._isSystemDatabase(db.name)) {
          return false;
        }
        return true;
      });

      // Analyze each database
      for (const dbInfo of databasesToAnalyze) {
        try {
          const databaseResult = await this._analyzeDatabase(client, dbInfo.name);
          nodeResult.databases.push(databaseResult);
        } catch (error) {
          console.warn(`Failed to analyze database ${dbInfo.name} on ${endpoint.nodeId}: ${error.message}`);
        }
      }

      return nodeResult;

    } finally {
      await client.close();
    }
  }

  /**
   * Analyze a single database
   * @param {MongoClient} client - MongoDB client
   * @param {string} dbName - Database name
   * @returns {Promise<Object>} Database analysis results
   */
  async _analyzeDatabase(client, dbName) {
    const db = client.db(dbName);
    
    const databaseResult = {
      name: dbName,
      collections: []
    };

    // Get collections in the database
    const collections = await db.listCollections().toArray();
    
    for (const collectionInfo of collections) {
      if (collectionInfo.type === 'collection') {
        try {
          const collectionResult = await this._analyzeCollection(db, collectionInfo.name);
          databaseResult.collections.push(collectionResult);
        } catch (error) {
          console.warn(`Failed to analyze collection ${collectionInfo.name}: ${error.message}`);
        }
      }
    }

    return databaseResult;
  }

  /**
   * Analyze a single collection
   * @param {Db} db - MongoDB database object
   * @param {string} collectionName - Collection name
   * @returns {Promise<Object>} Collection analysis results
   */
  async _analyzeCollection(db, collectionName) {
    const collection = db.collection(collectionName);
    
    const collectionResult = {
      name: collectionName,
      indexStats: [],
      ttlIndexes: [],
      recommendations: []
    };

    try {
      // Get index statistics
      const indexStats = await this.indexStatsCollector.getIndexStats(collection);
      collectionResult.indexStats = indexStats;

      // Detect TTL indexes
      const ttlIndexes = await this.ttlDetector.detectTTLIndexes(collection);
      collectionResult.ttlIndexes = ttlIndexes;

      // Generate collection-level recommendations
      collectionResult.recommendations = this._generateCollectionRecommendations(
        indexStats,
        ttlIndexes
      );

    } catch (error) {
      console.warn(`Error analyzing collection ${collectionName}: ${error.message}`);
      collectionResult.error = error.message;
    }

    return collectionResult;
  }

  /**
   * Consolidate statistics across all nodes
   * @param {Array} nodeResults - Results from all analyzed nodes
   * @returns {Object} Consolidated statistics
   */
  _consolidateStats(nodeResults) {
    const consolidated = {
      totalNodes: nodeResults.length,
      successfulNodes: nodeResults.filter(r => r.success).length,
      databaseStats: {},
      indexUsageComparison: {},
      ttlIndexSummary: {}
    };

    const successfulNodes = nodeResults.filter(r => r.success);
    
    for (const nodeResult of successfulNodes) {
      for (const database of nodeResult.databases) {
        if (!consolidated.databaseStats[database.name]) {
          consolidated.databaseStats[database.name] = {
            collections: {}
          };
        }

        for (const collection of database.collections) {
          const dbName = database.name;
          const collName = collection.name;
          
          if (!consolidated.databaseStats[dbName].collections[collName]) {
            consolidated.databaseStats[dbName].collections[collName] = {
              indexUsageByNode: {},
              ttlIndexes: collection.ttlIndexes,
              allIndexes: new Set()
            };
          }

          const collStats = consolidated.databaseStats[dbName].collections[collName];
          
          // Store index usage for this node
          collStats.indexUsageByNode[nodeResult.nodeId] = {
            nodeType: nodeResult.type,
            indexStats: collection.indexStats,
            lastRestart: nodeResult.lastRestart
          };

          // Track all unique indexes
          collection.indexStats.forEach(stat => {
            collStats.allIndexes.add(stat.name);
          });
        }
      }
    }

    // Convert Sets to Arrays for JSON serialization
    Object.values(consolidated.databaseStats).forEach(db => {
      Object.values(db.collections).forEach(coll => {
        coll.allIndexes = Array.from(coll.allIndexes);
      });
    });

    return consolidated;
  }

  /**
   * Generate recommendations based on analysis
   * @param {Object} consolidatedStats - Consolidated statistics
   * @returns {Array} Array of recommendations
   */
  _generateRecommendations(consolidatedStats) {
    const recommendations = [];

    Object.entries(consolidatedStats.databaseStats).forEach(([dbName, db]) => {
      Object.entries(db.collections).forEach(([collName, coll]) => {
        // Check for unused indexes
        const unusedIndexes = this._findUnusedIndexes(coll.indexUsageByNode);
        if (unusedIndexes.length > 0) {
          recommendations.push({
            type: 'unused_indexes',
            severity: 'medium',
            database: dbName,
            collection: collName,
            message: `Found ${unusedIndexes.length} potentially unused indexes`,
            indexes: unusedIndexes,
            action: 'Consider dropping these indexes if they are not needed for queries'
          });
        }

        // Check for inconsistent usage across nodes
        const inconsistentIndexes = this._findInconsistentIndexUsage(coll.indexUsageByNode);
        if (inconsistentIndexes.length > 0) {
          recommendations.push({
            type: 'inconsistent_usage',
            severity: 'info',
            database: dbName,
            collection: collName,
            message: `Found indexes with significantly different usage patterns across nodes`,
            indexes: inconsistentIndexes,
            action: 'Review read preferences and query distribution'
          });
        }
      });
    });

    return recommendations;
  }

  /**
   * Generate collection-level recommendations
   * @param {Array} indexStats - Index statistics
   * @param {Array} ttlIndexes - TTL indexes
   * @returns {Array} Recommendations
   */
  _generateCollectionRecommendations(indexStats, ttlIndexes) {
    const recommendations = [];

    // Check for unused indexes
    const unusedIndexes = indexStats.filter(stat => 
      stat.accesses?.ops < this.minOpsThreshold
    );

    if (unusedIndexes.length > 0) {
      recommendations.push({
        type: 'unused_indexes',
        count: unusedIndexes.length,
        indexes: unusedIndexes.map(idx => idx.name)
      });
    }

    // Note TTL indexes (important for preventing accidental deletion)
    if (ttlIndexes.length > 0) {
      recommendations.push({
        type: 'ttl_indexes_present',
        count: ttlIndexes.length,
        message: 'TTL indexes detected - do not delete these as they handle automatic document expiration',
        indexes: ttlIndexes.map(idx => ({
          name: idx.name,
          expireAfterSeconds: idx.expireAfterSeconds,
          field: idx.field
        }))
      });
    }

    return recommendations;
  }

  /**
   * Find unused indexes across nodes
   * @param {Object} indexUsageByNode - Index usage data by node
   * @returns {Array} Unused index names
   */
  _findUnusedIndexes(indexUsageByNode) {
    const unusedIndexes = [];
    const allNodes = Object.keys(indexUsageByNode);
    
    if (allNodes.length === 0) return unusedIndexes;

    // Get all unique index names
    const allIndexNames = new Set();
    Object.values(indexUsageByNode).forEach(nodeData => {
      nodeData.indexStats.forEach(stat => {
        allIndexNames.add(stat.name);
      });
    });

    // Check each index across all nodes
    allIndexNames.forEach(indexName => {
      let totalOps = 0;
      let nodeCount = 0;

      Object.values(indexUsageByNode).forEach(nodeData => {
        const indexStat = nodeData.indexStats.find(stat => stat.name === indexName);
        if (indexStat && indexStat.accesses) {
          totalOps += indexStat.accesses.ops || 0;
          nodeCount++;
        }
      });

      // Consider unused if total operations across all nodes is below threshold
      if (totalOps < this.minOpsThreshold && indexName !== '_id_') {
        unusedIndexes.push(indexName);
      }
    });

    return unusedIndexes;
  }

  /**
   * Find indexes with inconsistent usage patterns across nodes
   * @param {Object} indexUsageByNode - Index usage data by node
   * @returns {Array} Inconsistent index names
   */
  _findInconsistentIndexUsage(indexUsageByNode) {
    const inconsistentIndexes = [];
    const nodes = Object.keys(indexUsageByNode);
    
    if (nodes.length < 2) return inconsistentIndexes;

    // Get all unique index names
    const allIndexNames = new Set();
    Object.values(indexUsageByNode).forEach(nodeData => {
      nodeData.indexStats.forEach(stat => {
        allIndexNames.add(stat.name);
      });
    });

    allIndexNames.forEach(indexName => {
      const usageByNode = [];
      
      nodes.forEach(nodeId => {
        const nodeData = indexUsageByNode[nodeId];
        const indexStat = nodeData.indexStats.find(stat => stat.name === indexName);
        if (indexStat && indexStat.accesses) {
          usageByNode.push({
            nodeId,
            nodeType: nodeData.nodeType,
            ops: indexStat.accesses.ops || 0
          });
        }
      });

      if (usageByNode.length >= 2) {
        const maxOps = Math.max(...usageByNode.map(u => u.ops));
        const minOps = Math.min(...usageByNode.map(u => u.ops));
        
        // Consider inconsistent if there's a significant difference (>10x)
        if (maxOps > 0 && (maxOps / Math.max(minOps, 1)) > 10) {
          inconsistentIndexes.push({
            name: indexName,
            usage: usageByNode
          });
        }
      }
    });

    return inconsistentIndexes;
  }

  /**
   * Check if a database is a system database
   * @param {string} dbName - Database name
   * @returns {boolean} True if system database
   */
  _isSystemDatabase(dbName) {
    const systemDbs = ['admin', 'local', 'config'];
    return systemDbs.includes(dbName);
  }

  /**
   * Get MongoDB connection string for an endpoint
   * @param {Object} endpoint - Connection endpoint
   * @returns {string} Connection string
   */
  _getConnectionString(endpoint) {
    const encodedUsername = encodeURIComponent(this.username);
    const encodedPassword = encodeURIComponent(this.password);
    

    //HARDCODE FOR TESTING
    return `mongodb://${encodedUsername}:${encodedPassword}@dds-gs532f7312d8b2541686-pub.mongodb.singapore.rds.aliyuncs.com:3717/${this.authSource}?directConnection=true&authSource=${this.authSource}`;
    //return `mongodb://${encodedUsername}:${encodedPassword}@${endpoint.host}:${endpoint.port}/${this.authSource}?directConnection=true&authSource=${this.authSource}`;
  }
}

module.exports = MongoDBAnalyzer;