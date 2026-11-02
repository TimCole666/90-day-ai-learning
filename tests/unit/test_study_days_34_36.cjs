const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const fields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const dayTerms = {
  'day-34': /MLP|perceptron|forward|network|tanh|layer|感知机|感知器|活性化|層|前向/i,
  'day-35': /backprop|gradient|chain rule|反向传播|反向傳播|梯度|誤差逆伝播|勾配/i,
  'day-36': /training loop|zero_grad|learning rate|训练循环|訓練循環|訓練ループ|学習率/i
};
for (const n of [34, 35, 36]) {
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
const combined = lang => ['day-34', 'day-35', 'day-36'].map(id => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', id, `${lang}.json`))))).join('');
const allText = languages.map(combined).join('');

// Cross-edition semantic regression: these learner-facing activities must retain
// the canonical N1 graph, loss/gradient contract, measured experiment, and
// failure-repair tasks. Localized prose may differ, but executable/math tokens
// and acceptance evidence may not.
const semanticRequirements = {
  'day-34': [
    ['day-34-act-01', [/0\.5/, /-0\.25/, /-0\.5/, /tanh/i, /線形|线性|線性|linear/i, /\(o - y\)\^2/]],
    ['day-34-act-02', [/4\.5179/, /0\.8741/, /-0\.9757/, /3\.1255/]],
    ['day-34-act-03', [/parameters\(\)/, /\b9\b/, /input\/weight length mismatch|入力.*重み|输入.*权重|輸入.*權重/i]],
    ['day-34-act-04', [/1\.0, 1\.0/, /0\.3364/, /0\.2913/, /0\.0538/, /0\.8954/]]
  ],
  'day-35': [
    ['day-35-act-01', [/\(o\s*[-−]\s*y\)\^2/, /2\s*\(o\s*[-−]\s*y\)/, /4\.2511/, /3\.7157/, /-4\.1480/]],
    ['day-35-act-02', [/1\s*[-−]\s*a_1\^2/, /1\s*[-−]\s*a_2\^2/, /2\.0068/, /-0\.8149/, /loss\.backward\(\)/]],
    ['day-35-act-03', [/tanh.'?\(4\)/i, /tanh.'?\(8\)/i, /0\.5\^\{?10\}?/, /9\.77/, /\+=/]],
    ['day-35-act-04', [/1\.0, 1\.0/, /-1\.8925/, /-1\.6784/, /3\.4638/, /独立|獨立|independent/i]]
  ],
  'day-36': [
    ['day-36-act-01', [/forward|前向|順伝播|前向传播/i, /loss|損失|损失/i, /zero_grad/, /backward|反向|逆伝播/i, /step/, /0\.05/, /40/]],
    ['day-36-act-02', [/0\.05/, /5\.0/, /epoch|ステップ|步/i, /10/, /20/, /30/, /39/, /2\.106/, /0\.129/]],
    ['day-36-act-03', [/tanh/i, /9\.25/, /3\.7/, /zero_grad/, /zip|切り捨て|截断|截斷/i, /999\.0/]],
    ['day-36-act-04', [/zero_grad/, /p -= lr \* grad/, /Independent|独立|獨立|自立/i]]
  ]
};
for (const [day, requirements] of Object.entries(semanticRequirements)) {
  for (const [activityId, tokens] of requirements) {
    for (const lang of languages) {
      const activity = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', day, `${lang}.json`))).activities[activityId];
      assert.ok(activity, `${day}/${lang} missing ${activityId}`);
      const text = JSON.stringify(activity);
      for (const token of tokens) assert.ok(token.test(text), `${day}/${lang}/${activityId} missing canonical token ${token}`);
    }
  }
}
// A translated activity must carry the same executable examples, not just
// matching quiz IDs or numeric keywords. Execute the public example and check
// independently recorded values rather than accepting a successful exit alone.
for (const day of ['day-35', 'day-36']) {
  const canonical = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', day, 'en.json')));
  for (const [activityId, reference] of Object.entries(canonical.activities)) {
    const referenceCode = reference.instructions.match(/```[\s\S]*?```/g) || [];
    for (const lang of languages) {
      const localized = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', day, `${lang}.json`))).activities[activityId];
      assert.deepEqual(localized.instructions.match(/```[\s\S]*?```/g) || [], referenceCode, `${activityId}/${lang} runnable example drift`);
      const assisted = /act-0[13]$/.test(activityId);
      assert.match(localized.assistance_policy_label, assisted ? /Agent/i : /Independent|独立|獨立/i);
      if (activityId === 'day-35-act-04') {
        assert.match(localized.answer, /\\nabla_a/, `${activityId}/${lang} must preserve the LaTeX gradient operator`);
        assert.doesNotMatch(localized.instructions + localized.exercise_prompt, /relu\s*\(/i, `${activityId}/${lang} must not substitute a single ReLU task`);
      }
    }
  }
  const metadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `${day}.json`)));
  for (const activity of metadata.activities) assert.equal(activity.content_revision, '2026.10.30-rev2');
}
const { spawnSync } = require('node:child_process');
function runExample(code) {
  const result = spawnSync(path.join(ROOT, '.venv/bin/python'), ['-c', code], { cwd: ROOT, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function extractPython(instructions) {
  return instructions.match(/python3 - <<'EOF'\n([\s\S]*?)\nEOF/)[1];
}
const backprop = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-35/en.json'))).activities;
const gradientCode = extractPython(backprop['day-35-act-02'].instructions);
assert.deepEqual(JSON.parse(runExample(gradientCode)), [2.0068, -1.0034, 1.0034, -0.8149, 0.4075, -0.4075, 3.7157, -4.148, 4.2511]);
const newInputCode = gradientCode.replace('Value(2.0), Value(-1.0)', 'Value(1.0), Value(1.0)');
assert.notEqual(newInputCode, gradientCode, 'Independent derivation must change inputs');
assert.deepEqual(JSON.parse(runExample(newInputCode)), [-1.6784, -1.6784, -1.6784, 3.4638, 3.4638, 3.4638, -0.6366, -0.5513, -1.8925]);
const saturationRows = runExample(extractPython(backprop['day-35-act-03'].instructions)).split('\n').map(row => row.split(/\s+/).map(Number));
assert.ok(Math.abs(saturationRows[0][2] - 1.34e-3) < 2e-6);
assert.ok(Math.abs(saturationRows[1][2] - 4.5e-7) < 2e-9);
const failure = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-36/en.json'))).activities['day-36-act-03'];
const resetRows = runExample(extractPython(failure.instructions) + '\nloss.zero_grad(); loss.backward(); print("reset:", W[0].grad)').split('\n').map(row => Number(row.split(/\s+/).at(-1)));
assert.ok(Math.abs(resetRows[0] - 2.0068) < 0.0001);
assert.ok(Math.abs(resetRows[1] - 4.0135) < 0.0001);
assert.ok(Math.abs(resetRows[0] - resetRows[2]) < 1e-12, 'Whole-graph zeroing must restore a clean backward');
const training = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content/day-36/en.json'))).activities['day-36-act-02'].instructions;
const pythonCode = training.match(/python3 - <<'EOF'\n([\s\S]*?)\nEOF/)[1];
const measured = spawnSync(path.join(ROOT, '.venv/bin/python'), ['-c', pythonCode], { cwd: ROOT, encoding: 'utf8', timeout: 10000 });
assert.equal(measured.status, 0, measured.stderr);
const observed = measured.stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
assert.equal(observed.length, 10);
const expected = [2.106, 0.369, 0.268, 0.189, 0.129, 2.106, 6.0e36, 1.6e76, 4.4e115, 1.3e151];
for (let i = 0; i < expected.length; i++) {
  assert.equal(observed[i][0], i < 5 ? 0.05 : 5.0);
  assert.equal(observed[i][1], [0, 10, 20, 30, 39][i % 5]);
  assert.ok(Number.isFinite(observed[i][2]));
  assert.ok(Math.abs(observed[i][2] - expected[i]) <= (i < 5 ? 0.001 : expected[i] * 0.05), `Measured checkpoint drift at ${i}: ${observed[i][2]}`);
}
assert.ok(/backprop|反向传播|誤差逆伝播/.test(allText), 'backpropagation terminology missing');
assert.ok(/zero_grad|梯度清零|勾配ゼロ化/.test(allText), 'zero_grad terminology missing');
assert.ok(/learning rate|学习率|學習率|学習率/.test(allText), 'learning rate terminology missing');
console.log('Study Days 34-36 structural checks passed');
