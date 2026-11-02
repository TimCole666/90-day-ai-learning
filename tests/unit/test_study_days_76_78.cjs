const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-76': /state|transition|checkpoint|persist|trace|ledger|idempot|replay|resume|状态|狀態|遷移|迁移|检查点|檢查點|持久|追跡|追踪|台帳|台账|冪等|幂等|重放|恢复|恢復|状態|遷移|チェックポイント|永続|トレース|台帳|冪等|リプレイ|再開/i,
  'day-77': /review|retrieval|drill|taxonomy|post-mortem|postmortem|evidence|consolidat|budget|termination|复习|復習|检索|檢索|演练|演練|分类|分類|事后|事後|复盘|複盤|证据|証拠|整合|预算|預算|终止|終止|復習|検索|ドリル|分類|事後|エビデンス|統合|予算|終了/i,
  'day-78': /retry|backoff|jitter|timeout|deadline|process.?group|kill|isolat|sandbox|namespace|resource.?limit|AST|重试|重試|退避|抖动|抖動|超时|超時|截止|进程组|進程組|隔离|隔離|沙箱|沙盒|命名空间|命名空間|资源限制|資源限制|リトライ|バックオフ|ジッター|タイムアウト|デッドライン|プロセスグループ|分離|サンドボックス|名前空間|リソース制限/i
};

for (const n of [76, 77, 78]) {
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
const combined = lang => ['day-76', 'day-77', 'day-78'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');
assert.ok(/checkpoint|检查点|檢查點|チェックポイント/.test(allText), 'checkpoint terminology missing');
assert.ok(/idempot|冪等|幂等/.test(allText), 'idempotency terminology missing');
assert.ok(/process.?group|进程组|進程組|プロセスグループ/.test(allText), 'process-group terminology missing');
assert.ok(/backoff|退避|バックオフ/.test(allText), 'backoff terminology missing');
assert.ok(/sandbox|沙箱|沙盒|サンドボックス/.test(allText), 'sandbox terminology missing');
console.log('Study Days 76-78 structural checks passed');
