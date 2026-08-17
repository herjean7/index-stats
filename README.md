# MongoDB Index Stats Tool

A tool for analyzing MongoDB index statistics across all nodes in a cluster.

## Supported Providers

- AliCloud MongoDB
- MongoDB Atlas
- Self-managed MongoDB

## Features

- Collects index usage stats across multiple nodes
- Detects TTL indexes and flags TTL-specific caveats
- Captures node restart timing to avoid false unused-index signals
- Produces table, JSON, and CSV reports
- Highlights potentially unused and inconsistent index usage patterns

## Setup

1. Install dependencies:

```bash
npm install
```

2. Run interactive setup:

```bash
npm run setup
```

3. Run analysis with the provider mode you need.

## Quick Start

AliCloud:

```bash
node index.js --provider alicloud --instance-id dds-xxxxxxxxx --region cn-hangzhou
```

Atlas:

```bash
node index.js --provider atlas --atlas-uri "mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/admin?tls=true"
```

Self-managed with URI discovery:

```bash
node index.js --provider self-managed --connection-uri "mongodb://user:pass@host1:27017,host2:27017/admin?replicaSet=rs0"
```

Self-managed static endpoints:

```bash
node index.js --provider self-managed --hosts host1:27017,host2:27017 --tls
```

## Using a .env File

If a `.env` file with the variables below already exists, connection flags can be omitted:

```bash
node index.js --provider atlas --output json --min-ops 2
```

## Common Options

```bash
--output table|json|csv
--include-system-dbs
--min-ops 10
--unused-days 7
```

## Environment Variables

```env
# Provider selection
CLOUD_PROVIDER=alicloud

# AliCloud
ALICLOUD_ACCESS_KEY_ID=
ALICLOUD_ACCESS_KEY_SECRET=
ALICLOUD_REGION=cn-hangzhou

# Atlas
ATLAS_CONNECTION_URI=

# Self-managed
MONGODB_CONNECTION_URI=
MONGODB_HOSTS=
MONGODB_TLS=false

# MongoDB credentials (used when endpoint URIs do not embed auth)
MONGODB_USERNAME=
MONGODB_PASSWORD=
MONGODB_AUTH_SOURCE=admin

# Optional
CONNECTION_TIMEOUT=30000
ANALYSIS_TIMEOUT=300000
```

## Minimum MongoDB Privileges

The analyzing user should have permissions to:

- list databases
- list collections
- list indexes
- run index stats related commands

## Notes

- Atlas and self-managed URI modes perform topology discovery and then connect directly to each node for node-level stats.
- Some locked-down environments may restrict shard/member discovery, resulting in partial node coverage.

## License

MIT