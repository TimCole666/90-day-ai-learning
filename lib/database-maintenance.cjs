'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { assertSupportedNodeVersion } = require('./runtime.cjs');

assertSupportedNodeVersion();

const CONFIG_CREDENTIAL_KEY = /(secret|password|token|credential|private[._-]?key|api[._-]?key|client[._-]?secret|access[._-]?key)/i;
const UNSUPPORTED_CONFIG_KEYS = new Set(['dbFileName', 'allowedOrigins', 'backup']);

function isMemoryDatabase(dbPath) {
  return !dbPath || dbPath === ':memory:';
}

function resolvePath(rootDir, value) {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function assertSafeConfigValue(value) {
  const visit = current => {
    if (!current || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      if (CONFIG_CREDENTIAL_KEY.test(key)) {
        throw new Error('Configuration contains prohibited private values. Supply secrets through the environment.');
      }
      if (UNSUPPORTED_CONFIG_KEYS.has(key)) {
        throw new Error(`Configuration field ${key} is unsupported; use the documented environment or database path options.`);
      }
      visit(child);
    }
  };
  visit(value);
}

function readConfigFile(configPath) {
  if (!configPath) return {};
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    throw new Error('Configuration file could not be read or parsed.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Configuration file must contain a JSON object.');
  }
  assertSafeConfigValue(parsed);
  return parsed;
}

function resolveDatabasePath({ rootDir, env = process.env, configPath = env.CONFIG_PATH, config = null, dbPathOverride = null, dataDirOverride = null }) {
  const fileConfig = config || readConfigFile(configPath);
  const explicitDbPath = dbPathOverride || env.DB_PATH || fileConfig.dbPath;
  if (explicitDbPath) return explicitDbPath === ':memory:' ? ':memory:' : resolvePath(rootDir, explicitDbPath);
  const dataDir = dataDirOverride || env.DATA_DIR || fileConfig.dataDir || path.join(rootDir, 'data');
  return resolvePath(rootDir, path.join(dataDir, 'learn.db'));
}

function lockPathForDatabase(dbPath) {
  if (isMemoryDatabase(dbPath)) return null;
  return `${path.resolve(dbPath)}.maintenance.lock`;
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

function lockConflict(lockPath, lock, recoverStaleLock) {
  const pid = lock && Number.isInteger(lock.pid) ? lock.pid : null;
  if (pid && processIsAlive(pid)) {
    return `Database maintenance lock is held by active process ${pid}; stop the service before restore.`;
  }
  if (!recoverStaleLock) {
    return `Stale or unreadable database maintenance lock at ${lockPath}; verify no service is using the database, then rerun with --recover-stale-lock.`;
  }
  return null;
}

function acquireDatabaseLock(dbPath, owner, { recoverStaleLock = false } = {}) {
  const lockPath = lockPathForDatabase(dbPath);
  if (!lockPath) return () => {};
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const conflict = lockConflict(lockPath, readLock(lockPath), recoverStaleLock);
    if (conflict) throw new Error(conflict);
    fs.rmSync(lockPath, { force: true });
    fd = fs.openSync(lockPath, 'wx', 0o600);
  }

  const token = crypto.randomUUID();
  const record = JSON.stringify({ pid: process.pid, owner, dbPath: path.resolve(dbPath), token, createdAt: new Date().toISOString() });
  try {
    fs.writeSync(fd, record);
    fs.fsyncSync(fd);
  } catch (error) {
    fs.closeSync(fd);
    fs.rmSync(lockPath, { force: true });
    throw error;
  }
  fs.closeSync(fd);

  return () => {
    const current = readLock(lockPath);
    if (current && current.token === token) fs.rmSync(lockPath, { force: true });
  };
}

function assertDistinctDatabasePath(sourcePath, outputPath, label = 'output') {
  const source = path.resolve(sourcePath);
  const output = path.resolve(outputPath);
  if (source === output) throw new Error(`Backup ${label} must not be the source database.`);
  try {
    const outputStat = fs.lstatSync(output);
    if (outputStat.isSymbolicLink()) throw new Error(`Backup ${label} must not be a symlink.`);
    throw new Error(`Backup ${label} already exists; refusing to overwrite it.`);
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }
  let sourceReal;
  try {
    sourceReal = fs.realpathSync(source);
  } catch {
    sourceReal = source;
  }
  const parentReal = fs.realpathSync(path.dirname(output));
  if (sourceReal === path.join(parentReal, path.basename(output))) {
    throw new Error(`Backup ${label} resolves to the source database.`);
  }
}

function verifyDatabaseIntegrity(dbPath) {
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare('PRAGMA integrity_check').get();
    return Boolean(row && row.integrity_check === 'ok');
  } catch {
    return false;
  } finally {
    if (db) db.close();
  }
}

function createVacuumSnapshot(sourcePath, outputPath) {
  assertDistinctDatabasePath(sourcePath, outputPath, 'snapshot');
  let source;
  try {
    source = new DatabaseSync(sourcePath, { readOnly: true });
    const escapedOutput = path.resolve(outputPath).replace(/'/g, "''");
    source.exec(`VACUUM INTO '${escapedOutput}';`);
    if (!verifyDatabaseIntegrity(outputPath)) {
      throw new Error('Database snapshot failed integrity verification.');
    }
  } catch (error) {
    fs.rmSync(outputPath, { force: true });
    throw error;
  } finally {
    if (source) source.close();
  }
}

module.exports = {
  assertDistinctDatabasePath,
  acquireDatabaseLock,
  createVacuumSnapshot,
  isMemoryDatabase,
  lockPathForDatabase,
  readConfigFile,
  resolveDatabasePath,
  verifyDatabaseIntegrity
};
