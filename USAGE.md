# MongoDB Index Stats Tool - Usage Guide

## Overview

This tool analyzes index usage per node to avoid the common issue where a single cluster endpoint only reveals partial index behavior.

Supported providers:

- AliCloud
- Atlas
- Self-managed

## Setup

```bash
npm install
npm run setup
```

You can also configure `.env` manually.

## Commands

AliCloud:

```bash
node index.js --provider alicloud --instance-id dds-xxxxxxxxx --region cn-hangzhou
```

Atlas (URI mode):

```bash
node index.js --provider atlas --atlas-uri "mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/admin?tls=true"
```

Self-managed (URI discovery mode):

```bash
node index.js --provider self-managed --connection-uri "mongodb://user:pass@host1:27017,host2:27017/admin?replicaSet=rs0"
```

Self-managed (static host mode):

```bash
node index.js --provider self-managed --hosts host1:27017,host2:27017 --tls
```

Common reporting options:

```bash
node index.js --provider atlas --atlas-uri "mongodb+srv://..." --output json
node index.js --provider atlas --atlas-uri "mongodb+srv://..." --output csv
node index.js --provider atlas --atlas-uri "mongodb+srv://..." --include-system-dbs
node index.js --provider atlas --atlas-uri "mongodb+srv://..." --min-ops 100 --unused-days 14
```

## Important Notes

- URI-based Atlas and self-managed modes perform topology discovery, then connect directly to each discovered node.
- In restricted environments, commands like `listShards` may be blocked. The tool falls back to seed endpoints when discovery is limited.
- `_id_` indexes are ignored for unused-index recommendations.

## Minimum Permissions

MongoDB user should have privileges to:

- list databases
- list collections
- list indexes
- execute index stats collection logic

AliCloud mode also needs API credentials capable of querying instance metadata.

## Environment Variables

```env
# Provider
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

# Shared MongoDB auth
MONGODB_USERNAME=
MONGODB_PASSWORD=
MONGODB_AUTH_SOURCE=admin

# Optional
CONNECTION_TIMEOUT=30000
ANALYSIS_TIMEOUT=300000
```

## Help

```bash
node index.js --help
npm run examples
```