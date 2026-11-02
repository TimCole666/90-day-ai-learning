// Browser integration test for Study Days 37-39 across 4 languages.
// Run with: node tests/browser/test_study_days_37_39.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const targetDays = ['day-37', 'day-38', 'day-39'];

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function startServer() {
  const server = spawn('node', ['server.cjs', '0'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit']
  });

  const portPromise = new Promise((resolve, reject) => {
    let output = '';
    server.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/127\.0\.0\.1:(\d+)/) ||
                    output.match(/listening on (?:http:\/\/127\.0\.0\.1:|port )(\d+)/i);
      if (match) resolve(match[1]);
    });
    server.once('error', reject);
    server.once('exit', code => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Server process exited early with code ${code}`));
      }
    });
  });

  const port = await withTimeout(portPromise, 8000, 'server start');

  // Probe until port accepts connections
  await withTimeout(new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const probe = () => {
      const client = net.connect({ host: '127.0.0.1', port });
      client.once('connect', () => { client.destroy(); resolve(); });
      client.once('error', () => {
        client.destroy();
        if (Date.now() >= deadline) reject(new Error('Server port connection probe timed out'));
        else setTimeout(probe, 40);
      });
    };
    probe();
  }), 6000, 'connection probe');

  return { server, port: parseInt(port, 10) };
}

(async () => {
  console.log('--- Starting Browser Integration Tests for Study Days 37-39 ---');
  const { server, port } = await startServer();
  const origin = `http://127.0.0.1:${port}`;
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

    for (const day of targetDays) {
      for (const language of languages) {
        const url = `${origin}/${language}/${day}`;
        const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200, `Expected 200 for ${url}`);

        // 4 activity cards present
        assert.equal(await page.locator('.activity-card').count(), 4, `${url} should have 4 activity cards`);

        // Day header h1 populated
        const h1 = await page.locator('.day-header h1').innerText();
        assert.ok(h1.length > 5, `${url} header h1 text too short`);

        // Substantive card text
        const firstCardText = await page.locator('.activity-card').first().innerText();
        assert.ok(firstCardText.length > 80, `${url} first activity card text too short`);

        // Language switcher present with 4 links
        const langLinks = page.locator('.lang-switcher .lang-link');
        assert.equal(await langLinks.count(), 4, `${url} should have 4 language switcher links`);

        // Language switcher retains day
        for (let l = 0; l < 4; l++) {
          const href = await langLinks.nth(l).getAttribute('href');
          assert.ok(href && href.includes(day), `${url} language link ${href} does not retain ${day}`);
        }

        // Toggle hint check on activity 01
        const hintBtn = page.locator(`#${day}-act-01 .btn-toggle-hint`);
        if (await hintBtn.count() > 0) {
          const hintBox = page.locator(`#${day}-act-01 .exercise-hint`);
          const initiallyHidden = await hintBox.getAttribute('hidden');
          assert.notEqual(initiallyHidden, null, `${url} hint should be hidden initially`);
          await hintBtn.click();
          const visibleNow = await hintBox.getAttribute('hidden');
          assert.equal(visibleNow, null, `${url} hint should be visible after click`);
        }

        // Toggle answer check on activity 01
        const answerBtn = page.locator(`#${day}-act-01 .btn-reveal-answer`);
        if (await answerBtn.count() > 0) {
          const answerBox = page.locator(`#${day}-act-01 .exercise-answer`);
          const initiallyHidden = await answerBox.getAttribute('hidden');
          assert.notEqual(initiallyHidden, null, `${url} answer should be hidden initially`);
          await answerBtn.click();
          const visibleNow = await answerBox.getAttribute('hidden');
          assert.equal(visibleNow, null, `${url} answer should be visible after click`);
        }
      }
    }

    console.log('✓ All Study Days 37-39 browser integration checks passed successfully!');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Browser integration test failed:', error);
  process.exit(1);
});
