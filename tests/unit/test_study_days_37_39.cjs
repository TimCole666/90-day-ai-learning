const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];

console.log('--- Running Study Days 37-39 Unit Tests ---');

for (const n of [37, 38, 39]) {
  const id = `day-${String(n).padStart(2, '0')}`;
  const dayFile = path.join(ROOT, 'curriculum/days', `${id}.json`);
  const day = JSON.parse(fs.readFileSync(dayFile, 'utf8'));

  assert.equal(day.status, 'available', `${id} day status must be available`);
  assert.equal(day.active_minutes, 480, `${id} active_minutes must equal 480`);
  assert.equal(day.activities.reduce((sum, a) => sum + a.active_minutes, 0), 480, `${id} activities must sum to 480`);
  assert.equal(day.activities.length, 4, `${id} must have exactly 4 activities`);
  assert.equal(new Set(day.activities.map(a => a.id)).size, 4, `${id} activity IDs must be unique`);

  for (const act of day.activities) {
    assert.equal(act.status, 'available', `${id} activity ${act.id} status must be available`);
    assert.ok(Array.isArray(act.source_resources) && act.source_resources.length >= 2, `${id} activity ${act.id} must have >= 2 sources`);
    for (const src of act.source_resources) {
      assert.ok(src.id, `${id} activity ${act.id} source missing id`);
      assert.ok(src.license, `${id} source ${src.id} missing license`);
      assert.ok(src.safe_fallback, `${id} source ${src.id} missing safe_fallback`);
      assert.ok(Array.isArray(src.compared_candidates) && src.compared_candidates.length >= 2, `${id} source ${src.id} must have >= 2 compared_candidates`);
    }
  }

  for (const lang of languages) {
    const contentFile = path.join(ROOT, 'curriculum/content', id, `${lang}.json`);
    assert.ok(fs.existsSync(contentFile), `Missing content file: ${contentFile}`);
    const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
    assert.equal(content.language, lang, `${contentFile} language mismatch`);
    assert.deepEqual(Object.keys(content.activities).sort(), day.activities.map(a => a.id).sort(), `${contentFile} activity keys mismatch`);

    for (const [aid, act] of Object.entries(content.activities)) {
      for (const field of fields) {
        assert.ok(typeof act[field] === 'string' && act[field].trim().length > 0, `${id}/${lang}/${aid} missing field: ${field}`);
      }
    }
  }
}

// Domain-specific content and term checks across all languages
for (const n of [37, 38, 39]) {
  const id = `day-${String(n).padStart(2, '0')}`;
  for (const lang of languages) {
    const raw = fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`), 'utf8');
    assert.match(raw, /empty|空|空文字|空文字列|空字串|空字符串/i, `${id}/${lang} missing empty-string concept`);
    assert.match(raw, /Unicode|ユニコード|😀|é猫/i, `${id}/${lang} missing Unicode concept`);
    if (n === 37) {
      assert.match(raw, /byte|UTF-8|字节|位元組|バイト/i, `${id}/${lang} missing byte/UTF-8 terminology`);
      assert.match(raw, /split|划分|劃分|分割|train|val|test/i, `${id}/${lang} missing dataset split terminology`);
    } else if (n === 38) {
      assert.match(raw, /bigram|二元|バイグラム|2-gram/i, `${id}/${lang} missing bigram terminology`);
      assert.match(raw, /smoothing|平滑|スムージング/i, `${id}/${lang} missing smoothing terminology`);
      assert.match(raw, /perplexity|困惑度|パープレキシティ/i, `${id}/${lang} missing perplexity terminology`);
    } else if (n === 39) {
      assert.match(raw, /BPE|Byte-Pair|字节对|位元組對|バイト対/i, `${id}/${lang} missing BPE terminology`);
      assert.match(raw, /merge|合并|合併|マージ/i, `${id}/${lang} missing merge terminology`);
      assert.match(raw, /lossless|无损|無損|可逆|ロスレス/i, `${id}/${lang} missing lossless terminology`);
    }
  }
}

// Ensure manifest reflects available status and objectives
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/manifest.json'), 'utf8'));
for (const lesId of ['les-37', 'les-38', 'les-39']) {
  const les = manifest.lessons.find(l => l.id === lesId);
  assert.ok(les, `Manifest missing ${lesId}`);
  assert.equal(les.status, 'available', `Manifest ${lesId} must be available`);
  assert.ok(les.objective && les.objective.length > 20, `Manifest ${lesId} missing objective`);
}

// Lessons integrity check: tickets must not modify lessons/
const lessonFiles = fs.readdirSync(path.join(ROOT, 'lessons'));
assert.ok(lessonFiles.length > 0, 'existing lesson corpus should remain present');
const changedFiles = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .map(line => line.slice(3).trim());
assert.ok(changedFiles.every(file => !file.startsWith('lessons/')), 'ticket must not modify lessons/');

console.log('✓ All Study Days 37-39 structural and unit checks passed successfully!');
