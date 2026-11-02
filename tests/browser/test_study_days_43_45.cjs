// Run with: NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules node tests/browser/test_study_days_43_45.cjs
let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  chromium = require('/home/tiancaijb/.npm-global/lib/node_modules/playwright').chromium;
}
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];

(async () => {
  const server = spawn('node', ['server.cjs', '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    server.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/127\.0\.0\.1:(\d+)/);
      if (match) resolve(match[1]);
    });
    server.once('error', reject);
    setTimeout(() => reject(new Error('server start timeout')), 8000);
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    for (const day of ['day-43', 'day-44', 'day-45']) {
      for (const language of languages) {
        const response = await page.goto(`http://127.0.0.1:${port}/${language}/${day}`, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200, `Failed to load ${language}/${day}`);
        assert.equal(await page.locator('.activity-card').count(), 4, `Expected 4 activity cards for ${language}/${day}`);
        assert.ok((await page.locator('.day-header h1').innerText()).length > 5);
        assert.ok((await page.locator('.activity-card').first().innerText()).length > 80);
        assert.equal(await page.locator('.lang-switcher .lang-link').count(), 4);
        assert.ok((await page.locator('.source-resource-card').count()) >= 2, `${language}/${day} should render source cards`);
      }
    }
    console.log('Study Days 43-45 browser checks passed');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
