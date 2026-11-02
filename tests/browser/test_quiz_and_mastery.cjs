// Browser-level seam tests for 4-Language Quiz, Deterministic Grading, and Separated Mastery Evidence
// Run with: NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules node tests/browser/test_quiz_and_mastery.cjs
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
  console.log('--- Starting Quiz & Separated Mastery Evidence Seam Tests ---');
  const { server, origin } = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });

    // ==========================================
    // 1. Four-Language Quiz Rendering
    // ==========================================
    console.log('1. Testing four-language quiz structure across zh-Hans, zh-Hant, en, ja...');
    const contextGuest = await browser.newContext();
    const page = await contextGuest.newPage();

    const expectedSnippets = {
      'zh-Hans': { title: '客观诊断测验', opt: '在 Python 中，变量赋值' },
      'zh-Hant': { title: '客觀診斷測驗', opt: '在 Python 中，變數賦值' },
      'en': { title: 'Objective Diagnostic Check', opt: 'In Python, variable assignment' },
      'ja': { title: '客観的診断クイズ', opt: 'Pythonにおいて変数代入' }
    };

    for (const [lang, exp] of Object.entries(expectedSnippets)) {
      await page.goto(`${origin}/${lang}/day-01#day-01-act-01`, { waitUntil: 'domcontentloaded' });
      const quizContainer = page.locator('#day-01-act-01 .quiz-container');
      await quizContainer.waitFor({ state: 'visible', timeout: 5000 });
      
      const text = await quizContainer.textContent();
      assert.ok(text.includes(exp.title), `Language ${lang} should contain title snippet: ${exp.title}`);

      // Verify question 1 options
      const q1Card = page.locator('#day-01-act-01 .quiz-question-card[data-question-id="q1"]');
      await q1Card.waitFor({ state: 'visible', timeout: 3000 });
      const optionsCount = await q1Card.locator('.quiz-option-label').count();
      assert.equal(optionsCount, 4, `Question 1 in ${lang} must render 4 options`);

      // Verify hint toggle
      const hintBtn = q1Card.locator('.btn-toggle-q-hint');
      await hintBtn.click();
      const hintDiv = q1Card.locator('.question-hint');
      await hintDiv.waitFor({ state: 'visible', timeout: 2000 });
      assert.ok((await hintDiv.textContent()).length > 10, 'Question hint should expand with content');
    }

    // ==========================================
    // 2. Alice Signs in, selects Independent mode, and passes quiz
    // ==========================================
    console.log('2. Testing authenticated quiz submission with Independent Mastery Check...');
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();

    await pageAlice.goto(`${origin}/auth/google?returnTo=/en/day-01#day-01-act-01`);
    await pageAlice.waitForURL(/auth\/test-provider/);
    await pageAlice.click('button[data-user="alice"]');
    await pageAlice.waitForURL(/day-01/);

    const quizAlice = pageAlice.locator('#day-01-act-01 .quiz-container');
    await quizAlice.waitFor({ state: 'visible', timeout: 5000 });

    // Verify Independent radio is selected by default or select it
    const independentRadio = quizAlice.locator('input[value="independent"]');
    await independentRadio.check();
    assert.equal(await independentRadio.isChecked(), true);

    // Select correct answers: q1 -> b, q2 -> c, q3 -> b
    await quizAlice.locator('input[name="quiz_day-01-act-01_q1"][value="b"]').check();
    await quizAlice.locator('input[name="quiz_day-01-act-01_q2"][value="c"]').check();
    await quizAlice.locator('input[name="quiz_day-01-act-01_q3"][value="b"]').check();

    // Submit
    const submitBtn = quizAlice.locator('.btn-submit-quiz');
    await submitBtn.click();

    // Verify results banner shows 100% score and passed
    const banner = quizAlice.locator('.quiz-results-banner');
    await banner.waitFor({ state: 'visible', timeout: 5000 });
    const bannerText = await banner.textContent();
    assert.match(bannerText, /100%/, 'Result banner must show 100%');
    assert.match(bannerText, /Passed/i, 'Result banner must show Passed');

    // Verify each question shows correct feedback and explanation
    const q1Feedback = quizAlice.locator('.quiz-question-card[data-question-id="q1"] .question-feedback');
    await q1Feedback.waitFor({ state: 'visible', timeout: 3000 });
    assert.match(await q1Feedback.textContent(), /same list object|in-place/i, 'Feedback should display explanation');

    // Verify mastery badge displays "Independent Mastery Verified"
    const indepBadge = quizAlice.locator('.badge-independent');
    await indepBadge.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await indepBadge.isVisible(), true, 'Independent Mastery Verified badge should be visible');

    // ==========================================
    // 3. Retry quiz with imperfect answers under Agent-Assisted mode
    // ==========================================
    console.log('3. Testing retry with Agent-Assisted mode and imperfect score...');
    const retryBtn = quizAlice.locator('.btn-retry-quiz');
    await retryBtn.waitFor({ state: 'visible', timeout: 3000 });
    await retryBtn.click();

    // Change assistance mode to agent_assisted
    const agentRadio = quizAlice.locator('input[value="agent_assisted"]');
    await agentRadio.check();

    // Select answers: q1 -> a (wrong), q2 -> c (correct), q3 -> b (correct)
    await quizAlice.locator('input[name="quiz_day-01-act-01_q1"][value="a"]').check();
    await quizAlice.locator('input[name="quiz_day-01-act-01_q2"][value="c"]').check();
    await quizAlice.locator('input[name="quiz_day-01-act-01_q3"][value="b"]').check();

    await Promise.all([
      pageAlice.waitForResponse(resp => resp.url().includes('/api/quiz/submit') && resp.status() === 200),
      submitBtn.click()
    ]);
    await banner.waitFor({ state: 'visible', timeout: 5000 });
    const bannerTextRetry = await banner.textContent();
    assert.match(bannerTextRetry, /67%/, 'Imperfect retry should show 67%');

    // Verify attempt history has 2 records
    const historyItems = quizAlice.locator('.attempts-history-list .attempt-record-item');
    assert.equal(await historyItems.count(), 2, 'History list should contain 2 attempts');

    // Alice's independent badge remains because she already earned it!
    assert.equal(await indepBadge.isVisible(), true);

    // ==========================================
    // 4. Bob signs in: self-reported checkbox completion cannot mint verified quiz evidence
    // ==========================================
    console.log('4. Testing Bob: checkbox completion CANNOT mint verified quiz evidence...');
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();

    await pageBob.goto(`${origin}/auth/google?returnTo=/en/day-01#day-01-act-01`);
    await pageBob.waitForURL(/auth\/test-provider/);
    await pageBob.click('button[data-user="bob"]');
    await pageBob.waitForURL(/day-01/);

    const quizBob = pageBob.locator('#day-01-act-01 .quiz-container');
    await quizBob.waitFor({ state: 'visible', timeout: 5000 });

    // Bob has 0 attempts initially
    const bobHistory = quizBob.locator('.attempts-history-list .attempt-record-item');
    assert.equal(await bobHistory.count(), 0, 'Bob must have 0 attempts');

    // Bob checks the activity completion checkbox and clicks Save
    const bobControls = pageBob.locator(`.exercise-progress-controls[data-activity-id="day-01-act-01"]`);
    const bobCheckbox = bobControls.locator('.activity-completion-checkbox');
    await bobCheckbox.check();
    await bobControls.locator('.btn-save-progress').click();
    await bobControls.locator('.save-status-indicator.status-saved').waitFor({ state: 'visible', timeout: 5000 });

    // Bob reloads page to verify persisted state
    await pageBob.reload({ waitUntil: 'domcontentloaded' });
    await pageBob.locator('#day-01-act-01 .quiz-container').waitFor({ state: 'visible', timeout: 5000 });

    // Verify Bob's self-reported badge is visible in evidence panel, but independent/agent badges are hidden
    const bobSelfBadge = pageBob.locator('#day-01-act-01 .badge-self-reported');
    await bobSelfBadge.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await bobSelfBadge.isVisible(), true, 'Self-reported badge should be visible');

    const bobIndepBadge = pageBob.locator('#day-01-act-01 .badge-independent');
    assert.equal(await bobIndepBadge.isVisible(), false, 'Bob MUST NOT have Independent Mastery badge');

    const bobAgentBadge = pageBob.locator('#day-01-act-01 .badge-agent');
    assert.equal(await bobAgentBadge.isVisible(), false, 'Bob MUST NOT have Agent-Assisted badge');

    // ==========================================
    // 5. Fresh-Session Recovery for Alice
    // ==========================================
    console.log('5. Testing fresh-session recovery for Alice in new incognito context...');
    const contextAliceFresh = await browser.newContext();
    const pageAliceFresh = await contextAliceFresh.newPage();

    await pageAliceFresh.goto(`${origin}/auth/google?returnTo=/en/day-01#day-01-act-01`);
    await pageAliceFresh.waitForURL(/auth\/test-provider/);
    await pageAliceFresh.click('button[data-user="alice"]');
    await pageAliceFresh.waitForURL(/day-01/);

    const quizAliceFresh = pageAliceFresh.locator('#day-01-act-01 .quiz-container');
    await quizAliceFresh.waitFor({ state: 'visible', timeout: 5000 });

    // Alice's independent badge must be recovered
    const aliceFreshIndep = quizAliceFresh.locator('.badge-independent');
    await aliceFreshIndep.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await aliceFreshIndep.isVisible(), true, 'Alice Independent badge should recover in fresh session');

    // Alice's attempt history list has 2 attempts
    const aliceFreshHistory = quizAliceFresh.locator('.attempts-history-list .attempt-record-item');
    assert.equal(await aliceFreshHistory.count(), 2, 'Alice 2 historical attempts must recover in fresh session');

    // ==========================================
    // 6. Content Revision Change & Stale Evidence
    // ==========================================
    console.log('6. Testing content revision tracking and stale evidence flag...');
    const reloadWords = { en: /Reload/, ja: /再読み込み/, 'zh-Hans': /重新加载/, 'zh-Hant': /重新載入/ };
    for (const lang of ['en', 'ja', 'zh-Hans', 'zh-Hant']) {
      await pageAliceFresh.goto(`${origin}/${lang}/day-01`, { waitUntil: 'networkidle' });
      const staleQuiz = pageAliceFresh.locator('#day-01-act-01 .quiz-container');
      await staleQuiz.evaluate(container => { container.dataset.revision = 'revision-before-deployment'; });
      const [conflict] = await Promise.all([
        pageAliceFresh.waitForResponse(response => response.url().includes('/api/quiz/submit') && response.status() === 409),
        staleQuiz.locator('.btn-submit-quiz').click()
      ]);
      assert.equal((await conflict.json()).code, 'stale_content_revision');
      const status = staleQuiz.locator('.quiz-submit-status');
      await status.waitFor({ state: 'visible' });
      assert.match(await status.textContent(), reloadWords[lang], `${lang} must explain reload and revalidation`);
      const unchanged = await pageAliceFresh.request.get(`${origin}/api/quiz/attempts?activityId=day-01-act-01`);
      assert.equal((await unchanged.json()).summary.attempts.length, 2, 'Stale submissions must not add mastery evidence');
    }

    // Reloading must restore the rendered revision and permit a new valid attempt.
    await pageAliceFresh.goto(`${origin}/en/day-01`, { waitUntil: 'networkidle' });
    const reloadedQuiz = pageAliceFresh.locator('#day-01-act-01 .quiz-container');
    for (const [question, choice] of Object.entries({ q1: 'b', q2: 'c', q3: 'b' })) {
      await reloadedQuiz.locator(`input[name="quiz_day-01-act-01_${question}"][value="${choice}"]`).check();
    }
    const [accepted] = await Promise.all([
      pageAliceFresh.waitForResponse(response => response.url().includes('/api/quiz/submit') && response.status() === 200),
      reloadedQuiz.locator('.btn-submit-quiz').click()
    ]);
    const saved = await accepted.json();
    assert.equal(saved.content_revision, await reloadedQuiz.getAttribute('data-revision'));
    assert.equal(saved.passed, true);
    const attemptsResp = await pageAliceFresh.request.get(`${origin}/api/quiz/attempts?activityId=day-01-act-01`);
    assert.equal((await attemptsResp.json()).summary.attempts.length, 3, 'Only the reloaded attempt should be added');

    // ==========================================
    // 7. Rejected Payloads & Save Failure Handling
    // ==========================================
    console.log('7. Testing rejected payloads and client error feedback...');
    const rejectedResult = await pageAliceFresh.evaluate(async () => {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({
          activity_id: 'day-01-act-01',
          assistance_mode: 'unauthorized_assistance_bot', // Invalid mode!
          answers: {}
        })
      });
      return { status: res.status, json: await res.json() };
    });
    assert.equal(rejectedResult.status, 400, 'Invalid assistance mode must be rejected with 400');
    assert.match(rejectedResult.json.error, /Invalid assistance mode/i);

    // Spoofed user ID rejection
    const spoofResult = await pageAliceFresh.evaluate(async () => {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({
          user_id: 'impersonated-user-uuid',
          activity_id: 'day-01-act-01',
          assistance_mode: 'independent',
          answers: { q1: 'b', q2: 'c', q3: 'b' }
        })
      });
      return { status: res.status, json: await res.json() };
    });
    assert.equal(spoofResult.status, 403, 'Spoofed user ID must be rejected with 403 Forbidden');

    console.log('\n>>> ALL QUIZ & SEPARATED MASTERY BROWSER SEAM TESTS PASSED! <<<');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(err => {
  console.error('Quiz browser test failed:', err);
  process.exit(1);
});
