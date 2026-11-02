// Unit and API test suite for Agent Tool Track Selection & Shared Practice (Ticket 11)
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { initDb } = require('../../lib/db.cjs');

console.log('--- Starting Agent Tool Track Unit Tests (Ticket 11) ---');

// Test 1: Database persistence for user track
console.log('1. Testing DB user track persistence and multi-user isolation...');
const db = initDb(':memory:');

// Create two users
const userAlice = db.upsertUser({
  provider: 'google',
  providerUserId: 'test-google-alice',
  email: 'alice@example.com',
  name: 'Alice Walker'
});
const userBob = db.upsertUser({
  provider: 'google',
  providerUserId: 'test-google-bob',
  email: 'bob@example.com',
  name: 'Bob Smith'
});

// Initially no track selected
assert.strictEqual(db.getUserTrack(userAlice.id), null, 'Alice should have no initial track');
assert.strictEqual(db.getUserTrack(userBob.id), null, 'Bob should have no initial track');

// Alice selects 'claude-code'
const setAlice = db.setUserTrack(userAlice.id, 'claude-code');
assert.strictEqual(setAlice, true, 'Setting Alice track should succeed');
assert.strictEqual(db.getUserTrack(userAlice.id), 'claude-code', 'Alice track should be claude-code');

// Bob selects 'deepseek-harness'
const setBob = db.setUserTrack(userBob.id, 'deepseek-harness');
assert.strictEqual(setBob, true, 'Setting Bob track should succeed');
assert.strictEqual(db.getUserTrack(userBob.id), 'deepseek-harness', 'Bob track should be deepseek-harness');

// Alice's track must not be changed by Bob's selection (Multi-user isolation)
assert.strictEqual(db.getUserTrack(userAlice.id), 'claude-code', 'Alice track must remain claude-code after Bob selection');

// Alice switches track to 'codex'
db.setUserTrack(userAlice.id, 'codex');
assert.strictEqual(db.getUserTrack(userAlice.id), 'codex', 'Alice track should be updated to codex');
assert.strictEqual(db.getUserTrack(userBob.id), 'deepseek-harness', 'Bob track must remain deepseek-harness');

// Test 2: Shared progress preservation across track change
console.log('2. Testing shared progress preservation when track changes...');
const sharedActivityId = 'agent-common-practice-01';

// Save progress on shared exercise while on track 'codex'
const saveRes = db.saveProgress({
  userId: userAlice.id,
  activityId: sharedActivityId,
  draftText: 'Decomposed 3 bounded tasks with test checks.',
  completed: 1
});
assert.strictEqual(saveRes.success, true, 'Progress should be saved');

// Alice switches to 'pi-agent'
db.setUserTrack(userAlice.id, 'pi-agent');
assert.strictEqual(db.getUserTrack(userAlice.id), 'pi-agent');

// Verify that shared exercise progress is intact and NOT reset
const aliceProgress = db.getProgress(userAlice.id, sharedActivityId);
assert.ok(aliceProgress, 'Alice progress on shared exercise must exist');
assert.strictEqual(aliceProgress.completed, 1, 'Completion status must be preserved');
assert.strictEqual(aliceProgress.draft_text, 'Decomposed 3 bounded tasks with test checks.', 'Draft text must be preserved');

console.log('>>> All Slice 1 DB user track tests passed! <<<');

// Slice 2: HTTP API Endpoints and Validation
const http = require('node:http');
const { spawn } = require('node:child_process');
const net = require('node:net');

