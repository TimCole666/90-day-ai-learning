const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  // Day 49 is a review day (F7): act-01 teaches batching, act-02..04 review Days 43-48.
  'day-49': /batch|chunk|target|offset|autoregressive|自回归|自回歸|自己回帰|批次|バッチ|オフセット|attention|注意力|LayerNorm/i,
  'day-50': /AdamW|weight decay|warmup|cosine|schedule|权重衰减|權重衰減|重み減衰|ウォームアップ|コサイン|退火/i,
  'day-51': /checkpoint|clip|loss|explosion|overfitting|eval|检查点|檢查點|チェックポイント|クリッピング|裁剪|発散|过拟合|過擬合/i
};

for (const n of [49, 50, 51]) {
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

const combined = lang => ['day-49', 'day-50', 'day-51'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/autoregressive|自回归|自回歸|自己回帰/.test(allText), 'autoregressive terminology missing');
assert.ok(/batch|chunk|批次|バッチ/.test(allText), 'batching terminology missing');
assert.ok(/AdamW/.test(allText), 'AdamW terminology missing');
assert.ok(/weight decay|权重衰减|權重衰減|重み減衰/.test(allText), 'weight decay terminology missing');
assert.ok(/cosine|余弦|餘弦|コサイン/.test(allText), 'cosine schedule terminology missing');
assert.ok(/checkpoint|检查点|檢查點|チェックポイント/.test(allText), 'checkpoint terminology missing');
assert.ok(/clip|裁剪|クリッピング/.test(allText), 'gradient clipping terminology missing');

console.log('Study Days 49-51 structural checks passed');
