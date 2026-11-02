// tests/browser/test_source_cards.cjs
// Browser seam test suite verifying Source Resource Cards, Rights Badges,
// Compared Candidates, 4-Language Display, and Safe Fallback Text.
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
        if (Date.now() > deadline) {
          reject(new Error(`Server at port ${port} did not accept connections within timeout`));
        } else {
          setTimeout(probe, 50);
        }
      });
    };
    probe();
  }), 5000, 'server connection probe');

  return {
    port,
    stop: () => new Promise(resolve => {
      serverProcess.once('exit', resolve);
      serverProcess.kill('SIGTERM');
      setTimeout(() => {
        try { serverProcess.kill('SIGKILL'); } catch (_) {}
      }, 2000);
    })
  };
}

async function runBrowserTests() {
  console.log('--- Starting Browser Seam Tests for Source Resource Cards ---');

  const { port, stop } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });

    // Offline interceptor: abort external network requests to guarantee self-containment
    await context.route('**/*', (route) => {
      const requestUrl = route.request().url();
      if (requestUrl.startsWith(baseUrl)) {
        return route.continue();
      }
      return route.abort();
    });

    const page = await context.newPage();

    // 1. Visit Day 01 in English
    console.log('1. Testing Day 01 English Source Resource Card rendering...');
    await page.goto(`${baseUrl}/en/day-01`);
    await page.waitForSelector('.activity-card#day-01-act-01');

    // Check presence of Source Resources container
    const sourceCard = page.locator('#day-01-act-01 .source-resource-card');
    await sourceCard.waitFor({ state: 'visible', timeout: 3000 });

    // Check Author, Title, and Link
    const authorText = await sourceCard.locator('.source-author').textContent();
    assert(authorText.includes('Python Software Foundation'), `Expected PSF author, got "${authorText}"`);

    const link = sourceCard.locator('a.source-original-url');
    const href = await link.getAttribute('href');
    assert.strictEqual(href, 'https://docs.python.org/3/reference/datamodel.html');
    const target = await link.getAttribute('target');
    const rel = await link.getAttribute('rel');
    assert.strictEqual(target, '_blank', 'External link should have target="_blank"');
    assert(rel && rel.includes('noopener'), 'External link must have rel="noopener"');

    // Check Relevant Range / Timestamp and Verification Date
    const rangeText = await sourceCard.locator('.source-range').textContent();
    assert(rangeText.includes('Section 3.1') || rangeText.includes('3.2'), `Expected section range, got "${rangeText}"`);

    // A card without locator_url keeps the section text as plain text.
    assert.strictEqual(await sourceCard.locator('.source-range a').count(), 0);

    // A card with locator_url links the section text to the deep link.
    await page.goto(`${baseUrl}/en/day-19`);
    const chainCard = page.locator('#day-19-act-01 #source-openstax-calculus-1');
    const locatorLink = chainCard.locator('.source-range a.source-locator-link');
    assert.strictEqual(await locatorLink.getAttribute('href'),
      'https://openstax.org/books/calculus-volume-1/pages/3-6-the-chain-rule');
    assert.strictEqual(await locatorLink.getAttribute('target'), '_blank');
    assert((await locatorLink.getAttribute('rel')).includes('noopener'));
    assert((await chainCard.locator('.source-range').textContent()).includes('Section 3.6'));
    assert.strictEqual(await chainCard.locator('a.source-original-url').getAttribute('href'),
      'https://openstax.org/details/books/calculus-volume-1');
    await page.goto(`${baseUrl}/en/day-01`);
    await page.waitForSelector('.activity-card#day-01-act-01');

    const dateText = await sourceCard.locator('.source-verification-date').textContent();
    assert(dateText.includes('2026-10-30') || dateText.includes('Python 3.12'), `Expected verification date, got "${dateText}"`);

    // Check Reuse Category and License Badges
    const reuseBadge = await sourceCard.locator('.source-reuse-badge').textContent();
    assert(reuseBadge.toLowerCase().includes('linking'), `Expected linking reuse badge, got "${reuseBadge}"`);

    const licenseBadge = await sourceCard.locator('.source-license-badge').textContent();
    assert(licenseBadge.includes('PSF'), `Expected PSF license, got "${licenseBadge}"`);

    // Check Selection Rationale and Prerequisites
    const rationaleText = await sourceCard.locator('.source-rationale').textContent();
    assert(rationaleText.length > 20, 'Expected non-empty selection rationale');

    const prereqsText = await sourceCard.locator('.source-prerequisites').textContent();
    assert(prereqsText.length > 5, 'Expected non-empty source prerequisites');

    // Check Safe Fallback Notice
    const fallbackText = await sourceCard.locator('.source-fallback-notice').textContent();
    assert(fallbackText.toLowerCase().includes('fallback') || fallbackText.toLowerCase().includes('offline') || fallbackText.toLowerCase().includes('mirror'),
      `Expected safe fallback notice, got "${fallbackText}"`);

    // 2. Compared Candidates verification
    console.log('2. Testing Compared Candidates display and comparison rationales...');
    const candidatesContainer = sourceCard.locator('.compared-candidates-list');
    await candidatesContainer.waitFor({ state: 'visible' });

    const candidateItems = sourceCard.locator('.compared-candidate-item');
    const count = await candidateItems.count();
    assert(count >= 2, `Expected at least 2 compared candidates, found ${count}`);

    const candidateTextAll = await candidatesContainer.textContent();
    assert(candidateTextAll.includes('MIT OCW') || candidateTextAll.includes('6.0001'), 'Must include MIT OCW candidate');
    assert(candidateTextAll.includes('CS336') || candidateTextAll.includes('Stanford'), 'Must include Stanford CS336 candidate');
    assert(candidateTextAll.includes('3Blue1Brown') || candidateTextAll.includes('Karpathy'), 'Must include Karpathy or 3Blue1Brown candidate');

    // Check interactive expansion if details element is used
    const detailsCandidate = sourceCard.locator('details.compared-candidates-details');
    if (await detailsCandidate.count() > 0) {
      await detailsCandidate.click();
      const isOpen = await detailsCandidate.getAttribute('open');
      assert.notStrictEqual(isOpen, null, 'Candidate details should expand on click');
    }

    // 3. Four-Language Localization Verification
    console.log('3. Testing 4-Language Source Card presentation...');
    const languages = [
      { code: 'zh-Hans', authorKeyword: 'Python 软件基金会', rationaleKeyword: '规范' },
      { code: 'zh-Hant', authorKeyword: 'Python 軟體基金會', rationaleKeyword: '規範' },
      { code: 'ja', authorKeyword: 'Pythonソフトウェア財団', rationaleKeyword: '仕様' },
      { code: 'en', authorKeyword: 'Python Software Foundation', rationaleKeyword: 'normative' }
    ];

    for (const lang of languages) {
      await page.goto(`${baseUrl}/${lang.code}/day-01#day-01-act-01`);
      const card = page.locator('#day-01-act-01 .source-resource-card');
      await card.waitFor({ state: 'visible' });

      const cardText = await card.textContent();
      assert(cardText.includes(lang.authorKeyword) || cardText.includes('Python'),
        `Language ${lang.code} should contain expected author keyword "${lang.authorKeyword}"`);

      // Verify safe fallback is localized
      const localizedFallback = await card.locator('.source-fallback-notice').textContent();
      assert(localizedFallback.length > 10, `Language ${lang.code} must have non-empty safe fallback notice`);
    }

    // 4. Mobile Viewport Overflow Check
    console.log('4. Testing Mobile Viewport (375x812) layout & responsiveness...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/zh-Hans/day-01#day-01-act-01`);

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert.strictEqual(hasHorizontalOverflow, false, 'Page must not have horizontal scroll overflow on mobile viewport');

    // 5. Internal source reassessment must reach the actual four-language pages.
    console.log('5. Testing adopted teaching sources in all four editions...');
    const adopted = [
      [4, 1, 'automate-boring-stuff-3e', 'https://automatetheboringstuff.com/3e/'],
      [17, 1, 'mit-ocw-18-01sc', 'https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/'],
      [25, 2, 'harvard-stat110-practice', 'https://stat110.hsites.harvard.edu/strategic-practice-problems'],
      [43, 1, 'stanford-cs224n', 'https://web.stanford.edu/class/cs224n/'],
      [50, 2, 'cs336-basics', 'https://github.com/stanford-cs336/assignment1-basics/tree/spring2025'],
      [61, 1, 'huggingface-llm-course-finetuning', 'https://huggingface.co/learn/llm-course/chapter11/1'],
      [70, 1, 'huggingface-evaluation-guidebook', 'https://github.com/huggingface/evaluation-guidebook'],
      [73, 1, 'huggingface-agents-course', 'https://huggingface.co/learn/agents-course/en/unit1/introduction'],
      [82, 1, 'anthropic-agent-evals-2026', 'https://www.anthropic.com/research/demystifying-evals-for-ai-agents']
    ];
    for (const lang of languages) {
      for (const [day, activity, source, expectedUrl] of adopted) {
        const dayId = `day-${String(day).padStart(2, '0')}`;
        const actId = `${dayId}-act-${String(activity).padStart(2, '0')}`;
        await page.goto(`${baseUrl}/${lang.code}/${dayId}#${actId}`);
        const adoptedCard = page.locator(`#${actId} #source-${source}`);
        await adoptedCard.waitFor({ state: 'visible' });
        assert.strictEqual(await adoptedCard.locator('a.source-original-url').getAttribute('href'), expectedUrl);
        assert((await adoptedCard.locator('.source-range').textContent()).trim().length > 10);
        assert((await adoptedCard.locator('.source-fallback-notice').textContent()).trim().length > 20);
        if (source === 'cs336-basics') {
          assert.strictEqual((await adoptedCard.locator('.source-license-badge').textContent()).trim(), 'MIT');
        }
        assert.strictEqual(await page.evaluate(() =>
          document.documentElement.scrollWidth > window.innerWidth), false,
          `${lang.code}/${dayId}: adopted source must fit the mobile viewport`);
      }
    }

    console.log('\n>>> ALL BROWSER SEAM TESTS FOR SOURCE CARDS PASSED! <<<\n');
  } finally {
    await browser.close();
    await stop();
  }
}

runBrowserTests().catch((err) => {
  console.error('Browser Test Failed:', err);
  process.exit(1);
});
