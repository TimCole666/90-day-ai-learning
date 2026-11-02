// Browser-level integration test for Agent Tool Track Selection & Shared Practice (Ticket 11)
// Run with: NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules node tests/browser/test_agent_track.cjs
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
        reject(new Error(`Server process exited with code ${code}. Output: ${output}`));
      }
    });
  });

  const port = await withTimeout(portPromise, 8000, 'server port discovery');

  // Probe until accepting connections
  await withTimeout(new Promise((resolve) => {
    const probe = () => {
      const client = net.connect({ host: '127.0.0.1', port });
      client.once('connect', () => { client.destroy(); resolve(); });
      client.once('error', () => { setTimeout(probe, 50); });
    };
    probe();
  }), 5000, 'port probe');

  return { port, process: serverProcess };
}

async function runBrowserTests() {
  console.log('--- Starting Agent Tool Track Browser Tests (Ticket 11) ---');
  const { port, process: serverProcess } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Mock CDN external requests for offline deterministic execution
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.includes('jsdelivr.net') || u.includes('fonts.googleapis') || u.includes('example.com')) {
        route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
      } else {
        route.continue();
      }
    });

    // 1. Navigation from Day 01 to Agent Tool Track
    console.log('1. Testing navigation to Agent Tool Track from navbar...');
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState('domcontentloaded');

    const navTrackLink = page.locator('.nav-track-link');
    await assert.doesNotReject(navTrackLink.waitFor({ timeout: 4000 }), 'Navbar must have Agent Track link');
    await navTrackLink.click();
    await page.waitForLoadState('domcontentloaded');
    assert.match(page.url(), /\/zh-Hans\/agent-track/, 'Should navigate to /zh-Hans/agent-track');

    // 2. Four Alternative Tracks & Status Verification
    console.log('2. Testing 4 alternative tracks and pending status display...');
    const trackCards = page.locator('.track-card');
    const count = await trackCards.count();
    assert.strictEqual(count, 4, 'Must offer exactly 4 alternative tracks');

    // Check disclaimer that completing all four is not required
    const disclaimer = await page.locator('.tracks-disclaimer').textContent();
    assert.ok(disclaimer.includes('选择') || disclaimer.includes('Select') || disclaimer.includes('代替'), 'Must explain tracks are alternatives');

    // Claude Code is documented but live acceptance is blocked without authorization.
    const claudeCard = page.locator('.track-card[data-track="claude-code"]');
    assert.strictEqual(await claudeCard.count(), 1);
    const claudeBadge = await claudeCard.locator('.badge-pending').textContent();
    assert.ok(claudeBadge.includes('Pending') || claudeBadge.includes('待验证'));
    const claudeVersion = await claudeCard.locator('.track-tested-version').textContent();
    assert.ok(claudeVersion.includes('2.1.312'));

    // Codex pending status
    const codexCard = page.locator('.track-card[data-track="codex"]');
    const codexBadge = await codexCard.locator('.badge-pending').textContent();
    assert.ok(codexBadge.includes('Pending') || codexBadge.includes('待验证'));

    // Pi Agent pending status
    const piCard = page.locator('.track-card[data-track="pi-agent"]');
    const piBadge = await piCard.locator('.badge-pending').textContent();
    assert.ok(piBadge.includes('Pending') || piBadge.includes('待验证'));

    // DeepSeek Harness pending status
    const dsCard = page.locator('.track-card[data-track="deepseek-harness"]');
    const dsBadge = await dsCard.locator('.badge-pending').textContent();
    assert.ok(dsBadge.includes('Pending') || dsBadge.includes('待验证'));

    // 3. Shared Agent Practice 7-step method & assistance policy
    console.log('3. Testing 7-step shared practice and assistance modes...');
    const policySection = page.locator('.assistance-policy-container');
    await assert.doesNotReject(policySection.waitFor({ timeout: 3000 }), 'Assistance policy must be visible');
    const policyText = await policySection.textContent();
    assert.ok(policyText.includes('独立掌握检查') || policyText.includes('Independent Mastery'));
    assert.ok(policyText.includes('Agent 协同') || policyText.includes('Agent-Assisted'));
    assert.ok(policyText.includes('沙箱') || policyText.includes('workspace') || policyText.includes('disposable'));

    // 7 steps
    const steps = page.locator('.seven-step-item');
    assert.strictEqual(await steps.count(), 7, 'Must present all 7 steps');

    // 4. Interactive Track Selection and Tool-specific Instructions
    console.log('4. Testing track selection and tool-specific panel switching...');
    // Default is claude-code
    assert.ok(await claudeCard.evaluate(el => el.classList.contains('selected')), 'Claude Code should be default selected');
    const claudePanel = page.locator('.track-instructions-panel[data-track="claude-code"]');
    assert.ok(await claudePanel.isVisible(), 'Claude instructions panel should be visible');

    // Switch to Codex
    await codexCard.locator('.btn-select-track').click();
    assert.ok(await codexCard.evaluate(el => el.classList.contains('selected')), 'Codex card must become selected');
    const codexPanel = page.locator('.track-instructions-panel[data-track="codex"]');
    assert.ok(await codexPanel.isVisible(), 'Codex instructions panel must be visible');
    const codexInstructions = await codexPanel.textContent();
    const codexVersion = await codexCard.locator('.track-tested-version').textContent();
    assert.ok(codexVersion.includes('codex-cli 0.148.0'), 'Codex card must disclose the observed CLI release');
    assert.ok(codexInstructions.includes('workspace-write'), 'Codex panel must document the bounded sandbox');
    assert.ok(codexInstructions.includes('on-request'), 'Codex panel must document approval mode');
    assert.ok(codexInstructions.includes('blocked') || codexInstructions.includes('待授权'), 'Codex panel must disclose live-access limits');
    assert.ok(!(await claudePanel.isVisible()), 'Claude panel should now be hidden');

    // 5. Shared Progress Preservation Across Track Changes
    console.log('5. Testing shared progress preservation across track change...');
    const draftInput = page.locator('.exercise-draft-input[data-activity-id="agent-common-practice-01"]');
    await draftInput.fill('STEP 1-7: Identified deleted assertions and credential leak. Executed local pytest exit code 0.');
    const completeBox = page.locator('.activity-completion-checkbox[data-activity-id="agent-common-practice-01"]');
    await completeBox.check();
    const saveBtn = page.locator('.btn-save-progress[data-activity-id="agent-common-practice-01"]');
    await saveBtn.click();
    await page.waitForTimeout(500);

    // Now switch track to Pi Agent
    await piCard.locator('.btn-select-track').click();
    assert.ok(await piCard.evaluate(el => el.classList.contains('selected')));

    // Shared progress must remain intact!
    const draftValAfterSwitch = await draftInput.inputValue();
    assert.strictEqual(draftValAfterSwitch, 'STEP 1-7: Identified deleted assertions and credential leak. Executed local pytest exit code 0.');
    assert.strictEqual(await completeBox.isChecked(), true, 'Completion checkbox must remain checked');

    // 6. 4-Language Switching with Track & Progress Preservation
    console.log('6. Testing 4-language switching with track and progress preserved...');
    // Switch to English
    await page.locator('.lang-switcher .lang-link[data-lang="en"]').click();
    await page.waitForLoadState('domcontentloaded');
    assert.match(page.url(), /\/en\/agent-track/);

    // Selected track must still be pi-agent in English edition
    const enPiCard = page.locator('.track-card[data-track="pi-agent"]');
    assert.ok(await enPiCard.evaluate(el => el.classList.contains('selected')), 'Pi Agent must remain selected in English');
    const enDraftVal = await page.locator('.exercise-draft-input[data-activity-id="agent-common-practice-01"]').inputValue();
    assert.strictEqual(enDraftVal, 'STEP 1-7: Identified deleted assertions and credential leak. Executed local pytest exit code 0.');

    // Switch to Japanese
    await page.locator('.lang-switcher .lang-link[data-lang="ja"]').click();
    await page.waitForLoadState('domcontentloaded');
    assert.match(page.url(), /\/ja\/agent-track/);
    const jaPiCard = page.locator('.track-card[data-track="pi-agent"]');
    assert.ok(await jaPiCard.evaluate(el => el.classList.contains('selected')));

    // Switch to Traditional Chinese
    await page.locator('.lang-switcher .lang-link[data-lang="zh-Hant"]').click();
    await page.waitForLoadState('domcontentloaded');
    assert.match(page.url(), /\/zh-Hant\/agent-track/);
    const hantPiCard = page.locator('.track-card[data-track="pi-agent"]');
    assert.ok(await hantPiCard.evaluate(el => el.classList.contains('selected')));

    // Switch back to Simplified Chinese
    await page.locator('.lang-switcher .lang-link[data-lang="zh-Hans"]').click();
    await page.waitForLoadState('domcontentloaded');

    // 7. Session Persistence & Multi-User Isolation
    console.log('7. Testing authentication session persistence and multi-user isolation...');
    // Sign in as Alice
    await page.goto(`${baseUrl}/auth/google?returnTo=/zh-Hans/agent-track`);
    await page.waitForLoadState('domcontentloaded');
    await page.locator('button[data-user="alice"]').click();
    await page.waitForLoadState('domcontentloaded');
    assert.match(page.url(), /\/zh-Hans\/agent-track/);

    // Alice selects DeepSeek Harness
    const aliceDsCard = page.locator('.track-card[data-track="deepseek-harness"]');
    await aliceDsCard.locator('.btn-select-track').click();
    await page.waitForTimeout(500);
    assert.ok(await aliceDsCard.evaluate(el => el.classList.contains('selected')));

    // Alice saves draft on shared exercise
    const aliceDraft = page.locator('.exercise-draft-input[data-activity-id="agent-common-practice-01"]');
    await aliceDraft.fill('Alice review: Discarded secrets.env modification and verified exit code 0.');
    await page.locator('.btn-save-progress[data-activity-id="agent-common-practice-01"]').click();
    await page.waitForTimeout(500);

    // Refresh page for Alice
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    const aliceDsReloaded = page.locator('.track-card[data-track="deepseek-harness"]');
    assert.ok(await aliceDsReloaded.evaluate(el => el.classList.contains('selected')), 'Alice track must persist across refresh');
    assert.strictEqual(await aliceDraft.inputValue(), 'Alice review: Discarded secrets.env modification and verified exit code 0.');

    // Logout Alice
    await page.locator('.btn-logout').click();
    await page.waitForLoadState('domcontentloaded');

    // Sign in as Bob
    await page.goto(`${baseUrl}/auth/google?returnTo=/zh-Hans/agent-track`);
    await page.waitForLoadState('domcontentloaded');
    await page.locator('button[data-user="bob"]').click();
    await page.waitForLoadState('domcontentloaded');

    // Bob selects Codex
    const bobCodex = page.locator('.track-card[data-track="codex"]');
    await bobCodex.locator('.btn-select-track').click();
    await page.waitForTimeout(500);
    assert.ok(await bobCodex.evaluate(el => el.classList.contains('selected')), 'Bob track should be codex');

    // Bob's exercise draft is isolated (not Alice's)
    const bobDraft = page.locator('.exercise-draft-input[data-activity-id="agent-common-practice-01"]');
    assert.notStrictEqual(await bobDraft.inputValue(), 'Alice review: Discarded secrets.env modification and verified exit code 0.');

    // Logout Bob and re-login Alice
    await page.locator('.btn-logout').click();
    await page.waitForLoadState('domcontentloaded');

    await page.goto(`${baseUrl}/auth/google?returnTo=/zh-Hans/agent-track`);
    await page.waitForLoadState('domcontentloaded');
    await page.locator('button[data-user="alice"]').click();
    await page.waitForLoadState('domcontentloaded');

    // Alice's track is STILL deepseek-harness, unaffected by Bob
    const aliceRestored = page.locator('.track-card[data-track="deepseek-harness"]');
    assert.ok(await aliceRestored.evaluate(el => el.classList.contains('selected')), 'Alice track must remain deepseek-harness (Multi-user isolation)');

    // 8. Safe Failure, Invalid Selections & Ownership Protection
    console.log('8. Testing safe failure, invalid selections & ownership tampering rejection...');
    const invalidSelectionRes = await page.evaluate(async () => {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({ track: 'invalid-malicious-track' })
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, error: data.error };
    });
    assert.strictEqual(invalidSelectionRes.status, 400, 'Invalid track selection must return 400');
    assert.ok(invalidSelectionRes.error.includes('Invalid agent tool track'), 'Should safely reject invalid track');

    // Bob spoof attempt via browser
    const spoofRes = await page.evaluate(async () => {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({ track: 'codex', user_id: 'arbitrary-victim-user-id' })
      });
      return res.status;
    });
    assert.strictEqual(spoofRes, 403, 'Spoofing user_id in track selection must return 403');

    // Alice's track remains deepseek-harness
    assert.ok(await aliceRestored.evaluate(el => el.classList.contains('selected')), 'Alice track must remain deepseek-harness after rejected requests');

    // 9. Mobile Viewport & Responsiveness
    console.log('9. Testing mobile viewport responsiveness (375x812)...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(200);

    const isOverflowing = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert.strictEqual(isOverflowing, false, 'Mobile viewport must not produce horizontal overflow');

    console.log('>>> ALL AGENT TOOL TRACK BROWSER SEAM TESTS PASSED! <<<');
  } finally {
    await browser.close();
    serverProcess.kill('SIGTERM');
  }
}

runBrowserTests().catch(err => {
  console.error('Browser Test Failed:', err);
  process.exit(1);
});
