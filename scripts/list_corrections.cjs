#!/usr/bin/env node
// Lists open learner-reported content corrections (spec US59) as JSON.
// Reporter identity is never printed.
//
// Usage: node scripts/list_corrections.cjs [--db path/to/learn.db]
// Without --db, uses DB_PATH, then $DATA_DIR/learn.db (default data/learn.db), like server.cjs.
const path = require('node:path');
const fs = require('node:fs');
const { assertSupportedNodeVersion } = require('../lib/runtime.cjs');
const { initDb } = require('../lib/db.cjs');
const { readConfigFile, resolveDatabasePath } = require('../lib/database-maintenance.cjs');

assertSupportedNodeVersion();

const args = process.argv.slice(2);
const flag = args.indexOf('--db');
let config;
try {
  config = readConfigFile(process.env.CONFIG_PATH || null);
} catch (error) {
  console.error(`FATAL: ${error.message}`);
  process.exit(1);
}
const dbPath = flag >= 0 && args[flag + 1]
  ? path.resolve(args[flag + 1])
  : resolveDatabasePath({ rootDir: path.resolve(__dirname, '..'), env: process.env, config });


if (!dbPath || !fs.existsSync(dbPath)) {
  console.error(`list_corrections: database not found: ${dbPath || '(none)'}`);
  process.exit(2);
}

const db = initDb(dbPath);
process.stdout.write(JSON.stringify(db.listOpenCorrections(), null, 2) + '\n');
