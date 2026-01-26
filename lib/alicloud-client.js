const crypto = require('crypto');

class AliCloudClient {
  constructor(config) {
    this.accessKeyId = config.accessKeyId;
    this.accessKeySecret = config.accessKeySecret;
    this.region = config.region;
    
    if (!this.accessKeyId || !this.accessKeySecret) {
      throw new Error('ALICLOUD_ACCESS_KEY_ID and ALICLOUD_ACCESS_KEY_SECRET are required');
    }
  }

  /**
   * Create Aliyun API signature
   * @param {string} method - HTTP method
   * @param {string} uri - URI path
   * @param {Object} params - Query parameters
   * @returns {string} Signature
   */
  createAliyunSignature(method, uri, params) {
    const sortedKeys = Object.keys(params).sort();
    const canonicalQueryString = sortedKeys.map(key => {
      return `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
    }).join('&');

    const stringToSign = `${method}&${encodeURIComponent(uri)}&${encodeURIComponent(canonicalQueryString)}`;
    const signature = crypto.createHmac('sha1', `${this.accessKeySecret}&`)
      .update(stringToSign, 'utf8')
      .digest('base64');

    return signature;
  }

  /**
   * Get detailed attributes for a specific MongoDB instance
   * @param {string} instanceId - MongoDB instance ID
   * @returns {Promise<Object>} Instance details with connection information
   */
  async getDBInstanceAttribute(instanceId) {
    const endpoint = 'https://mongodb.aliyuncs.com';
    const action = 'DescribeDBInstanceAttribute';
    const version = '2015-12-01';
    
    const params = {
      Action: action,
      Version: version,
      AccessKeyId: this.accessKeyId,
      Format: 'JSON',
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      SignatureVersion: '1.0',
      SignatureNonce: Math.random().toString(36).substring(2, 15),
      RegionId: this.region,
      DBInstanceId: instanceId
    };

    const signature = this.createAliyunSignature('GET', '/', params);
    params.Signature = signature;

    try {
      const queryString = Object.keys(params).sort().map(key => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
      }).join('&');

      const response = await fetch(`${endpoint}/?${queryString}`, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const instanceInfo = data.DBInstances?.DBInstance?.[0];
      
      if (!instanceInfo) {
        throw new Error(`Instance ${instanceId} not found`);
      }

      // Extract connection endpoints for all nodes
      const connectionEndpoints = this._extractConnectionEndpoints(instanceInfo);
      
      return {
        instanceId: instanceInfo.DBInstanceId,
        description: instanceInfo.DBInstanceDescription,
        engine: instanceInfo.Engine,
        engineVersion: instanceInfo.EngineVersion,
        dbInstanceClass: instanceInfo.DBInstanceClass,
        dbInstanceStorage: instanceInfo.DBInstanceStorage,
        replicationFactor: instanceInfo.ReplicationFactor,
        networkType: instanceInfo.NetworkType,
        connectionEndpoints: connectionEndpoints,
        creationTime: instanceInfo.CreationTime,
        expireTime: instanceInfo.ExpireTime,
        region: instanceInfo.RegionId,
        zone: instanceInfo.ZoneId
      };

      
    } catch (error) {
      throw new Error(`Failed to get instance attributes for ${instanceId}: ${error.message}`);
    }
  }

  /**
   * Extract connection endpoints for all MongoDB nodes
   * @param {Object} instanceInfo - Instance information from AliCloud
   * @returns {Array} Array of connection endpoints
   */
  _extractConnectionEndpoints(instanceInfo) {
    const endpoints = [];

    // Primary connection endpoint
    if (instanceInfo.ConnectionDomain && instanceInfo.Port) {
      endpoints.push({
        type: 'primary',
        host: instanceInfo.ConnectionDomain,
        port: instanceInfo.Port,
        nodeId: 'primary',
        description: 'Primary node connection'
      });
    }

    // Replica set member endpoints
    if (instanceInfo.ReplicaSets && instanceInfo.ReplicaSets.ReplicaSet && Array.isArray(instanceInfo.ReplicaSets.ReplicaSet)) {
      instanceInfo.ReplicaSets.ReplicaSet.forEach((member, index) => {
        if (member.ConnectionDomain && member.ConnectionPort) {
          endpoints.push({
            type: member.ReplicaSetRole?.toLowerCase() || 'secondary',
            host: member.ConnectionDomain,
            port: member.ConnectionPort,
            nodeId: member.VPCCloudInstanceId || `node-${index}`,
            description: `${member.ReplicaSetRole || 'Secondary'} node connection`,
            networkType: member.NetworkType,
            vpcId: member.VPCId,
            vSwitchId: member.VSwitchId
          });
        }
      });
    }

    // If no replica set info but we have shards (for sharded clusters)
    if (instanceInfo.ShardList && instanceInfo.ShardList.length > 0) {
      instanceInfo.ShardList.forEach((shard, shardIndex) => {
        if (shard.ConnectionDomain && shard.Port) {
          endpoints.push({
            type: 'shard',
            host: shard.ConnectionDomain,
            port: shard.Port,
            nodeId: shard.NodeId || `shard-${shardIndex}`,
            description: `Shard ${shardIndex + 1} connection`,
            shardId: shard.NodeId
          });
        }
      });
    }

    // Mongos endpoints for sharded clusters
    if (instanceInfo.MongosList && instanceInfo.MongosList.length > 0) {
      instanceInfo.MongosList.forEach((mongos, mongosIndex) => {
        if (mongos.ConnectionDomain && mongos.Port) {
          endpoints.push({
            type: 'mongos',
            host: mongos.ConnectionDomain,
            port: mongos.Port,
            nodeId: mongos.NodeId || `mongos-${mongosIndex}`,
            description: `Mongos ${mongosIndex + 1} connection`
          });
        }
      });
    }

    return endpoints;
  }

  /**
   * Get connection string for a specific endpoint
   * @param {Object} endpoint - Connection endpoint
   * @param {string} username - MongoDB username
   * @param {string} password - MongoDB password
   * @param {string} authSource - Authentication source database
   * @returns {string} MongoDB connection string
   */
  getConnectionString(endpoint, username, password, authSource = 'admin') {
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    
    return `mongodb://${encodedUsername}:${encodedPassword}@${endpoint.host}:${endpoint.port}/${authSource}?directConnection=true&authSource=${authSource}`;
  }
}

module.exports = AliCloudClient;