const ROOT = path.resolve(__dirname, '../..');

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function startTestServer() {
  const env = Object.assign({}, process.env, {
    DB_PATH: ':memory:',
    AUTH_ADAPTER: 'test'
  });

  const serverProcess = spawn('node', ['server.cjs', '0'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const portPromise = new Promise((resolve, reject) => {
    let output = '';
    serverProcess.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/Server listening on (?:http:\/\/127\.0\.0\.1:|port )(\d+)/i) ||
                    output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        resolve(parseInt(match[1], 10));
      }
    });
    serverProcess.stderr.on('data', chunk => {
      console.error('[server stderr]', chunk.toString());
    });
    serverProcess.on('error', reject);
    serverProcess.on('exit', code => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}. Output: ${output}`));
      }
    });
  });

  const port = await withTimeout(portPromise, 8000, 'server startup');

  // Probe port
  await withTimeout(new Promise((resolve) => {
    const probe = () => {
      const client = net.connect({ host: '127.0.0.1', port });
      client.once('connect', () => { client.destroy(); resolve(); });
      client.once('error', () => { setTimeout(probe, 50); });
    };
    probe();
  }), 5000, 'port probe');

  return {
    port,
    process: serverProcess
  };
}

async function makeRequest(port, method, reqPath, body = null, cookie = null) {
  const secured = await require('../helpers/csrf.cjs')(`http://127.0.0.1:${port}`, {
    method, headers: cookie ? { Cookie: cookie } : {}
  });
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const headers = { ...secured.headers };
    if (postData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runApiTests() {
  console.log('3. Testing HTTP API endpoints for track selection...');
  const { port, process: serverProc } = await startTestServer();

  try {
    // 3.1 GET /api/tracks returns registry
    const tracksRes = await makeRequest(port, 'GET', '/api/tracks');
    assert.strictEqual(tracksRes.statusCode, 200, 'GET /api/tracks should return 200');
    assert.ok(Array.isArray(tracksRes.json.tracks), 'Should return array of tracks');
    assert.strictEqual(tracksRes.json.tracks.length, 4, 'Should offer exactly 4 alternative tracks');

    const trackIds = tracksRes.json.tracks.map(t => t.id);
    assert.ok(trackIds.includes('claude-code'));
    assert.ok(trackIds.includes('codex'));
    assert.ok(trackIds.includes('pi-agent'));
    assert.ok(trackIds.includes('deepseek-harness'));

    // Check that pending state is visible
    const pendingTracks = tracksRes.json.tracks.filter(t => t.verification_state === 'pending');
    assert.ok(pendingTracks.length >= 3, 'Untested tracks must be visibly pending');

    // 3.2 GET /api/track without authentication
    const guestGetRes = await makeRequest(port, 'GET', '/api/track');
    assert.strictEqual(guestGetRes.statusCode, 200);

    // 3.3 POST /api/track with invalid track rejected
    const invalidRes = await makeRequest(port, 'POST', '/api/track', { track: 'unsupported-tool-xyz' });
    assert.strictEqual(invalidRes.statusCode, 400, 'Invalid track should be rejected with 400');
    assert.ok(invalidRes.json.error.includes('Invalid agent tool track'), 'Error message should explain invalid track');

    // 3.4 POST /api/track guest mode
    const guestPostRes = await makeRequest(port, 'POST', '/api/track', { track: 'codex' });
    assert.strictEqual(guestPostRes.statusCode, 200);
    assert.strictEqual(guestPostRes.json.selected_track, 'codex');

    // Authenticate Alice via mock callback
    const aliceCallback = await makeRequest(port, 'GET', '/auth/google/callback?code=mock-code-alice&state=mock-state');
    // Note: mock OAuth needs valid state token, let's initiate OAuth flow
    const oauthInit = await makeRequest(port, 'GET', '/auth/google');
    const stateMatch = oauthInit.headers.location.match(/state=([^&]+)/);
    assert.ok(stateMatch, 'OAuth init should provide state');
    const aliceState = decodeURIComponent(stateMatch[1]);

    const aliceCbRes = await makeRequest(port, 'GET', `/auth/google/callback?code=mock-code-alice&state=${aliceState}`);
    const aliceCookie = aliceCbRes.headers['set-cookie'][0].split(';')[0];

    // Authenticate Bob
    const oauthInitBob = await makeRequest(port, 'GET', '/auth/google');
    const bobState = decodeURIComponent(oauthInitBob.headers.location.match(/state=([^&]+)/)[1]);
    const bobCbRes = await makeRequest(port, 'GET', `/auth/google/callback?code=mock-code-bob&state=${bobState}`);
    const bobCookie = bobCbRes.headers['set-cookie'][0].split(';')[0];

    // Get Alice & Bob user IDs from /api/auth/me
    const aliceMe = await makeRequest(port, 'GET', '/api/auth/me', null, aliceCookie);
    const bobMe = await makeRequest(port, 'GET', '/api/auth/me', null, bobCookie);
    const aliceId = aliceMe.json.user.id;
    const bobId = bobMe.json.user.id;

    // 3.5 Alice sets track to 'claude-code'
    const aliceSetTrack = await makeRequest(port, 'POST', '/api/track', { track: 'claude-code' }, aliceCookie);
    assert.strictEqual(aliceSetTrack.statusCode, 200);
    assert.strictEqual(aliceSetTrack.json.selected_track, 'claude-code');

    // 3.6 Bob sets track to 'deepseek-harness'
    const bobSetTrack = await makeRequest(port, 'POST', '/api/track', { track: 'deepseek-harness' }, bobCookie);
    assert.strictEqual(bobSetTrack.statusCode, 200);
    assert.strictEqual(bobSetTrack.json.selected_track, 'deepseek-harness');

    // 3.7 Verify multi-user isolation on GET /api/track
    const aliceGetTrack = await makeRequest(port, 'GET', '/api/track', null, aliceCookie);
    const bobGetTrack = await makeRequest(port, 'GET', '/api/track', null, bobCookie);
    assert.strictEqual(aliceGetTrack.json.selected_track, 'claude-code');
    assert.strictEqual(bobGetTrack.json.selected_track, 'deepseek-harness');

    // 3.8 Multi-user isolation security enforcement:
    // Bob attempts to forge Alice's user_id in POST /api/track
    const bobSpoofAlice = await makeRequest(port, 'POST', '/api/track', {
      track: 'pi-agent',
      user_id: aliceId
    }, bobCookie);
    assert.strictEqual(bobSpoofAlice.statusCode, 403, 'Cross-user track manipulation must return 403');

    // Alice's track remains claude-code
    const aliceCheckTrack = await makeRequest(port, 'GET', '/api/track', null, aliceCookie);
    assert.strictEqual(aliceCheckTrack.json.selected_track, 'claude-code');

    // 3.9 Guessed identifier protection:
    // Bob attempts to read Alice's track via /api/users/:userId/track
    const bobReadAlice = await makeRequest(port, 'GET', `/api/users/${aliceId}/track`, null, bobCookie);
    assert.strictEqual(bobReadAlice.statusCode, 403, 'Reading another user track must return 403');

    // Alice reads her own track via /api/users/:userId/track
    const aliceReadSelf = await makeRequest(port, 'GET', `/api/users/${aliceId}/track`, null, aliceCookie);
    assert.strictEqual(aliceReadSelf.statusCode, 200);
    assert.strictEqual(aliceReadSelf.json.selected_track, 'claude-code');

    console.log('>>> All Slice 2 HTTP API tests passed! <<<');
  } finally {
    serverProc.kill('SIGTERM');
  }
}

runApiTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
