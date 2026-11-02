// Browser-level integration test for Day 01 across 4 Language Editions.
// Run with: NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules node tests/browser/test_day01.cjs
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
  console.log('--- Starting Browser Seam Tests for Day 01 ---');
  const { server, origin } = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });
    const context = await browser.newContext({ viewport: viewports[1] });

    // Strict offline policy: intercept external network requests
    await context.route('**/*', (route, request) => {
      const url = request.url();
      // Allow internal server requests
      if (url.startsWith(origin)) {
        // Deliberately simulate external optional media failure if requesting /media/optional-* or external
        return route.continue();
      }
      // If mock external media or cdn
      if (url.includes('example.com') || url.includes('video') || url.includes('cdn')) {
        return route.abort('failed');
      }
      return route.abort('blockedbyclient');
    });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // Helper: assert no horizontal overflow
    async function assertNoHorizontalOverflow(label) {
      const metrics = await page.evaluate(() => ({
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      }));
      assert.ok(
        metrics.scrollWidth <= metrics.viewport + 1 && metrics.bodyScrollWidth <= metrics.viewport + 1,
        `Horizontal overflow in ${label}: scrollWidth=${metrics.scrollWidth}, viewport=${metrics.viewport}`
      );
    }

    // 1. Root redirect to default language edition (/zh-Hans/day-01)
    console.log('1. Testing root redirect to default language edition...');
    const response = await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    assert.ok(page.url().includes('/zh-Hans/day-01'), `Expected redirect to /zh-Hans/day-01, got ${page.url()}`);
    assert.equal(response.status(), 200);

    // Verify day metadata
    await page.waitForSelector('#day-header', { state: 'visible', timeout: 5000 });
    const dayLedger = await page.locator('.day-time-budget').textContent();
    assert.match(dayLedger, /480\s*(?:分钟|min)/i, 'Expected 480 active minutes ledger');

    // 2. Day 01 Beginner Activity Content Checks
    console.log('2. Testing beginner activity structure and components...');
    const activity = page.locator('#day-01-act-01');
    await activity.waitFor({ state: 'visible', timeout: 5000 });

    // Check title, prerequisites, objective, policy
    const titleText = await activity.locator('.activity-title').textContent();
    assert.ok(titleText.length > 5, 'Activity must have a descriptive title');

    const prereqText = await activity.locator('.activity-prerequisites').textContent();
    assert.ok(prereqText.length > 0, 'Prerequisites must be visible');

    const objText = await activity.locator('.activity-objective').textContent();
    assert.ok(objText.length > 0, 'Objective must be visible');

    const policyBadge = await activity.locator('.assistance-policy-badge').textContent();
    assert.match(policyBadge, /独立掌握检查|Independent Mastery Check/i, 'Policy must declare Independent Mastery Check');

    // 3. Exercise practice, draft retention, hint, and answer inspection
    console.log('3. Testing exercise practice, hint, and reference answer inspection...');
    const exerciseArea = activity.locator('.exercise-container');
    await exerciseArea.waitFor({ state: 'visible', timeout: 5000 });

    const responseInput = exerciseArea.locator('.exercise-draft-input');
    await responseInput.waitFor({ state: 'visible', timeout: 5000 });
    const draftText = 'Prediction: id(x) remains identical, but x value mutates.';
    await responseInput.fill(draftText);

    // Hint toggle
    const hintDetails = exerciseArea.locator('.exercise-hint');
    const hintButton = exerciseArea.locator('.btn-toggle-hint');
    assert.equal(await hintDetails.isVisible(), false, 'Hint should be hidden by default');
    await hintButton.click();
    assert.equal(await hintDetails.isVisible(), true, 'Hint should be revealed after clicking hint button');
    assert.ok((await hintDetails.textContent()).length > 10, 'Hint text should not be empty');

    // Reference answer and mastery criterion toggle
    const answerContainer = exerciseArea.locator('.exercise-answer');
    const answerButton = exerciseArea.locator('.btn-reveal-answer');
    assert.equal(await answerContainer.isVisible(), false, 'Answer should be hidden initially');
    await answerButton.click();
    assert.equal(await answerContainer.isVisible(), true, 'Answer should be visible after clicking reveal');
    assert.ok((await answerContainer.textContent()).length > 20, 'Reference answer should contain worked trace');

    const masteryCriterion = activity.locator('.mastery-criterion');
    await masteryCriterion.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok((await masteryCriterion.textContent()).length > 10, 'Mastery criterion should be clearly stated');

    // 4. Four-Language Switching without identity loss or state reset
    console.log('4. Testing 4-language switching with unit identity preservation...');
    // Ensure we are focused on the specific learning unit anchor
    await page.goto(origin + '/zh-Hans/day-01#day-01-act-01', { waitUntil: 'domcontentloaded' });
    await page.locator('#day-01-act-01 .exercise-draft-input').fill(draftText);

    for (const lang of LANGUAGES) {
      const switcherLink = page.locator(`.lang-switcher a[data-lang="${lang}"]`);
      await switcherLink.waitFor({ state: 'visible', timeout: 5000 });
      await switcherLink.click();
      await page.waitForLoadState('domcontentloaded');

      // Verify URL retains day-01 and hash #day-01-act-01
      const currentUrl = page.url();
      assert.ok(
        currentUrl.includes(`/${lang}/day-01`),
        `Expected URL to contain /${lang}/day-01, got ${currentUrl}`
      );
      assert.ok(
        currentUrl.includes('#day-01-act-01'),
        `Expected URL to preserve anchor #day-01-act-01, got ${currentUrl}`
      );

      // Verify draft input was NOT wiped out upon language switch
      const preservedDraft = await page.locator('#day-01-act-01 .exercise-draft-input').inputValue();
      assert.equal(preservedDraft, draftText, `Learner draft should persist across language switch to ${lang}`);

      // Verify localized content
      const localizedTitle = await page.locator('#day-01-act-01 .activity-title').textContent();
      assert.ok(localizedTitle.length > 3, `Localized title for ${lang} should not be empty`);

      // Viewport test on desktop and mobile for each language
      for (const vp of viewports) {
        await page.setViewportSize(vp);
        await assertNoHorizontalOverflow(`${lang} ${vp.name}`);
      }
    }

    // 5. Graceful degradation when external optional media is unavailable
    console.log('5. Testing graceful degradation when external media is unavailable...');
    const mediaContainer = page.locator('.optional-media-card');
    await mediaContainer.waitFor({ state: 'visible', timeout: 5000 });
    const fallbackText = await mediaContainer.locator('.media-fallback-notice').textContent();
    assert.match(
      fallbackText,
      /不可用|unavailable|利用不可|Text and self-contained exercises remain fully functional/i,
      'Should display clear fallback notice for unavailable optional media'
    );
    // Assert all core text and exercises remain completely intact
    assert.ok(await activity.locator('.activity-instructions').isVisible(), 'Instructions remain visible');
    assert.ok(await exerciseArea.isVisible(), 'Exercise remains visible');

    // The completed local content still explicitly separates external acceptance.
    const disclaimer = await page.locator('.dev-slice-disclaimer').textContent();
    const edition = await page.locator('html').getAttribute('lang');
    const publishedNotice = require(path.join(ROOT, 'curriculum/content/day-01', `${edition}.json`)).common.dev_slice_notice;
    assert.equal(disclaimer.trim(), publishedNotice, 'Must render the current localized scope disclosure');
    assert.match(disclaimer, /external|外部|extern/i, 'Scope disclosure must retain external-evidence limitations');

    // 6. The retired legacy roadmap link is gone from the navigation
    console.log('6. Testing that the retired legacy roadmap link is no longer offered...');
    assert.equal(await page.locator('a.nav-legacy-roadmap').count(), 0, 'Legacy roadmap nav link must be removed');
    assert.equal(await page.locator('a[href="/lessons/index.html"]').count(), 0, 'No link may point at the retired roadmap');

    // Verify no unhandled page errors occurred throughout the entire run
    assert.deepEqual(pageErrors, [], `Expected 0 uncaught page errors, found: ${pageErrors.join('; ')}`);

    console.log('\n>>> ALL BROWSER SEAM TESTS PASSED SUCCESSFULLY! <<<');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(err => {
  console.error('\nFAIL:', err);
  process.exitCode = 1;
});
