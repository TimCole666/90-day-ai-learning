const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  // Day 70 is a review day (F7): act-01 teaches benchmark scoring, act-02..04 review Days 64-69.
  'day-70': /LoRA|baseline|benchmark|contamination|leak|held|基线|基準|ベースライン|基准|污染|汚染|泄露|洩漏|漏洩|留出|MMLU|GSM8K|HELM|canary|カナリア|金丝雀|金絲雀|評測|评测|評価|评估|比較|比较|comparison|honest|誠実|诚实|誠實/i,
  'day-71': /exact|F1|ROUGE|likelihood|perplexity|bootstrap|confidence|置信|信頼|信心|完全|対数|对数|對數|困惑|パープレキシティ|ブートストラップ|自助|指标|指標|メトリクス|metric|尤度|似然|区間|区间|显著|顕著|significan|准确|正確|精度/i,
  'day-72': /hallucination|幻觉|幻覚|ハルシネーション|taxonomy|分类|分類|refusal|拒答|拒絶|forgetting|遗忘|遺忘|忘却|report|报告|報告|レポート|trade|权衡|權衡|トレードオフ|format|格式|形式|violation|违规|違規|違反|错误|錯誤|error|エラー|归因|歸因|帰因|attribut/i
};

for (const n of [70, 71, 72]) {
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
const combined = lang => ['day-70', 'day-71', 'day-72'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/contamination|污染|汚染/.test(allText), 'contamination terminology missing');
assert.ok(/bootstrap|Bootstrap|ブートストラップ|自助法/.test(allText), 'bootstrap terminology missing');
assert.ok(/hallucination|幻觉|幻覚|ハルシネーション/.test(allText), 'hallucination terminology missing');
console.log('Study Days 70-72 structural checks passed');
