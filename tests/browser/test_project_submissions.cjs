// Browser-level seam tests for Learning Project Submissions, Bounded Constraints, Multi-User Isolation, and Evidence Separation
// Run with: NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules node tests/browser/test_project_submissions.cjs
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

async function waitForStatusText(statusLocator, expectedText, label) {
  await withTimeout((async () => {
    while (true) {
      if ((await statusLocator.textContent()).includes(expectedText)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  })(), 5000, label);
}

async function startServer() {
  const env = Object.assign({}, process.env, {
    DB_PATH: ':memory:',
    PORT: '0',
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
  console.log('--- Starting Learning Project Submissions Seam Tests ---');
  const { server, origin } = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });

    // ==========================================
    // 1. Four-Language Project Submission UI Rendering
    // ==========================================
    console.log('1. Testing four-language project submission structure across zh-Hans, zh-Hant, en, ja...');
    const contextGuest = await browser.newContext();
    const page = await contextGuest.newPage();

    const expectedSnippets = {
      'zh-Hans': { title: '学习项目提交与证据', repoLabel: '代码仓库链接', logNotice: '粘贴的执行日志与文字说明属于自述证据' },
      'zh-Hant': { title: '學習專案提交與證據', repoLabel: '程式碼倉庫連結', logNotice: '貼上的執行日誌與文字說明屬於自述證據' },
      'en': { title: 'Learning Project Submission & Evidence', repoLabel: 'Repository Link', logNotice: 'Pasted execution logs and notes are self-reported evidence' },
      'ja': { title: '学習プロジェクト提出と証拠', repoLabel: 'リポジトリリンク', logNotice: '貼り付けられた実行ログやメモは自己申告の証拠であり' }
    };

    for (const [lang, exp] of Object.entries(expectedSnippets)) {
      await page.goto(`${origin}/${lang}/day-01#day-01-act-01`, { waitUntil: 'domcontentloaded' });
      const submissionSection = page.locator('#day-01-act-01 .project-submission-container');
      await submissionSection.waitFor({ state: 'visible', timeout: 5000 });

      const text = await submissionSection.textContent();
      assert.ok(text.includes(exp.title), `Language ${lang} should contain title: "${exp.title}"`);
      assert.ok(text.includes(exp.repoLabel), `Language ${lang} should contain repo label: "${exp.repoLabel}"`);
      assert.ok(text.includes(exp.logNotice), `Language ${lang} should contain log notice: "${exp.logNotice}"`);

      // Verify assistance mode options present
      const indLabel = submissionSection.locator('input[value="independent"]');
      const agentLabel = submissionSection.locator('input[value="agent_assisted"]');
      assert.equal(await indLabel.count(), 1, `Language ${lang} should have independent mode radio`);
      assert.equal(await agentLabel.count(), 1, `Language ${lang} should have agent_assisted mode radio`);
    }

    // ==========================================
    // 2. Four-Language Success, Validation, Save-Failure, and Stale Feedback
    // ==========================================
    console.log('2. Testing localized success, validation, save-failure, and stale feedback...');
    const feedbackText = {
      'zh-Hans': {
        saved: '提交已成功保存。',
        invalid: '无效链接',
        failed: '提交保存失败。',
        stale: '历史证据'
      },
      'zh-Hant': {
        saved: '提交已成功儲存。',
        invalid: '無效連結',
        failed: '提交儲存失敗。',
        stale: '歷史證據'
      },
      en: {
        saved: 'Submission saved successfully.',
        invalid: 'Invalid URL',
        failed: 'Submission failed.',
        stale: 'Historical Evidence'
      },
      ja: {
        saved: '提出内容が正常に保存されました。',
        invalid: '無効なURL',
        failed: '提出の保存に失敗しました。',
        stale: '過去の証拠'
      }
    };

    for (const lang of Object.keys(expectedSnippets)) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const expected = feedbackText[lang];

      await page.goto(`${origin}/auth/google?returnTo=/${lang}/day-01#day-01-act-01`);
      await page.waitForURL(/auth\/test-provider/);
      await page.click('button[data-user="alice"]');
      await page.waitForURL(/day-01/);

      const submission = page.locator('#day-01-act-01 .project-submission-container');
      await submission.waitFor({ state: 'visible', timeout: 5000 });
      const status = submission.locator('.project-submit-status');

      await submission.locator('.project-repo-input').fill('javascript:alert(1)');
      await submission.locator('.btn-submit-project').click();
      await waitForStatusText(status, expected.invalid, `${lang} URL validation feedback`);

      await submission.locator('.project-repo-input').fill(`https://example.com/${lang}/project`);
      await submission.locator('.project-notes-input').fill(`Localized save coverage for ${lang}.`);
      await submission.locator('.btn-submit-project').click();
      await waitForStatusText(status, expected.saved, `${lang} success feedback`);

      await page.route('**/api/project/submit', route => route.abort());
      await submission.locator('.project-notes-input').fill(`Localized failure coverage for ${lang}.`);
      await submission.locator('.btn-submit-project').click();
      await waitForStatusText(status, expected.failed, `${lang} save-failure feedback`);
      await page.unroute('**/api/project/submit');

      await submission.evaluate(node => node.setAttribute('data-revision', '2026.11.01-rev2'));
      await page.evaluate(() => window.refreshProjectEvidence && window.refreshProjectEvidence('day-01-act-01'));
      const staleBadge = submission.locator('.badge-evidence.badge-stale');
      await staleBadge.waitFor({ state: 'visible', timeout: 5000 });
      assert.ok((await staleBadge.textContent()).includes(expected.stale), `${lang} should localize stale-revision feedback`);

      await context.close();
    }

    // ==========================================
    // 3. Alice Signs in, Submits Project with Independent Mode & Claude Code Track
    // ==========================================
    console.log('2. Testing authenticated project submission for Alice...');
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();

    await pageAlice.goto(`${origin}/auth/google?returnTo=/en/day-01#day-01-act-01`);
    await pageAlice.waitForURL(/auth\/test-provider/);
    await pageAlice.click('button[data-user="alice"]');
    await pageAlice.waitForURL(/day-01/);

    const subAlice = pageAlice.locator('#day-01-act-01 .project-submission-container');
    await subAlice.waitFor({ state: 'visible', timeout: 5000 });

    // Fill in project submission details
    await subAlice.locator('.project-repo-input').fill('https://github.com/alice/day01-mre-project');
    await subAlice.locator('.project-report-input').fill('https://alice.dev/day01-report');
    await subAlice.locator('.project-notes-input').fill('Completed initial minimal reproduction experiment and diagnostic trace.');
    await subAlice.locator('input[value="independent"]').check();
    await subAlice.locator('.project-track-select').selectOption('claude-code');

    // Click submit
    await subAlice.locator('.btn-submit-project').click();

    // Verify submission status message
    const statusMsg = subAlice.locator('.project-submit-status');
    await waitForStatusText(statusMsg, 'saved', 'Alice initial submission success');
    const statusText = await statusMsg.textContent();
    assert.ok(statusText.includes('saved') || statusText.includes('Saved') || statusText.includes('success'), `Status text should indicate success: "${statusText}"`);

    // Verify evidence inspection panel
    const evidencePanel = subAlice.locator('.project-evidence-panel');
    await evidencePanel.waitFor({ state: 'visible', timeout: 5000 });

    // Verify safe link rendering (rel="noopener noreferrer" and target="_blank")
    const repoAnchor = evidencePanel.locator('a.evidence-repo-link');
    assert.equal(await repoAnchor.getAttribute('href'), 'https://github.com/alice/day01-mre-project');
    assert.equal(await repoAnchor.getAttribute('target'), '_blank');
    assert.ok((await repoAnchor.getAttribute('rel')).includes('noopener'));

    const reportAnchor = evidencePanel.locator('a.evidence-report-link');
    assert.equal(await reportAnchor.getAttribute('href'), 'https://alice.dev/day01-report');

    // Verify evidence status is strictly 'self_reported'
    const statusBadge = evidencePanel.locator('.badge-evidence.badge-self-reported');
    await statusBadge.waitFor({ state: 'visible', timeout: 3000 });
    assert.ok((await statusBadge.textContent()).includes('Self-Reported Evidence'));

    // Verify selected track and assistance mode
    const modeBadge = evidencePanel.locator('.evidence-mode-badge');
    assert.ok((await modeBadge.textContent()).includes('Independent'));
    const trackBadge = evidencePanel.locator('.evidence-track-badge');
    assert.ok((await trackBadge.textContent()).includes('Claude Code'));

    // ==========================================
    // 3. Multi-User Isolation: Bob Cannot See Alice's Submission
    // ==========================================
    console.log('3. Testing multi-user isolation with Bob...');
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();

    await pageBob.goto(`${origin}/auth/google?returnTo=/en/day-01#day-01-act-01`);
    await pageBob.waitForURL(/auth\/test-provider/);
    await pageBob.click('button[data-user="bob"]');
    await pageBob.waitForURL(/day-01/);

    const subBob = pageBob.locator('#day-01-act-01 .project-submission-container');
    await subBob.waitFor({ state: 'visible', timeout: 5000 });

    // Bob's input fields must be empty and evidence panel should not show Alice's links
    const bobRepoVal = await subBob.locator('.project-repo-input').inputValue();
    assert.equal(bobRepoVal, '', 'Bob repo input must be empty');

    const bobEvidencePanel = subBob.locator('.project-evidence-panel');
    const bobHasAliceLink = await bobEvidencePanel.locator('a.evidence-repo-link').isVisible();
    assert.equal(bobHasAliceLink, false, "Bob must not see Alice's repo link");

    // ==========================================
    // 4. Fresh-Session Recovery for Alice
    // ==========================================
    console.log('4. Testing fresh-session recovery for Alice...');
    await contextAlice.close();

    const freshContextAlice = await browser.newContext();
    const freshPageAlice = await freshContextAlice.newPage();

    // Re-authenticate Alice in fresh context
    await freshPageAlice.goto(`${origin}/auth/google?returnTo=/en/day-01#day-01-act-01`);
    await freshPageAlice.waitForURL(/auth\/test-provider/);
    await freshPageAlice.click('button[data-user="alice"]');
    await freshPageAlice.waitForURL(/day-01/);

    const freshSubAlice = freshPageAlice.locator('#day-01-act-01 .project-submission-container');
    await freshSubAlice.waitFor({ state: 'visible', timeout: 5000 });

    // Alice's existing submission should be populated in inputs and evidence panel
    const loadedRepoVal = await freshSubAlice.locator('.project-repo-input').inputValue();
    assert.equal(loadedRepoVal, 'https://github.com/alice/day01-mre-project', 'Fresh session should load persisted repo URL');

    const freshRepoLink = freshSubAlice.locator('.project-evidence-panel a.evidence-repo-link');
    await freshRepoLink.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await freshRepoLink.getAttribute('href'), 'https://github.com/alice/day01-mre-project');

    // ==========================================
    // 5. Update Existing Submission
    // ==========================================
    console.log('5. Testing update existing submission for Alice...');
    await freshSubAlice.locator('.project-repo-input').fill('https://github.com/alice/day01-mre-project-v2');
    await freshSubAlice.locator('input[value="agent_assisted"]').check();
    await freshSubAlice.locator('.project-track-select').selectOption('deepseek-harness');
    await freshSubAlice.locator('.btn-submit-project').click();

    await waitForStatusText(freshSubAlice.locator('.project-submit-status'), 'saved', 'Alice submission update success');

    // Verify updated link in evidence panel
    const updatedRepoLink = freshSubAlice.locator('.project-evidence-panel a.evidence-repo-link');
    await updatedRepoLink.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await updatedRepoLink.getAttribute('href'), 'https://github.com/alice/day01-mre-project-v2');

    const updatedModeBadge = freshSubAlice.locator('.project-evidence-panel .evidence-mode-badge');
    assert.ok((await updatedModeBadge.textContent()).includes('Agent-Assisted'));

    // ==========================================
    // 6. Validation: Invalid URL Schemes & Excessive Payloads
    // ==========================================
    console.log('6. Testing client rejection of unsafe URL schemes and excessive payload...');
    // Unsafe scheme: javascript:alert(1)
    await freshSubAlice.locator('.project-repo-input').fill('javascript:alert(1)');
    await freshSubAlice.locator('.btn-submit-project').click();

    const errStatus = freshSubAlice.locator('.project-submit-status.status-error');
    await errStatus.waitFor({ state: 'visible', timeout: 5000 });
    const errMsg = await errStatus.textContent();
    assert.ok(errMsg.toLowerCase().includes('url') || errMsg.toLowerCase().includes('http'), `Validation message expected: "${errMsg}"`);

    // Verify existing record was NOT overwritten by the invalid update!
    await freshPageAlice.reload({ waitUntil: 'domcontentloaded' });
    const preservedSub = freshPageAlice.locator('#day-01-act-01 .project-submission-container');
    await preservedSub.waitFor({ state: 'visible', timeout: 5000 });
    const preservedRepoLink = preservedSub.locator('.project-evidence-panel a.evidence-repo-link');
    await preservedRepoLink.waitFor({ state: 'visible', timeout: 5000 });
    const preservedRepo = await preservedRepoLink.getAttribute('href');
    assert.equal(preservedRepo, 'https://github.com/alice/day01-mre-project-v2', 'Invalid submission must not corrupt accepted record');

    // ==========================================
    // 7. Pasted Test Logs Remain Self-Reported Evidence
    // ==========================================
    console.log('7. Verifying pasted test logs remain self-reported evidence...');
    await preservedSub.locator('.project-notes-input').fill('=== RUNNING ALL TESTS: 233 PASSED, 0 FAILED, 100% SUCCESS ===\npytest test_engine.py -> PASSED');
    await preservedSub.locator('.btn-submit-project').click();
    await waitForStatusText(preservedSub.locator('.project-submit-status'), 'saved', 'Alice evidence notes update success');

    // Verify status remains self-reported, does not become verified check
    const persistentStatusBadge = preservedSub.locator('.project-evidence-panel .badge-evidence.badge-self-reported');
    await persistentStatusBadge.waitFor({ state: 'visible', timeout: 3000 });
    assert.ok((await persistentStatusBadge.textContent()).includes('Self-Reported Evidence'));

    const verifiedBadgeVisible = await preservedSub.locator('.project-evidence-panel .badge-evidence.badge-verified').isVisible();
    assert.equal(verifiedBadgeVisible, false, 'Pasted logs must NEVER show as verified check');

    // ==========================================
    // 8. Stale Revision Feedback
    // ==========================================
    console.log('8. Testing stale revision feedback when activity revision changes...');
    // Simulate activity revision change on the container
    await preservedSub.evaluate(node => node.setAttribute('data-revision', '2026.11.01-rev2'));
    // Trigger UI refresh of evidence
    await freshPageAlice.evaluate(() => window.refreshProjectEvidence && window.refreshProjectEvidence('day-01-act-01'));

    const staleBadge = preservedSub.locator('.badge-evidence.badge-stale');
    await staleBadge.waitFor({ state: 'visible', timeout: 3000 });
    assert.ok((await staleBadge.textContent()).includes('Revalidation Needed') || (await staleBadge.textContent()).includes('Historical'));

    console.log('\n>>> ALL PROJECT SUBMISSION BROWSER SEAM TESTS PASSED! <<<');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(err => {
  console.error('Browser seam test failed:', err);
  process.exit(1);
});
