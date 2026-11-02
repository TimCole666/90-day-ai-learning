#!/usr/bin/env node
// Public CLI/server seam tests for deployment configuration, persistence and artifact safety.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '../..');
const TEST_ENV = { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' };

function tempDir(prefix = 'learn-operations-safety-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function run(script, args, env = {}) {
  return spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    env: { ...process.env, ...TEST_ENV, ...env },
    encoding: 'utf8',
    timeout: 15000
  });
}

function createDatabase(file, rows = []) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;');
  db.exec('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const insert = db.prepare('INSERT OR REPLACE INTO records (id, value) VALUES (?, ?)');
  for (const [id, value] of rows) insert.run(id, value);
  return db;
}

function readRows(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare('SELECT id, value FROM records ORDER BY id').all()
      .map(row => ({ id: row.id, value: row.value }));
  } finally {
    db.close();
  }
}

function httpGet(port, requestPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: requestPath }, response => {
      response.resume();
      response.once('end', () => resolve(response));
    }).on('error', reject);
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`server startup timed out: ${output}`)), 8000);
    const onData = chunk => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on('data', onData);
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`server exited during startup (${code}): ${output}`));
    });
  });
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not drain and stop')), 8000);
    child.once('exit', code => {
      clearTimeout(timer);
      assert.equal(code, 0, 'server should stop cleanly after HTTP drain');
      resolve();
    });
  });
}

