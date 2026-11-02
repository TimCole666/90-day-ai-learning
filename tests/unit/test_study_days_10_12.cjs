const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
// Localized terminology that must appear in every activity of every language edition.
const dayTerms = {
  10: /file|ファイル|文件|檔案/,
  11: /exception|例外|异常|異常|environment|環境|环境|venv/,
  12: /test|テスト|测试|測試/,
};
for (const n of [10, 11, 12]) {
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
      assert.match(JSON.stringify(activity), dayTerms[n], `${id}/${lang} missing localized topic term`);
    }
  }
}
const all = languages.flatMap(lang => [10, 11, 12].map(n => JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', `day-${n}`, `${lang}.json`)))));
assert.ok(all.every(content => Object.keys(content.activities).length === 4));
const joined = JSON.stringify(all);
assert.match(joined, /FileNotFoundError/);
assert.match(joined, /encoding|エンコーディング|编码|編碼/);
assert.match(joined, /utf-8|UTF-8/);
assert.match(joined, /missing|見つからない|不存在|缺失|缺少|遺失/);
assert.match(joined, /ModuleNotFoundError|venv|虚拟环境|虛擬環境|仮想環境/);
assert.match(joined, /unittest|assertEqual|assertRaises/);
const lessonFiles = fs.readdirSync(path.join(ROOT, 'lessons'));
assert.ok(lessonFiles.length > 0, 'existing lesson corpus should remain present');
const changedFiles = require('child_process').execFileSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
assert.ok(changedFiles.every(file => !file.startsWith('lessons/')), 'ticket must not modify lessons/');
console.log('Study Days 10-12 structural checks passed');
