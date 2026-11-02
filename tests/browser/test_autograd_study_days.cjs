// Browser-level integration test for Autograd Study Days (Days 31, 32, 33) across 4 languages.
// Run with: NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules node tests/browser/test_autograd_study_days.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 375, height: 812 }
];
const LANGUAGES = ['zh-Hans', 'zh-Hant', 'en', 'ja'];
const TARGET_DAYS = ['day-31', 'day-32', 'day-33'];

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function startServer() {
  const serverProcess = spawn('node', ['server.cjs', '0'], {
    cwd: ROOT,
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
  console.log('--- Starting Browser Seam Tests for Autograd Study Days 31-33 ---');
  const { server, origin } = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });
    const context = await browser.newContext({ viewport: viewports[0] });

    // Mock/block external CDN and network calls for deterministic local testing
    await context.route('**/*', (route, request) => {
      const url = request.url();
      if (url.startsWith(origin)) {
        return route.continue();
      }
      return route.abort('blockedbyclient');
    });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    for (const dayId of TARGET_DAYS) {
      console.log(`\nTesting ${dayId}...`);

      for (const lang of LANGUAGES) {
        const targetUrl = `${origin}/${lang}/${dayId}`;
        const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200, `Expected 200 for ${targetUrl}`);

        // Check header and day badge
        const titleText = await page.locator('.day-header h1').innerText();
        assert.ok(titleText.length > 5, `Title text too short on ${targetUrl}: "${titleText}"`);

        // Check 4 activity cards exist
        for (let actIdx = 1; actIdx <= 4; actIdx++) {
          const actId = `${dayId}-act-0${actIdx}`;
          const actCard = page.locator(`#${actId}`);
          assert.equal(await actCard.count(), 1, `Activity #${actId} missing on ${targetUrl}`);

          // Verify activity title exists
          const actTitle = await actCard.locator('.activity-title').innerText();
          assert.ok(actTitle.length > 0, `Activity title missing in #${actId} on ${targetUrl}`);

          // Verify policy badge
          const policyBadge = await actCard.locator('.assistance-policy-badge').innerText();
          assert.ok(policyBadge.length > 0, `Policy badge missing in #${actId} on ${targetUrl}`);

          // Verify exercise prompt exists
          const prompt = await actCard.locator('.exercise-prompt').innerText();
          assert.ok(prompt.length > 10, `Exercise prompt missing in #${actId} on ${targetUrl}`);
        }

        // Verify hints and answers toggle
        const toggleHintBtn = page.locator(`#${dayId}-act-01 .btn-toggle-hint`);
        if (await toggleHintBtn.count() > 0) {
          const hintBox = page.locator(`#${dayId}-act-01 .exercise-hint`);
          const wasHidden = await hintBox.getAttribute('hidden');
          assert.notEqual(wasHidden, null, 'Hint box should be hidden initially');

          await toggleHintBtn.click();
          const isHiddenNow = await hintBox.getAttribute('hidden');
          assert.equal(isHiddenNow, null, 'Hint box should be visible after clicking toggle');
        }

        const toggleAnswerBtn = page.locator(`#${dayId}-act-01 .btn-reveal-answer`);
        if (await toggleAnswerBtn.count() > 0) {
          const answerBox = page.locator(`#${dayId}-act-01 .exercise-answer`);
          const wasHidden = await answerBox.getAttribute('hidden');
          assert.notEqual(wasHidden, null, 'Answer box should be hidden initially');

          await toggleAnswerBtn.click();
          const isHiddenNow = await answerBox.getAttribute('hidden');
          assert.equal(isHiddenNow, null, 'Answer box should be visible after clicking toggle');
        }

        // Verify language switcher maintains day
        const langLinks = page.locator('.lang-switcher .lang-link');
        const langCount = await langLinks.count();
        assert.equal(langCount, 4, `Expected 4 language links, got ${langCount}`);

        for (let l = 0; l < langCount; l++) {
          const href = await langLinks.nth(l).getAttribute('href');
          assert.ok(href.includes(dayId), `Lang link ${href} does not preserve ${dayId}`);
        }

        // Verify CLI reference in instructions
        const pageContent = await page.content();
        assert.ok(
          pageContent.includes('projects/autograd/cli.py'),
          `Day page ${targetUrl} should mention projects/autograd/cli.py`
        );
      }
    }

    assert.equal(pageErrors.length, 0, `Page errors encountered: ${pageErrors.join(', ')}`);
    console.log('\n>>> ALL AUTOGRAD STUDY DAYS BROWSER TESTS PASSED! <<<');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(err => {
  console.error('Browser Seam Test failed:', err);
  process.exit(1);
});
