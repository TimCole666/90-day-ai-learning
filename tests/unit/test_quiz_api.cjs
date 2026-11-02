// Integration test for Quiz submission API, deterministic grading, and mastery separation
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const { initDb } = require('../../lib/db.cjs');

// Spin up a test server instance using in-memory DB
function createTestServer() {
  const db = initDb(':memory:');
  process.env.DB_PATH = ':memory:';
  
  // We require the server module
  // Note: server.cjs starts listening when loaded, so we can require it and use its address
  delete require.cache[require.resolve('../../server.cjs')];
  delete require.cache[require.resolve('../../lib/db.cjs')];
  
  // We can test server routes via http.request
}

async function request(serverUrl, options, body = null) {
  options = await require('../helpers/csrf.cjs')(serverUrl, options);
  return new Promise((resolve, reject) => {
    const u = new URL(options.path || '/', serverUrl);
    const reqOpts = {
      method: options.method || 'GET',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: options.headers || {}
    };

    const req = http.request(reqOpts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          text: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (body) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

async function runApiTests() {
  console.log('--- Running Quiz & Mastery API Integration Tests ---');
  
  process.env.DB_PATH = ':memory:';
  process.env.PORT = '0';
  // The mock identity provider only runs when the test adapter is explicitly
  // selected outside production; declare it here so the auth seam stays usable.
  process.env.AUTH_ADAPTER = 'test';
  const server = require('../../server.cjs');
  
  // Wait for server to listen
  await new Promise(resolve => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  console.log(`Test server running at ${origin}`);

  // Create two users and sessions directly via db in server or via auth callbacks
  // Let's create Alice and Bob sessions via the mock callback
  // 1. Authenticate Alice
  // Start OAuth to get valid state
  const startAlice = await request(origin, { path: '/auth/google' });
  assert.equal(startAlice.statusCode, 302);
  const locAlice = new URL(startAlice.headers.location, origin);
  const stateAlice = locAlice.searchParams.get('state');

  // Callback for Alice
  const cbAlice = await request(origin, { path: `/auth/google/callback?code=mock-code-alice&state=${stateAlice}` });
  assert.equal(cbAlice.statusCode, 302);
  const aliceCookie = cbAlice.headers['set-cookie'][0].split(';')[0];
  assert.ok(aliceCookie.startsWith('sid='));

  // 2. Authenticate Bob
  const startBob = await request(origin, { path: '/auth/google' });
  const locBob = new URL(startBob.headers.location, origin);
  const stateBob = locBob.searchParams.get('state');
  const cbBob = await request(origin, { path: `/auth/google/callback?code=mock-code-bob&state=${stateBob}` });
  assert.equal(cbBob.statusCode, 302);
  const bobCookie = cbBob.headers['set-cookie'][0].split(';')[0];

  const actId = 'day-01-act-01';
  const currentRevision = JSON.parse(fs.readFileSync(path.join(__dirname, '../../curriculum/days/day-01.json'))).activities.find(activity => activity.id === actId).content_revision;

  // Test 1: Submit quiz without auth -> 401
  console.log('1. Testing unauthenticated submission...');
  const resUnauth = await request(origin, {
    method: 'POST',
    path: '/api/quiz/submit'
  }, {
    activity_id: actId,
    content_revision: currentRevision,
    assistance_mode: 'independent',
    answers: { q1: 'b', q2: 'c', q3: 'b' }
  });
  assert.equal(resUnauth.statusCode, 401);

  // Test 2: Submit with invalid assistance mode -> 400
  console.log('2. Testing invalid assistance mode rejection...');
  const resInvalidMode = await request(origin, {
    method: 'POST',
    path: '/api/quiz/submit',
    headers: { 'Cookie': aliceCookie }
  }, {
    activity_id: actId,
    content_revision: currentRevision,
    assistance_mode: 'unknown_mode',
    answers: { q1: 'b', q2: 'c', q3: 'b' }
  });
  assert.equal(resInvalidMode.statusCode, 400);

  // Test 3: Client cannot specify a different user_id (isolation attack) -> 403
  console.log('3. Testing client user_id spoofing rejection...');
  const resSpoof = await request(origin, {
    method: 'POST',
    path: '/api/quiz/submit',
    headers: { 'Cookie': aliceCookie }
  }, {
    user_id: 'some-other-uuid',
    activity_id: actId,
    content_revision: currentRevision,
    assistance_mode: 'independent',
    answers: { q1: 'b', q2: 'c', q3: 'b' }
  });
  assert.equal(resSpoof.statusCode, 403);

  // A previously opened page must not be relabeled with the deployed revision.
  for (const revision of [undefined, 'stale-before-this-deployment']) {
    const rejected = await request(origin, {
      method: 'POST', path: '/api/quiz/submit', headers: { Cookie: aliceCookie }
    }, {
      activity_id: actId, assistance_mode: 'independent',
      content_revision: revision, answers: { q1: 'b', q2: 'c', q3: 'b' }
    });
    assert.equal(rejected.statusCode, revision === undefined ? 400 : 409, 'An old or revisionless page cannot mint current evidence');
    assert.equal(rejected.json.code, revision === undefined ? 'content_revision_required' : 'stale_content_revision');
  }
  const beforeValid = await request(origin, { path: `/api/quiz/attempts?activityId=${actId}`, headers: { Cookie: aliceCookie } });
  assert.equal(beforeValid.json.summary.attempts.length, 0, 'Rejected revisions must not create attempt records');

  // Test 4: Alice submits perfect answers with 'independent' mode -> 100% score, passed = true
  console.log('4. Testing deterministic grading for perfect submission (Independent)...');
  const resAlicePerfect = await request(origin, {
    method: 'POST',
    path: '/api/quiz/submit',
    headers: { 'Cookie': aliceCookie }
  }, {
    activity_id: actId,
    content_revision: currentRevision,
    assistance_mode: 'independent',
    answers: { q1: 'b', q2: 'c', q3: 'b' }
  });
  assert.equal(resAlicePerfect.statusCode, 200);
  assert.equal(resAlicePerfect.json.success, true);
  assert.equal(resAlicePerfect.json.score, 100);
  assert.equal(resAlicePerfect.json.passed, true);
  assert.equal(resAlicePerfect.json.assistance_mode, 'independent');
  assert.equal(resAlicePerfect.json.results.length, 3);
  assert.equal(resAlicePerfect.json.results.every(r => r.correct), true);

  // Test 5: Alice submits imperfect answers with 'agent_assisted' mode -> 67% score, passed = false
  console.log('5. Testing imperfect answers (Agent-Assisted)...');
  const resAliceImperfect = await request(origin, {
    method: 'POST',
    path: '/api/quiz/submit',
    headers: { 'Cookie': aliceCookie }
  }, {
    activity_id: actId,
    content_revision: currentRevision,
    assistance_mode: 'agent_assisted',
    answers: { q1: 'a', q2: 'c', q3: 'b' }
  });
  assert.equal(resAliceImperfect.statusCode, 200);
  assert.equal(resAliceImperfect.json.score, 67);
  assert.equal(resAliceImperfect.json.passed, false);
  assert.equal(resAliceImperfect.json.assistance_mode, 'agent_assisted');

  // Test 6: Query attempts for Alice
  console.log('6. Testing query attempts and mastery summary for Alice...');
  const resAliceAttempts = await request(origin, {
    method: 'GET',
    path: `/api/quiz/attempts?activityId=${actId}`,
    headers: { 'Cookie': aliceCookie }
  });
  assert.equal(resAliceAttempts.statusCode, 200);
  assert.equal(resAliceAttempts.json.summary.attempts.length, 2);
  assert.equal(resAliceAttempts.json.summary.has_independent_pass, true);
  assert.equal(resAliceAttempts.json.summary.has_agent_assisted_pass, false); // attempt 2 failed
  assert.equal(resAliceAttempts.json.summary.self_reported_completed, false);

  // Test 7: Multi-user isolation - Bob has no attempts and cannot read Alice's attempts
  console.log('7. Testing multi-user isolation with Bob...');
  const resBobAttempts = await request(origin, {
    method: 'GET',
    path: `/api/quiz/attempts?activityId=${actId}`,
    headers: { 'Cookie': bobCookie }
  });
  assert.equal(resBobAttempts.statusCode, 200);
  assert.equal(resBobAttempts.json.summary.attempts.length, 0);
  assert.equal(resBobAttempts.json.summary.has_independent_pass, false);

  // Guessed user ID attempt query
  const resAliceInfo = await request(origin, { path: '/api/auth/me', headers: { 'Cookie': aliceCookie } });
  const aliceUserId = resAliceInfo.json.user.id;
  const resGuessed = await request(origin, {
    method: 'GET',
    path: `/api/users/${aliceUserId}/quiz-attempts`,
    headers: { 'Cookie': bobCookie }
  });
  assert.equal(resGuessed.statusCode, 403, 'Bob must not access Alice quiz attempts endpoint');

  // Test 8: Self-reported checkbox completion cannot mint verified quiz evidence
  console.log('8. Testing that self-reported checkbox completion cannot mint verified quiz evidence...');
  const resBobCheckbox = await request(origin, {
    method: 'POST',
    path: '/api/progress',
    headers: { 'Cookie': bobCookie }
  }, {
    activity_id: actId,
    draft_text: 'Bob checked completion box',
    completed: true
  });
  assert.equal(resBobCheckbox.statusCode, 200);

  const resBobCheckSummary = await request(origin, {
    method: 'GET',
    path: `/api/quiz/attempts?activityId=${actId}`,
    headers: { 'Cookie': bobCookie }
  });
  assert.equal(resBobCheckSummary.json.summary.self_reported_completed, true);
  assert.equal(resBobCheckSummary.json.summary.has_independent_pass, false, 'Checkbox cannot mint independent pass');
  assert.equal(resBobCheckSummary.json.summary.has_agent_assisted_pass, false, 'Checkbox cannot mint agent-assisted pass');

  // Test 9: Ledger-declared quizzes must resolve for days 04-06 (content editions
  // ship a quiz for every activity; the ledger grading definition must exist or
  // POST /api/quiz/submit 404s). The correct option is 'a' in every stub check.
  console.log('9. Testing quiz submission resolves on Study Days 04-06...');
  for (const dayNum of ['04', '05', '06']) {
    for (const actNum of ['01', '02', '03', '04']) {
      const dayAct = `day-${dayNum}-act-${actNum}`;
      const res = await request(origin, {
        method: 'POST',
        path: '/api/quiz/submit',
        headers: { 'Cookie': aliceCookie }
      }, {
        activity_id: dayAct,
        content_revision: JSON.parse(fs.readFileSync(path.join(__dirname, `../../curriculum/days/day-${dayNum}.json`))).activities.find(activity => activity.id === dayAct).content_revision,
        assistance_mode: 'independent',
        answers: { [`day-${dayNum}-act-${actNum}-q1`]: 'a' }
      });
      assert.equal(res.statusCode, 200, `${dayAct} quiz submission must not 404`);
      assert.equal(res.json.passed, true, `${dayAct} correct answer must grade as pass`);
    }
  }

  server.close();
  console.log('>>> All Quiz API Integration Tests Passed! <<<');
}

runApiTests().catch(err => {
  console.error('Quiz API test failed:', err);
  process.exit(1);
});
