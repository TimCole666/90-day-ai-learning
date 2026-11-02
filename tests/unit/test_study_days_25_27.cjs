const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerminology = {
  'day-25': [
    /probabilit|確率|概率|機率/,
    /conditional|条件付き|条件|條件/,
    /Bayes|ベイズ|贝叶斯|貝氏/,
    /frequency|頻度|频率|頻率|empirical|経験|经验|經驗/
  ],
  'day-26': [
    /random variable|確率変数|随机变量|隨機變數|distribution|分布|分佈/,
    /expectation|期待値|期望|expected|variance|分散|方差|變異數/,
    /likelihood|尤度|似然|概似/,
    /sampl|標本|サンプリング|采样|样本|採樣|樣本/,
    /zero|ゼロ|零/
  ],
  'day-27': [
    /entropy|熵|エントロピー/i,
    /cross-entropy|交叉熵|交差エントロピー/i,
    /perplexity|困惑度|パープレキシティ/i,
    /KL|ダイバージェンス|散度/,
    /bits?|ビット|比特|位元|nats?|ナット|奈特/i
  ]
};
for (const n of [25, 26, 27]) {
  const id = `day-${String(n).padStart(2, '0')}`;
  const day = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `${id}.json`)));
  assert.equal(day.active_minutes, 480);
  assert.equal(day.activities.reduce((sum, activity) => sum + activity.active_minutes, 0), 480);
  assert.equal(day.activities.length, 4);
  assert.equal(new Set(day.activities.map(activity => activity.id)).size, 4);
  assert.equal(day.status, 'available');
  for (const activity of day.activities) {
    assert.equal(activity.status, 'available');
    assert.ok(!/^DAY-\d+ Activity|^Day \d+ activity/.test(activity.title), `${activity.id} keeps placeholder title`);
    assert.ok(activity.source_resources.length >= 2, `${activity.id} needs at least two source objects`);
    for (const src of activity.source_resources) {
      for (const f of ['id', 'title', 'author', 'original_url', 'license', 'reuse_category', 'permission_basis', 'selection_rationale']) {
        assert.ok(src[f], `${activity.id}/${src.id || 'source'} missing ${f}`);
      }
    }
  }
  for (const lang of languages) {
    const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`)));
    assert.equal(content.language, lang);
    assert.deepEqual(Object.keys(content.activities).sort(), day.activities.map(activity => activity.id).sort());
    for (const activity of Object.values(content.activities)) {
      for (const field of fields) assert.ok(activity[field], `${id}/${lang} missing ${field}`);
    }
    const blob = JSON.stringify(content.activities);
    for (const re of dayTerminology[id]) {
      assert.match(blob, re, `${id}/${lang} missing expected localized terminology ${re}`);
    }
  }
}
const lessonFiles = fs.readdirSync(path.join(ROOT, 'lessons'));
assert.ok(lessonFiles.length > 0, 'existing lesson corpus should remain present');
const changedFiles = require('child_process').execFileSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
assert.ok(changedFiles.every(file => !file.startsWith('lessons/')), 'ticket must not modify lessons/');
console.log('Study Days 25-27 structural checks passed');
