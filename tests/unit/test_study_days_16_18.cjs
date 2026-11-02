const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion', 'source_recovery'];
const requiredTerms = {
  16: /function|函数|函數|関数/i,
  17: /derivative|导数|導數|微分/i,
  18: /finite|有限|有限差分|有限差分/i,
};

for (const n of [16, 17, 18]) {
  const id = `day-${String(n).padStart(2, '0')}`;
  const day = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `${id}.json`)));
  assert.equal(day.active_minutes, 480);
  assert.equal(day.activities.reduce((sum, activity) => sum + activity.active_minutes, 0), 480);
  assert.equal(day.activities.length, 4);
  assert.equal(new Set(day.activities.map(activity => activity.id)).size, 4);
  assert.ok(day.activities.every(activity => activity.category === 'mathematics'));
  assert.ok(day.activities.every(activity => activity.source_resources.length >= 2));

  for (const lang of languages) {
    const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`)));
    assert.equal(content.language, lang);
    assert.deepEqual(Object.keys(content.activities).sort(), day.activities.map(a => a.id).sort());
    assert.ok(content.source_resources.length >= 2);
    for (const activity of Object.values(content.activities)) {
      for (const field of fields) assert.ok(activity[field], `${id}/${lang} missing ${field}`);
      assert.match(JSON.stringify(activity), requiredTerms[n], `${id}/${lang} lacks localized topic evidence`);
    }
  }
}

const all = languages.map(lang => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-18', `${lang}.json`)))));
assert.ok(all.every(text => /1e-5|1e-12|浮動|浮動小数点|浮動小數點|floating/i.test(text)));
assert.ok(all.every(text => /not always|不是.*最小|最小.*不|最小.*良|小さい.*良/i.test(text)));
const review = fs.readFileSync(path.join(ROOT, 'curriculum/reviews/functions-limits-days-16-18.md'), 'utf8');
assert.match(review, /nondifferentiable|不可导|不可微|微分不可能/);
assert.match(review, /truncation|截断|截斷|切断/);
assert.match(review, /Four-language translation review/);
const changedFiles = execFileSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
assert.ok(changedFiles.every(file => !file.startsWith('lessons/')), 'ticket must not modify lessons/');
console.log('Study Days 16-18 structural checks passed');
