const { discoverClusterFromUri, parseMongoUri } = require('./topology-discovery');

class AtlasProvider {
  constructor({ env, options, config }) {
    this.env = env;
    this.options = options;
    this.config = config;
  }

  validate() {
    const uri = this.options.atlasUri || this.options.connectionUri || this.env.ATLAS_CONNECTION_URI;
    if (!uri) {
      throw new Error('Atlas provider requires --atlas-uri or ATLAS_CONNECTION_URI');
    }
  }

  async resolveTarget() {
    this.validate();

    const uri = this.options.atlasUri || this.options.connectionUri || this.env.ATLAS_CONNECTION_URI;
    const parsed = parseMongoUri(uri);
    const topology = await discoverClusterFromUri(uri, {
      timeoutMs: this.config.mongodb.connectionTimeout
    });

    const clusterName = this.options.clusterName || parsed.seedHosts[0] || 'atlas-cluster';

    return {
      provider: 'atlas',
      instanceId: clusterName,
      description: `Atlas cluster (${topology.discoveredTopology})`,
      engine: 'mongodb',
      engineVersion: 'unknown',
      connectionEndpoints: topology.connectionEndpoints
    };
  }
}

module.exports = AtlasProvider;