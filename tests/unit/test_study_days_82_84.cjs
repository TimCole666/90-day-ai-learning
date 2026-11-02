const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-82': /preregist|pre-regist|task suite|baseline|metric|deterministic|fixture|termination|budget|trace|评测|評測|基准|基準|任务集|任務集|预算|預算|终止|終止|事前登録|ベースライン|フィクスチャ|評価|メトリクス|台账|台帳/i,
  'day-83': /confound|attribution|failure|taxonomy|trace|latency|cost|ranking|sample size|uncertaint|混杂|混雜|归因|歸因|失败|失敗|轨迹|軌跡|成本|费用|費用|排序|混淆|サンプル|帰因|失敗|コスト|トレース|不確実|分類法|分類/i,
  'day-84': /consolidat|review|mastery|recompute|catch.?up|report|retrieval|spaced|综合|綜合|复习|復習|掌握|重算|重新计算|追赶|追趕|报告|報告|統合|レビュー|習熟|再計算|レポート|補習|抽出练习|检索/i
};

for (const n of [82, 83, 84]) {
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
const combined = lang => ['day-82', 'day-83', 'day-84'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/preregist|事前登録|预注册|預註冊/.test(allText), 'pre-registration terminology missing');
assert.ok(/confound|混杂|混雜|交絡/.test(allText), 'confounder terminology missing');
assert.ok(/attribution|归因|歸因|帰因/.test(allText), 'failure attribution terminology missing');
assert.ok(/termination|终止|終止|終了/.test(allText), 'termination honesty terminology missing');
console.log('Study Days 82-84 structural checks passed');
