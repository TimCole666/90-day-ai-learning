const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-79': /bounded|requirement|acceptance.criteria|context|permission|budget|scope|trace|bounded agent|acceptance|境界|受入|要件|コンテキスト|権限|予算|トレース|边界|邊界|验收|驗收|需求|权限|權限|预算|預算|上下文|范围|範圍|追踪|追蹤/i,
  'day-80': /diff|review|pull.request|regression|ci |continuous.integration|assertion|failing|diagnos|差分|レビュー|回帰|継続的インテグレーション|失敗|診断|修正|审查|審查|回归|回歸|持续集成|持續整合|失败|失敗|诊断|診斷|断言|斷言|篡改|合并|合併/i,
  'day-81': /deploy|delivery|rollback|health|merge|conflict|recovery|staging|release|evidence|teardown|デプロイ|ロールバック|ヘルス|ステージング|回復|リリース|エビデンス|部署|交付|回滚|回滾|健康|合并|合併|冲突|衝突|恢复|恢復|发布|發布|证据|證據/i
};

for (const n of [79, 80, 81]) {
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
const combined = lang => ['day-79', 'day-80', 'day-81'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/acceptance.criteria|验收标准|驗收標準|受入基準/.test(allText), 'acceptance criteria terminology missing');
assert.ok(/rollback|回滚|回滾|ロールバック/.test(allText), 'rollback terminology missing');
assert.ok(/pull.request|pr.review|代码评审|代碼評審|コードレビュー/.test(allText), 'PR-style review terminology missing');
console.log('Study Days 79-81 structural checks passed');
