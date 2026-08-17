const { MongoClient } = require('mongodb');

function parseMongoUri(uri) {
  const match = uri.match(/^(mongodb(?:\+srv)?):\/\/([^/?#]*)(?:\/([^?#]*))?(?:\?([^#]*))?$/i);

  if (!match) {
    throw new Error('Invalid MongoDB connection URI');
  }

  const protocol = match[1];
  const authority = match[2] || '';
  const database = match[3] || 'admin';
  const query = match[4] || '';

  const atIndex = authority.lastIndexOf('@');
  const credentials = atIndex >= 0 ? authority.slice(0, atIndex) : '';
  const hostsPart = atIndex >= 0 ? authority.slice(atIndex + 1) : authority;
  const seedHosts = hostsPart.split(',').map(host => host.trim()).filter(Boolean);

  return {
    protocol,
    credentials,
    hostsPart,
    seedHosts,
    database: database || 'admin',
    query
  };
}

function toNodeId(hostPort) {
  return hostPort.replace(/[^a-zA-Z0-9]/g, '-');
}

function buildDirectNodeUri(seedUri, hostPort) {
  const parsed = parseMongoUri(seedUri);
  const params = new URLSearchParams(parsed.query);

  // Ensure each host connection is direct so node-level index stats are isolated.
  params.set('directConnection', 'true');
  params.delete('replicaSet');

  // mongodb+srv implies TLS and authSource=admin; both are lost when rewriting to mongodb://
  if (parsed.protocol.toLowerCase() === 'mongodb+srv') {
    if (!params.has('tls') && !params.has('ssl')) {
      params.set('tls', 'true');
    }
    if (!params.has('authSource') && parsed.credentials) {
      params.set('authSource', 'admin');
    }
  }

  const queryString = params.toString();
  const authSegment = parsed.credentials ? `${parsed.credentials}@` : '';
  const dbSegment = parsed.database || 'admin';

  return `mongodb://${authSegment}${hostPort}/${dbSegment}${queryString ? `?${queryString}` : ''}`;
}

function parseShardHostString(shardHost) {
  if (!shardHost || typeof shardHost !== 'string') {
    return [];
  }

  const slashIndex = shardHost.indexOf('/');
  const hostList = slashIndex >= 0 ? shardHost.slice(slashIndex + 1) : shardHost;
  return hostList.split(',').map(host => host.trim()).filter(Boolean);
}

function classifyReplicaSetHost(hostPort, hello) {
  if (hello.primary === hostPort) {
    return 'primary';
  }

  if (Array.isArray(hello.passives) && hello.passives.includes(hostPort)) {
    return 'passive';
  }

  if (Array.isArray(hello.arbiters) && hello.arbiters.includes(hostPort)) {
    return 'arbiter';
  }

  return 'secondary';
}

async function discoverClusterFromUri(uri, options = {}) {
  if (!uri) {
    throw new Error('Connection URI is required for topology discovery');
  }

  const timeoutMs = options.timeoutMs || 30000;
  const client = new MongoClient(uri, {
    connectTimeoutMS: timeoutMs,
    serverSelectionTimeoutMS: timeoutMs
  });

  try {
    await client.connect();

    const adminDb = client.db('admin');
    let hello;

    try {
      hello = await adminDb.command({ hello: 1 });
    } catch (_) {
      hello = await adminDb.command({ isMaster: 1 });
    }

    const endpoints = [];
    const seenHosts = new Set();
    const pushEndpoint = (hostPort, type, description) => {
      if (!hostPort || seenHosts.has(hostPort)) {
        return;
      }

      const [host, portRaw] = hostPort.split(':');
      endpoints.push({
        type,
        host,
        port: portRaw || '27017',
        nodeId: toNodeId(hostPort),
        description,
        connectionString: buildDirectNodeUri(uri, hostPort)
      });
      seenHosts.add(hostPort);
    };

    const isMongos = hello.msg === 'isdbgrid';

    if (!isMongos && Array.isArray(hello.hosts) && hello.hosts.length > 0) {
      hello.hosts.forEach(hostPort => {
        const type = classifyReplicaSetHost(hostPort, hello);
        if (type !== 'arbiter') {
          pushEndpoint(hostPort, type, `Replica set member (${type})`);
        }
      });
    } else if (isMongos) {
      // Add mongos seed endpoints first for observability fallback.
      const parsed = parseMongoUri(uri);
      parsed.seedHosts.forEach(hostPort => {
        pushEndpoint(hostPort, 'mongos', 'Mongos router endpoint');
      });

      // Try to discover shard members for node-level stats.
      try {
        const listShardsResult = await adminDb.command({ listShards: 1 });
        (listShardsResult.shards || []).forEach(shard => {
          parseShardHostString(shard.host).forEach(hostPort => {
            pushEndpoint(hostPort, 'shard-member', `Shard member (${shard._id || 'unknown-shard'})`);
          });
        });
      } catch (_) {
        // Ignore; some environments do not allow listShards.
      }
    }

    if (endpoints.length === 0) {
      const parsed = parseMongoUri(uri);
      parsed.seedHosts.forEach(hostPort => {
        pushEndpoint(hostPort, 'unknown', 'Seed host endpoint');
      });
    }

    return {
      discoveredTopology: isMongos ? 'sharded' : 'replicaSet',
      connectionEndpoints: endpoints
    };
  } finally {
    await client.close();
  }
}

function buildDirectEndpointsFromHosts(hosts, options = {}) {
  const normalizedHosts = hosts.split(',').map(host => host.trim()).filter(Boolean);

  if (normalizedHosts.length === 0) {
    throw new Error('At least one host must be provided for self-managed host mode');
  }

  const username = options.username ? encodeURIComponent(options.username) : '';
  const password = options.password ? encodeURIComponent(options.password) : '';
  const authSource = options.authSource || 'admin';
  const tls = options.tls === true;

  const authSegment = username ? `${username}:${password}@` : '';

  return normalizedHosts.map(hostPort => {
    const [host, portRaw] = hostPort.split(':');
    const port = portRaw || '27017';
    const params = new URLSearchParams({
      directConnection: 'true',
      authSource
    });

    if (tls) {
      params.set('tls', 'true');
    }

    const connectionString = `mongodb://${authSegment}${host}:${port}/${authSource}?${params.toString()}`;

    return {
      type: 'direct',
      host,
      port,
      nodeId: toNodeId(`${host}:${port}`),
      description: 'Self-managed direct endpoint',
      connectionString
    };
  });
}

module.exports = {
  parseMongoUri,
  buildDirectNodeUri,
  discoverClusterFromUri,
  buildDirectEndpointsFromHosts
};