module.exports = {
  // MongoDB connection settings
  mongodb: {
    connectionTimeout: 30000,
    socketTimeout: 30000,
    maxPoolSize: 10,
    minPoolSize: 1,
    authSource: 'admin'
  },

  // Analysis settings
  analysis: {
    includeSystemDbs: false,
    minOpsThreshold: 10,
    unusedDaysThreshold: 7,
    timeoutMs: 300000, // 5 minutes
    maxConcurrentConnections: 5
  },

  // Report generation settings
  reports: {
    defaultFormat: 'table',
    includeMetadata: true,
    timestampFormat: 'ISO',
    outputDirectory: './reports'
  },

  // AliCloud settings
  alicloud: {
    defaultRegion: 'ap-southeast-1',
    requestTimeout: 30000,
    maxRetries: 3,
    retryDelay: 1000
  },

  // Logging settings
  logging: {
    level: 'info',
    includeTimestamp: true,
    colorize: true
  }
};