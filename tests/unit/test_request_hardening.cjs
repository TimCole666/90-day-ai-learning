// Unit test: hostile request input must never crash the server or produce an
// off-site redirect. Covers the acceptance-review findings:
//   - returnTo values with control characters or backslashes (open redirect,
//     and a newline in a Location header that used to kill the process);
//   - malformed percent-encoding in the path (URIError used to kill the process).
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');

function get(origin, rawPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(origin);
    // http.request keeps rawPath byte-for-byte; fetch would normalize it.
    const req = http.request({ host: u.hostname, port: u.port, path: rawPath, method: 'GET' }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location }));
    });
    req.on('error', reject);
    req.end();
  });
}

function spawnServer(env) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['server.cjs', '0'], {
      cwd: ROOT,
      env: { ...process.env, DB_PATH: ':memory:', PORT: '0', ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const timer = setTimeout(() => reject(new Error(`server start timeout: ${output}`)), 8000);
    const onData = chunk => {
      output += chunk.toString();
      const m = output.match(/127\.0\.0\.1:(\d+)/);
      if (m) { clearTimeout(timer); resolve({ proc, origin: `http://127.0.0.1:${m[1]}`, output: () => output }); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', chunk => { output += chunk.toString(); });
    proc.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${output}`)); });
  });
}

// A redirect target is safe only if a browser resolves it to the same origin.
function assertSameOrigin(location, label) {
  assert.ok(location, `${label}: expected a Location header`);
  const resolved = new URL(location, 'https://learn.example.test');
  assert.equal(resolved.origin, 'https://learn.example.test', `${label}: off-site redirect to ${resolved.href}`);
}

const HOSTILE_RETURN_TO = [
  '/%09/evil.example',      // tab: browsers strip it -> //evil.example
  '/%0a/evil.example',      // newline: used to throw ERR_INVALID_CHAR and kill the process
  '/%0d%0a/evil.example',
  '/%5C/evil.example',      // backslash
  '/%5C%5Cevil.example',
  '/%00/evil.example'
];

async function run() {
  console.log('--- Running Request Hardening Tests ---');
  // Unconfigured provider: /auth/google redirects straight back to returnTo.
  const { proc, origin, output } = await spawnServer({ NODE_ENV: 'development' });
  let exited = false;
  proc.once('exit', () => { exited = true; });
  try {
    for (const raw of HOSTILE_RETURN_TO) {
      for (const route of ['/auth/google', '/auth/github', '/auth/link/google']) {
        const res = await get(origin, `${route}?returnTo=${raw}`);
        assert.equal(res.status, 302, `${route} ${raw}: expected 302, got ${res.status}`);
        assertSameOrigin(res.location, `${route} ${raw}`);
        assert.ok(!/[\x00-\x1f\\]/.test(res.location), `${route} ${raw}: Location carries a control char or backslash`);
      }
    }
    console.log('✓ Hostile returnTo values never yield an off-site or control-character redirect');

    const malformed = await get(origin, '/%E0%A4%A');
    assert.equal(malformed.status, 400, `malformed percent-encoding should be 400, got ${malformed.status}`);
    console.log('✓ Malformed percent-encoding in the path returns 400');

    const ok = await get(origin, '/healthz');
    assert.equal(ok.status, 200, 'server must still be serving after hostile requests');
    assert.equal(exited, false, `server process exited: ${output()}`);
    console.log('✓ Server survives all hostile requests');

    const good = await get(origin, '/auth/google?returnTo=/ja/day-36');
    assert.ok(good.location.startsWith('/ja/day-36'), `legitimate returnTo must be kept, got ${good.location}`);
    console.log('✓ Legitimate same-site returnTo is preserved');

    const withQuery = await get(origin, '/auth/google?returnTo=' + encodeURIComponent('/ja/day-36?tab=quiz'));
    assert.equal(withQuery.location, '/ja/day-36?tab=quiz&auth_error=provider_error',
      `auth_error must be appended as a second parameter, got ${withQuery.location}`);
    console.log('✓ auth_error is appended without a second "?"');
  } finally {
    proc.kill('SIGTERM');
  }

  // Production session cookies are Secure even without x-forwarded-proto.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardening-'));
  const dbFile = path.join(tmpDir, 'learn.db');
  const { initDb } = require(path.join(ROOT, 'lib', 'db.cjs'));
  const seed = initDb(dbFile);
  const user = seed.upsertUser({ provider: 'google', providerUserId: 'seed-1', email: null, name: 'Seed' });
  const session = seed.createSession(user.id);
  const prod = await spawnServer({
    NODE_ENV: 'production',
    SESSION_SECRET: 'hardening-prod-secret',
    DB_PATH: dbFile,
    PUBLIC_ORIGIN: 'https://learn.example.test'
  });
  try {
    const res = await fetch(`${prod.origin}/auth/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Cookie: `sid=${session.token}`,
        'X-CSRF-Token': session.csrf_token,
        Origin: 'https://learn.example.test'
      }
    });
    assert.equal(res.status, 303, `production logout should succeed, got ${res.status}`);
    assert.match(res.headers.get('set-cookie') || '', /sid=;.*; Secure/, 'production logout cookie must be Secure');
    console.log('✓ Production session cookies are Secure without relying on x-forwarded-proto');
  } finally {
    prod.proc.kill('SIGTERM');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log('>>> All request hardening tests passed <<<');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
