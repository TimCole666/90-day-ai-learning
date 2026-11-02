// Browser-level integration test for Google Login, Private Progress, and Multi-user Isolation
// Run with: NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules node tests/browser/test_auth_and_progress.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function startServer() {
  const env = Object.assign({}, process.env, {
    DB_PATH: ':memory:', // Clean isolated database for test run
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
        reject(new Error(`Server process exited with code ${code}. Output: ${output}`));
      }
    });
  });

  const port = await withTimeout(portPromise, 8000, 'server port discovery');

  // Probe until accepting connections
  await withTimeout(new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const probe = () => {
      const client = net.connect({ host: '127.0.0.1', port });
      client.once('connect', () => { client.destroy(); resolve(); });
      client.once('error', () => {
        client.destroy();
        if (Date.now() >= deadline) reject(new Error('HTTP server did not accept connections'));
        else setTimeout(probe, 40);
      });
    };
    probe();
  }), 6000, 'HTTP connection probe');

  return { server: serverProcess, origin: `http://127.0.0.1:${port}` };
}

(async () => {
  console.log('--- Starting Auth & Private Progress Seam Tests ---');
  const { server, origin } = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });

    // ==========================================
    // 1. Public Browse Without Login
    // ==========================================
    console.log('1. Testing public browsing without login...');
    const contextGuest = await browser.newContext();
    const pageGuest = await contextGuest.newPage();

    await pageGuest.goto(`${origin}/zh-Hans/day-01`, { waitUntil: 'domcontentloaded' });
    const signInBtn = pageGuest.locator('a.btn-sign-in-google');
    await signInBtn.waitFor({ state: 'visible', timeout: 5000 });
    assert.match(await signInBtn.textContent(), /Google/i, 'Sign in button should mention Google');

    const userProfileGuest = pageGuest.locator('.user-profile');
    assert.equal(await userProfileGuest.count(), 0, 'No user profile should be shown to guest');

    // Local draft still works in guest mode
    const guestInput = pageGuest.locator('#day-01-act-01 .exercise-draft-input');
    await guestInput.fill('Guest anonymous draft');
    assert.equal(await guestInput.inputValue(), 'Guest anonymous draft');

    // ==========================================
    // 2. Deterministic Sign-in as User A (Alice Walker)
    // ==========================================
    console.log('2. Testing sign-in via test provider adapter for Alice...');
    await signInBtn.click();
    await pageGuest.waitForLoadState('domcontentloaded');

    // Should arrive at mock test provider page
    assert.ok(pageGuest.url().includes('/auth/test-provider'), `Expected test provider page, got ${pageGuest.url()}`);
    const chooseAliceBtn = pageGuest.locator('button[data-user="alice"]');
    await chooseAliceBtn.waitFor({ state: 'visible', timeout: 5000 });
    await chooseAliceBtn.click();
    await pageGuest.waitForLoadState('domcontentloaded');

    // Redirected back to Day 01
    assert.ok(pageGuest.url().includes('/zh-Hans/day-01'), `Expected redirect to /zh-Hans/day-01, got ${pageGuest.url()}`);

    // Verify user profile in UI
    const userNameAlice = pageGuest.locator('.user-name');
    await userNameAlice.waitFor({ state: 'visible', timeout: 5000 });
    assert.match(await userNameAlice.textContent(), /Alice Walker/i);

    const logoutBtnAlice = pageGuest.locator('form.logout-form button.btn-logout');
    await logoutBtnAlice.waitFor({ state: 'visible', timeout: 5000 });

    // Verify session cookie
    const cookiesAlice = await contextGuest.cookies();
    const sidCookieAlice = cookiesAlice.find(c => c.name === 'sid');
    assert.ok(sidCookieAlice, 'Session cookie sid must be set');
    assert.equal(sidCookieAlice.httpOnly, true, 'Session cookie must be HttpOnly');
    assert.equal(sidCookieAlice.sameSite, 'Lax', 'Session cookie SameSite must be Lax');

    // Get Alice's user id from /api/auth/me
    const meResponse = await pageGuest.request.get(`${origin}/api/auth/me`);
    assert.equal(meResponse.status(), 200);
    const meAlice = await meResponse.json();
    assert.equal(meAlice.authenticated, true);
    assert.ok(meAlice.user.id);
    const aliceUserId = meAlice.user.id;

    // ==========================================
    // 3. Save Progress on Day 01 Activity
    // ==========================================
    console.log('3. Testing saving progress for Alice...');
    const aliceDraft = "Alice's verified prediction: [1, 2, 3, 4] and [1, 2, 3, 4, 5]";
    const aliceInput = pageGuest.locator('#day-01-act-01 .exercise-draft-input');
    await aliceInput.fill(aliceDraft);

    const aliceCompleteBox = pageGuest.locator('#day-01-act-01 .activity-completion-checkbox');
    await aliceCompleteBox.check();

    const aliceSaveBtn = pageGuest.locator('#day-01-act-01 .btn-save-progress');
    await aliceSaveBtn.click();

    const aliceStatus = pageGuest.locator('#day-01-act-01 .save-status-indicator');
    await pageGuest.waitForFunction(() => {
      const el = document.querySelector('#day-01-act-01 .save-status-indicator');
      return el && el.textContent.includes('已保存');
    }, { timeout: 5000 });
    assert.match(await aliceStatus.textContent(), /已保存/);

    // ==========================================
    // 4. Refresh and Resume Progress
    // ==========================================
    console.log('4. Testing progress resumption after browser refresh...');
    await pageGuest.reload({ waitUntil: 'domcontentloaded' });

    // Ensure session and user identity persisted
    await pageGuest.waitForSelector('.user-name', { state: 'visible', timeout: 5000 });
    assert.match(await pageGuest.locator('.user-name').textContent(), /Alice Walker/i);

    // Ensure saved draft and completion checkbox were restored from server
    await pageGuest.waitForFunction(() => {
      const input = document.querySelector('#day-01-act-01 .exercise-draft-input');
      return input && input.value.length > 0;
    }, { timeout: 5000 });

    const restoredDraft = await pageGuest.locator('#day-01-act-01 .exercise-draft-input').inputValue();
    assert.equal(restoredDraft, aliceDraft, 'Draft must be restored from server');

    const restoredComplete = await pageGuest.locator('#day-01-act-01 .activity-completion-checkbox').isChecked();
    assert.equal(restoredComplete, true, 'Completion checkbox must remain checked');

    // ==========================================
    // 5. Multi-User Isolation: User B (Bob Smith)
    // ==========================================
    console.log('5. Testing multi-user isolation with Bob Smith...');
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();

    await pageBob.goto(`${origin}/en/day-01`, { waitUntil: 'domcontentloaded' });
    const bobSignInBtn = pageBob.locator('a.btn-sign-in-google');
    await bobSignInBtn.click();
    await pageBob.waitForLoadState('domcontentloaded');

    // Choose Bob Smith on test provider screen
    const chooseBobBtn = pageBob.locator('button[data-user="bob"]');
    await chooseBobBtn.waitFor({ state: 'visible', timeout: 5000 });
    await chooseBobBtn.click();
    await pageBob.waitForLoadState('domcontentloaded');

    // Bob is on English edition
    await pageBob.waitForSelector('.user-name', { state: 'visible', timeout: 5000 });
    assert.match(await pageBob.locator('.user-name').textContent(), /Bob Smith/i);

    // CRITICAL: Bob must NOT see Alice's draft or completion!
    const bobInput = pageBob.locator('#day-01-act-01 .exercise-draft-input');
    const bobDraftValue = await bobInput.inputValue();
    assert.equal(bobDraftValue, '', "Bob must start with empty draft, Alice's draft must not leak");

    const bobComplete = await pageBob.locator('#day-01-act-01 .activity-completion-checkbox').isChecked();
    assert.equal(bobComplete, false, "Bob must not have Alice's completed status");

    // Denial of guessed-identifier reads and writes
    console.log('5b. Testing access denial when attempting to read/write Alice records with Bob session...');
    // Bob attempts to query Alice's records directly via guessed user ID
    const guessedReadResp = await pageBob.request.get(`${origin}/api/users/${aliceUserId}/progress`);
    assert.equal(guessedReadResp.status(), 403, 'Guessed learner ID read must receive 403 Forbidden');

    // Bob attempts to overwrite Alice's records by sending user_id: aliceUserId in POST
    const forgedWriteResp = await pageBob.request.post(`${origin}/api/progress`, {
      headers: { 'X-CSRF-Token': await pageBob.locator('meta[name="csrf-token"]').getAttribute('content') },
      data: {
        user_id: aliceUserId,
        activity_id: 'day-01-act-01',
        draft_text: 'MALICIOUS OVERWRITE ATTEMPT',
        completed: 0,
        version: 1
      }
    });
    assert.equal(forgedWriteResp.status(), 403, 'Client-controlled user_id mismatch must receive 403 Forbidden');

    // Verify Alice's progress remains intact on server
    const aliceVerifyResp = await pageGuest.request.get(`${origin}/api/progress?dayId=day-01`);
    assert.equal(aliceVerifyResp.status(), 200);
    const aliceData = await aliceVerifyResp.json();
    assert.equal(aliceData.progress['day-01-act-01'].draft_text, aliceDraft);

    // Bob saves his own distinct progress
    const bobDraft = "Bob's independent reasoning on list references";
    await bobInput.fill(bobDraft);
    await pageBob.locator('#day-01-act-01 .btn-save-progress').click();

    // Bob sees English feedback "Saved"
    const bobStatus = pageBob.locator('#day-01-act-01 .save-status-indicator');
    await pageBob.waitForFunction(() => {
      const el = document.querySelector('#day-01-act-01 .save-status-indicator');
      return el && el.textContent.includes('Saved');
    }, { timeout: 5000 });
    assert.match(await bobStatus.textContent(), /Saved/);

    // ==========================================
    // 6. Malformed & Cancelled Callbacks Fail Safely
    // ==========================================
    console.log('6. Testing malformed and cancelled OAuth callbacks fail safely...');
    // Cancelled callback (user clicks Cancel or provider returns access_denied)
    const cancelledResp = await pageBob.request.get(`${origin}/auth/google/callback?error=access_denied`, {
      maxRedirects: 0
    });
    assert.ok(cancelledResp.status() < 500, 'Cancelled callback must not crash server (status < 500)');

    // Malformed callback with invalid state token
    const invalidStateResp = await pageBob.request.get(`${origin}/auth/google/callback?state=invalid-state-123&code=mock-code-alice`);
    assert.equal(invalidStateResp.status(), 400, 'Invalid state token must be rejected with 400');

    // ==========================================
    // 7. Save Failures and Localized Error Feedback
    // ==========================================
    console.log('7. Testing save error and localized feedback...');
    // Intercept /api/progress for Bob and fail with 500
    await pageBob.route('**/api/progress', route => {
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'simulated internal server error' }) });
    });

    await bobInput.fill("Bob's text that will fail saving");
    await pageBob.locator('#day-01-act-01 .btn-save-progress').click();

    // Verify localized error message displayed in English ("Save failed")
    await pageBob.waitForFunction(() => {
      const el = document.querySelector('#day-01-act-01 .save-status-indicator');
      return el && el.textContent.includes('Save failed');
    }, { timeout: 5000 });
    assert.match(await bobStatus.textContent(), /Save failed/);

    // Ensure user's input was NOT cleared or lost
    assert.equal(await bobInput.inputValue(), "Bob's text that will fail saving");

    // Remove route interception
    await pageBob.unroute('**/api/progress');

    // ==========================================
    // 8. Safe Logout
    // ==========================================
    console.log('8. Testing safe logout...');
    const logoutTokenBob = await pageBob.locator('form.logout-form input[name="csrf_token"]').inputValue();
    assert.ok(logoutTokenBob.length > 0);
    for (const lang of ['en', 'ja', 'zh-Hans', 'zh-Hant']) {
      for (const view of ['day-01', 'agent-track', 'diagnostics', 'export']) {
        const rendered = await pageBob.request.get(`${origin}/${lang}/${view}`);
        assert.equal(rendered.status(), 200, `${lang}/${view} should render`);
        assert.equal(rendered.headers()['cache-control'], 'no-store', 'Session-scoped HTML must not be cached');
        const html = await rendered.text();
        assert.ok(html.includes('<form class="logout-form" action="/auth/logout" method="post">'));
        assert.ok(html.includes(`name="csrf_token" value="${logoutTokenBob}"`));
      }
    }
    const getLogout = await pageBob.request.get(`${origin}/auth/logout`, { maxRedirects: 0 });
    assert.equal(getLogout.status(), 405, 'A GET navigation must never revoke a session');
    assert.equal(getLogout.headers().allow, 'POST');
    const forgedLogout = await pageBob.request.post(`${origin}/auth/logout`, {
      headers: { Origin: 'https://attacker.invalid' },
      form: { csrf_token: 'forged-token' },
      maxRedirects: 0
    });
    assert.equal(forgedLogout.status(), 403, 'Cross-origin logout without the session CSRF token must fail');
    const missingTokenLogout = await pageBob.request.post(`${origin}/auth/logout`, { maxRedirects: 0 });
    assert.equal(missingTokenLogout.status(), 403, 'Logout without a CSRF token must fail');
    const oversizedLogout = await pageBob.request.post(`${origin}/auth/logout`, {
      form: { csrf_token: 'x'.repeat(4097) },
      maxRedirects: 0
    });
    assert.equal(oversizedLogout.status(), 413, 'Logout forms must enforce their request-size bound');
    const stillSignedIn = await pageBob.request.get(`${origin}/api/auth/me`);
    assert.equal((await stillSignedIn.json()).authenticated, true, 'Rejected logout requests must preserve the session');
    const bobLogoutBtn = pageBob.locator('form.logout-form button.btn-logout');
    const [logoutResponse] = await Promise.all([
      pageBob.waitForResponse(response => response.url() === `${origin}/auth/logout`),
      bobLogoutBtn.click()
    ]);
    assert.equal(logoutResponse.status(), 303);
    await pageBob.waitForLoadState('domcontentloaded');

    // Verify redirected back to public view and login button reappears
    await pageBob.waitForSelector('a.btn-sign-in-google', { state: 'visible', timeout: 5000 });
    assert.equal(await pageBob.locator('.user-profile').count(), 0);

    // Verify Bob session cookie is cleared
    const cookiesBobAfter = await contextBob.cookies();
    const sidBob = cookiesBobAfter.find(c => c.name === 'sid');
    assert.ok(!sidBob || sidBob.value === '', 'Session cookie must be cleared on logout');

    // Verify querying /api/auth/me returns unauthenticated
    const meBobAfter = await pageBob.request.get(`${origin}/api/auth/me`);
    const meBobData = await meBobAfter.json();
    assert.equal(meBobData.authenticated, false);
    const anonymousLogout = await pageBob.request.post(`${origin}/auth/logout`, { maxRedirects: 0 });
    assert.equal(anonymousLogout.status(), 401, 'Anonymous requests cannot revoke a session');

    // ==========================================
    // 9. GitHub Sign-in with Minimal Scopes
    // ==========================================
    console.log('9. Testing GitHub login with minimal scopes (read:user, user:email)...');
    const contextGhAlice = await browser.newContext();
    const pageGhAlice = await contextGhAlice.newPage();

    await pageGhAlice.goto(`${origin}/en/day-01`, { waitUntil: 'domcontentloaded' });
    const ghSignInBtn = pageGhAlice.locator('a.btn-sign-in-github');
    await ghSignInBtn.waitFor({ state: 'visible', timeout: 5000 });
    assert.match(await ghSignInBtn.textContent(), /GitHub/i);

    await ghSignInBtn.click();
    await pageGhAlice.waitForLoadState('domcontentloaded');

    // Should arrive at mock provider with provider=github
    assert.ok(pageGhAlice.url().includes('provider=github'), `Expected provider=github in URL, got ${pageGhAlice.url()}`);
    // Check that scope is minimal and never includes 'repo'
    const scopeNotice = pageGhAlice.locator('.scopes-granted');
    await scopeNotice.waitFor({ state: 'visible', timeout: 5000 });
    const scopeText = await scopeNotice.textContent();
    assert.match(scopeText, /read:user/);
    assert.match(scopeText, /user:email/);
    assert.ok(!scopeText.includes('repo'), 'Must NEVER request repository or private repo scope');

    // Select Alice GitHub user
    const chooseGhAliceBtn = pageGhAlice.locator('button[data-user="gh-alice"]');
    await chooseGhAliceBtn.waitFor({ state: 'visible', timeout: 5000 });
    await chooseGhAliceBtn.click();
    await pageGhAlice.waitForLoadState('domcontentloaded');

    // Redirected back to Day 01
    await pageGhAlice.waitForSelector('.user-name', { state: 'visible', timeout: 5000 });
    assert.match(await pageGhAlice.locator('.user-name').textContent(), /Alice Walker/i);

    const meGhResp = await pageGhAlice.request.get(`${origin}/api/auth/me`);
    const meGhData = await meGhResp.json();
    assert.equal(meGhData.authenticated, true);
    assert.equal(meGhData.user.provider, 'github');
    const aliceGhUserId = meGhData.user.id;

    // ==========================================
    // 10. Strict No-Silent-Merge (Cross-provider Identical Email Isolation)
    // ==========================================
    console.log('10. Testing strict no-silent-merge: identical email across Google & GitHub...');
    // Alice Google had user ID aliceUserId and email alice@example.com
    // Alice GitHub has user ID aliceGhUserId and identical email alice@example.com
    assert.notEqual(
      aliceUserId,
      aliceGhUserId,
      'Google Alice and GitHub Alice must have DISTINCT user accounts (no silent merge)!'
    );

    // Alice GitHub must NOT see Alice Google's draft or completion!
    const ghAliceInput = pageGhAlice.locator('#day-01-act-01 .exercise-draft-input');
    assert.equal(await ghAliceInput.inputValue(), '', 'GitHub account must not see Google account draft');
    const ghAliceComplete = await pageGhAlice.locator('#day-01-act-01 .activity-completion-checkbox').isChecked();
    assert.equal(ghAliceComplete, false, 'GitHub account must not inherit Google completion');

    // Alice GitHub saves her own distinct progress
    const ghDraft = "Alice's GitHub specific notes";
    await ghAliceInput.fill(ghDraft);
    await pageGhAlice.locator('#day-01-act-01 .btn-save-progress').click();
    await pageGhAlice.waitForFunction(() => {
      const el = document.querySelector('#day-01-act-01 .save-status-indicator');
      return el && el.textContent.includes('Saved');
    }, { timeout: 5000 });

    // Verify Alice Google progress remains intact
    const verifyGoogleResp = await pageGuest.request.get(`${origin}/api/progress?dayId=day-01`);
    const verifyGoogleData = await verifyGoogleResp.json();
    assert.equal(verifyGoogleData.progress['day-01-act-01'].draft_text, aliceDraft);

    // ==========================================
    // 11. Explicit Safe Account Linking
    // ==========================================
    console.log('11. Testing explicit account linking...');
    // Sign in Bob Smith via Google
    const contextLinker = await browser.newContext();
    const pageLinker = await contextLinker.newPage();
    await pageLinker.goto(`${origin}/en/day-01`, { waitUntil: 'domcontentloaded' });
    await pageLinker.locator('a.btn-sign-in-google').click();
    await pageLinker.waitForLoadState('domcontentloaded');
    await pageLinker.locator('button[data-user="bob"]').click();
    await pageLinker.waitForLoadState('domcontentloaded');

    // Bob is logged in. Bob saves some progress
    const bobOriginalDraft = "Bob's linked account test progress";
    const linkerInput = pageLinker.locator('#day-01-act-01 .exercise-draft-input');
    await linkerInput.fill(bobOriginalDraft);
    await pageLinker.locator('#day-01-act-01 .btn-save-progress').click();
    await pageLinker.waitForFunction(() => {
      const el = document.querySelector('#day-01-act-01 .save-status-indicator');
      return el && el.textContent.includes('Saved');
    }, { timeout: 5000 });

    // Bob initiates linking to GitHub
    const linkGhBtn = pageLinker.locator('a.btn-link-github');
    await linkGhBtn.waitFor({ state: 'visible', timeout: 5000 });
    await linkGhBtn.click();
    await pageLinker.waitForLoadState('domcontentloaded');

    // On mock provider, choose Charlie GitHub (which is not yet bound to any user)
    assert.ok(pageLinker.url().includes('action=link'), 'Should include action=link in OAuth state flow');
    const chooseCharlieBtn = pageLinker.locator('button[data-user="gh-charlie"]');
    await chooseCharlieBtn.waitFor({ state: 'visible', timeout: 5000 });
    await chooseCharlieBtn.click();
    await pageLinker.waitForLoadState('domcontentloaded');

    // Verify Bob is still logged in and has linked GitHub
    await pageLinker.waitForSelector('.user-name', { state: 'visible', timeout: 5000 });
    const meLinkerResp = await pageLinker.request.get(`${origin}/api/auth/me`);
    const meLinkerData = await meLinkerResp.json();
    assert.ok(meLinkerData.user.identities.some(i => i.provider === 'github'));
    assert.ok(meLinkerData.user.identities.some(i => i.provider === 'google'));

    // Bob logs out
    await pageLinker.locator('form.logout-form button.btn-logout').click();
    await pageLinker.waitForLoadState('domcontentloaded');

    // Now sign in via GitHub using Charlie identity: should log directly into Bob's account!
    await pageLinker.locator('a.btn-sign-in-github').click();
    await pageLinker.waitForLoadState('domcontentloaded');
    await pageLinker.locator('button[data-user="gh-charlie"]').click();
    await pageLinker.waitForLoadState('domcontentloaded');

    // Verify Bob's progress is loaded!
    await pageLinker.waitForSelector('.user-name', { state: 'visible', timeout: 5000 });
    await pageLinker.waitForFunction(() => {
      const input = document.querySelector('#day-01-act-01 .exercise-draft-input');
      return input && input.value.length > 0;
    }, { timeout: 5000 });
    assert.equal(await linkerInput.inputValue(), bobOriginalDraft, 'Progress must be preserved when logging in via linked secondary identity');

    // ==========================================
    // 12. Linking Conflict Rejection Without Record Corruption
    // ==========================================
    console.log('12. Testing linking conflict rejection (identity already bound to another user)...');
    // Bob attempts to link gh-alice (which is already bound to Alice GitHub)
    await pageLinker.goto(`${origin}/auth/link/github?returnTo=/en/day-01`, { waitUntil: 'domcontentloaded' });
    await pageLinker.waitForLoadState('domcontentloaded');

    // Choose gh-alice on test provider
    const conflictGhAliceBtn = pageLinker.locator('button[data-user="gh-alice"]');
    await conflictGhAliceBtn.waitFor({ state: 'visible', timeout: 5000 });
    await conflictGhAliceBtn.click();
    await pageLinker.waitForLoadState('domcontentloaded');

    // Should be redirected back to Day 01 with error banner
    await pageLinker.waitForSelector('.auth-alert-box', { state: 'visible', timeout: 5000 });
    const alertBox = pageLinker.locator('.auth-alert-box');
    assert.match(await alertBox.textContent(), /already linked/i, 'Alert box should warn about conflicting identity');

    // Verify Bob's account was NOT deleted or corrupted
    const meBobAfterConflict = await pageLinker.request.get(`${origin}/api/auth/me`);
    const meBobAfterData = await meBobAfterConflict.json();
    assert.equal(meBobAfterData.authenticated, true);
    assert.equal(await linkerInput.inputValue(), bobOriginalDraft, "Bob's draft must be intact");

    // Verify Alice GitHub was NOT deleted or corrupted
    const meAliceGhAfter = await pageGhAlice.request.get(`${origin}/api/auth/me`);
    const meAliceGhData = await meAliceGhAfter.json();
    assert.equal(meAliceGhData.authenticated, true);
    assert.equal(meAliceGhData.user.id, aliceGhUserId);

    // ==========================================
    // 13. Safe 4-Language Error Outcomes & Redirect Misuse Defense
    // ==========================================
    console.log('13. Testing safe four-language outcomes for auth errors & redirect misuse defense...');
    // A: Redirect misuse defense (open redirect prevention)
    const openRedirectResp = await pageLinker.request.get(`${origin}/auth/github?returnTo=https://evil.com/attacker`, {
      maxRedirects: 0
    });
    // Server must redirect to safe internal URL, not https://evil.com
    const stateTokenUrl = openRedirectResp.headers()['location'];
    assert.ok(!stateTokenUrl.includes('evil.com'), 'Must not redirect to external origin');

    // B: Four languages for access_denied / cancelled callback
    const testLangs = ['zh-Hans', 'zh-Hant', 'en', 'ja'];
    for (const lang of testLangs) {
      await pageLinker.goto(`${origin}/${lang}/day-01?auth_error=access_denied`, { waitUntil: 'domcontentloaded' });
      await pageLinker.waitForSelector('.auth-alert-box', { state: 'visible', timeout: 5000 });
      const errText = await pageLinker.locator('.auth-alert-box').textContent();
      assert.ok(errText.length > 5, `Expected localized access_denied message in ${lang}`);
      // Check language-specific keywords
      if (lang === 'zh-Hans') assert.match(errText, /取消|拒绝/);
      if (lang === 'zh-Hant') assert.match(errText, /取消|拒絕/);
      if (lang === 'en') assert.match(errText, /cancelled|denied/i);
      if (lang === 'ja') assert.match(errText, /キャンセル|拒否/);
    }

    // C: Four languages for identity_conflict
    for (const lang of testLangs) {
      await pageLinker.goto(`${origin}/${lang}/day-01?auth_error=identity_conflict`, { waitUntil: 'domcontentloaded' });
      await pageLinker.waitForSelector('.auth-alert-box', { state: 'visible', timeout: 5000 });
      const conflictText = await pageLinker.locator('.auth-alert-box').textContent();
      if (lang === 'zh-Hans') assert.match(conflictText, /绑定|冲突/);
      if (lang === 'zh-Hant') assert.match(conflictText, /綁定|衝突/);
      if (lang === 'en') assert.match(conflictText, /linked|conflict/i);
      if (lang === 'ja') assert.match(conflictText, /連携|競合/);
    }

    await contextGhAlice.close();
    await contextLinker.close();

    console.log('\n>>> ALL AUTH & PRIVATE PROGRESS SEAM TESTS PASSED! <<<');
    await contextGuest.close();
    await contextBob.close();
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(err => {
  console.error('\nFAIL in test_auth_and_progress:', err);
  process.exit(1);
});
