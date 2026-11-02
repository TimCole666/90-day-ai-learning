const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-67': /hyperparameter|recipe|baseline|zero-shot|cap|spending|budget|preflight|微調|微调|超参数|超参|超參數|基线|基準|配方|预算|預算|上限|ゼロショット|レシピ/i,
  'day-68': /unattended|telemetry|loss|dynamics|overfit|overfitting|divergence|memoriz|early.stopping|watchdog|checkpoint|snapshot|isolation|fault|adapter|无头|无人值守|無人值守|遥测|遙測|动力学|動力學|过拟合|過擬合|早停|暗记|暗記|看门狗|看門狗|テレメトリ|检查点|檢查點|快照|隔离|隔離|チェックポイント|分離/i,
  'day-69': /delta|post-mortem|attribution|forgetting|regression|teardown|reconcil|billing|post-tuning|増量|增量|归因|歸因|遗忘|遺忘|忘却|回归|回歸|审计|審計|監査|解体|销毁|銷毀|对账|對賬|事後|タクソノミ|分類/i
};

for (const n of [67, 68, 69]) {
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
const combined = lang => ['day-67', 'day-68', 'day-69'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/recipe|配方|レシピ/.test(allText), 'recipe terminology missing');
assert.ok(/telemetry|遥测|遙測|テレメトリ/.test(allText), 'telemetry terminology missing');
assert.ok(/teardown|销毁|銷毀|解体/.test(allText), 'teardown terminology missing');
console.log('Study Days 67-69 structural checks passed');
