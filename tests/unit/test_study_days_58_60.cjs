const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-58': /preflight|ceiling|budget|gpu|dry.run|validator|预检|預檢|上限|预算|預算|点検|点検|ドライラン/i,
  'day-59': /unattended|tmux|telemetry|mfu|stream|gradient|checkpoint|preemption|resume|sigterm|遥测|遙測|无头|無頭|テレメトリ|バックグラウンド|ノルム|快照|恢复|恢復|断点|斷點|再開|中断/i,
  'day-60': /post.mortem|perplexity|reconciliation|safetensors|teardown|销毁|銷毀|困惑度|解体|監査|パープレキシティ|账单|賬單/i
};

for (const n of [58, 59, 60]) {
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
const combined = lang => ['day-58', 'day-59', 'day-60'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/preflight|预检|預檢|事前点検/.test(allText), 'preflight terminology missing');
assert.ok(/telemetry|遥测|遙測|テレメトリ/.test(allText), 'telemetry terminology missing');
assert.ok(/perplexity|困惑度|パープレキシティ/.test(allText), 'perplexity terminology missing');
assert.ok(/safetensors|teardown|销毁|銷毀|解体/.test(allText), 'safetensors/teardown terminology missing');
console.log('Study Days 58-60 structural checks passed');
