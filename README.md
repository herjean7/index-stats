# MongoDB Index Stats Tool

A comprehensive tool for analyzing MongoDB index statistics across all nodes in a specific AliCloud MongoDB instance.

## Features

- 📊 Collects index statistics from all MongoDB nodes (primary and secondary)
- 🔍 Identifies TTL indexes and their configurations
- ⏰ Reports when each MongoDB node was last restarted
- 📋 Consolidates results into easy-to-read tables
- 🚨 Highlights unused and redundant indexes
- 🌐 Works with AliCloud MongoDB instances

## Prerequisites

Before using this tool, you need to create a custom database role and assign it to your MongoDB user to ensure proper permissions for listing collections and indexes.

### Database Role Setup

Connect to your MongoDB instance and run the following commands:

```javascript
use admin
db.createRole({
  role: "globalListCollections",
  privileges: [
    {
      resource: { db: "", collection: "" }, 
      actions: ["listCollections", "listIndexes"]
    }
  ],
  roles: []
})
db.grantRolesToUser("indexLister", [
  { role: "globalListCollections", db: "admin" }
])
```

**Note**: Replace `"indexLister"` with your actual MongoDB username that you'll use for connecting to the database.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your AliCloud credentials in `.env`:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. Run the tool:
```bash
npm start
```

## Configuration

Create a `.env` file with the following variables:

```env
ALICLOUD_ACCESS_KEY_ID=your_access_key_id
ALICLOUD_ACCESS_KEY_SECRET=your_access_key_secret
ALICLOUD_REGION=your_region
MONGODB_USERNAME=your_mongodb_username
MONGODB_PASSWORD=your_mongodb_password
```

## Usage

### Basic Usage (Instance ID is required)
```bash
node index.js --instance-id dds-xxxxxxxxx
```

### Advanced Options
```bash
node index.js --region cn-hangzhou --instance-id dds-xxxxxxxxx
node index.js --instance-id dds-xxxxxxxxx --output json
node index.js --instance-id dds-xxxxxxxxx --include-system-dbs
```

## Output

The tool generates comprehensive reports showing:

- **Instance Information**: Connection details for each MongoDB node
- **Index Statistics**: Usage statistics for each index across all nodes
- **TTL Indexes**: Special highlighting of TTL indexes
- **Node Status**: Last restart time and current status
- **Recommendations**: Suggestions for unused or redundant indexes

## Architecture

```
index.js (Main entry point)
├── lib/
│   ├── alicloud-client.js (AliCloud API interactions)
│   ├── mongodb-analyzer.js (MongoDB connection and analysis)
│   ├── index-stats-collector.js (Index statistics collection)
│   ├── ttl-detector.js (TTL index detection)
│   ├── report-generator.js (Output formatting)
│   └── utils.js (Helper functions)
└── config/
    └── default.js (Default configuration)
```

## License

MIT