// Public HTTP seam tests for the authenticated, owner-scoped portable export.
const assert = require('node:assert/strict');
const http = require('node:http');

async function request(origin, options, body) {
  options = await require('../helpers/csrf.cjs')(origin, options);
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, origin);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: options.method || 'GET', headers: options.headers || {} }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ statusCode: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) {
      const payload = JSON.stringify(body);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

async function login(origin, code) {
  const start = await request(origin, { path: '/auth/google' });
  const state = new URL(start.headers.location, origin).searchParams.get('state');
  const callback = await request(origin, { path: `/auth/google/callback?code=${code}&state=${state}` });
  return callback.headers['set-cookie'][0].split(';')[0];
}

(async () => {
  process.env.DB_PATH = ':memory:';
  process.env.PORT = '0';
  // Declare the mock identity adapter explicitly; it is gated off by default.
  process.env.AUTH_ADAPTER = 'test';
  const server = require('../../server.cjs');
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const alice = await login(origin, 'mock-code-alice');
  const bob = await login(origin, 'mock-code-bob');

  const unauth = await request(origin, { path: '/api/export' });
  assert.equal(unauth.statusCode, 401);

  await request(origin, { path: '/api/progress', method: 'POST', headers: { Cookie: alice } }, { activity_id: 'day-01-act-01', draft_text: 'portable draft', completed: true, version: 0 });
  await request(origin, { path: '/api/track', method: 'POST', headers: { Cookie: alice } }, { track: 'pi-agent' });
  const quizRevision = require('../../curriculum/days/day-01.json').activities.find(activity => activity.id === 'day-01-act-01').content_revision;
  const quiz = await request(origin, { path: '/api/quiz/submit', method: 'POST', headers: { Cookie: alice } }, { activity_id: 'day-01-act-01', content_revision: quizRevision, assistance_mode: 'independent', answers: { q1: 'b', q2: 'a', q3: 'c' } });
  assert.equal(quiz.statusCode, 200);
  await request(origin, { path: '/api/project/submit', method: 'POST', headers: { Cookie: alice } }, { project_id: 'day-01-act-01', revision: 'test-revision', assistance_mode: 'agent_assisted', repo_url: 'https://example.com/alice', text_notes: 'self reported evidence' });

  const exported = await request(origin, { path: '/api/export', headers: { Cookie: alice } });
  assert.equal(exported.statusCode, 200);
  assert.match(exported.headers['content-disposition'], /learning-records-export\.json/);
  assert.equal(exported.json.format, '90-day-ai-learning.portable-export');
  assert.equal(exported.json.format_version, 1);
  assert.equal(exported.json.records.progress[0].activity_id, 'day-01-act-01');
  assert.equal(exported.json.records.progress[0].completed, true);
  assert.equal(exported.json.records.track_preference.track_id, 'pi-agent');
  assert.equal(exported.json.records.project_submissions[0].evidence_status, 'self_reported');
  assert.match(exported.json.records.project_submissions[0].evidence_label, /Self-reported/);
  assert.ok(exported.json.records.assistance_declarations.some(row => row.assistance_mode === 'independent'));
  assert.ok(exported.json.records.assistance_declarations.some(row => row.assistance_mode === 'agent_assisted'));
  assert.equal(JSON.stringify(exported.json).includes('mock-code'), false);
  assert.equal(JSON.stringify(exported.json).includes(alice.split('=')[1]), false);

  const bobEmpty = await request(origin, { path: '/api/export', headers: { Cookie: bob } });
  assert.equal(bobEmpty.statusCode, 200);
  assert.deepEqual(bobEmpty.json.records.progress, []);
  assert.deepEqual(bobEmpty.json.records.quiz_attempts, []);
  assert.deepEqual(bobEmpty.json.records.project_submissions, []);
  assert.equal(bobEmpty.json.records.track_preference, null);

  const guessed = await request(origin, { path: `/api/users/not-alice/export`, headers: { Cookie: bob } });
  assert.equal(guessed.statusCode, 403);

  for (const lang of ['zh-Hans', 'zh-Hant', 'en', 'ja']) {
    const page = await request(origin, { path: `/${lang}/export`, headers: { Cookie: alice } });
    assert.equal(page.statusCode, 200);
    assert.match(page.text, /export|匯出|导出|エクスポート/i);
    assert.match(page.text, /failure|失败|失敗|失敗|failed/i);
  }

  const original = server.db.getPortableLearningExport;
  server.db.getPortableLearningExport = () => { throw new Error('controlled failure'); };
  const failed = await request(origin, { path: '/api/export', headers: { Cookie: alice } });
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(failed.json, { error: 'export_generation_failed' });
  server.db.getPortableLearningExport = original;
  server.close();
  console.log('>>> Portable export HTTP seam tests passed! <<<');
})().catch(error => { console.error(error); process.exit(1); });
