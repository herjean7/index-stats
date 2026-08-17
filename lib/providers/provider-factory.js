const AliCloudProvider = require('./alicloud-provider');
const AtlasProvider = require('./atlas-provider');
const SelfManagedProvider = require('./self-managed-provider');

function resolveProviderName(options = {}, env = {}) {
  if (options.provider) {
    return options.provider.toLowerCase();
  }

  if (env.CLOUD_PROVIDER) {
    return env.CLOUD_PROVIDER.toLowerCase();
  }

  if (options.instanceId) {
    return 'alicloud';
  }

  if (options.atlasUri || env.ATLAS_CONNECTION_URI) {
    return 'atlas';
  }

  return 'self-managed';
}

function createProvider({ options, env, config }) {
  const providerName = resolveProviderName(options, env);

  switch (providerName) {
    case 'alicloud':
      return { providerName, provider: new AliCloudProvider({ options, env, config }) };
    case 'atlas':
      return { providerName, provider: new AtlasProvider({ options, env, config }) };
    case 'self-managed':
    case 'selfmanaged':
      return { providerName: 'self-managed', provider: new SelfManagedProvider({ options, env, config }) };
    default:
      throw new Error(`Unsupported provider: ${providerName}. Supported providers: alicloud, atlas, self-managed`);
  }
}

module.exports = {
  createProvider,
  resolveProviderName
};