const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const loadJson = relative => JSON.parse(readFileSync(path.join(ROOT, relative), 'utf8'));
const normalize = text => text.replace(/\s+/gu, ' ').trim();
// Current quiz prompts use the renderer's inline-code/bold Markdown, not raw text.
const promptText = text => normalize(text.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1'));

(async () => {
  const server = spawn('node', ['server.cjs', '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  let browser;
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const finish = (error, value) => {
        clearTimeout(timer);
        server.stdout.off('data', onData);
        server.off('error', onError);
        server.off('exit', onExit);
        if (error) reject(error); else resolve(value);
      };
      const onData = chunk => {
        output += chunk;
        const match = output.match(/127\.0\.0\.1:(\d+)/);
        if (match) finish(null, match[1]);
      };
      const onError = error => finish(error);
      const onExit = code => finish(new Error(`server exited before startup: ${code}`));
      const timer = setTimeout(() => finish(new Error('server start timeout')), 8000);
      server.stdout.on('data', onData);
      server.once('error', onError);
      server.once('exit', onExit);
    });
    browser = await chromium.launch({ headless: true });
    // Static rendering only: no page scripts, auth, scoring, or record requests.
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, javaScriptEnabled: false });
    for (const day of ['day-04', 'day-05', 'day-06']) {
      const descriptor = loadJson(`curriculum/days/${day}.json`);
      for (const language of languages) {
        const content = loadJson(`curriculum/content/${day}/${language}.json`);
        const context = `${day}/${language}`;
        const response = await page.goto(`http://127.0.0.1:${port}/${language}/${day}`, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        assert.equal(await page.locator('.activity-card').count(), 4);
        assert.deepEqual(await page.locator('.activity-card').evaluateAll(cards => cards.map(card => card.id)), descriptor.activities.map(activity => activity.id));
        assert.equal(await page.locator('.lang-switcher .lang-link').count(), 4);
        for (const target of languages) {
          assert.equal(await page.locator(`.lang-switcher .lang-link[data-lang="${target}"]`).getAttribute('href'), `/${target}/${day}`);
        }
        assert.equal(await page.locator('.lang-switcher .lang-link.active').getAttribute('data-lang'), language);
        for (const metadata of descriptor.activities) {
          const localized = content.activities[metadata.id];
          const card = page.locator(`.activity-card[id="${metadata.id}"]`);
          assert.equal(normalize(await card.locator('.activity-title').textContent()), normalize(localized.title), `${context}/${metadata.id}: title`);
          assert.equal(normalize(await card.locator('.assistance-policy-badge').textContent()), normalize(localized.assistance_policy_label), `${context}/${metadata.id}: assistance label`);
          const questions = localized.quiz.questions;
          const questionCards = card.locator('.quiz-question-card');
          assert.equal(questions.length, metadata.quiz.questions.length);
          assert.equal(await questionCards.count(), questions.length);
          for (const [index, question] of questions.entries()) {
            assert.equal(typeof question.prompt, 'string', `${context}/${question.id}: missing prompt`);
            assert.ok(question.prompt.trim(), `${context}/${question.id}: empty prompt`);
            const questionCard = questionCards.nth(index);
            assert.equal(question.id, metadata.quiz.questions[index].id);
            assert.equal(await questionCard.getAttribute('data-question-id'), question.id);
            assert.equal(normalize(await questionCard.locator('.question-prompt').textContent()), promptText(question.prompt), `${context}/${question.id}: localized prompt`);
            assert.deepEqual(Object.keys(question.options), ['a', 'b', 'c']);
            assert.deepEqual(await questionCard.locator('.quiz-option-input').evaluateAll(inputs => inputs.map(input => input.value)), Object.keys(question.options));
            assert.deepEqual((await questionCard.locator('.option-text').allTextContents()).map(normalize), Object.values(question.options).map(normalize), `${context}/${question.id}: localized choices`);
          }
          // Match the renderer's activity-local override, then descriptor fallback.
          const sources = localized.source_resources || metadata.source_resources || [];
          const sourceCards = card.locator('.source-resource-card');
          assert.equal(await sourceCards.count(), sources.length);
          for (const [index, source] of sources.entries()) {
            const sourceCard = sourceCards.nth(index);
            assert.equal(await sourceCard.getAttribute('id'), `source-${source.id}`);
            assert.equal(await sourceCard.locator('.source-original-url').getAttribute('href'), source.original_url);
            const fields = {
              '.source-title': source.title,
              '.source-author': source.author,
              '.source-reuse-badge': source.reuse_category_label || source.reuse_category,
              '.source-license-badge': source.license,
              '.source-range': source.relevant_timestamp || 'N/A',
              '.source-verification-date': source.version_or_verification_date || 'N/A',
              '.source-rationale': source.selection_rationale,
              '.source-prerequisites': source.prerequisites,
              '.source-fallback-notice': source.safe_fallback,
            };
            for (const [selector, expected] of Object.entries(fields)) {
              assert.equal(normalize(await sourceCard.locator(selector).textContent()), normalize(expected || ''), `${context}/${metadata.id}/${source.id}: ${selector}`);
            }
            assert.deepEqual((await sourceCard.locator('.badge-restriction').allTextContents()).map(normalize), (source.license_restrictions || []).map(normalize));
            const candidates = source.compared_candidates || [];
            const candidateCards = sourceCard.locator('.compared-candidate-item');
            assert.equal(await candidateCards.count(), candidates.length);
            for (const [candidateIndex, candidate] of candidates.entries()) {
              const candidateCard = candidateCards.nth(candidateIndex);
              assert.equal(await candidateCard.locator('.candidate-link').getAttribute('href'), candidate.url);
              assert.equal(normalize(await candidateCard.locator('.candidate-link').textContent()), normalize(`${candidate.candidate_name} ↗`));
              assert.equal(normalize(await candidateCard.locator('.candidate-license').textContent()), normalize(`[${candidate.license}]`));
              assert.equal(normalize(await candidateCard.locator('.badge-candidate-status').textContent()), normalize(candidate.status || ''));
              assert.equal(normalize(await candidateCard.locator('.candidate-rationale').textContent()), normalize(candidate.comparison_rationale));
            }
          }
        }
      }
    }
    console.log('Study Days 04-06 browser rendering checks passed (not language or teaching acceptance)');
  } finally {
    try { if (browser) await browser.close(); }
    finally { server.kill('SIGTERM'); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
