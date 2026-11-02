// Integration test for Project Submission API, bounded constraints, multi-user isolation, and evidence status
const assert = require('node:assert/strict');
const http = require('node:http');

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
        } catch {}
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

async function runProjectSubmissionApiTests() {
  console.log('--- Running Project Submission API Integration Tests ---');

  process.env.DB_PATH = ':memory:';
  process.env.PORT = '0';
  // Declare the mock identity adapter explicitly; it is gated off by default.
  process.env.AUTH_ADAPTER = 'test';
  const server = require('../../server.cjs');

  await new Promise(resolve => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  console.log(`Test server running at ${origin}`);

  // 1. Authenticate Alice & Bob via OAuth mock flow
  const startAlice = await request(origin, { path: '/auth/google' });
  assert.equal(startAlice.statusCode, 302);
  const stateAlice = new URL(startAlice.headers.location, origin).searchParams.get('state');
  const cbAlice = await request(origin, { path: `/auth/google/callback?code=mock-code-alice&state=${stateAlice}` });
  assert.equal(cbAlice.statusCode, 302);
  const aliceCookie = cbAlice.headers['set-cookie'][0].split(';')[0];

  const startBob = await request(origin, { path: '/auth/google' });
  const stateBob = new URL(startBob.headers.location, origin).searchParams.get('state');
  const cbBob = await request(origin, { path: `/auth/google/callback?code=mock-code-bob&state=${stateBob}` });
  assert.equal(cbBob.statusCode, 302);
  const bobCookie = cbBob.headers['set-cookie'][0].split(';')[0];

  const projectId = 'day-01-act-01';
  const revision = require('../../curriculum/days/day-01.json').activities.find(activity => activity.id === projectId).content_revision;

  // 2. Unauthenticated submission rejected with 401
  console.log('1. Testing unauthenticated submission rejected...');
  const resUnauth = await request(origin, {
    path: '/api/project/submit',
    method: 'POST'
  }, {
    project_id: projectId,
    revision,
    assistance_mode: 'independent',
    repo_url: 'https://github.com/alice/repo'
  });
  assert.equal(resUnauth.statusCode, 401);

  // 3. Client user_id spoofing rejected with 403
  console.log('2. Testing client user_id spoofing rejected...');
  const resSpoof = await request(origin, {
    path: '/api/project/submit',
    method: 'POST',
    headers: { Cookie: aliceCookie }
  }, {
    user_id: 'target-victim-id',
    project_id: projectId,
    revision,
    assistance_mode: 'independent',
    repo_url: 'https://github.com/alice/repo'
  });
  assert.equal(resSpoof.statusCode, 403);

  // 4. Validation: Invalid assistance mode rejected with 400
  console.log('3. Testing invalid assistance mode rejection...');
  const resBadMode = await request(origin, {
    path: '/api/project/submit',
    method: 'POST',
    headers: { Cookie: aliceCookie }
  }, {
    project_id: projectId,
    revision,
    assistance_mode: 'magical_agent',
    repo_url: 'https://github.com/alice/repo'
  });
  assert.equal(resBadMode.statusCode, 400);

  // 5. Validation: Invalid URL schemes rejected with 400
  console.log('4. Testing unsafe URL schemes rejected...');
  for (const badSchemeUrl of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://anon@example.com']) {
    const resBadUrl = await request(origin, {
      path: '/api/project/submit',
      method: 'POST',
      headers: { Cookie: aliceCookie }
    }, {
      project_id: projectId,
      revision,
      assistance_mode: 'independent',
      repo_url: badSchemeUrl
    });
    assert.equal(resBadUrl.statusCode, 400, `Expected 400 for unsafe URL: ${badSchemeUrl}`);
  }

  // 6. Validation: Empty submission (no repo, no report, no notes) rejected with 400
  console.log('5. Testing empty submission rejected...');
  const resEmpty = await request(origin, {
    path: '/api/project/submit',
    method: 'POST',
    headers: { Cookie: aliceCookie }
  }, {
    project_id: projectId,
    revision,
    assistance_mode: 'independent',
    repo_url: '',
    report_url: '',
    text_notes: '   '
  });
  assert.equal(resEmpty.statusCode, 400);

  // 7. Successful submission by Alice
  console.log('6. Testing valid submission by Alice...');
  const resAliceSub = await request(origin, {
    path: '/api/project/submit',
    method: 'POST',
    headers: { Cookie: aliceCookie }
  }, {
    project_id: projectId,
    revision,
    assistance_mode: 'independent',
    selected_track: 'claude-code',
    repo_url: 'https://github.com/alice/ai-learning-lab',
    report_url: 'https://alice.dev/reports/day01',
    text_notes: 'Diagnostic trace and MRE completed.',
    evidence_status: 'verified_check' // Client attempts to spoof evidence_status!
  });

  assert.equal(resAliceSub.statusCode, 200);
  assert.ok(resAliceSub.json.success);
  assert.ok(resAliceSub.json.submission);
  assert.equal(resAliceSub.json.submission.project_id, projectId);
  assert.equal(resAliceSub.json.submission.repo_url, 'https://github.com/alice/ai-learning-lab');
  assert.equal(resAliceSub.json.submission.evidence_status, 'self_reported', 'Evidence status MUST remain self_reported despite client spoofing attempt');

  // 8. Query submission for Alice
  console.log('7. Testing retrieval of Alice submission...');
  const resGetAlice = await request(origin, {
    path: `/api/project/submission?projectId=${projectId}`,
    method: 'GET',
    headers: { Cookie: aliceCookie }
  });
  assert.equal(resGetAlice.statusCode, 200);
  assert.ok(resGetAlice.json.submission);
  assert.equal(resGetAlice.json.submission.repo_url, 'https://github.com/alice/ai-learning-lab');
  assert.equal(resGetAlice.json.summary.is_stale, false);

  // 9. Multi-user isolation: Bob cannot see Alice's submission
  console.log('8. Testing multi-user isolation with Bob...');
  const resGetBob = await request(origin, {
    path: `/api/project/submission?projectId=${projectId}`,
    method: 'GET',
    headers: { Cookie: bobCookie }
  });
  assert.equal(resGetBob.statusCode, 200);
  assert.equal(resGetBob.json.submission, null, 'Bob must receive null submission');

  // Guessed identifier protection
  const aliceUserId = resAliceSub.json.submission.user_id;
  const resGuessedId = await request(origin, {
    path: `/api/users/${aliceUserId}/project-submissions`,
    method: 'GET',
    headers: { Cookie: bobCookie }
  });
  assert.equal(resGuessedId.statusCode, 403, 'Bob must be forbidden from accessing Alice project submissions by guessed user_id');

  // 10. Update existing submission
  console.log('9. Testing update existing submission for Alice...');
  const resUpdate = await request(origin, {
    path: '/api/project/submit',
    method: 'POST',
    headers: { Cookie: aliceCookie }
  }, {
    project_id: projectId,
    revision,
    assistance_mode: 'agent_assisted',
    selected_track: 'deepseek-harness',
    repo_url: 'https://github.com/alice/ai-learning-lab-v2',
    report_url: 'https://alice.dev/reports/day01-v2',
    text_notes: 'Updated notes with DeepSeek harness reproduction.'
  });
  assert.equal(resUpdate.statusCode, 200);
  assert.equal(resUpdate.json.submission.id, resAliceSub.json.submission.id, 'Submission ID should be preserved on update');
  assert.equal(resUpdate.json.submission.assistance_mode, 'agent_assisted');
  assert.equal(resUpdate.json.submission.selected_track, 'deepseek-harness');
  assert.equal(resUpdate.json.submission.repo_url, 'https://github.com/alice/ai-learning-lab-v2');

  // 11. Bounded text: Excessive payload (> 4096 bytes) rejected without corrupting existing record
  console.log('10. Testing excessive payload (> 4096 bytes) rejection...');
  const hugeNotes = 'X'.repeat(5000);
  const resHuge = await request(origin, {
    path: '/api/project/submit',
    method: 'POST',
    headers: { Cookie: aliceCookie }
  }, {
    project_id: projectId,
    revision,
    assistance_mode: 'independent',
    repo_url: 'https://github.com/alice/corrupt-attempt',
    text_notes: hugeNotes
  });
  assert.equal(resHuge.statusCode, 400);

  // Verify existing record is unchanged
  const verifyAlice = await request(origin, {
    path: `/api/project/submission?projectId=${projectId}`,
    method: 'GET',
    headers: { Cookie: aliceCookie }
  });
  assert.equal(verifyAlice.json.submission.repo_url, 'https://github.com/alice/ai-learning-lab-v2');

  // 12. No server-side fetching verification:
  // Submitting an unroutable / closed link (http://127.0.0.1:59999/nonexistent) must not hang or fail
  console.log('11. Testing no server-side fetching of external links...');
  const t0 = Date.now();
  const resNoFetch = await request(origin, {
    path: '/api/project/submit',
    method: 'POST',
    headers: { Cookie: aliceCookie }
  }, {
    project_id: projectId,
    revision,
    assistance_mode: 'independent',
    repo_url: 'http://127.0.0.1:59999/unreachable-endpoint',
    text_notes: 'Valid local notes'
  });
  const elapsed = Date.now() - t0;
  assert.equal(resNoFetch.statusCode, 200);
  assert.ok(elapsed < 1000, `Save must be immediate without external HTTP fetch (elapsed: ${elapsed}ms)`);

  console.log('>>> All Project Submission API Integration Tests Passed! <<<');
  process.exit(0);
}

runProjectSubmissionApiTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
