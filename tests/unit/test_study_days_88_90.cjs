const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-88': /retrieval|independent|unaided|ai.free|closed.book|python|git|debug|mathematics|gradient|model.reasoning|rubric|mastery|檢索|检索|獨立|独立|除錯|调试|調試|數學|数学|梯度|勾配|評分|评分|採点|回収|検索|デバッグ|習得|模式推理|模型推理|モデル推論/i,
  'day-89': /correction|partial.failure|feedback|remediation|retest|agent.assisted|delegation|diff.review|taxonomy|regression|diagnos|修正|纠正|糾正|補救|补救|部分失敗|部分失败|反饋|反馈|再測|再测|复测|複測|委任|委派|委譲|フィードバック|是正|再テスト|委譲|レビュー|分類/i,
  'day-90': /portfolio|provenance|reproducib|checklist|manifest|limitation|next.learning|annual.route|review.plan|legacy|evidence|作品集|履歷|简历|出處|出处|可复现|可複現|再現性|局限|限制|清單|清单|學習計畫|学习计划|年度路線|年度路线|証跡|ポートフォリオ|再現性|チェックリスト|学習計画|年間/i
};

for (const n of [88, 89, 90]) {
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
  // Independent checks and assisted checks stay explicitly separated.
  const policies = day.activities.map(activity => activity.assistance_policy);
  assert.ok(policies.includes('independent'), `${id} must contain Independent Mastery activities`);
  assert.ok(policies.includes('agent_assisted'), `${id} must contain an Agent-Assisted activity`);
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
const combined = lang => ['day-88', 'day-89', 'day-90'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/retrieval|檢索|检索|回収|検索/i.test(allText), 'retrieval terminology missing');
assert.ok(/portfolio|作品集|ポートフォリオ/i.test(allText), 'portfolio terminology missing');
assert.ok(/rubric|量規|量规|ルーブリック|採点|评分|評分/i.test(allText), 'rubric terminology missing');
assert.ok(/blocked.awaiting.authorization|授權|授权|認可|承認/i.test(allText), 'honest blocked-authorization labeling missing');
console.log('Study Days 88-90 structural checks passed');
