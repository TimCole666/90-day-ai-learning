const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const termRegex = /vector|向量|ベクトル|matrix|矩阵|矩陣|行列|tensor|张量|張量|テンソル/i;
for (const n of [22, 23, 24]) {
  const id = `day-${String(n).padStart(2, '0')}`;
  const day = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `${id}.json`)));
  assert.equal(day.active_minutes, 480);
  assert.equal(day.activities.reduce((sum, activity) => sum + activity.active_minutes, 0), 480);
  assert.equal(day.activities.length, 4);
  assert.equal(new Set(day.activities.map(activity => activity.id)).size, 4);
  assert.equal(day.status, 'available');
  for (const activity of day.activities) {
    assert.equal(activity.status, 'available');
    assert.ok(activity.title.length > 5, `${id} activity title should be real`);
    assert.ok(activity.source_resources.length >= 2, `${activity.id} needs >= 2 source objects`);
    for (const src of activity.source_resources) {
      for (const key of ['id', 'title', 'author', 'original_url', 'license', 'reuse_category', 'permission_basis', 'selection_rationale', 'safe_fallback']) {
        assert.ok(src[key], `${activity.id} source missing ${key}`);
      }
    }
  }
  for (const lang of languages) {
    const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`)));
    assert.equal(content.language, lang);
    assert.deepEqual(Object.keys(content.activities).sort(), day.activities.map(activity => activity.id).sort());
    for (const activity of Object.values(content.activities)) {
      for (const field of fields) assert.ok(activity[field], `${id}/${lang} missing ${field}`);
      assert.match(JSON.stringify(activity), termRegex);
    }
  }
}
const byDay = n => languages.map(lang => JSON.parse(fs.readFileSync(path.join(ROOT, `curriculum/content/day-${n}`, `${lang}.json`))));
for (const n of ['22', '23', '24']) {
  const all = byDay(n);
  assert.ok(all.every(content => Object.keys(content.activities).length === 4));
  const blob = JSON.stringify(all);
  assert.match(blob, /matrix|矩阵|矩陣|行列/i);
  assert.match(blob, /vector|向量|ベクトル/i);
  assert.match(blob, /tensor|张量|張量|テンソル/i);
}
assert.match(JSON.stringify(byDay('22')), /dot product|内積|点积|點積/i);
assert.match(JSON.stringify(byDay('23')), /transpose|转置|轉置|転置/i);
assert.match(JSON.stringify(byDay('23')), /inverse|逆|奇[异異]|det/i);
assert.match(JSON.stringify(byDay('24')), /broadcast|广播|廣播|ブロードキャスト/i);
assert.match(JSON.stringify(byDay('24')), /reshape|view|视图|檢視|ビュー|copy|复制|複製|コピー|non-contiguous|非连续|非連續|非連続/i);
const lessonFiles = fs.readdirSync(path.join(ROOT, 'lessons'));
assert.ok(lessonFiles.length > 0, 'existing lesson corpus should remain present');
const changedFiles = require('child_process').execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
assert.ok(changedFiles.every(file => !file.startsWith('lessons/')), 'ticket must not modify lessons/');
console.log('Study Days 22-24 structural checks passed');
