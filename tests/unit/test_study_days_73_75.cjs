const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-73': /loop|action|observation|trace|state|terminat|control|prompt|step|循环|迴圈|动作|行動|動作|观察|觀察|観測|轨迹|軌跡|トレース|状態|状态|狀態|終了|终止|終止|ループ|制御/i,
  'day-74': /schema|tool|protocol|valid|json|mcp|argument|dispatch|contract|parameter|schema|工具|スキーマ|协议|協議|協定|验证|驗證|検証|引数|引數|契約|合同|プロトコル|規約/i,
  'day-75': /fail|error|retry|repair|budget|verif|evaluat|termination|evidence|scor|metric|fault|故障|错误|錯誤|エラー|重试|重試|リトライ|修复|修復|検証|验证|驗證|証拠|证据|證據|预算|預算|終了|终止|終止|再試行|障害/i
};

for (const n of [73, 74, 75]) {
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
const combined = lang => ['day-73', 'day-74', 'day-75'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/observation|观察|觀察|観測/.test(allText), 'observation terminology missing');
assert.ok(/schema|schema|スキーマ|架構|架构/.test(allText), 'schema terminology missing');
assert.ok(/termination|终止|終止|終了/.test(allText), 'termination terminology missing');
assert.ok(/retry|重试|重試|リトライ/.test(allText), 'retry terminology missing');
assert.ok(/agent_learning|agent-learning|summarize-notes/.test(allText), 'bounded agent project reference missing');
console.log('Study Days 73-75 structural checks passed');
