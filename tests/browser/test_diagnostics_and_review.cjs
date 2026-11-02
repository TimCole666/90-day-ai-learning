// Browser-level seam tests for 4-Language Diagnostic Flow and Review Plan Generation (Ticket 08)
// Run with: NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules node tests/browser/test_diagnostics_and_review.cjs
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
    AUTH_ADAPTER: 'test',
    PORT: '0'
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
  console.log('--- Starting Diagnostics & Review Plans Browser Seam Tests ---');
  const { server, origin } = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });

    // ==========================================
    // 1. Four-Language Diagnostics Rendering
    // ==========================================
    console.log('1. Testing four-language diagnostic page structure across zh-Hans, zh-Hant, en, ja...');
    const contextGuest = await browser.newContext();
    const page = await contextGuest.newPage();

    const expectedSnippets = {
      'zh-Hans': { heading: '前置诊断与针对性复习计划', q1: '在 Python 中，当执行' },
      'zh-Hant': { heading: '前置診斷與針對性複習計劃', q1: '在 Python 中，當執行' },
      'en': { heading: 'Prerequisite Diagnostics & Targeted Review Plan', q1: 'In Python, when executing' },
      'ja': { heading: '前提知識診断とターゲット復習プラン', q1: 'Pythonにおいて' }
    };

    for (const [lang, exp] of Object.entries(expectedSnippets)) {
      await page.goto(`${origin}/${lang}/diagnostics`, { waitUntil: 'domcontentloaded' });
      const container = page.locator('.diagnostics-container');
      await container.waitFor({ state: 'visible', timeout: 5000 });
      const pageText = await page.locator('.diagnostics-main').textContent();
      assert.ok(pageText.includes(exp.heading), `Language ${lang} should contain heading: ${exp.heading}`);
      assert.ok(pageText.includes(exp.q1), `Language ${lang} should contain snippet: ${exp.q1}`);

      // Verify questions count (5 questions covering Python + Math prerequisites)
      const qCards = page.locator('.diagnostic-question-card');
      assert.equal(await qCards.count(), 5, `Language ${lang} must render 5 diagnostic question cards`);
    }

    // ==========================================
    // 2. Alice Signs in, Submits Diagnostic with Gaps
    // ==========================================
    console.log('2. Testing authenticated diagnosis with gaps and review plan generation...');
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();

    await pageAlice.goto(`${origin}/auth/google?returnTo=/en/diagnostics`);
    await pageAlice.waitForURL(/auth\/test-provider/);
    await pageAlice.click('button[data-user="alice"]');
    await pageAlice.waitForURL(/diagnostics/);

    const diagAlice = pageAlice.locator('.diagnostics-container');
    await diagAlice.waitFor({ state: 'visible', timeout: 5000 });

    // A failed save must remain visible and must not navigate or present a plan.
    await pageAlice.route('**/api/diagnostics/submit', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'simulated persistence failure' })
    }));
    await pageAlice.click('.btn-submit-diagnostic');
    await pageAlice.waitForSelector('.diag-status-message.status-error', { state: 'visible', timeout: 3000 });
    assert.match(await pageAlice.locator('.diag-status-message').textContent(), /simulated persistence failure/i);
    await pageAlice.unroute('**/api/diagnostics/submit');

    // Verify unverified skip checkbox is available and test claim
    const unverifiedSkipBox = pageAlice.locator('#chk-skip-py');
    if (await unverifiedSkipBox.count() > 0) {
      await unverifiedSkipBox.check();
    }

    // Answer questions with gaps:
    // q1: wrong answer 'a' (py_mutability)
    await pageAlice.locator('input[name="diag_q1"][value="a"]').check();
    // q2: correct answer 'b' (py_control_scope)
    await pageAlice.locator('input[name="diag_q2"][value="b"]').check();
    // q3: wrong answer 'a' (math_calculus_derivatives)
    await pageAlice.locator('input[name="diag_q3"][value="a"]').check();
    // q4: correct answer 'b' (math_linear_algebra_tensors)
    await pageAlice.locator('input[name="diag_q4"][value="b"]').check();
    // q5: marked uncertain checkbox
    await pageAlice.locator('input[name="diag_q5"][value="b"]').check();
    const q5Uncertain = pageAlice.locator('#chk-uncertain-q5');
    if (await q5Uncertain.count() > 0) {
      await q5Uncertain.check();
    }

    // Submit diagnostic
    await pageAlice.click('.btn-submit-diagnostic');

    // Verify review plan container appears
    const reviewPlanSection = pageAlice.locator('.review-plan-section');
    await reviewPlanSection.waitFor({ state: 'visible', timeout: 6000 });

    const reviewPlanText = await reviewPlanSection.textContent();
    assert.match(reviewPlanText, /Review Plan/i, 'Review plan section must be rendered');
    assert.match(reviewPlanText, /Day 07/i, 'Must link review allocation to scheduled review days (Day 07)');
    assert.match(reviewPlanText, /720/i, 'Must explicitly state 720 mandatory hours maintained');

    // Check that review items link to real activities
    const reviewItemLinks = pageAlice.locator('.review-item-link');
    const linkCount = await reviewItemLinks.count();
    assert.ok(linkCount >= 2, 'Must display at least 2 linked review activities for gaps/uncertain concepts');

    const firstHref = await reviewItemLinks.first().getAttribute('href');
    assert.match(firstHref, /\/(?:zh-Hans|zh-Hant|en|ja)\/day-\d{2}#day-\d{2}-act-\d{2}/, 'Review link must target real curriculum activity anchor');

    // Verify explicit recovery objectives and retry conditions
    const objectives = pageAlice.locator('.review-item-objective');
    assert.ok(await objectives.count() >= 2, 'Review items must list explicit objectives');

    const retryConditions = pageAlice.locator('.review-item-retry');
    assert.ok(await retryConditions.count() >= 2, 'Review items must list explicit retry conditions');

    // Check unverified skip feedback: mere checkbox does not grant skip
    const skipNotice = pageAlice.locator('.skip-guidance-container .skip-guidance-notice');
    if (await skipNotice.count() > 0) {
      const skipText = await skipNotice.first().textContent();
      assert.match(skipText, /demonstrated/i, 'Skip notice must mention demonstrated mastery check requirement');
    }

    // ==========================================
    // 3. Alice Retries Diagnostic and Achieves 100% Mastery
    // ==========================================
    console.log('3. Testing diagnostic retry and evidence-based skip guidance...');
    const retryBtn = pageAlice.locator('.btn-retry-diagnostic');
    await retryBtn.click();

    // Answer all 5 questions correctly
    await pageAlice.locator('input[name="diag_q1"][value="b"]').check();
    await pageAlice.locator('input[name="diag_q2"][value="b"]').check();
    await pageAlice.locator('input[name="diag_q3"][value="b"]').check();
    await pageAlice.locator('input[name="diag_q4"][value="b"]').check();
    await pageAlice.locator('input[name="diag_q5"][value="b"]').check();

    // Uncheck any uncertain boxes
    const q5UncertainRetry = pageAlice.locator('#chk-uncertain-q5');
    if (await q5UncertainRetry.count() > 0 && await q5UncertainRetry.isChecked()) {
      await q5UncertainRetry.uncheck();
    }

    await pageAlice.click('.btn-submit-diagnostic');
    await reviewPlanSection.waitFor({ state: 'visible', timeout: 6000 });

    const updatedText = await reviewPlanSection.textContent();
    assert.match(updatedText, /100%/, 'Updated summary should reflect 100% score');
    assert.match(updatedText, /Skip/i, 'Should display evidence-based skip guidance');
    assert.match(updatedText, /demonstrated/i, 'Skip guidance must cite demonstrated criteria');
    assert.match(updatedText, /recovery/i, 'Skip guidance must cite recovery material');

    // ==========================================
    // 4. Multi-User Isolation: Bob has no review plan
    // ==========================================
    console.log('4. Testing multi-user isolation with Bob...');
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();

    await pageBob.goto(`${origin}/auth/google?returnTo=/en/diagnostics`);
    await pageBob.waitForURL(/auth\/test-provider/);
    await pageBob.click('button[data-user="bob"]');
    await pageBob.waitForURL(/diagnostics/);

    const bobContainer = pageBob.locator('.diagnostics-container');
    await bobContainer.waitFor({ state: 'visible', timeout: 5000 });
    // Bob should see questionnaire, NOT Alice's generated plan
    const bobPlanSection = pageBob.locator('.review-plan-section');
    assert.equal(await bobPlanSection.isVisible(), false, 'Bob should not see Alice review plan');

    // ==========================================
    // 5. Fresh-Session Recovery: Alice in new incognito context
    // ==========================================
    console.log('5. Testing fresh-session recovery for Alice...');
    const contextFresh = await browser.newContext();
    const pageFresh = await contextFresh.newPage();

    await pageFresh.goto(`${origin}/auth/google?returnTo=/en/diagnostics`);
    await pageFresh.waitForURL(/auth\/test-provider/);
    await pageFresh.click('button[data-user="alice"]');
    await pageFresh.waitForURL(/diagnostics/);

    const freshPlanSection = pageFresh.locator('.review-plan-section');
    await freshPlanSection.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await freshPlanSection.isVisible(), true, 'Alice review plan must be restored in fresh session');
    assert.match(await freshPlanSection.textContent(), /100%/, 'Restored review plan maintains Alice 100% result');

    // ==========================================
    // 6. Language Switching Persists Review Plan
    // ==========================================
    console.log('6. Testing language switching on saved review plan...');
    await pageFresh.click('.lang-switcher a[data-lang="zh-Hans"]');
    await pageFresh.waitForURL(/\/zh-Hans\/diagnostics/);

    const zhPlanSection = pageFresh.locator('.review-plan-section');
    await zhPlanSection.waitFor({ state: 'visible', timeout: 5000 });
    const zhText = await zhPlanSection.textContent();
    assert.match(zhText, /复习计划|跳过建议|诊断/, 'Review plan should render in Simplified Chinese');

    console.log('>>> ALL DIAGNOSTICS & REVIEW PLANS BROWSER SEAM TESTS PASSED! <<<');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(err => {
  console.error('Browser seam test failed:', err);
  process.exit(1);
});
