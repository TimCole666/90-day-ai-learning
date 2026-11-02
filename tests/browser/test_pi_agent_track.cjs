// Focused browser seam for Ticket 14: every language exposes the pinned Pi route.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['server.cjs', '0'], { cwd: ROOT, env: { ...process.env, DB_PATH: ':memory:', AUTH_ADAPTER: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/127\.0\.0\.1:(\d+)/);
      if (match) resolve({ child, port: Number(match[1]) });
    });
    child.on('error', reject);
  });
}

(async () => {
  const { child, port } = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const lang of ['en', 'zh-Hans', 'zh-Hant', 'ja']) {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/${lang}/agent-track`);
      const text = await page.locator('body').innerText();
      assert.match(text, /v1\.4\.0/);
      assert.match(text, /Pi Agent/);
      assert.match(text, /blocked|Pending|未検証|待驗證|待验证/i);
      await page.close();
    }
  } finally {
    await browser.close();
    child.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
