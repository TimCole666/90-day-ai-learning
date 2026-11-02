const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-85': /capstone|charter|scope|baseline|contract|acceptance|model.selection|provenance|summarize-notes|live_eval_contract|comparison_contract|ceiling|キャップストーン|チャーター|憲章|範囲|验收|驗收|章程|范围|範圍|基线|基準|上限|封顶|適合証拠|出处/i,
  'day-86': /integrat|adapter|harness|baseline|pipeline|rollback|fixture|fault|injection|ci_delivery|deterministic|summarize-notes|ci_practice_runner|統合|連携|集成|整合|適配|适配|流水线|管線|回滚|回滾|注入|ロールバック|アダプタ|ハーネス|ベースライン|故障|フォルト/i,
  'day-87': /evaluat|evidence|post-mortem|postmortem|rubric|acceptance|readiness|provenance|submission|review|gate|taxonomy|評価|评测|評測|证据|證據|事後|事后|验收|驗收|就绪|就緒|提出|提交|分類|失败分类|失敗分類/i
};

for (const n of [85, 86, 87]) {
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
const combined = lang => ['day-85', 'day-86', 'day-87'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/capstone|キャップストーン|综合项目|綜合專案/.test(allText), 'capstone terminology missing');
assert.ok(/provenance|出处|出處|來源|来源|来歴/.test(allText), 'provenance terminology missing');
assert.ok(/rubric|ルーブリック|评分细则|評分細則|採点基準/.test(allText), 'rubric terminology missing');
assert.ok(/course.?readiness|コース準備|课程就绪|課程就緒/i.test(allText), 'course readiness gate distinction missing');
assert.ok(/projects\/agent_learning/.test(allText), 'bounded agent project reference missing');
assert.ok(/comparison_contract\.json/.test(allText), 'LoRA comparison contract reference missing');
assert.ok(/live_eval_contract\.json/.test(allText), 'live agent evaluation contract reference missing');
assert.ok(/evidence-package\.json/.test(allText), 'cloud pretraining evidence package reference missing');
assert.ok(/ci_practice_runner\.py/.test(allText), 'CI delivery practice reference missing');
console.log('Study Days 85-87 structural checks passed');
