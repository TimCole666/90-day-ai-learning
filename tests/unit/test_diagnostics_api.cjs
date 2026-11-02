// Integration tests for Diagnostics API & Review Plan generation (Ticket 08)
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

async function runDiagnosticsApiTests() {
  console.log('--- Running Diagnostics & Review Plan API Integration Tests ---');

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

  // 1. Authenticate Alice & Bob
  const startAlice = await request(origin, { path: '/auth/google' });
  const locAlice = new URL(startAlice.headers.location, origin);
  const stateAlice = locAlice.searchParams.get('state');
  const cbAlice = await request(origin, { path: `/auth/google/callback?code=mock-code-alice&state=${stateAlice}` });
  const aliceCookie = cbAlice.headers['set-cookie'][0].split(';')[0];

  const startBob = await request(origin, { path: '/auth/google' });
  const locBob = new URL(startBob.headers.location, origin);
  const stateBob = locBob.searchParams.get('state');
  const cbBob = await request(origin, { path: `/auth/google/callback?code=mock-code-bob&state=${stateBob}` });
  const bobCookie = cbBob.headers['set-cookie'][0].split(';')[0];

  // 2. Fetch diagnostic questionnaire definition
  console.log('1. Testing GET /api/diagnostics...');
  const diagRes = await request(origin, {
    path: '/api/diagnostics?lang=en',
    headers: { Cookie: aliceCookie }
  });
  assert.equal(diagRes.statusCode, 200);
  assert.ok(diagRes.json.diagnostic);
  assert.ok(Array.isArray(diagRes.json.diagnostic.questions));
  assert.equal(diagRes.json.diagnostic.questions.length, 5);

  // 3. Unauthenticated submit rejection
  console.log('2. Testing unauthenticated submission rejection...');
  const unauthRes = await request(origin, {
    method: 'POST',
    path: '/api/diagnostics/submit'
  }, { answers: { q1: 'b' } });
  assert.equal(unauthRes.statusCode, 401);

  // 4. Client identity spoofing rejection
  console.log('3. Testing client user_id spoofing rejection...');
  const spoofRes = await request(origin, {
    method: 'POST',
    path: '/api/diagnostics/submit',
    headers: { Cookie: aliceCookie }
  }, {
    user_id: 'spoofed-target-user-id',
    answers: { q1: 'b' },
    assistance_mode: 'independent'
  });
  assert.equal(spoofRes.statusCode, 403);

  // 5. Unverified skip checkbox claim without demonstrated check
  console.log('4. Testing rejection of unverified skip checkbox claims...');
  const unverifiedSkipRes = await request(origin, {
    method: 'POST',
    path: '/api/diagnostics/submit',
    headers: { Cookie: aliceCookie }
  }, {
    assistance_mode: 'independent',
    claimed_skips: ['python_fundamentals'],
    // Missing actual answers or incorrect answers
    answers: { q1: 'a', q2: 'a' },
    lang: 'en'
  });
  assert.equal(unverifiedSkipRes.statusCode, 200);
  assert.equal(unverifiedSkipRes.json.recommended_plan.skip_recommendations[0].eligible, false);
  assert.match(
    unverifiedSkipRes.json.recommended_plan.skip_recommendations[0].guidance,
    /demonstrated mastery check/i,
    'Skip guidance must state that merely selecting an option does not certify prerequisite mastery'
  );

  // Invalid references are rejected before grading or persistence.
  const invalidReferenceRes = await request(origin, {
    method: 'POST',
    path: '/api/diagnostics/submit',
    headers: { Cookie: aliceCookie }
  }, {
    answers: { q999: 'b' },
    uncertain_questions: ['q999'],
    lang: 'en'
  });
  assert.equal(invalidReferenceRes.statusCode, 400);
  assert.match(invalidReferenceRes.json.error, /Invalid diagnostic reference/);

  // 6. Submitting diagnostic with gaps and uncertain concepts
  console.log('5. Testing actionable review plan generation for identified gaps...');
  // q1: wrong, q2: correct, q3: wrong, q4: correct, q5: uncertain
  const gapSubmitRes = await request(origin, {
    method: 'POST',
    path: '/api/diagnostics/submit',
    headers: { Cookie: aliceCookie }
  }, {
    assistance_mode: 'independent',
    answers: {
      q1: 'a', // wrong (py_mutability)
      q2: 'b', // correct (py_control_scope)
      q3: 'a', // wrong (math_calculus_derivatives)
      q4: 'b', // correct (math_linear_algebra_tensors)
      q5: 'b'  // correct answer, but marked uncertain
    },
    uncertain_questions: ['q5']
  });

  assert.equal(gapSubmitRes.statusCode, 200);
  const planData = gapSubmitRes.json;
  assert.equal(planData.success, true);
  assert.ok(planData.diagnostics_summary);
  assert.ok(planData.diagnostics_summary.gaps.includes('py_mutability'));
  assert.ok(planData.diagnostics_summary.gaps.includes('math_calculus_derivatives'));
  assert.ok(planData.diagnostics_summary.uncertain.includes('math_probability_loss'));

  // Verify review items structure
  assert.ok(Array.isArray(planData.items));
  assert.ok(planData.items.length >= 2, 'Should generate review items for gaps and uncertain concepts');

  for (const item of planData.items) {
    assert.ok(item.concept_id);
    assert.ok(item.activity_id, 'Must link to real curriculum activity ID');
    assert.ok(item.objective, 'Must specify explicit recovery objective');
    assert.ok(item.retry_condition, 'Must specify explicit retry condition');
    assert.ok(item.scheduled_review_day, 'Must schedule into planned review day');
    assert.ok(item.allocated_minutes > 0, 'Must have allocated active minutes');
    assert.ok(item.recovery_links && item.recovery_links.length > 0, 'Must have recovery links');
  }

  // Verify planned curriculum allocation constraint (budget fits into Day 07 / planned review days, 720 total hours maintained)
  assert.equal(planData.recommended_plan.mandatory_curriculum_hours_retained, 720);
  assert.equal(planData.recommended_plan.no_extra_hours_added, true);
  assert.ok(planData.recommended_plan.total_allocated_minutes <= 480);

  // 7. GET /api/diagnostics/review-plan persists for Alice
  console.log('6. Testing GET /api/diagnostics/review-plan persistence...');
  const getPlanAlice = await request(origin, {
    path: '/api/diagnostics/review-plan',
    headers: { Cookie: aliceCookie }
  });
  assert.equal(getPlanAlice.statusCode, 200);
  assert.equal(getPlanAlice.json.has_plan, true);
  assert.equal(getPlanAlice.json.plan.items.length, planData.items.length);

  // 8. Multi-user isolation: Bob should not see Alice's plan
  console.log('7. Testing Bob multi-user isolation...');
  const getPlanBob = await request(origin, {
    path: '/api/diagnostics/review-plan',
    headers: { Cookie: bobCookie }
  });
  assert.equal(getPlanBob.statusCode, 200);
  assert.equal(getPlanBob.json.has_plan, false);

  // Protected route check: Alice cannot access Bob's review plan directly
  const aliceAttemptBob = await request(origin, {
    path: `/api/users/mock-google-2/review-plan`,
    headers: { Cookie: aliceCookie }
  });
  assert.equal(aliceAttemptBob.statusCode, 403);

  // 9. Full independent pass generates evidence-based skip guidance
  console.log('8. Testing 100% pass generates evidence-based skip guidance...');
  const perfectSubmitRes = await request(origin, {
    method: 'POST',
    path: '/api/diagnostics/submit',
    headers: { Cookie: aliceCookie }
  }, {
    assistance_mode: 'independent',
    answers: {
      q1: 'b',
      q2: 'b',
      q3: 'b',
      q4: 'b',
      q5: 'b'
    },
    uncertain_questions: []
  });

  assert.equal(perfectSubmitRes.statusCode, 200);
  assert.equal(perfectSubmitRes.json.diagnostics_summary.score, 100);
  assert.equal(perfectSubmitRes.json.items.length, 0);

  const skips = perfectSubmitRes.json.recommended_plan.skip_recommendations;
  assert.ok(skips.length > 0, 'Should include skip recommendations when prerequisites are mastered');
  assert.ok(skips.every(s => s.eligible === true));
  assert.ok(skips.every(s => s.demonstrated_criteria.length > 0));
  assert.ok(skips.every(s => Array.isArray(s.recovery_material) && s.recovery_material.length > 0));

  console.log('>>> All Diagnostics API Integration Tests Passed! <<<');
  await new Promise(resolve => server.close(resolve));
}

runDiagnosticsApiTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
