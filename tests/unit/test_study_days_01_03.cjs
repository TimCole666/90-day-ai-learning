const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const langs = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const required = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
for (const n of [1, 2, 3]) {
  const id = `day-${String(n).padStart(2, '0')}`;
  const day = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `${id}.json`)));
  assert.equal(day.active_minutes, 480);
  assert.equal(day.activities.reduce((sum, a) => sum + a.active_minutes, 0), 480);
  assert.equal(new Set(day.activities.map(a => a.id)).size, 4);
  for (const lang of langs) {
    const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`)));
    assert.equal(content.language, lang);
    assert.deepEqual(Object.keys(content.activities).sort(), day.activities.map(a => a.id).sort());
    for (const activity of Object.values(content.activities)) {
      for (const field of required) assert.ok(typeof activity[field] === 'string' && activity[field].length > 0, `${id}/${lang} missing ${field}`);
    }
  }
}
const all = langs.map(lang => JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-01', `${lang}.json`))));
assert.ok(all.every(c => JSON.stringify(c.activities['day-01-act-01']).includes('tracer')));
assert.ok(JSON.stringify(all).includes('Independent'));
console.log('Study Days 01-03 structural checks passed');
