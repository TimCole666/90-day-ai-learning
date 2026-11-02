// Browser seam test for the localized export flow and real authenticated download.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');

function waitForPort(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/127\.0\.0\.1:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('exit', code => code && reject(new Error(`server exited: ${code}\n${output}`)));
  });
}

(async () => {
  const server = spawn('node', ['server.cjs', '0'], { cwd: ROOT, env: { ...process.env, DB_PATH: ':memory:', PORT: '0', AUTH_ADAPTER: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await waitForPort(server);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    for (const [lang, title] of [['zh-Hans', '导出个人学习记录'], ['zh-Hant', '匯出個人學習記錄'], ['en', 'Export Personal Learning Records'], ['ja', '個人学習記録をエクスポート']]) {
      await page.goto(`http://127.0.0.1:${port}/${lang}/export`);
      assert.ok((await page.locator('body').textContent()).includes(title));
      assert.equal(await page.locator('#export-button').isDisabled(), true);
    }

    await page.goto(`http://127.0.0.1:${port}/auth/google?returnTo=/en/export`);
    await page.waitForURL(/auth\/test-provider/);
    await page.locator('button[data-user="alice"]').click();
    await page.waitForURL(/\/en\/export$/);
    assert.equal(await page.locator('#export-button').isDisabled(), false);
    await page.evaluate(async () => {
      await fetch('/api/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('input[name="csrf_token"]').value
        },
        body: JSON.stringify({ activity_id: 'day-01-act-01', draft_text: 'browser export record', completed: false, version: 0 })
      });
    });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-button').click();
    const download = await downloadPromise;
    const exportText = await (await download.createReadStream()).toArray().then(chunks => Buffer.concat(chunks).toString('utf8'));
    const exportData = JSON.parse(exportText);
    assert.equal(exportData.format, '90-day-ai-learning.portable-export');
    assert.equal(exportData.records.progress[0].activity_id, 'day-01-act-01');
    await context.close();
    console.log('>>> Portable export browser seam tests passed! <<<');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exit(1); });
