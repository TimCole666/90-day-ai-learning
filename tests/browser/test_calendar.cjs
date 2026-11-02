// Browser-level integration test for Curriculum Calendar across 4 Language Editions.
// Run with: NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules node tests/browser/test_calendar.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 }
];
const LANGUAGES = ['zh-Hans', 'zh-Hant', 'en', 'ja'];

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
  console.log('--- Starting Browser Seam Tests for Curriculum Calendar ---');
  const { server, origin } = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });
    const context = await browser.newContext({ viewport: viewports[1] });

    // Strict offline policy: intercept external network requests
    await context.route('**/*', (route, request) => {
      const url = request.url();
      if (url.startsWith(origin)) {
        return route.continue();
      }
      return route.abort('failed');
    });

    const page = await context.newPage();

    // 1. Root /calendar redirect test
    console.log('1. Testing /calendar redirect to default language calendar (/zh-Hans/calendar)...');
    const response = await page.goto(`${origin}/calendar`, { waitUntil: 'domcontentloaded' });
    assert.strictEqual(response.status(), 200);
    assert.match(page.url(), /\/zh-Hans\/calendar$/);

    // 2. Ledger and Time Budget Display
    console.log('2. Testing time ledger metrics (90 Days, 720 Hours, 43,200 Minutes, 4 Category cards)...');
    const pageText = await page.textContent('body');
    assert.ok(pageText.includes('43,200') || pageText.includes('43200'), 'Page must display 43,200 active minutes');
    assert.ok(pageText.includes('90'), 'Page must mention 90 study days');
    assert.ok(pageText.includes('720'), 'Page must mention 720 hours');
    assert.ok(pageText.includes('180'), 'Page must mention 180 hours for SDL & Python');
    assert.ok(pageText.includes('144'), 'Page must mention 144 hours for Mathematics');
    assert.ok(pageText.includes('288'), 'Page must mention 288 hours for Models');
    assert.ok(pageText.includes('108'), 'Page must mention 108 hours for Agents');

    // 3. Topic blocks and 90 day cards existence
    console.log('3. Testing 30 topic blocks and 90 day representations...');
    const dayCards = await page.$$('.calendar-day-card');
    assert.strictEqual(dayCards.length, 90, `Calendar must render exactly 90 day cards, found ${dayCards.length}`);

    const topicBlocks = await page.$$('.topic-block');
    assert.strictEqual(topicBlocks.length, 30, `Calendar must render 30 topic blocks, found ${topicBlocks.length}`);

    // Check weekly review days are tagged
    const reviewCards = await page.$$('.calendar-day-card.review-day');
    assert.ok(reviewCards.length >= 12, `Must tag at least 12 review days, found ${reviewCards.length}`);

    // Published days must reflect the ledger, not the original Day01-only slice.
    const statusLabels = require('../../curriculum/content/calendar/zh-Hans.json').status_labels;
    for (let day = 1; day <= 90; day++) {
      const id = `day-${String(day).padStart(2, '0')}`;
      const metadata = require(path.join(ROOT, 'curriculum/days', `${id}.json`));
      const badge = page.locator(`#calendar-${id} .card-top .status-badge`);
      assert.equal((await badge.textContent()).trim(), statusLabels[metadata.status], `${id} must show its ledger status`);
      const ready = ['available', 'reviewed', 'accepted'].includes(metadata.status);
      assert.equal(await page.locator(`#calendar-${id} a.day-link`).count(), ready ? 1 : 0, `${id} navigation must match readiness`);
    }

    // 4. Four-Language Switching on Calendar
    console.log('4. Testing 4-language switching on calendar...');
    for (const lang of LANGUAGES) {
      await page.click(`.lang-switcher a[data-lang="${lang}"]`);
      await page.waitForLoadState('domcontentloaded');
      assert.ok(page.url().includes(`/${lang}/calendar`), `URL must reflect ${lang} edition: ${page.url()}`);

      const title = await page.title();
      assert.ok(title && title.length > 0, `Title must exist for ${lang}`);
      const h1 = await page.textContent('h1');
      assert.ok(h1 && h1.length > 0, `H1 heading must exist for ${lang}`);
    }

    // 5. Navigation between Calendar and Study Day
    console.log('5. Testing navigation between calendar and Day 01...');
    // Click Day 01 link
    await page.goto(`${origin}/en/calendar`);
    await page.click('#calendar-day-01 a.day-link');
    await page.waitForLoadState('domcontentloaded');
    assert.match(page.url(), /\/en\/day-01$/);

    // On Day 01, click calendar link in nav
    await page.click('.nav-calendar-link');
    await page.waitForLoadState('domcontentloaded');
    assert.match(page.url(), /\/en\/calendar$/);

    // 6. Responsive Viewport and Overflow Check
    console.log('6. Checking responsive viewports and horizontal overflow...');
    for (const vp of viewports) {
      await page.setViewportSize(vp);
      const isOverflown = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      assert.strictEqual(isOverflown, false, `Viewport ${vp.name} (${vp.width}x${vp.height}) has horizontal overflow`);
    }

    console.log('>>> ALL CALENDAR BROWSER SEAM TESTS PASSED! <<<');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(err => {
  console.error('Browser Seam Test Failed:', err);
  process.exit(1);
});
