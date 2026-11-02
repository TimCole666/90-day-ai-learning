// Browser test for the translation-review notice and correction report form (spec US59, review F8).
// Run with: NODE_PATH=$(npm root -g) node tests/browser/test_translation_review.cjs
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
  console.log('--- Starting Translation Review Notice Tests ---');
  const { server, origin } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });

    // 1. Signed-out: notice shows state and revision, plus a sign-in prompt instead of the form.
    console.log('1. Signed-out notice renders without a form...');
    const guest = await (await browser.newContext()).newPage();
    await guest.goto(`${origin}/ja/day-36`, { waitUntil: 'domcontentloaded' });
    const notice = guest.locator('aside.translation-review-notice');
    await notice.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await notice.getAttribute('data-edition-state'), 'automated-checks-only');
    assert.match(await notice.getAttribute('data-edition-revision'), /^[0-9a-f]{12}$/);
    assert.equal(await guest.locator('#correction-form').count(), 0);
    assert.equal(await guest.locator('p.correction-signin').count(), 1);

    // 2. Signed-in: submit a report and see the localized confirmation.
    console.log('2. Signed-in learner submits a correction report...');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${origin}/auth/google?returnTo=/ja/day-36`);
    await page.waitForURL(/auth\/test-provider/);
    await page.click('button[data-user="alice"]');
    await page.waitForURL(/day-36/);

    await page.locator('details.correction-report summary').click();
    const form = page.locator('#correction-form');
    await form.waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#correction-description').fill('Term "勾配" is inconsistent with Day 35.');
    await form.locator('button[type="submit"]').click();
    await waitForStatusText(page.locator('#correction-status'), 'ありがとうございます。報告を記録しました。', 'correction sent message');
    assert.equal(await page.locator('#correction-description').inputValue(), '', 'textarea resets after success');
    assert.ok(page.url().includes('/ja/day-36'), 'submit must not navigate away');

    // 3. The report shows up in the learner's export.
    console.log('3. Report appears in the learner export...');
    const res = await page.request.get(`${origin}/api/export`);
    assert.equal(res.status(), 200);
    const exported = await res.json();
    const reports = exported.records.content_corrections;
    assert.equal(reports.length, 1);
    assert.equal(reports[0].day_id, 'day-36');
    assert.equal(reports[0].lang, 'ja');
    assert.equal(reports[0].activity_id, null);

    console.log('--- All Translation Review Notice Tests Passed ---');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
