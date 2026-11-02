const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
async function start() {
  const child = spawn('node', ['server.cjs', '0'], { cwd: ROOT, env: { ...process.env, DB_PATH: ':memory:', AUTH_ADAPTER: 'test' }, stdio: ['ignore', 'pipe', 'inherit'] });
  const origin = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (m) resolve(`http://127.0.0.1:${m[1]}`); });
    child.on('error', reject);
    setTimeout(() => reject(new Error(`server did not start: ${out}`)), 8000);
  });
  return { child, origin };
}
async function login(page, origin) {
  await page.goto(`${origin}/en/day-01`);
  await page.locator('.btn-sign-in-google').click();
  await page.locator('button[data-user="alice"]').click();
  await page.waitForSelector('.user-name');
}
(async () => {
  const { child, origin } = await start();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, origin);
    const accountLink = page.locator('.btn-account');
    await accountLink.waitFor({ state: 'visible' });
    assert.equal(await accountLink.getAttribute('href'), '/en/account');

    const me = await page.request.get(`${origin}/api/auth/me`);
    assert.equal((await me.json()).authenticated, true);
    const pageCsrf = await page.locator('meta[name="csrf-token"]').getAttribute('content');
    const csrfHeaders = { 'X-CSRF-Token': pageCsrf };
    await page.request.post(`${origin}/api/progress`, { headers: csrfHeaders, data: { activity_id: 'day-01-act-01', draft_text: 'stale private draft', completed: true } });
    await page.request.post(`${origin}/api/project/submit`, { headers: csrfHeaders, data: { project_id: 'day-01-act-01', assistance_mode: 'independent', text_notes: 'private submission' } });

    // Every language exposes the same deliberate scope and backup warning; GET is side-effect free.
    for (const lang of ['zh-Hans', 'zh-Hant', 'en', 'ja']) {
      const response = await page.request.get(`${origin}/${lang}/account`);
      assert.equal(response.status(), 200);
      const html = await response.text();
      assert.match(html, /account|帳戶|アカウント/i);
      assert.match(html, /DELETE MY LEARNING RECORDS/);
      assert.match(html, /backup|備份|バックアップ/i);
    }
    const before = await page.request.get(`${origin}/api/progress`);
    assert.equal(Object.keys((await before.json()).progress).length, 1, 'passive account page views must not delete');

    const account = await page.goto(`${origin}/en/account`);
    assert.equal(account.status(), 200);
    const csrf = await page.locator('input[name="csrf_token"]').inputValue();
    const noCsrf = await page.request.post(`${origin}/api/account/delete`, { data: { scope: 'learning_records', confirm_scope: true, confirmation: 'DELETE MY LEARNING RECORDS' } });
    assert.equal(noCsrf.status(), 403);
    const incomplete = await page.request.post(`${origin}/api/account/delete`, { headers: { 'X-CSRF-Token': csrf }, data: { scope: 'learning_records', confirm_scope: false, confirmation: 'DELETE MY LEARNING RECORDS' } });
    assert.equal(incomplete.status(), 400);

    const deleted = await page.request.post(`${origin}/api/account/delete`, { headers: { 'X-CSRF-Token': csrf }, data: { scope: 'learning_records', confirm_scope: true, confirmation: 'DELETE MY LEARNING RECORDS' } });
    assert.equal(deleted.status(), 200);
    assert.equal((await deleted.json()).account_retained, true);
    const after = await page.request.get(`${origin}/api/progress`);
    assert.deepEqual((await after.json()).progress, {});
    const submissions = await page.request.get(`${origin}/api/project/submission?activityId=day-01-act-01`);
    assert.equal((await submissions.json()).submission, null);

    // Replays are safe and do not recreate records; a fresh session still has the account but no records.
    const replay = await page.request.post(`${origin}/api/account/delete`, { headers: { 'X-CSRF-Token': csrf }, data: { scope: 'learning_records', confirm_scope: true, confirmation: 'DELETE MY LEARNING RECORDS' } });
    assert.equal(replay.status(), 200);
    await page.goto(`${origin}/en/day-01`);
    assert.equal(await page.locator('#day-01-act-01 .exercise-draft-input').inputValue(), '', 'stale browser state is not recreated by a fresh page view');
    assert.equal((await (await page.request.get(`${origin}/api/auth/me`)).json()).authenticated, true);
    console.log('Learning record deletion browser seam tests passed.');
  } finally {
    await browser.close();
    child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exit(1); });
