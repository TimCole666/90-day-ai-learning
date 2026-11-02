const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
(async () => {
  const server = spawn('node', ['server.cjs', '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    server.stdout.on('data', chunk => { output += chunk; const match = output.match(/127\.0\.0\.1:(\d+)/); if (match) resolve(match[1]); });
    server.once('error', reject);
    setTimeout(() => reject(new Error('server start timeout')), 8000);
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    for (const day of ['day-61', 'day-62', 'day-63']) {
      for (const language of languages) {
        const response = await page.goto(`http://127.0.0.1:${port}/${language}/${day}`, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        assert.equal(await page.locator('.activity-card').count(), 4);
        assert.ok((await page.locator('.day-header h1').innerText()).length > 5);
        assert.ok((await page.locator('.activity-card').first().innerText()).length > 80);
        assert.equal(await page.locator('.lang-switcher .lang-link').count(), 4);
        assert.ok((await page.locator('.source-resource-card').count()) >= 2, `${language}/${day} should render source cards`);
      }
    }
    console.log('Study Days 61-63 browser checks passed');
  } finally { await browser.close(); server.kill('SIGTERM'); }
})().catch(error => { console.error(error); process.exit(1); });
