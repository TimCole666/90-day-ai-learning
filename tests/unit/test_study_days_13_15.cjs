const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'prerequisites', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion', 'assistance_policy_label'];
const sourceFields = ['id', 'title', 'author', 'original_url', 'relevant_timestamp', 'version_or_verification_date', 'reuse_category', 'license', 'permission_basis', 'selection_rationale', 'known_availability_limitations', 'safe_fallback', 'compared_candidates'];
for (const n of [13, 14, 15]) {
  const id = `day-${String(n).padStart(2, '0')}`;
  const day = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `${id}.json`)));
  assert.equal(day.active_minutes, 480);
  assert.equal(day.activities.reduce((sum, activity) => sum + activity.active_minutes, 0), 480);
  assert.equal(day.activities.length, 4);
  assert.equal(new Set(day.activities.map(activity => activity.id)).size, 4);
  assert.equal(day.status, 'available', `${id} status should be available`);
  for (const activity of day.activities) {
    assert.equal(activity.status, 'available', `${activity.id} status should be available`);
    assert.ok(Array.isArray(activity.source_resources) && activity.source_resources.length > 0, `${activity.id} needs source_resources objects`);
    for (const source of activity.source_resources) {
      for (const key of sourceFields) assert.ok(source[key] !== undefined, `${activity.id} source ${source.id} missing ${key}`);
      assert.ok(Array.isArray(source.compared_candidates) && source.compared_candidates.length > 0, `${activity.id} source ${source.id} needs compared candidates`);
    }
  }
  for (const lang of languages) {
    const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`)));
    assert.equal(content.language, lang);
    assert.deepEqual(Object.keys(content.activities).sort(), day.activities.map(activity => activity.id).sort());
    for (const activity of Object.values(content.activities)) {
      for (const field of fields) assert.ok(activity[field], `${id}/${lang} missing ${field}`);
    }
  }
}
// Localized terms must appear in each language edition (real translations, not shims)
const day13 = languages.map(lang => JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-13', `${lang}.json`))));
assert.ok(day13.every(content => JSON.stringify(content).match(/corpus|コーパス|语料库|語料庫/)), 'day-13 corpus term in every edition');
assert.ok(day13.every(content => JSON.stringify(content).match(/manifest|マニフェスト|清单|清單/)), 'day-13 manifest term in every edition');
assert.ok(day13.every(content => JSON.stringify(content).match(/empty|空/)), 'day-13 empty-input case in every edition');
assert.ok(day13.every(content => JSON.stringify(content).match(/UTF-8|Unicode|ユニコード|碼位|码点/)), 'day-13 encoding term in every edition');
const day14 = languages.map(lang => JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-14', `${lang}.json`))));
assert.ok(day14.every(content => JSON.stringify(content).match(/merge|マージ|合并|合併/)), 'day-14 merge term in every edition');
assert.ok(day14.every(content => JSON.stringify(content).match(/branch|ブランチ|分支/)), 'day-14 branch term in every edition');
assert.ok(day14.every(content => JSON.stringify(content).match(/revert|撤销|撤銷|打ち消/)), 'day-14 revert term in every edition');
assert.ok(day14.every(content => JSON.stringify(content).match(/disposable|使い捨て|一次性/)), 'day-14 disposable-repository term in every edition');
const day15 = languages.map(lang => JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-15', `${lang}.json`))));
assert.ok(day15.every(content => JSON.stringify(content).match(/provenance|出所|出处|出處/)), 'day-15 provenance term in every edition');
assert.ok(day15.every(content => JSON.stringify(content).match(/seed|シード|种子|種子/)), 'day-15 seed term in every edition');
assert.ok(day15.every(content => JSON.stringify(content).match(/text_tools/)), 'every edition references the real text_tools project');
// The described project must really exist and carry its declared metadata
assert.ok(fs.existsSync(path.join(ROOT, 'projects/text_tools/cli.py')), 'projects/text_tools/cli.py must exist');
assert.ok(fs.existsSync(path.join(ROOT, 'projects/text_tools/core.py')), 'projects/text_tools/core.py must exist');
const project = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/projects/text_tools/project.json')));
assert.equal(project.project_id, 'text_tools');
assert.deepEqual(project.study_days_recommended, [13, 14, 15]);
const lessonFiles = fs.readdirSync(path.join(ROOT, 'lessons'));
assert.ok(lessonFiles.length > 0, 'existing lesson corpus should remain present');
const changedFiles = require('child_process').execFileSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
assert.ok(changedFiles.every(file => !file.startsWith('lessons/')), 'ticket must not modify lessons/');
console.log('Study Days 13-15 structural checks passed');
