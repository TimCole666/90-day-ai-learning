#!/usr/bin/env node
// Database persistence backup script for 90-Day AI Learning Platform
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertSupportedNodeVersion } = require('../lib/runtime.cjs');
const {
  assertDistinctDatabasePath,
  readConfigFile,
  resolveDatabasePath,
  createVacuumSnapshot
} = require('../lib/database-maintenance.cjs');

assertSupportedNodeVersion();

function parseArgs() {
  const args = process.argv.slice(2);
  const configPath = process.env.CONFIG_PATH || null;
  let config = {};
  try {
    config = readConfigFile(configPath);
  } catch (error) {
    console.error(`FATAL: ${error.message}`);
    process.exit(1);
  }
  const options = {
    dataDir: process.env.DATA_DIR || config.dataDir || path.resolve(__dirname, '..', 'data'),
    dbPathOverride: process.env.DB_PATH || config.dbPath || null,
    output: null,
    config
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data-dir' && args[i + 1]) {
      options.dataDir = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.output = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--db-path' && args[i + 1]) {
      options.dbPathOverride = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--help') {
      console.log('Usage: node scripts/backup.cjs [--data-dir <dir>] [--db-path <file>] [--output <file>]');
      process.exit(0);
    }
  }

  const dbPath = resolveDatabasePath({
    rootDir: path.resolve(__dirname, '..'),
    env: process.env,
    config: options.config,
    dbPathOverride: options.dbPathOverride,
    dataDirOverride: options.dataDir
  });
  options.dbPath = dbPath;
  if (!options.output) {
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    options.output = path.join(backupDir, `learn-backup-${timestamp}.db`);
  }

  return options;
}

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function main() {
  const options = parseArgs();
  const dbPath = options.dbPath;

  if (!fs.existsSync(dbPath)) {
    console.error(`FATAL: Source database not found at ${dbPath}`);
    process.exit(1);
  }

  const outputDir = path.dirname(options.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    assertDistinctDatabasePath(dbPath, options.output);
    createVacuumSnapshot(dbPath, options.output);

    const sha256 = computeFileSha256(options.output);
    const stat = fs.statSync(options.output);

    // Write companion metadata
    const meta = {
      source: dbPath,
      target: options.output,
      sizeBytes: stat.size,
      sha256,
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(`${options.output}.meta.json`, JSON.stringify(meta, null, 2) + '\n');

    console.log(`Backup created successfully at: ${options.output}`);
    console.log(`SHA-256: ${sha256} (${stat.size} bytes)`);
  } catch (err) {
    console.error(`FATAL: Backup failed: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, computeFileSha256 };
