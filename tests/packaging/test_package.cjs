// Automated test suite for Reproducible Delivery Package & Operations (Ticket 56)
const assert = require('node:assert');
const { spawn, spawnSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    http.get(urlStr, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

function waitForServer(child, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Server startup timed out after ${timeoutMs}ms. Output: ${stdoutBuffer}\nErr: ${stderrBuffer}`));
    }, timeoutMs);

    function onStdout(chunk) {
      stdoutBuffer += chunk.toString();
      const match = stdoutBuffer.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        cleanup();
        resolve({ port: parseInt(match[1], 10), output: stdoutBuffer });
      }
    }

    function onStderr(chunk) {
      stderrBuffer += chunk.toString();
    }

    function onExit(code) {
      cleanup();
      reject(new Error(`Server exited unexpectedly with code ${code}. Output: ${stdoutBuffer}\nErr: ${stderrBuffer}`));
    }

    function cleanup() {
      clearTimeout(timer);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
    }

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('exit', onExit);
  });
}

async function testMissingConfigurationGracefulError() {
  console.log('[1/5] Testing missing configuration failure in server...');
  // Running server with NODE_ENV=production but missing SESSION_SECRET should exit with code 1 and clear error
  const res = spawnSync(process.execPath, [path.join(REPO_ROOT, 'server.cjs')], {
    env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: '', PORT: '0' },
    encoding: 'utf8'
  });
  assert.strictEqual(res.status, 1, `Expected exit status 1 for missing config, got ${res.status}`);
  const combinedOutput = res.stdout + res.stderr;
  assert.ok(
    combinedOutput.includes('FATAL: Missing required configuration: SESSION_SECRET must be set in production mode'),
    `Expected clear error message about SESSION_SECRET, got: ${combinedOutput}`
  );
  console.log('  ✓ Missing configuration failed gracefully with code 1 and informative error message');
}

function writeCurriculumFixture(rootDir, sourceResources) {
  fs.mkdirSync(path.join(rootDir, 'curriculum', 'days'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  fs.writeFileSync(path.join(rootDir, 'curriculum', 'days', 'day-01.json'), JSON.stringify({
    id: 'day-01',
    activities: [{ id: 'activity-01', source_resources: sourceResources }]
  }));
}

async function testPackagingRightsGate() {
  console.log('[2/6] Testing release rights gate before artifact creation...');
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-package-rights-'));
  const scriptPath = path.join(REPO_ROOT, 'scripts', 'package_release.cjs');
  const invalidSources = [
    {
      id: 'missing-provenance', title: 'Unattributed source', original_url: 'https://example.com/source',
      version_or_verification_date: '2026-01-01', reuse_category: 'linking', license: 'unknown',
      permission_basis: 'link only', selection_rationale: 'Useful context', prerequisites: 'None', safe_fallback: 'Use summary',
      compared_candidates: [
        { candidate_name: 'A', url: 'https://example.com/a', license: 'unknown', comparison_rationale: 'First candidate for comparison' },
        { candidate_name: 'B', url: 'https://example.com/b', license: 'unknown', comparison_rationale: 'Second candidate for comparison' }
      ]
    },
    {
      id: 'prohibited-import', title: 'Restricted transcript', author: 'Author', original_url: 'https://example.com/video',
      version_or_verification_date: '2026-01-01', reuse_category: 'imported_or_translated', license: 'Standard YouTube License',
      permission_basis: 'None', selection_rationale: 'Useful example', prerequisites: 'None', safe_fallback: 'Link externally',
      compared_candidates: [
        { candidate_name: 'A', url: 'https://example.com/a', license: 'unknown', comparison_rationale: 'First candidate for comparison' },
        { candidate_name: 'B', url: 'https://example.com/b', license: 'unknown', comparison_rationale: 'Second candidate for comparison' }
      ]
    }
  ];

  try {
    writeCurriculumFixture(fixtureRoot, invalidSources);
    const invalid = spawnSync(process.execPath, [scriptPath], {
      cwd: REPO_ROOT, env: { ...process.env, PACKAGE_ROOT: fixtureRoot }, encoding: 'utf8'
    });
    assert.notStrictEqual(invalid.status, 0, 'Invalid provenance must reject the release');
    assert.match(invalid.stderr, /Source Rights Audit FAILED|missing.*author|rights gate/i);
    assert.ok(!fs.existsSync(path.join(fixtureRoot, 'dist')), 'Rejected release must not create dist/');

    fs.rmSync(path.join(fixtureRoot, 'curriculum'), { recursive: true, force: true });
    writeCurriculumFixture(fixtureRoot, [{
      id: 'lawful-link', title: 'Lawful external resource', author: 'Author', original_url: 'https://example.com/resource',
      version_or_verification_date: '2026-01-01', reuse_category: 'linking', license: 'Standard YouTube License',
      permission_basis: 'External link only', selection_rationale: 'Best explanation', prerequisites: 'None', safe_fallback: 'Original explanation',
      compared_candidates: [
        { candidate_name: 'A', url: 'https://example.com/a', license: 'unknown', comparison_rationale: 'First candidate for comparison' },
        { candidate_name: 'B', url: 'https://example.com/b', license: 'unknown', comparison_rationale: 'Second candidate for comparison' }
      ]
    }]);
    const valid = spawnSync(process.execPath, [scriptPath], {
      cwd: REPO_ROOT, env: { ...process.env, PACKAGE_ROOT: fixtureRoot }, encoding: 'utf8'
    });
    assert.strictEqual(valid.status, 0, `Lawful linking should package: ${valid.stdout}\n${valid.stderr}`);
    assert.ok(fs.existsSync(path.join(fixtureRoot, 'dist', 'package-manifest.json')));
    assert.ok(fs.readdirSync(path.join(fixtureRoot, 'dist')).some(file => file.endsWith('.tar.gz')));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  console.log('  ✓ Invalid sources rejected before artifacts; lawful linking packaged');
}

async function testPackagingExecution() {
  console.log('[3/6] Testing package release script execution and artifact filtering...');
  const distDir = path.join(REPO_ROOT, 'dist');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  // Execute packaging script
  const pkgRes = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'package_release.cjs')], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  assert.strictEqual(pkgRes.status, 0, `Packaging script failed:\n${pkgRes.stdout}\n${pkgRes.stderr}`);

  // Check generated artifacts
  assert.ok(fs.existsSync(distDir), 'dist/ directory was not created');
  const files = fs.readdirSync(distDir);
  const tarballName = files.find(f => f.endsWith('.tar.gz'));
  assert.ok(tarballName, 'No .tar.gz bundle found in dist/');
  const tarballPath = path.join(distDir, tarballName);

  assert.ok(fs.existsSync(path.join(distDir, 'checksums.txt')), 'dist/checksums.txt is missing');
  assert.ok(fs.existsSync(path.join(distDir, 'package-manifest.json')), 'dist/package-manifest.json is missing');

  // Verify manifest details
  const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'package-manifest.json'), 'utf8'));
  assert.ok(manifest.name, 'Manifest missing package name');
  assert.ok(manifest.version, 'Manifest missing package version');
  assert.ok(manifest.timestamp, 'Manifest missing timestamp');
  assert.ok(Array.isArray(manifest.included_files), 'Manifest missing included_files list');

  // Inspect contents of tarball using tar -tzf
  const listOutput = execSync(`tar -tzf "${tarballPath}"`, { encoding: 'utf8' });
  const archiveFiles = listOutput.split('\n').filter(Boolean).map(f => f.replace(/^\.\//, ''));

  // INCLUSION checks
  const requiredFiles = [
    'server.cjs',
    'package.json',
    'lib/db.cjs',
    'curriculum/days/day-01.json',
    'curriculum/content/day-01/zh-Hans.json',
    'curriculum/assets/style.css',
    'curriculum/assets/app.js',
    'assets/course.css',
    'assets/course.js',
    'lessons/index.html',
    'LICENSE',
    'LICENSE-CC-BY-SA-4.0',
    'NOTICE',
    'config.production.json',
    'scripts/backup.cjs',
    'scripts/restore.cjs',
    'scripts/rollback.cjs',
    'docs/operations/deployment-and-rollback.md'
  ];

  for (const reqFile of requiredFiles) {
    assert.ok(
      archiveFiles.some(f => f === reqFile || f.endsWith('/' + reqFile)),
      `Package is missing required file: ${reqFile}`
    );
  }

  // EXCLUSION checks (no credentials, scratch, git, test logs, venv, unredistributed archives)
  const forbiddenPatterns = [
    /^\.git/,
    /^\.scratch/,
    /^\.pi/,
    /^\.venv/,
    /^\.env/,
    /^tests\//,
    /^archive\//,
    /^self-media\//,
    /^selfteaching\//,
    /^reference\//,
    /^zettelkasten\//,
    /\.db$/,
    /\.pyc$/,
    /__pycache__/
  ];

  for (const f of archiveFiles) {
    for (const pattern of forbiddenPatterns) {
      assert.ok(!pattern.test(f), `Package contains forbidden file matching ${pattern}: ${f}`);
    }
  }

  console.log(`  ✓ Release package verified: ${tarballName} (${archiveFiles.length} files included cleanly)`);
  return { tarballPath, manifest };
}

async function testUnpackAndRunOutsideRepo(tarballPath) {
  console.log('[4/6] Testing unpack and runtime execution in clean disposable directory...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-deploy-test-'));

  try {
    // Unpack
    execSync(`tar -xzf "${tarballPath}" -C "${tmpDir}"`);
    assert.ok(fs.existsSync(path.join(tmpDir, 'server.cjs')), 'server.cjs missing from unpacked directory');

    // Test missing configuration inside unpacked directory
    const missingConfRes = spawnSync(process.execPath, [path.join(tmpDir, 'server.cjs')], {
      cwd: tmpDir,
      env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: '', PORT: '0' },
      encoding: 'utf8'
    });
    assert.strictEqual(missingConfRes.status, 1);
    assert.ok(
      (missingConfRes.stdout + missingConfRes.stderr).includes('FATAL: Missing required configuration'),
      'Missing config check failed in unpacked deployment'
    );

    // Launch server with valid production config
    const dataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    const serverProc = spawn(process.execPath, [path.join(tmpDir, 'server.cjs')], {
      cwd: tmpDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: '0',
        DATA_DIR: dataDir,
        SESSION_SECRET: 'disposable-production-secret-9999'
      }
    });

    const { port } = await waitForServer(serverProc);
    console.log(`  ✓ Unpacked server listening on port ${port}`);

    // Verify /healthz returns 200 and database connected
    const health = await httpGet(`http://127.0.0.1:${port}/healthz`);
    assert.strictEqual(health.statusCode, 200, `/healthz returned status ${health.statusCode}`);
    const healthJson = JSON.parse(health.body);
    assert.strictEqual(healthJson.status, 'ok', 'health status should be ok');
    assert.strictEqual(healthJson.database, 'connected', 'database should be connected');
    assert.ok(healthJson.version, 'healthz should return version');

    // Verify curriculum page renders
    const day01 = await httpGet(`http://127.0.0.1:${port}/zh-Hans/day-01`);
    assert.strictEqual(day01.statusCode, 200, `Day 01 returned status ${day01.statusCode}`);
    assert.ok(day01.body.includes('90-Day AI Learning'), 'Day 01 page missing title');
    assert.ok(day01.body.includes('day-01-act-01'), 'Day 01 page missing activity container');

    // Stop server
    serverProc.kill('SIGTERM');
    await new Promise(r => serverProc.on('exit', r));
    console.log('  ✓ Clean deployment and health check verified successfully');
    return { deployDir: tmpDir, dataDir };
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

async function testBackupAndRestoreRoundtrip(deployDir, dataDir) {
  console.log('[5/6] Testing database persistence, backup, and restore roundtrip...');
  const dbPath = path.join(dataDir, 'learn.db');
  assert.ok(fs.existsSync(dbPath), `Database file not found at ${dbPath}`);

  // Insert identifiable learner test records
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_records (
      id TEXT PRIMARY KEY,
      learner_id TEXT,
      activity_id TEXT,
      score INTEGER,
      payload TEXT,
      created_at TEXT
    );
  `);
  db.prepare(`
    INSERT INTO test_records (id, learner_id, activity_id, score, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?);
  `).run('rec-1', 'learner-alice', 'day-01-act-01', 100, '{"prediction":"correct"}', '2026-10-30T02:00:00Z');
  db.close();

  // Create backup using backup script
  const backupRes = spawnSync(process.execPath, [
    path.join(deployDir, 'scripts', 'backup.cjs'),
    '--data-dir', dataDir
  ], {
    cwd: deployDir,
    encoding: 'utf8'
  });
  assert.strictEqual(backupRes.status, 0, `Backup script failed:\n${backupRes.stdout}\n${backupRes.stderr}`);
  
  // Extract created backup path from stdout
  const match = backupRes.stdout.match(/Backup created successfully at:\s*(.+)/);
  assert.ok(match, `Could not find backup path in output: ${backupRes.stdout}`);
  const backupFilePath = match[1].trim();
  assert.ok(fs.existsSync(backupFilePath), `Backup file not found at ${backupFilePath}`);

  // Corrupt / modify data in the active DB
  const dbCorrupt = new DatabaseSync(dbPath);
  dbCorrupt.exec("DELETE FROM test_records; INSERT INTO test_records VALUES ('rec-corrupt', 'intruder', 'bad', 0, 'corrupted', '2026-10-30');");
  const corruptCount = dbCorrupt.prepare("SELECT count(*) as count FROM test_records WHERE learner_id = 'intruder'").get().count;
  assert.strictEqual(corruptCount, 1);
  dbCorrupt.close();

  // Run restore script
  const restoreRes = spawnSync(process.execPath, [
    path.join(deployDir, 'scripts', 'restore.cjs'),
    backupFilePath,
    '--data-dir', dataDir
  ], {
    cwd: deployDir,
    encoding: 'utf8'
  });
  assert.strictEqual(restoreRes.status, 0, `Restore script failed:\n${restoreRes.stdout}\n${restoreRes.stderr}`);

  // Verify restored database integrity and data
  const dbRestored = new DatabaseSync(dbPath);
  const integrity = dbRestored.prepare('PRAGMA integrity_check').get().integrity_check;
  assert.strictEqual(integrity, 'ok', `Integrity check failed: ${integrity}`);

  const restoredRecord = dbRestored.prepare("SELECT * FROM test_records WHERE id = 'rec-1'").get();
  assert.ok(restoredRecord, 'Restored record rec-1 not found');
  assert.strictEqual(restoredRecord.learner_id, 'learner-alice');
  assert.strictEqual(restoredRecord.score, 100);

  const intruderRecord = dbRestored.prepare("SELECT * FROM test_records WHERE learner_id = 'intruder'").get();
  assert.strictEqual(intruderRecord, undefined, 'Intruder record should have been overwritten by restore');
  dbRestored.close();

  console.log('  ✓ Backup, data wipe, and restore roundtrip passed with verified integrity');
}

async function testRollbackExecution(deployDir, dataDir) {
  console.log('[6/6] Testing automated rollback procedure...');
  const rollbackRes = spawnSync(process.execPath, [
    path.join(deployDir, 'scripts', 'rollback.cjs'),
    '--data-dir', dataDir
  ], {
    cwd: deployDir,
    encoding: 'utf8'
  });
  assert.strictEqual(rollbackRes.status, 0, `Rollback script failed:\n${rollbackRes.stdout}\n${rollbackRes.stderr}`);
  assert.ok(rollbackRes.stdout.includes('Rollback completed successfully'), `Rollback output missing success confirmation: ${rollbackRes.stdout}`);
  console.log('  ✓ Rollback procedure executed cleanly against disposable environment');
}

async function run() {
  console.log('=== Reproducible Delivery Package & Operations Test Suite (Ticket 56) ===\n');
  let cleanDeploy = null;

  try {
    await testMissingConfigurationGracefulError();
    await testPackagingRightsGate();
    const { tarballPath } = await testPackagingExecution();
    cleanDeploy = await testUnpackAndRunOutsideRepo(tarballPath);
    await testBackupAndRestoreRoundtrip(cleanDeploy.deployDir, cleanDeploy.dataDir);
    await testRollbackExecution(cleanDeploy.deployDir, cleanDeploy.dataDir);

    console.log('\n>>> ALL REPRODUCIBLE PACKAGING AND OPERATIONS TESTS PASSED! <<<');
  } finally {
    if (cleanDeploy && cleanDeploy.deployDir && fs.existsSync(cleanDeploy.deployDir)) {
      fs.rmSync(cleanDeploy.deployDir, { recursive: true, force: true });
    }
  }
}

run().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