function writeValidPackageFixture(root, config = { env: 'production' }) {
  fs.mkdirSync(path.join(root, 'curriculum', 'days'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts', 'list_corrections.cjs'), path.join(root, 'scripts', 'list_corrections.cjs'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  fs.writeFileSync(path.join(root, 'config.production.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(root, 'curriculum', 'days', 'day-01.json'), JSON.stringify({
    id: 'day-01', activities: []
  }));
}

async function testConfigAndParserSafety() {
  const { isSupportedNodeVersion } = require('../../lib/runtime.cjs');
  assert.equal(isSupportedNodeVersion('22.12.0'), false);
  assert.equal(isSupportedNodeVersion('22.13.0'), true);
  assert.equal(isSupportedNodeVersion('23.0.0'), true);

  const dir = tempDir();
  let child;
  try {
    const config = path.join(dir, 'config.json');
    fs.writeFileSync(config, JSON.stringify({ env: 'development', dataDir: path.join(dir, 'from-config') }));
    child = spawn(process.execPath, [path.join(ROOT, 'server.cjs')], {
      cwd: ROOT,
      env: {
        ...process.env, ...TEST_ENV, NODE_ENV: 'production', SESSION_SECRET: 'env-secret',
        PUBLIC_ORIGIN: 'https://learn.example.test', GOOGLE_CLIENT_ID: 'test-client',
        GOOGLE_CLIENT_SECRET: 'test-secret', CONFIG_PATH: config, PORT: '0'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const port = await waitForServer(child);
    const mockRoute = await httpGet(port, '/auth/test-provider?provider=google&state=blocked');
    assert.equal(mockRoute.statusCode, 404, 'NODE_ENV=production must not be downgraded by config.env');
    const oauthStart = await httpGet(port, '/auth/google');
    assert.equal(oauthStart.statusCode, 302);
    assert.ok((oauthStart.headers['set-cookie'] || []).some(cookie => /\bSecure\b/.test(cookie)), 'production OAuth binding cookie must be Secure');
    await stopServer(child);
    child = null;

    const badConfig = path.join(dir, 'bad.json');
    fs.writeFileSync(badConfig, '{"sessionSecret":"RAW_SECRET_SHOULD_NOT_APPEAR"');
    const bad = run('server.cjs', [], { NODE_ENV: 'production', SESSION_SECRET: 'env-secret', CONFIG_PATH: badConfig, PORT: '0' });
    assert.equal(bad.status, 1);
    assert.doesNotMatch(`${bad.stdout}\n${bad.stderr}`, /RAW_SECRET_SHOULD_NOT_APPEAR|Unexpected token/);

    const credentialConfig = path.join(dir, 'credential.json');
    fs.writeFileSync(credentialConfig, JSON.stringify({ env: 'production', credentials: { token: 'RAW_SECRET' } }));
    const credential = run('server.cjs', [], { NODE_ENV: 'production', SESSION_SECRET: 'env-secret', CONFIG_PATH: credentialConfig, PORT: '0' });
    assert.equal(credential.status, 1);
    assert.doesNotMatch(`${credential.stdout}\n${credential.stderr}`, /RAW_SECRET|credentials/);
  } finally {
    if (child) await stopServer(child);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testDatabaseAndOperations() {
  const dir = tempDir();
  try {
    const configPath = path.join(dir, 'config.json');
    const dbPath = path.join(dir, 'nested', 'actual.sqlite');
    fs.writeFileSync(configPath, JSON.stringify({ dataDir: path.join(dir, 'wrong-data'), dbPath }));
    const db = createDatabase(dbPath, [['old', 'old-value']]);
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    db.close();

    const backupPath = path.join(dir, 'backups', 'deployment.db');
    const backup = run('scripts/backup.cjs', ['--output', backupPath], { CONFIG_PATH: configPath });
    assert.equal(backup.status, 0, backup.stderr);
    assert.deepEqual(readRows(backupPath), [{ id: 'old', value: 'old-value' }]);

    const same = run('scripts/backup.cjs', ['--output', dbPath], { CONFIG_PATH: configPath });
    assert.notEqual(same.status, 0);
    assert.deepEqual(readRows(dbPath), [{ id: 'old', value: 'old-value' }]);

    const existingOutput = path.join(dir, 'backups', 'existing.db');
    createDatabase(existingOutput, [['keep', 'do-not-overwrite']]).close();
    const existing = run('scripts/backup.cjs', ['--output', existingOutput], { CONFIG_PATH: configPath });
    assert.notEqual(existing.status, 0);
    assert.deepEqual(readRows(existingOutput), [{ id: 'keep', value: 'do-not-overwrite' }]);

    const symlink = path.join(dir, 'backups', 'symlink.db');
    fs.symlinkSync(backupPath, symlink);
    const link = run('scripts/backup.cjs', ['--output', symlink], { CONFIG_PATH: configPath });
    assert.notEqual(link.status, 0);

    const target = path.join(dir, 'target');
    const targetDb = path.join(target, 'learn.db');
    const live = createDatabase(targetDb, [['base', 'base-value']]);
    live.prepare('INSERT INTO records VALUES (?, ?)').run('wal', 'wal-value');
    // This open external client proves VACUUM INTO sees committed WAL pages;
    // it does not authorize live-client restore and is intentionally separate
    // from the cooperating server-lock test below.
    const restore = run('scripts/restore.cjs', [backupPath, '--db-path', targetDb]);
    assert.equal(restore.status, 0, restore.stderr);
    const safety = fs.readdirSync(path.join(target, 'backups')).find(name => name.startsWith('pre-restore-safety-'));
    assert.ok(safety, 'restore should create a safety snapshot');
    assert.deepEqual(readRows(path.join(target, 'backups', safety)), [
      { id: 'base', value: 'base-value' }, { id: 'wal', value: 'wal-value' }
    ]);
    live.close();

    const staleDir = path.join(dir, 'stale');
    const staleDb = path.join(staleDir, 'learn.db');
    createDatabase(staleDb, [['state', 'stale']]).close();
    fs.writeFileSync(`${staleDb}.maintenance.lock`, JSON.stringify({ pid: 999999, token: 'stale' }));
    const stale = run('scripts/restore.cjs', [backupPath, '--db-path', staleDb]);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /stale|lock/i);
    const recovered = run('scripts/restore.cjs', [backupPath, '--db-path', staleDb, '--recover-stale-lock']);
    assert.equal(recovered.status, 0, recovered.stderr);

    const runningDir = path.join(dir, 'running');
    let server = spawn(process.execPath, [path.join(ROOT, 'server.cjs')], {
      cwd: ROOT,
      env: { ...process.env, ...TEST_ENV, NODE_ENV: 'production', SESSION_SECRET: 'env-secret', DATA_DIR: runningDir, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForServer(server);
    const blocked = run('scripts/restore.cjs', [backupPath, '--data-dir', runningDir]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /stop|maintenance|lock/i);
    await stopServer(server);
    server = null;

    const rollbackDir = path.join(dir, 'rollback');
    const active = path.join(rollbackDir, 'learn.db');
    createDatabase(active, [['state', 'bad']]).close();
    const deploymentBackup = path.join(rollbackDir, 'backups', 'learn-backup-deployment.db');
    createDatabase(deploymentBackup, [['state', 'good']]).close();
    const safetyBackup = path.join(rollbackDir, 'backups', 'pre-restore-safety-newer.db');
    createDatabase(safetyBackup, [['state', 'bad-safety']]).close();
    const rollback = run('scripts/rollback.cjs', ['--data-dir', rollbackDir]);
    assert.equal(rollback.status, 0, rollback.stderr);
    assert.deepEqual(readRows(active), [{ id: 'state', value: 'good' }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testPackageSecretAndFilenameGates() {
  const dir = tempDir();
  try {
    writeValidPackageFixture(dir, { env: 'production', sessionSecret: 'PACKAGE_SECRET' });
    fs.mkdirSync(path.join(dir, 'curriculum', 'private'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'curriculum', 'private', 'credentials.json'), '{}');
    const rejected = run('scripts/package_release.cjs', [], { PACKAGE_ROOT: dir });
    assert.notEqual(rejected.status, 0);
    assert.doesNotMatch(`${rejected.stdout}\n${rejected.stderr}`, /PACKAGE_SECRET/);
    assert.equal(fs.existsSync(path.join(dir, 'dist')), false, 'secret rejection must happen before dist');

    fs.writeFileSync(path.join(dir, 'config.production.json'), JSON.stringify({ env: 'production' }));
    const packaged = run('scripts/package_release.cjs', [], { PACKAGE_ROOT: dir });
    assert.equal(packaged.status, 0, packaged.stderr);
    const archive = fs.readdirSync(path.join(dir, 'dist')).find(file => file.endsWith('.tar.gz'));
    const names = execFileSync('tar', ['-tzf', path.join(dir, 'dist', archive)], { encoding: 'utf8' });
    assert.match(names, /scripts\/list_corrections\.cjs/);
    assert.doesNotMatch(names, /credentials\.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  await testConfigAndParserSafety();
  await testDatabaseAndOperations();
  await testPackageSecretAndFilenameGates();
  console.log('operations safety tests passed');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
