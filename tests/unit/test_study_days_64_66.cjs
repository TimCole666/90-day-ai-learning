const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-64': /lora|rank|low.rank|adapter|factorization|scaling|alpha|低秩|矩阵|矩陣|ランク|スケーリング|アダプタ/i,
  'day-65': /freeze|freezing|gradient|routing|optimizer|adamw|collapse|vram|projection|module|target|parameter|冻结|凍結|梯度|优化器|優化器|オプティマイザ|メモリ|射影|モジュール|対象|投影|模块|模組|目标|目標/i,
  'day-66': /merge|unmerge|latency|serving|serializ|adapter_config|safetensors|融合|反融合|折叠|折疊|熱插拔|热插拔|ゼロ遅延|マージ|アンマージ/i
};

for (const n of [64, 65, 66]) {
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
const combined = lang => ['day-64', 'day-65', 'day-66'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/lora|低秩|ランク/.test(allText), 'lora terminology missing');
assert.ok(/freeze|freezing|冻结|凍結/.test(allText), 'freezing terminology missing');
assert.ok(/merge|融合|マージ/.test(allText), 'merge terminology missing');
console.log('Study Days 64-66 structural checks passed');
