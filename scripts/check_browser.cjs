// Deterministic offline Chromium smoke test.
// Run with: NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules node scripts/check_browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LESSON_NN = '/lessons/nn-01-derivative-limits-and-tangents.html';
const LESSON_PY = '/lessons/py-01-variables-types-and-references.html';
const viewports = [{ width: 375, height: 812 }, { width: 1280, height: 800 }];

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function startServer() {
  const socket = net.createServer();
  await withTimeout(new Promise(resolve => socket.listen(0, '127.0.0.1', resolve)), 5000, 'port allocation');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
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
  }), 6000, 'HTTP server startup');
  return { server, origin: `http://127.0.0.1:${port}` };
}

(async () => {
  const { server, origin } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });
    const context = await browser.newContext({ viewport: viewports[1] });
    // No network is needed: CDN styles are empty and CDN scripts expose only the
    // small APIs used by the pages. Pyodide is deliberately aborted until the
    // later host-stub control-flow test.
    await context.route('https://**/*', route => {
      const url = route.request().url();
      if (url.includes('/pyodide.js')) return route.abort();
      if (url.endsWith('.css')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (url.endsWith('.js')) {
        const body = url.includes('mermaid')
          ? 'window.mermaid = { initialize: function () {} };'
          : 'window.renderMathInElement = function () {};';
        return route.fulfill({ status: 200, contentType: 'application/javascript', body });
      }
      return route.fulfill({ status: 200, body: '' });
    });

    async function instrument(page) {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      return errors;
    }
    async function noOverflow(page, label) {
      const metrics = await page.evaluate(() => ({
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        offenders: Array.from(document.querySelectorAll('body *')).filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 5).map(el => ({ tag: el.tagName, class: el.className, right: Math.round(el.getBoundingClientRect().right), width: Math.round(el.getBoundingClientRect().width), parents: el.parentElement ? `${el.parentElement.tagName}.${el.parentElement.className}` : '' })),
        blocks: Array.from(document.querySelectorAll('pre, p')).filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 4).map(el => ({ tag: el.tagName, right: Math.round(el.getBoundingClientRect().right), width: Math.round(el.getBoundingClientRect().width), overflow: getComputedStyle(el).overflowX, whiteSpace: getComputedStyle(el).whiteSpace })),  
      }));
      assert.equal(metrics.scrollWidth <= metrics.viewport, true, `${label} overflow: ${JSON.stringify(metrics)}`);
    }

    const page = await context.newPage();
    const portalErrors = await instrument(page);
    await page.goto(origin + '/lessons/index.html', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('.lesson-card', { state: 'visible', timeout: 5000 });
    assert.equal(await page.locator('.lesson-card').count(), 81);
    assert.match(await page.locator('#progress-text').textContent(), /0 \/ 81/);
    await page.fill('#course-search', 'scaled-dot-product');
    assert.equal(await page.locator('.lesson-card:visible').count(), 1);
    assert.equal(await page.locator('.lesson-card:visible').getAttribute('href'), 'nn-39-scaled-dot-product-attention-math.html');
    await page.fill('#course-search', '');
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await noOverflow(page, `portal ${viewport.width}`);
      await page.screenshot({ path: path.join(ROOT, 'learning-records', 'ui-portal.png'), fullPage: true });
    }
    assert.deepEqual(portalErrors, [], `portal page errors: ${portalErrors.join('; ')}`);

    // Exercise the actual shared runtime on the neural-network lesson.
    await page.setViewportSize(viewports[1]);
    const nnErrors = await instrument(page);
    await page.goto(origin + LESSON_NN, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('.code-editor', { state: 'visible', timeout: 5000 });
    await noOverflow(page, 'nn-01 1280');
    const editor = page.locator('.code-editor');
    const original = await editor.inputValue();
    await editor.fill('print("changed")');
    await page.locator('.btn-reset').first().click();
    assert.equal(await editor.inputValue(), original);
    await page.locator('.check-item input').first().check();
    await page.locator('#btn-toggle-complete').click();
    assert.equal(await page.locator('#btn-toggle-complete').getAttribute('aria-pressed'), 'true');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
    assert.equal(await page.locator('.check-item input').first().isChecked(), true);
    await page.locator('.btn-run').first().click();
    await page.waitForFunction(() => document.querySelector('.terminal-output').textContent.includes('运行失败'), null, { timeout: 5000 });
    assert.equal(await page.locator('.btn-run').first().isDisabled(), false);

    // Stub only the Python host API; this is not a Pyodide execution claim.
    await page.evaluate(() => {
      window.__restored = 0; window.__destroyed = 0;
      window.loadPyodide = async () => ({
        loadPackagesFromImports: async () => {},
        runPython(code) {
          if (code === 'dict()') return { destroy() { window.__destroyed++; } };
          if (code.includes('sys.version')) return 'test';
          if (code === 'sys.stdout.getvalue()') return 'captured output';
          if (code === 'sys.stderr.getvalue()') return '';
          if (code.startsWith('sys.stdout = _course_stdout')) window.__restored++;
        },
        async runPythonAsync(code) { if (code.includes('RAISE')) throw new Error('expected failure'); },
      });
    });
    await editor.fill('RAISE'); await page.locator('.btn-run').first().click();
    await page.waitForFunction(() => document.querySelector('.terminal-output').textContent.includes('expected failure'), null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__restored), 1);
    assert.equal(await page.evaluate(() => window.__destroyed), 1);
    await editor.fill('print("ok")'); await page.locator('.btn-run').first().click();
    await page.waitForFunction(() => document.querySelector('.terminal-output').textContent === 'captured output', null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__restored), 2);
    await page.screenshot({ path: path.join(ROOT, 'learning-records', 'ui-lesson.png'), fullPage: true });
    assert.deepEqual(nnErrors, [], `nn-01 page errors: ${nnErrors.join('; ')}`);

    const py = await context.newPage();
    const pyErrors = await instrument(py);
    await py.goto(origin + LESSON_PY, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await py.waitForSelector('.code-editor', { state: 'visible', timeout: 5000 });
    for (const viewport of viewports) { await py.setViewportSize(viewport); await noOverflow(py, `py-01 ${viewport.width}`); }
    assert.deepEqual(pyErrors, [], `py-01 page errors: ${pyErrors.join('; ')}`);

    await page.goto(origin + '/lessons/index.html', { waitUntil: 'domcontentloaded', timeout: 10000 });
    assert.match(await page.locator('#progress-text').textContent(), /1 \/ 81/);
    await page.selectOption('#course-filter', 'true');
    assert.equal(await page.locator('.lesson-card:visible').count(), 1);
    console.log('PASS: offline Chromium checked portal (375/1280), nn-01, py-01, search href, progress, editor reset, completion persistence, page errors, and overflow.');
    console.log('Python execution remains host-stubbed; this script does not claim real Pyodide validation.');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
