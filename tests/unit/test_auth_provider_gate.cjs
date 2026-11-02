// Unit test: the mock/test OAuth provider must be gated behind an explicit
// non-production opt-in. The production artifact (config.production.json)
// must not be able to enable it; production only permits real providers.
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      res.resume();
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
  });
}

function waitForServer(proc, label) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`${label}: server start timeout. Output: ${output}`)), 8000);
    proc.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); resolve(parseInt(match[1], 10)); }
    });
    proc.once('exit', code => { clearTimeout(timer); reject(new Error(`${label}: exited with code ${code}. Output: ${output}`)); });
    proc.once('error', err => { clearTimeout(timer); reject(err); });
  });
}

async function probeUntilReady(port) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const ok = await new Promise(resolve => {
      const client = net.connect({ host: '127.0.0.1', port });
      client.once('connect', () => { client.destroy(); resolve(true); });
      client.once('error', () => { client.destroy(); resolve(false); });
    });
    if (ok) return;
    await new Promise(r => setTimeout(r, 40));
  }
  throw new Error('server did not accept connections');
}

async function spawnServer(env) {
  const proc = spawn('node', ['server.cjs', '0'], {
    cwd: ROOT,
    env: { ...process.env, DB_PATH: ':memory:', PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const port = await waitForServer(proc, JSON.stringify(env));
  await probeUntilReady(port);
  return { proc, origin: `http://127.0.0.1:${port}` };
}

async function run() {
  console.log('--- Running Auth Provider Gate Tests ---');

  // 1. Production config cannot enable the mock provider, even when the
  // test adapter variable is explicitly set (defense against leaked config).
  {
    const { proc, origin } = await spawnServer({
      NODE_ENV: 'production',
      SESSION_SECRET: 'gate-test-secret',
      AUTH_ADAPTER: 'test'
    });
    try {
      const tp = await get(`${origin}/auth/test-provider?provider=google&state=x`);
      assert.notEqual(tp.statusCode, 200, 'production must not serve the mock test provider');
      const g = await get(`${origin}/auth/google`);
      const loc = g.headers.location || '';
      assert.ok(!loc.includes('/auth/test-provider'), `production /auth/google must not redirect to test provider (got ${loc})`);
      console.log('✓ Production mode rejects the mock test provider');
    } finally {
      proc.kill('SIGTERM');
    }
  }

  // 2. Non-production without the explicit flag must not silently enable it.
  {
    const { proc, origin } = await spawnServer({ NODE_ENV: 'development' });
    try {
      const tp = await get(`${origin}/auth/test-provider?provider=google&state=x`);
      assert.notEqual(tp.statusCode, 200, 'mock provider requires explicit opt-in even outside production');
      const g = await get(`${origin}/auth/google`);
      const loc = g.headers.location || '';
      assert.ok(!loc.includes('/auth/test-provider'), `unflagged /auth/google must not redirect to test provider (got ${loc})`);
      console.log('✓ Non-production without the flag rejects the mock test provider');
    } finally {
      proc.kill('SIGTERM');
    }
  }

  // 3. Explicit test opt-in outside production keeps the mock usable.
  {
    const { proc, origin } = await spawnServer({ NODE_ENV: 'development', AUTH_ADAPTER: 'test' });
    try {
      const g = await get(`${origin}/auth/google`);
      const loc = g.headers.location || '';
      assert.ok(loc.includes('/auth/test-provider'), `test adapter should redirect to test provider (got ${loc})`);
      console.log('✓ Explicit test adapter enables the mock provider outside production');
    } finally {
      proc.kill('SIGTERM');
    }
  }

  console.log('>>> All auth provider gate tests passed <<<');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
