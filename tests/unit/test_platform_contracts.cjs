// Public HTTP contracts: local fixture identities only, never live OAuth evidence.
const assert = require('node:assert/strict');
const http = require('node:http');

function request(origin, options, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path || '/', origin);
    const req = http.request({
      method: options.method || 'GET', hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, headers: options.headers || {}
    }, res => {
      res.setEncoding('utf8');
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch {}
        resolve({ statusCode: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body === undefined) {
      req.end();
      return;
    }
    const payload = JSON.stringify(body);
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Content-Length', Buffer.byteLength(payload));
    req.end(payload);
  });
}

async function authenticate(origin, code) {
  const start = await request(origin, { path: '/auth/google' });
  assert.equal(start.statusCode, 302);
  const state = new URL(start.headers.location, origin).searchParams.get('state');
  const callback = await request(origin, { path: `/auth/google/callback?code=${code}&state=${state}` });
  assert.equal(callback.statusCode, 302);
  const cookie = callback.headers['set-cookie'][0].split(';')[0];
  const page = await request(origin, { path: '/en/day-01', headers: { Cookie: cookie } });
  assert.equal(page.statusCode, 200);
  const match = page.text.match(/<meta name="csrf-token" content="([^"]+)"/);
  assert.ok(match, 'Authenticated lesson exposes its CSRF token');
  return { cookie, token: match[1], headers: { Cookie: cookie, 'X-CSRF-Token': match[1] } };
}

async function run() {
  process.env.DB_PATH = ':memory:';
  process.env.PORT = '0';
  process.env.AUTH_ADAPTER = 'test';
  const server = require('../../server.cjs');
  try {
    await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const alice = await authenticate(origin, 'mock-code-alice');
    const bob = await authenticate(origin, 'mock-code-bob');
    assert.notEqual(alice.token, bob.token, 'CSRF tokens must be session-specific');

    for (const lang of ['en', 'ja', 'zh-Hans', 'zh-Hant']) {
      for (const route of ['day-01', 'agent-track', 'diagnostics', 'export', 'calendar']) {
        const pathname = `/${lang}/${route}`;
        for (const authenticated of [false, true]) {
          const page = await request(origin, { path: pathname, headers: authenticated ? alice.headers : {} });
          assert.equal(page.statusCode, 200, pathname);
          assert.match(page.text, /<\/head>\s*<body>/, `${pathname} preserves HTML structure`);
          assert.match(page.text, /class="brand"/, `${pathname} preserves its navigation`);
          const match = page.text.match(/<meta name="csrf-token" content="([^"]+)"/);
          if (authenticated && route !== 'calendar') assert.equal(match?.[1], alice.token, pathname);
          else assert.equal(match, null, `${pathname} must not expose a guest token`);
        }
      }
    }
    console.log('PASS: session-only metadata and page structure across four locales');

    const paths = ['/api/progress', '/api/track', '/api/quiz/submit', '/api/project/submit', '/api/diagnostics/submit'];
    for (const path of paths) {
      for (const token of [undefined, '', 'wrong-token', bob.token]) {
        const headers = { Cookie: alice.cookie };
        if (token !== undefined) headers['X-CSRF-Token'] = token;
        const rejected = await request(origin, { method: 'POST', path, headers }, {});
        assert.equal(rejected.statusCode, 403, `${path}: missing/wrong/foreign token`);
        assert.deepEqual(rejected.json, { error: 'csrf' });
      }
      if (path !== '/api/track') {
        const guest = await request(origin, { method: 'POST', path }, {});
        assert.equal(guest.statusCode, 401, `${path}: unauthenticated write`);
      }
    }
    const before = await request(origin, { path: '/api/export', headers: alice.headers });
    for (const collection of ['progress', 'quiz_attempts', 'project_submissions', 'diagnostics_attempts']) {
      if (before.json.records[collection] !== undefined) assert.deepEqual(before.json.records[collection], []);
    }
    assert.equal(before.json.records.track_preference, null);
    console.log('PASS: all five POST routes reject missing, empty, wrong, and foreign tokens');

    const postProgress = body => request(origin, { method: 'POST', path: '/api/progress', headers: alice.headers }, body);
    for (const activityId of [undefined, null, 0, {}, [], '', 'Bad-ID', 'bad id', '../day-01', 'a'.repeat(129), 'day-99-act-99']) {
      const invalid = await postProgress({ activity_id: activityId, draft_text: 'rejected' });
      assert.equal(invalid.statusCode, 400, `Invalid activity identifier: ${JSON.stringify(activityId)}`);
    }
    const progress = { activity_id: 'day-01-act-01', draft_text: '\u00e9'.repeat(32768), completed: false, version: 0 };
    const saved = await postProgress(progress);
    assert.equal(saved.statusCode, 200, 'Exactly 65536 UTF-8 bytes must be accepted');
    for (const draftText of [`${progress.draft_text}a`, 'a'.repeat(65537)]) {
      const oversized = await postProgress({ ...progress, draft_text: draftText, version: saved.json.version });
      assert.equal(oversized.statusCode, 413, '65537 UTF-8 bytes must be rejected');
    }
    const unchanged = await request(origin, { path: '/api/progress', headers: alice.headers });
    assert.deepEqual(Object.keys(unchanged.json.progress), ['day-01-act-01']);
    assert.equal(unchanged.json.progress['day-01-act-01'].draft_text, progress.draft_text);
    assert.equal(unchanged.json.progress['day-01-act-01'].version, saved.json.version);
    const bobProgress = await request(origin, { path: '/api/progress', headers: bob.headers });
    assert.deepEqual(bobProgress.json.progress, {});
    console.log('PASS: identifier format and UTF-8 byte boundaries reject without mutation');

    const guestTrack = await request(origin, { method: 'POST', path: '/api/track' }, { track: 'pi-agent' });
    assert.equal(guestTrack.statusCode, 200);
    const validTracks = ['claude-code', 'codex', 'pi-agent', 'deepseek-harness'];
    for (const track of validTracks) {
      const selected = await request(origin, { method: 'POST', path: '/api/track', headers: alice.headers }, { track });
      assert.equal(selected.statusCode, 200);
      assert.equal(selected.json.selected_track, track);
    }
    const project = { project_id: 'day-01-act-01', assistance_mode: 'independent', text_notes: 'Local fixture, not verified evidence' };
    for (const track of [null, ...validTracks]) {
      const accepted = await request(origin, { method: 'POST', path: '/api/project/submit', headers: alice.headers }, { ...project, selected_track: track });
      assert.equal(accepted.statusCode, 200, `Canonical selected_track: ${track}`);
      assert.equal(accepted.json.submission.selected_track, track);
      assert.equal(accepted.json.submission.evidence_status, 'self_reported');
    }
    for (const track of ['', 'not-a-track', 'claude_code', false, 0, [], {}]) {
      const invalid = await request(origin, { method: 'POST', path: '/api/project/submit', headers: alice.headers }, { ...project, selected_track: track });
      assert.equal(invalid.statusCode, 400, `Invalid project track: ${JSON.stringify(track)}`);
    }
    console.log('PASS: guest track selection, canonical track IDs, and submission evidence safeguards');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log('Platform security contract tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
