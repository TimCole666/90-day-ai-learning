// Spec US59 (acceptance review F8): every day page discloses its edition's
// translation-review state and revision, and signed-in learners can report
// content for correction. Reports are the learner's own records: exported
// with them and deleted with them.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const LANGS = ['en', 'ja', 'zh-Hans', 'zh-Hant'];

function request(origin, { method = 'GET', path: p = '/', headers = {} } = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(p, origin);
    const req = http.request({ method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== null) {
      const payload = JSON.stringify(body);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

async function signIn(origin, code) {
  const start = await request(origin, { path: '/auth/google' });
  const state = new URL(start.headers.location, origin).searchParams.get('state');
  const cb = await request(origin, { path: `/auth/google/callback?code=${code}&state=${state}` });
  assert.equal(cb.status, 302, `${code} sign-in`);
  const cookie = cb.headers['set-cookie'][0].split(';')[0];
  const page = await request(origin, { path: '/en/day-36', headers: { Cookie: cookie } });
  const csrf = page.text.match(/<meta name="csrf-token" content="([^"]+)"/)[1];
  const me = await request(origin, { path: '/api/auth/me', headers: { Cookie: cookie } });
  return { cookie, csrf, userId: me.json.user.id };
}

function editionRevision(dayId, lang) {
  const file = path.join(ROOT, 'curriculum', 'content', dayId, `${lang}.json`);
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
}

async function run() {
  console.log('--- Running Translation Review Disclosure Tests ---');

  // -- 1. Registry is honest about review state --------------------------
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum', 'translation-review.json'), 'utf8'));
  assert.deepEqual(Object.keys(registry.editions).sort(), [...LANGS].sort());
  assert.equal(registry.editions.en.state, 'source-edition');
  for (const lang of ['ja', 'zh-Hans', 'zh-Hant']) {
    assert.equal(registry.editions[lang].state, 'automated-checks-only',
      `${lang} has had no native review (ticket 61); it must not claim one`);
  }
  const overrides = registry.days || {};
  for (const [dayId, byLang] of Object.entries(overrides)) {
    for (const [lang, entry] of Object.entries(byLang)) {
      if (entry.state === 'native-reviewed') {
        assert.ok(entry.reviewer && entry.reviewed_at && entry.edition_revision,
          `${dayId}/${lang}: native-reviewed needs reviewer, reviewed_at and edition_revision`);
      }
    }
  }
  console.log('✓ Registry: en is the source edition; ja/zh claim automated checks only');

  process.env.DB_PATH = ':memory:';
  process.env.PORT = '0';
  process.env.AUTH_ADAPTER = 'test';
  const mod = require('../../server.cjs');
  const server = mod.server || mod;
  await new Promise(resolve => (server.listening ? resolve() : server.once('listening', resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    // -- 2. Every edition renders the notice with its state and revision ---
    for (const lang of LANGS) {
      const page = await request(origin, { path: `/${lang}/day-36` });
      assert.equal(page.status, 200);
      const notice = page.text.match(/<aside class="translation-review-notice"[^>]*>/);
      assert.ok(notice, `${lang}: notice missing`);
      assert.match(notice[0], new RegExp(`data-edition-state="${registry.editions[lang].state}"`));
      assert.match(notice[0], new RegExp(`data-edition-revision="${editionRevision('day-36', lang)}"`));
      assert.ok(!/id="correction-form"/.test(page.text), `${lang}: signed-out page must not show the form`);
      assert.match(page.text, /class="correction-signin"/, `${lang}: signed-out page must say how to report`);
    }
    console.log('✓ Every edition discloses review state and edition revision');

    const alice = await signIn(origin, 'mock-code-alice');
    const bob = await signIn(origin, 'mock-code-bob');
    const jaPage = await request(origin, { path: '/ja/day-36', headers: { Cookie: alice.cookie } });
    assert.match(jaPage.text, /id="correction-form"/);
    for (const act of ['day-36-act-01', 'day-36-act-04']) {
      assert.match(jaPage.text, new RegExp(`<option value="${act}"`), `form lists ${act}`);
    }
    console.log('✓ Signed-in page offers a correction form listing the day\'s activities');

    // -- 3. API validation -------------------------------------------------
    const good = {
      day_id: 'day-36', lang: 'ja', activity_id: 'day-36-act-02',
      edition_revision: editionRevision('day-36', 'ja'),
      description: 'The η=5.0 loss sequence omits the step-10 value.'
    };
    const post = (who, body, extraHeaders = {}) => request(origin, {
      method: 'POST', path: '/api/corrections',
      headers: who ? { Cookie: who.cookie, 'X-CSRF-Token': who.csrf, ...extraHeaders } : extraHeaders
    }, body);

    assert.equal((await post(null, good)).status, 401, 'sign-in required');
    assert.equal((await request(origin, { method: 'POST', path: '/api/corrections', headers: { Cookie: alice.cookie } }, good)).status, 403, 'CSRF required');
    const invalid = [
      { ...good, day_id: 'day-99' },
      { ...good, day_id: '../etc' },
      { ...good, lang: 'fr' },
      { ...good, activity_id: 'day-35-act-01' },
      { ...good, description: '   ' },
      { ...good, description: 'x'.repeat(2001) },
      { ...good, edition_revision: '' },
      { ...good, user_id: bob.userId }
    ];
    for (const body of invalid) {
      const res = await post(alice, body);
      assert.ok(res.status === 400 || res.status === 403, `${JSON.stringify(body).slice(0, 80)} -> ${res.status}`);
    }
    console.log('✓ Invalid day, language, activity, description, revision and foreign user are rejected');

    const created = await post(alice, good);
    assert.equal(created.status, 201, created.text);
    assert.equal(created.json.status, 'open');
    assert.equal(created.json.revision_current, true);
    const dayLevel = await post(alice, { ...good, activity_id: null, edition_revision: 'stale0000000' });
    assert.equal(dayLevel.status, 201, 'day-level report without an activity is allowed');
    assert.equal(dayLevel.json.revision_current, false, 'a stale revision is kept but flagged');
    console.log('✓ Valid reports are stored as open, with stale revisions flagged');

    // -- 4. Reports are the learner's records ------------------------------
    const aliceExport = (await request(origin, { path: '/api/export', headers: { Cookie: alice.cookie } })).json;
    const reports = aliceExport.records.content_corrections;
    assert.equal(reports.length, 2);
    assert.equal(reports.find(r => r.activity_id === 'day-36-act-02').description, good.description);
    const bobExport = (await request(origin, { path: '/api/export', headers: { Cookie: bob.cookie } })).json;
    assert.deepEqual(bobExport.records.content_corrections, [], 'other users never see the report');
    console.log('✓ Reports appear in the reporter\'s export only');

    const deleted = mod.db.deleteLearningRecords(alice.userId);
    assert.ok(deleted.deleted.includes('content_corrections'),
      `delete must cover content_corrections, got ${JSON.stringify(deleted)}`);
    const after = (await request(origin, { path: '/api/export', headers: { Cookie: alice.cookie } })).json;
    assert.deepEqual(after.records.content_corrections, []);
    console.log('✓ Deleting learning records removes correction reports');
  } finally {
    server.close();
  }

  // -- 5. Maintainer listing ---------------------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corrections-'));
  try {
    const dbFile = path.join(tmp, 'learn.db');
    const { initDb } = require('../../lib/db.cjs');
    const db = initDb(dbFile);
    const user = db.upsertUser({ provider: 'google', providerUserId: 'list-1', email: 'secret@example.com', name: 'Lister' });
    db.createContentCorrection({
      userId: user.id, dayId: 'day-05', lang: 'zh-Hant', activityId: null,
      editionRevision: 'abc123abc123', revisionCurrent: true, description: '術語不一致'
    });
    const out = execFileSync('node', [path.join(ROOT, 'scripts', 'list_corrections.cjs'), '--db', dbFile], { encoding: 'utf8' });
    const rows = JSON.parse(out);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].day_id, 'day-05');
    assert.equal(rows[0].lang, 'zh-Hant');
    assert.equal(rows[0].description, '術語不一致');
    assert.ok(!out.includes('secret@example.com') && !out.includes(user.id), 'listing carries no reporter identity');
    console.log('✓ Maintainer listing prints open reports without reporter identity');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('>>> All translation review disclosure tests passed <<<');
}

run().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
