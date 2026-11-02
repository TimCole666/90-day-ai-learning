const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-61': /chatml|alpaca|instruction|schema|format|special_token|delimiter|指示データ|指令数据|指令數據|テンプレート|模板|定界|特殊トークン|特殊标记|特殊標記/i,
  'day-62': /loss|mask|ignore_index|label|cross_entropy|shift|gradient|backward|損失マスク|损失掩码|損失遮罩|勾配|梯度|対数幾率|对数几率|對數幾率/i,
  // Day 63 is a review day (F7): act-01 teaches decontamination, act-02..04 review Days 57-62.
  'day-63': /contamination|benchmark|n-gram|deduplication|minhash|filter|outlier|canary|汚染|污染|除染|去污染|重複排除|去重|ベンチマーク|基准|基準|金丝雀|金絲雀|SIGTERM|ChatML/i
};

for (const n of [61, 62, 63]) {
  const id = `day-${String(n).padStart(2, '0')}`;
  const day = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `${id}.json`)));
  assert.equal(day.active_minutes, 480);
  assert.equal(day.activities.reduce((sum, activity) => sum + activity.active_minutes, 0), 480);
  assert.equal(day.activities.length, 4);
  assert.equal(new Set(day.activities.map(activity => activity.id)).size, 4);
  assert.equal(day.status, 'available', `${id} status should be available`);
  for (const activity of day.activities) {
    assert.equal(activity.status, 'available', `${activity.id} status should be available`);
    assert.ok(activity.source_resources.length >= 2, `${activity.id} should carry at least two full source objects`);
    for (const source of activity.source_resources) {
      for (const field of ['id', 'title', 'author', 'original_url', 'version_or_verification_date', 'reuse_category', 'license', 'permission_basis', 'selection_rationale', 'prerequisites', 'safe_fallback']) {
        assert.ok(source[field], `${activity.id} source ${source.id || '?'} missing ${field}`);
      }
      assert.ok(Array.isArray(source.compared_candidates) && source.compared_candidates.length >= 2, `${source.id} needs >=2 compared_candidates`);
    }
  }
  for (const lang of languages) {
    const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`)));
    assert.equal(content.language, lang);
    assert.deepEqual(Object.keys(content.activities).sort(), day.activities.map(activity => activity.id).sort());
    for (const activity of Object.values(content.activities)) {
      for (const field of fields) assert.ok(activity[field], `${id}/${lang} missing ${field}`);
      assert.match(JSON.stringify(activity), dayTerms[id], `${id}/${lang}/${activity.title} missing key term`);
    }
  }
}
const combined = lang => ['day-61', 'day-62', 'day-63'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/instruction|指示データ|指令数据|指令數據/.test(allText), 'instruction terminology missing');
assert.ok(/mask|損失マスク|损失掩码|損失遮罩/.test(allText), 'loss mask terminology missing');
assert.ok(/ignore_index/.test(allText), 'ignore_index terminology missing');
assert.ok(/contamination|汚染|污染/.test(allText), 'contamination terminology missing');
assert.ok(/deduplication|重複排除|去重/.test(allText), 'deduplication terminology missing');
console.log('Study Days 61-63 structural checks passed');
