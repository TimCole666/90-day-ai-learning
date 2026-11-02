#!/usr/bin/env node
// Automated operator rollback script for 90-Day AI Learning Platform
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSupportedNodeVersion } = require('../lib/runtime.cjs');
const {
  readConfigFile,
  resolveDatabasePath,
  verifyDatabaseIntegrity
} = require('../lib/database-maintenance.cjs');

assertSupportedNodeVersion();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dataDir: process.env.DATA_DIR || null,
    dbPathOverride: process.env.DB_PATH || null,
    toBackup: null,
    recoverStaleLock: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data-dir' && args[i + 1]) {
      options.dataDir = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--db-path' && args[i + 1]) {
      options.dbPathOverride = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--to-backup' && args[i + 1]) {
      options.toBackup = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--recover-stale-lock') {
      options.recoverStaleLock = true;
    } else if (args[i] === '-h' || args[i] === '--help') {
      console.log('Usage: node scripts/rollback.cjs [--data-dir <dir>] [--db-path <file>] [--to-backup <path>] [--recover-stale-lock]');
      process.exit(0);
    }
  }

  return options;
}

function findLatestValidBackup(backupDir) {
  if (!fs.existsSync(backupDir)) return null;
  const entries = fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.db') && !file.includes('.tmp') && !file.startsWith('pre-restore-safety-'))
    .map(file => {
      const fullPath = path.join(backupDir, file);
      const stat = fs.statSync(fullPath);
      return { path: fullPath, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const entry of entries) {
    if (verifyDatabaseIntegrity(entry.path)) return entry.path;
  }
  return null;
}

function main() {
  const { dataDir, dbPathOverride, toBackup, recoverStaleLock } = parseArgs();
  let config;
  try {
    config = readConfigFile(process.env.CONFIG_PATH || null);
  } catch (error) {
    console.error(`FATAL: ${error.message}`);
    process.exit(1);
  }
  const activeDbPath = resolveDatabasePath({
    rootDir: path.resolve(__dirname, '..'),
    env: process.env,
    config,
    dbPathOverride,
    dataDirOverride: dataDir
  });
  if (activeDbPath === ':memory:') {
    console.error('FATAL: Rollback requires a file-backed database; :memory: is unsupported.');
    process.exit(1);
  }

  const backupDir = path.join(path.dirname(activeDbPath), 'backups');
  const targetBackup = toBackup || findLatestValidBackup(backupDir);
  if (!targetBackup || !fs.existsSync(targetBackup) || !verifyDatabaseIntegrity(targetBackup)) {
    console.error(`FATAL: No suitable valid backup found to rollback to in ${backupDir}`);
    process.exit(1);
  }

  console.log(`Initiating rollback using backup snapshot: ${targetBackup}`);
  const restoreScript = path.join(__dirname, 'restore.cjs');
  const restoreArgs = [restoreScript, targetBackup, '--db-path', activeDbPath];
  if (recoverStaleLock) restoreArgs.push('--recover-stale-lock');
  const res = spawnSync(process.execPath, restoreArgs, { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error('FATAL: Rollback restore failed.');
    process.exit(1);
  }

  if (!verifyDatabaseIntegrity(activeDbPath)) {
    console.error('FATAL: Integrity check failed on active database after rollback.');
    process.exit(1);
  }
  console.log(`Rollback completed successfully. Restored state from ${targetBackup}`);
}

if (require.main === module) {
  main();
}

module.exports = { findLatestValidBackup, parseArgs };
