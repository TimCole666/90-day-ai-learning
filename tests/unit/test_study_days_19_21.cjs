const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-19': {
    en: /chain rule/i,
    ja: /連鎖律/,
    'zh-Hans': /链式法则/,
    'zh-Hant': /連鎖律/,
    edge: /nondifferentiab|kink|不可微|折点|折點|微分不可能|折れ点/
  },
  'day-20': {
    en: /partial derivative/i,
    ja: /偏微分/,
    'zh-Hans': /偏导数/,
    'zh-Hant': /偏導數/,
    grad: /gradient|勾配|梯度/
  },
  'day-21': {
    en: /computational graph/i,
    ja: /計算グラフ/,
    'zh-Hans': /计算图/,
    'zh-Hant': /計算圖/,
    accum: /backprop|accumulat|反向传播|反向傳播|誤差逆伝播|逆伝播|累加|累積/i
  }
};
for (const n of [19, 20, 21]) {
  const id = `day-${String(n).padStart(2, '0')}`;
  const day = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `${id}.json`)));
  assert.equal(day.active_minutes, 480);
  assert.equal(day.activities.reduce((sum, activity) => sum + activity.active_minutes, 0), 480);
  assert.equal(day.activities.length, 4);
  assert.equal(new Set(day.activities.map(activity => activity.id)).size, 4);
  assert.equal(day.status, 'available');
  for (const activity of day.activities) {
    assert.ok(Array.isArray(activity.source_resources) && activity.source_resources.length >= 2, `${id} ${activity.id} needs at least two full source resources`);
    assert.equal(activity.status, 'available');
  }
  const perLang = {};
  for (const lang of languages) {
    const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`)));
    assert.equal(content.language, lang);
    assert.deepEqual(Object.keys(content.activities).sort(), day.activities.map(activity => activity.id).sort());
    perLang[lang] = content;
    for (const activity of Object.values(content.activities)) {
      for (const field of fields) assert.ok(activity[field], `${id}/${lang} missing ${field}`);
      assert.match(JSON.stringify(activity), /finite difference|有限差分|recovery|恢复|恢復|回復/);
    }
  }
  const terms = dayTerms[id];
  for (const lang of languages) {
    const blob = JSON.stringify(perLang[lang]);
    assert.match(blob, terms[lang], `${id}/${lang} missing localized topic term`);
    const shared = Object.values(terms).find(term => term.test(blob));
    assert.ok(shared, `${id}/${lang} missing expected terminology`);
  }
}
const day21All = languages.map(lang => JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-21', `${lang}.json`))));
assert.ok(JSON.stringify(day21All).includes('central_fd'), 'day-21 must include the finite-difference harness code');
assert.ok(JSON.stringify(day21All).match(/42/));
const day19All = languages.map(lang => JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-19', `${lang}.json`))));
assert.ok(JSON.stringify(day19All).match(/18x \+ 6/));
const lessonFiles = fs.readdirSync(path.join(ROOT, 'lessons'));
assert.ok(lessonFiles.length > 0, 'existing lesson corpus should remain present');
const changedFiles = require('child_process').execFileSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
assert.ok(changedFiles.every(file => !file.startsWith('lessons/')), 'ticket must not modify lessons/');
console.log('Study Days 19-21 structural checks passed');
