const {
  discoverClusterFromUri,
  parseMongoUri,
  buildDirectEndpointsFromHosts
} = require('./topology-discovery');

class SelfManagedProvider {
  constructor({ env, options, config }) {
    this.env = env;
    this.options = options;
    this.config = config;
  }

  validate() {
    const uri = this.options.connectionUri || this.env.MONGODB_CONNECTION_URI;
    const hosts = this.options.hosts || this.env.MONGODB_HOSTS;

    if (!uri && !hosts) {
      throw new Error('Self-managed provider requires --connection-uri/ MONGODB_CONNECTION_URI or --hosts/ MONGODB_HOSTS');
    }
  }

  async resolveTarget() {
    this.validate();

    const uri = this.options.connectionUri || this.env.MONGODB_CONNECTION_URI;
    const hosts = this.options.hosts || this.env.MONGODB_HOSTS;

    if (uri) {
      const parsed = parseMongoUri(uri);
      const topology = await discoverClusterFromUri(uri, {
        timeoutMs: this.config.mongodb.connectionTimeout
      });

      return {
        provider: 'self-managed',
        instanceId: this.options.clusterName || parsed.seedHosts[0] || 'self-managed-cluster',
        description: `Self-managed cluster (${topology.discoveredTopology})`,
        engine: 'mongodb',
        engineVersion: 'unknown',
        connectionEndpoints: topology.connectionEndpoints
      };
    }

    const tls = this._resolveBoolean(this.options.tls, this.env.MONGODB_TLS, false);
    const connectionEndpoints = buildDirectEndpointsFromHosts(hosts, {
      username: this.env.MONGODB_USERNAME,
      password: this.env.MONGODB_PASSWORD,
      authSource: this.env.MONGODB_AUTH_SOURCE || this.config.mongodb.authSource,
      tls
    });

    return {
      provider: 'self-managed',
      instanceId: this.options.clusterName || 'self-managed-host-list',
      description: 'Self-managed hosts (static endpoint mode)',
      engine: 'mongodb',
      engineVersion: 'unknown',
      connectionEndpoints
    };
  }

  _resolveBoolean(optionValue, envValue, fallback) {
    if (typeof optionValue === 'boolean') {
      return optionValue;
    }

    if (typeof envValue === 'string') {
      return envValue.toLowerCase() === 'true';
    }

    return fallback;
  }
}

module.exports = SelfManagedProvider;