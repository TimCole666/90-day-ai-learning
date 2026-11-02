#!/usr/bin/env node
// Database persistence restore script for 90-Day AI Learning Platform
const fs = require('node:fs');
const path = require('node:path');
const { assertSupportedNodeVersion } = require('../lib/runtime.cjs');
const {
  acquireDatabaseLock,
  createVacuumSnapshot,
  readConfigFile,
  resolveDatabasePath,
  verifyDatabaseIntegrity
} = require('../lib/database-maintenance.cjs');

assertSupportedNodeVersion();

function parseArgs() {
  const args = process.argv.slice(2);
  let backupFile = null;
  const options = {
    dataDir: process.env.DATA_DIR || null,
    dbPathOverride: process.env.DB_PATH || null,
    skipPreBackup: false,
    recoverStaleLock: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data-dir' && args[i + 1]) {
      options.dataDir = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--db-path' && args[i + 1]) {
      options.dbPathOverride = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--no-pre-backup') {
      options.skipPreBackup = true;
    } else if (args[i] === '--recover-stale-lock') {
      options.recoverStaleLock = true;
    } else if (args[i] === '-h' || args[i] === '--help') {
      console.log('Usage: node scripts/restore.cjs <backup-file> [--data-dir <dir>] [--db-path <file>] [--no-pre-backup] [--recover-stale-lock]');
      process.exit(0);
    } else if (!backupFile && !args[i].startsWith('-')) {
      backupFile = path.resolve(args[i]);
    }
  }

  if (!backupFile) {
    console.error('FATAL: Missing required backup file argument.');
    console.error('Usage: node scripts/restore.cjs <backup-file> [--data-dir <dir>] [--db-path <file>]');
    process.exit(1);
  }

  return { backupFile, ...options };
}

function main() {
  const { backupFile, dataDir, dbPathOverride, skipPreBackup, recoverStaleLock } = parseArgs();
  let config;
  try {
    config = readConfigFile(process.env.CONFIG_PATH || null);
  } catch (error) {
    console.error(`FATAL: ${error.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(backupFile)) {
    console.error(`FATAL: Backup file not found at ${backupFile}`);
    process.exit(1);
  }
  if (!verifyDatabaseIntegrity(backupFile)) {
    console.error(`FATAL: Backup file at ${backupFile} failed SQLite integrity check or is corrupted.`);
    process.exit(1);
  }

  const targetDbPath = resolveDatabasePath({
    rootDir: path.resolve(__dirname, '..'),
    env: process.env,
    config,
    dbPathOverride,
    dataDirOverride: dataDir
  });
  if (targetDbPath === ':memory:') {
    console.error('FATAL: Restore requires a file-backed database; :memory: is unsupported.');
    process.exit(1);
  }

  const targetDir = path.dirname(targetDbPath);
  fs.mkdirSync(targetDir, { recursive: true });
  if (fs.existsSync(targetDbPath) && fs.lstatSync(targetDbPath).isSymbolicLink()) {
    console.error(`FATAL: Refusing to restore through symlink target ${targetDbPath}`);
    process.exit(1);
  }

  let releaseLock = () => {};
  const tempTargetPath = `${targetDbPath}.restore-${process.pid}-${Date.now()}.tmp`;
  try {
    releaseLock = acquireDatabaseLock(targetDbPath, 'restore', { recoverStaleLock });

    if (fs.existsSync(targetDbPath) && !skipPreBackup) {
      const backupDir = path.join(targetDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safetyBackupPath = path.join(backupDir, `pre-restore-safety-${timestamp}.db`);
      // A failed safety snapshot is a hard stop: never replace live data without it.
      createVacuumSnapshot(targetDbPath, safetyBackupPath);
      console.log(`Saved safety pre-restore backup to: ${safetyBackupPath}`);
    }

    fs.copyFileSync(backupFile, tempTargetPath);
    if (!verifyDatabaseIntegrity(tempTargetPath)) {
      throw new Error('Restore copy failed SQLite integrity verification.');
    }

    for (const suffix of ['-wal', '-shm']) {
      fs.rmSync(`${targetDbPath}${suffix}`, { force: true });
    }
    fs.renameSync(tempTargetPath, targetDbPath);

    if (!verifyDatabaseIntegrity(targetDbPath)) {
      throw new Error(`Restored database at ${targetDbPath} failed integrity check.`);
    }
    console.log(`Restore completed successfully from: ${backupFile} to ${targetDbPath}`);
  } catch (error) {
    fs.rmSync(tempTargetPath, { force: true });
    console.error(`FATAL: Restore operation failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    releaseLock();
  }
}

if (require.main === module) {
  main();
}

module.exports = { verifyDatabaseIntegrity, parseArgs };
