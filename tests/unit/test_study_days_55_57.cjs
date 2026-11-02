const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-55': /checkpoint|state_dict|optimizer|seed|restore|reload|atomic|serialize|检查点|狀態|状態|オプティマイザ|リネーム/i,
  'day-56': /parameter|memory|flop|activation|adamw|vram|compute|计算|算力|显存|顯存|浮点|浮動|メモリ/i,
  'day-57': /corrupt|fault|resume|preemption|spot|billing|sigterm|truncat|strict|incompatible|vocabulary|故障|抢占|搶佔|损坏|損壞|中断|復旧|プリエンプション|互換性|語彙|词表|詞表|不兼容|不相容/i
};

for (const n of [55, 56, 57]) {
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
const combined = lang => ['day-55', 'day-56', 'day-57'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/checkpoint|检查点|チェックポイント|檢查點/.test(allText), 'checkpoint terminology missing');
assert.ok(/state_dict|状態辞書|状态字典|狀態字典/.test(allText), 'state_dict terminology missing');
assert.ok(/parameter|参数|參數|パラメータ/.test(allText), 'parameter terminology missing');
assert.ok(/sigterm|preemption|抢占|搶佔|プリエンプション/.test(allText), 'preemption terminology missing');
console.log('Study Days 55-57 structural checks passed');
