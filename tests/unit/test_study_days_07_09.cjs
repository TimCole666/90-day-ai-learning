const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
for (const n of [7, 8, 9]) {
  const id = `day-${String(n).padStart(2, '0')}`;
  const day = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `${id}.json`)));
  assert.equal(day.active_minutes, 480);
  assert.equal(day.activities.reduce((sum, activity) => sum + activity.active_minutes, 0), 480);
  assert.equal(day.activities.length, 4);
  assert.equal(new Set(day.activities.map(activity => activity.id)).size, 4);
  for (const lang of languages) {
    const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`)));
    assert.equal(content.language, lang);
    assert.deepEqual(Object.keys(content.activities).sort(), day.activities.map(activity => activity.id).sort());
    for (const activity of Object.values(content.activities)) {
      for (const field of fields) assert.ok(activity[field], `${id}/${lang} missing ${field}`);
      assert.match(JSON.stringify(activity), /empty|空|空文字|空文字列|空白|空の/);
      assert.match(JSON.stringify(activity), /Unicode|Unicode文字|ユニコード|유니コード|😀/i);
    }
  }
}
const all = languages.map(lang => JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-07', `${lang}.json`))));
assert.ok(all.every(content => Object.keys(content.activities).length === 4));
const invariantContent = [8, 9].flatMap(n => languages.map(lang => JSON.parse(fs.readFileSync(path.join(ROOT, `curriculum/content/day-${String(n).padStart(2, '0')}`, `${lang}.json`)))));
assert.ok(invariantContent.every(content => /invariant|不変条件|不变量|不變量/.test(JSON.stringify(content))), 'Days 08–09 teach and apply invariants after the Day 07 review');
const day09 = languages.map(lang => JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-09', `${lang}.json`))));
assert.ok(day09.every(content => /\bgit revert\b/.test(JSON.stringify(content.activities['day-09-act-03']))), 'Day 09 activity 3 teaches git revert in every language edition');
const lessonFiles = fs.readdirSync(path.join(ROOT, 'lessons'));
assert.ok(lessonFiles.length > 0, 'existing lesson corpus should remain present');
const changedFiles = require('child_process').execFileSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
assert.ok(changedFiles.every(file => !file.startsWith('lessons/')), 'ticket must not modify lessons/');
console.log('Study Days 07-09 structural checks passed');
