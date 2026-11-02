// Focused regression tests for the Day 02–03 repair batch (bounded handoff).
//
// Verifies, for all 8 activities x 4 editions:
//   1. Every activity has a distinct, fully specified task — no shared generic
//      instructions/prompt/answer boilerplate across a day's activities.
//   2. Independent activities do not pass on "honest disclosure" alone: labels
//      and mastery criteria require a fresh unaided check after remediation.
//   3. agent_assisted activities declare prompt/permissions/budget/stop rules,
//      a review checklist, and an honest blocked/unexecuted boundary; the
//      illustrative material is labelled as not-live-evidence.
//   4. Authored shell/Python snippets actually execute and produce the stated
//      invariants — run in disposable fixtures under a controlled environment
//      (private HOME, LC_ALL=C, GIT_CONFIG_NOSYSTEM, no inherited VIRTUAL_ENV).
//   5. Review activities keep recall/checking/transfer phases distinct, allow
//      a rigorous no-error-found alternative, and never demand fabricated
//      mistakes or word counts.
//   6. Learner-facing prose is genuinely localized per edition; common
//      nav/notice labels are honest and in-language; ledger ids/policies/
//      minutes/quiz-absence are preserved; activity revisions are asserted below.
// Offline: no network, providers, learner data, or repo-state mutation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const LANGS = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }

const content = {};
const ledgers = {};
for (const day of ['day-02', 'day-03']) {
  ledgers[day] = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `${day}.json`)));
  for (const lang of LANGS) {
    const p = path.join(ROOT, 'curriculum/content', day, `${lang}.json`);
    content[`${day}/${lang}`] = JSON.parse(fs.readFileSync(p));
  }
}
function act(day, lang, id) { return content[`${day}/${lang}`].activities[id]; }

const BLOCK = /```(sh|bash|python)\s*\n([\s\S]*?)```/g;
function blocks(text, kind) {
  const out = [];
  for (const m of text.matchAll(BLOCK)) if (m[1] === kind) out.push(m[2]);
  return out;
}
// Project .venv is the required Python for these checks (parent evidence
// used project Python 3.13.15); fall back to PATH python3 if absent.
const VENV_PY = fs.existsSync(path.join(ROOT, '.venv/bin/python3'))
  ? path.join(ROOT, '.venv/bin/python3') : null;
function fixtureEnv(tmp) {
  const env = {
    PATH: (VENV_PY ? path.dirname(VENV_PY) + path.delimiter : '') + process.env.PATH,
    HOME: tmp, LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    TERM: 'dumb',
  };
  return env;
}
// POST-01/02: authored blocks must be safe when run RAW - the learner-visible
// source carries its own fail-stop subshell and setup validation. No injected
// `set -e`, no injected cd, no repair of expected failures.
function runRaw(tmp, script, extraEnv) {
  const env = Object.assign(fixtureEnv(tmp), { TMPDIR: tmp }, extraEnv || {});
  const r = spawnSync('bash', ['-c', script], { cwd: tmp, env, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function runPy(tmp, script) {
  const f = path.join(tmp, '__snippet.py');
  fs.writeFileSync(f, script);
  return execFileSync('python3', [f], { encoding: 'utf8', env: fixtureEnv(tmp), cwd: tmp });
}
function dedent(code) {
  const lines = code.split('\n').filter(l => l.trim().length);
  const indent = Math.min(...lines.map(l => l.match(/^ */)[0].length));
  return code.split('\n').map(l => l.slice(indent)).join('\n');
}

const KANA = /[\u3040-\u30ff]/;
const HAN = /[\u4e00-\u9fff]/;

// ---------- 1. Distinct, fully specified tasks ----------
console.log('1. Checking every activity has a distinct concrete task...');
for (const day of ['day-02', 'day-03']) {
  const ids = Object.keys(content[`${day}/en`].activities);
  assert.equal(ids.length, 4, `${day} must have 4 activities`);
  for (const field of ['instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion']) {
    const vals = ids.map(id => act(day, 'en', id)[field]);
    ok(new Set(vals).size === ids.length,
      `${day} ${field} is still shared boilerplate across activities`);
    passed += ids.length;
  }
}
// Named sandboxes must differ between the transfer tasks.
ok(act('day-02', 'en', 'day-02-act-03').exercise_prompt.includes('fs-sandbox'), 'day-02-act-03 needs the fs-sandbox task');
ok(act('day-03', 'en', 'day-03-act-03').exercise_prompt.includes('report-sandbox'), 'day-03-act-03 needs a fresh report-sandbox task');
ok(!act('day-03', 'en', 'day-03-act-03').exercise_prompt.includes('notes/todo.txt'),
  'day-03-act-03 must not reuse the Day 02 transcript');

// ---------- 2. Independent boundary ----------
console.log('2. Checking independent-activity boundaries...');
const INDEP = ['day-02-act-01', 'day-02-act-03', 'day-02-act-04',
  'day-03-act-01', 'day-03-act-03', 'day-03-act-04'];
const FRESH = {
  en: /fresh unaided|unaided check/i,
  ja: /無支援(チェック|のバリエーション|転移)/,
  'zh-Hans': /无辅助(检查|变体|迁移)/,
  'zh-Hant': /無輔助(檢查|變體|遷移)/,
};
for (const lang of LANGS) {
  for (const day of ['day-02', 'day-03']) {
    for (const id of INDEP.filter(i => i.startsWith(day))) {
      const a = act(day, lang, id);
      ok(FRESH[lang].test(a.mastery_criterion) || FRESH[lang].test(a.assistance_policy_label),
        `${day}/${lang} ${id}: assisted work must require a fresh unaided check`);
      ok(!/or labels? (agent |the )?assist|labels? assistance honestly|只要如实申报|如實申報.*即可|誠実に申告.*(合格|可)/i.test(a.mastery_criterion),
        `${day}/${lang} ${id}: honest disclosure must not substitute for unaided mastery`);
    }
  }
}

// ---------- 3. agent_assisted boundaries ----------
console.log('3. Checking agent-assisted boundaries...');
const AGENT = ['day-02-act-02', 'day-03-act-02'];
const AGENT_REQ = {
  en: { budget: /3 (agent )?(turns?|回合|轮)/i, stop: /stop|abort/i, blocked: /blocked|unexecuted|not executed/i,
        illust: /illustrat|not (a |an )?(real|live|observed)/i, approval: /approval|approve/i },
  ja: { budget: /3(ターン|回)/, stop: /停止|中止/, blocked: /ブロック済み|未実行/,
        illust: /例示|ではありません/, approval: /承認/ },
  'zh-Hans': { budget: /3 ?(轮|回合|次)/, stop: /停止|中止/, blocked: /受阻|未执行/,
        illust: /示例|不是.*(真实|实际)/, approval: /批准/ },
  'zh-Hant': { budget: /3 ?(回合|輪|次)/, stop: /停止|中止/, blocked: /受阻|未執行/,
        illust: /範例|不是.*(真實|實際)/, approval: /批准/ },
};
for (const lang of LANGS) {
  for (const id of AGENT) {
    const day = id.slice(0, 6);
    const a = act(day, lang, id);
    const blob = `${a.instructions}\n${a.exercise_prompt}\n${a.answer}\n${a.assistance_policy_label}`;
    for (const [k, re] of Object.entries(AGENT_REQ[lang])) {
      ok(re.test(blob), `${day}/${lang} ${id}: missing ${k} boundary`);
    }
    // permission declared != OS sandbox
    ok(/not an? OS sandbox|契約であって|不是操作系统沙箱|不是作業系統沙箱/i.test(blob),
      `${day}/${lang} ${id}: must state declared permission is not an OS sandbox`);
  }
}
ok(act('day-02', 'en', 'day-02-act-02').exercise_prompt.includes('agent-task-sandbox'), 'day-02-act-02 needs bounded sandbox');
ok(/checklist/i.test(act('day-02', 'en', 'day-02-act-02').exercise_prompt), 'day-02-act-02 needs a review checklist');
ok(act('day-03', 'en', 'day-03-act-02').exercise_prompt.includes('check_clamp.py'), 'day-03-act-02 needs the independent check');

// ---------- 4. Execute the authored snippets in disposable fixtures ----------
console.log('4. Executing authored snippets in disposable fixtures...');
let tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd23-'));
try {
  // day-02-act-01 strip snippet — identical python block across editions.
  const stripBlocks = LANGS.map(l => blocks(act('day-02', l, 'day-02-act-01').exercise_prompt, 'python')[0]);
  ok(new Set(stripBlocks).size === 1, 'day-02-act-01 python snippet must be identical across editions');
  const stripOut = runPy(tmp, dedent(stripBlocks[0]));
  assert.equal(stripOut, "'data'\n'  data  '\n'data'\n", 'strip snippet output mismatch'); passed += 2;

  // day-02-act-04 dict transfer snippet.
  const dictBlock = blocks(act('day-02', 'en', 'day-02-act-04').exercise_prompt, 'python')[0];
  assert.equal(runPy(tmp, dedent(dictBlock)), "{'a': 1, 'b': 2} True\n", 'dict transfer output mismatch'); passed += 2;

  // day-02-act-03 fs-sandbox sequence — identical sh block across editions,
  // run RAW (no injected set-e/cd): the authored subshell must fail-stop itself.
  const fsBlocks = LANGS.map(l => blocks(act('day-02', l, 'day-02-act-03').exercise_prompt, 'bash')[0]);
  ok(new Set(fsBlocks).size === 1, 'day-02-act-03 sh block must be identical across editions');
  ok(fsBlocks[0].startsWith('(\nset -e'), 'day-02-act-03 block must be a contained fail-stop subshell');
  const fsR = runRaw(tmp, fsBlocks[0]);
  ok(fsR.status === 0, `day-02-act-03 raw run must exit 0: ${fsR.stderr}`);
  const fsLines = fsR.stdout.split('\n').filter(Boolean);
  ok(fsLines[0].endsWith('/fs-sandbox'), `pwd must land in fs-sandbox: ${fsLines[0]}`);
  ok(fsLines.includes('./notes/drafts/ideas.txt') && fsLines.includes('./notes/todo.txt'),
    `find must list both files: ${fsR.stdout}`);
  ok(fsLines.includes('first note'), `cat output missing: ${fsR.stdout}`);
  ok(fsLines.some(l => l.endsWith('/fs-sandbox/notes')), `nested pwd missing: ${fsR.stdout}`);
  ok(fsLines.includes('drafts') && fsLines.includes('todo.txt'), `ls output missing: ${fsR.stdout}`);
  ok(fsLines.includes('2 notes/drafts/ideas.txt'), `wc output mismatch: ${fsR.stdout}`);
  const fsClean = fsLines.find(l => l.startsWith('rm -r -- '));
  ok(fsClean, `block must print a literal rm cleanup line: ${fsR.stdout}`);
  const fsRoot = fs.readdirSync(tmp).find(f => f.startsWith('d02sbx.'));
  ok(fsRoot && fs.existsSync(path.join(tmp, fsRoot, 'fs-sandbox')),
    `block must create a private d02sbx root holding fs-sandbox: ${fs.readdirSync(tmp)}`);
  ok(fsClean === `rm -r -- ${path.join(tmp, fsRoot)}`,
    `literal cleanup must name the exact root created: ${fsClean}`);
  // nothing outside the sandbox: the fixture holds only the d02sbx root + snippet.
  ok(fs.readdirSync(tmp).every(f => f.startsWith('d02sbx.') || f === '__snippet.py'),
    `fs-sandbox sequence touched files outside the sandbox: ${fs.readdirSync(tmp)}`);
  // POST-07: literal cleanup removes exactly the printed root and nothing else —
  // no variable-based lexical guard may exist or be advertised.
  for (const lang of LANGS) {
    const a = act('day-02', lang, 'day-02-act-03');
    const blob = `${a.instructions}\n${a.exercise_prompt}\n${a.hint}\n${a.answer}`;
    ok(!blob.includes('case "$SBX_ROOT"'),
      `day-02/${lang} act-03 must not offer a lexical ownership pattern (POST-07)`);
  }
  const foreign = path.join(tmp, 'foreign-surrogate');
  fs.mkdirSync(path.join(tmp, 'd02sbx.anchor'));
  fs.mkdirSync(foreign);
  fs.writeFileSync(path.join(foreign, 'keep.txt'), 'PRIVATE SURROGATE KEEP\n');
  const clRun = spawnSync('bash', ['-c', fsClean], { cwd: tmp, env: fixtureEnv(tmp), encoding: 'utf8' });
  ok(clRun.status === 0 && !fs.existsSync(path.join(tmp, fsRoot)),
    `printed cleanup line must remove the real root verbatim: ${clRun.stderr}`);
  ok(fs.readFileSync(path.join(foreign, 'keep.txt'), 'utf8') === 'PRIVATE SURROGATE KEEP\n',
    'printed cleanup must not touch the foreign surrogate');
  // a stale/traversal SBX_ROOT value cannot redirect the literal cleanup
  const stale = spawnSync('bash', ['-c', fsClean],
    { cwd: tmp, env: Object.assign(fixtureEnv(tmp), { SBX_ROOT: `${tmp}/d02sbx.anchor/../foreign-surrogate` }), encoding: 'utf8' });
  ok(fs.readFileSync(path.join(foreign, 'keep.txt'), 'utf8') === 'PRIVATE SURROGATE KEEP\n',
    'literal cleanup is immune to a poisoned SBX_ROOT (path already removed)');
  fs.rmSync(foreign, { recursive: true, force: true });
  fs.rmSync(path.join(tmp, 'd02sbx.anchor'), { recursive: true, force: true });

  // NEGATIVE (POST-01): same raw block under umask 0777 in a sentinel caller
  // dir — mkdir creates unusable mode-000 dirs, the authored subshell must
  // abort without writing exercise artifacts into the caller directory.
  const neg = path.join(tmp, 'negcaller');
  fs.mkdirSync(path.join(neg, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(neg, 't'), { mode: 0o700 });
  fs.writeFileSync(path.join(neg, 'notes/todo.txt'), 'PRIVATE SURROGATE KEEP\n');
  const negR = spawnSync('bash', ['-c', 'umask 0777; ' + fsBlocks[0]],
    { cwd: neg, env: Object.assign(fixtureEnv(neg), { TMPDIR: path.join(neg, 't') }), encoding: 'utf8' });
  ok(negR.status !== 0, 'raw block must abort on unusable private root');
  ok(fs.readFileSync(path.join(neg, 'notes/todo.txt'), 'utf8') === 'PRIVATE SURROGATE KEEP\n',
    'caller sentinel must be unchanged after aborted setup');
  ok(!fs.readdirSync(neg).some(f => f === 'drafts' || f === 'ideas.txt'),
    'aborted setup must not write exercise artifacts into the caller');
  // restore permissions strictly inside the owned neg root for cleanup —
  // chmod each top-level mktemp dir (find cannot descend into mode-000 first)
  execFileSync('bash', ['-c', 'for d in "$1"/t/*/; do chmod -R u+rwx "$d"; done', 'bash', neg]);
  fs.rmSync(neg, { recursive: true, force: true });

  // day-03-act-01 env drill — three sh blocks: build+fail, evidence, fix+recheck.
  const drillBlocks = LANGS.map(l => blocks(act('day-03', l, 'day-03-act-01').exercise_prompt, 'bash'));
  ok(drillBlocks.every(b => b.length === 3), 'day-03-act-01 must have three sh blocks');
  ok(new Set(drillBlocks.map(b => b.join(''))).size === 1, 'day-03-act-01 sh blocks must be identical across editions');
  const [build, evidence, fix] = drillBlocks[0];
  for (const b of drillBlocks[0]) {
    ok(b.startsWith('(\nset -e'), 'each env-drill block must be a contained fail-stop subshell');
  }
  // Block 1: intended failure is observed inside the subshell; root printed.
  const d1 = runRaw(tmp, build);
  ok(d1.status === 0, `build block must exit 0 after observing the intended failure: ${d1.stderr}`);
  ok(/ModuleNotFoundError/.test(d1.stdout + d1.stderr), `intended failure must be shown: ${d1.stdout}${d1.stderr}`);
  const sbxExport = d1.stdout.split('\n').find(l => l.startsWith('export SBX_ROOT='));
  ok(sbxExport, `build block must print the SBX_ROOT export line: ${d1.stdout}`);
  const sbx = sbxExport.split('=')[1];
  ok(sbx && sbx.startsWith(tmp + path.sep) && fs.existsSync(path.join(sbx, 'env-drill')),
    `SBX_ROOT export must name a fixture descendant holding env-drill: ${d1.stdout}`);
  // POST-08: the availability check must not execute the ambient module.
  // A synthetic helper whose IMPORT writes a sentinel must abort the block
  // with the sentinel never written.
  const pre = path.join(tmp, 'prehelper');
  fs.mkdirSync(pre);
  fs.writeFileSync(path.join(pre, 'helper.py'),
    'import os\n'
    + `open(${JSON.stringify(path.join(tmp, 'IMPORT_SIDE_EFFECT'))}, 'w').write('CHANGED BY IMPORT\\n')\n`
    + 'def greet():\n    return 0\n');
  const preR = runRaw(tmp, build, { PYTHONPATH: pre });
  ok(preR.status !== 0, 'pre-resolvable helper must abort the build block');
  ok(/already resolves 'helper'/.test(preR.stdout + preR.stderr),
    `abort must name the ambient-helper cause: ${preR.stdout}${preR.stderr}`);
  ok(!fs.existsSync(path.join(tmp, 'IMPORT_SIDE_EFFECT')),
    'availability check must not execute the ambient module (POST-08)');
  ok(fs.readdirSync(pre).join(',') === 'helper.py', 'ambient-helper abort must write nothing');
  // the probe is a non-executing importlib.util.find_spec resolution check;
  // exit0 means positively verified absence ONLY — never "probably absent".
  ok(build.includes("spec = importlib.util.find_spec('helper')")
    && build.includes('sys.exit(3 if spec is not None else 0)'),
    'probe must reserve exit0 for verified absence and use a distinct resolvable code');
  ok(/\[ "\$probe_rc" -ne 0 \][\s\S]*-eq 3 [\s\S]*already resolves/.test(build),
    'probe must fail-closed: every nonzero except the resolvable code is a probe failure');
  // POST-08 residual: a controlled preflight Python failure (exit 1/2/73 on
  // the find_spec call) must ABORT the block — exit1 must never alias
  // "verified absence". Wrapper delegates all other calls to the project
  // Python; fixtures are invocation-owned.
  const faultbin = path.join(tmp, 'faultbin');
  const faulttmp = path.join(tmp, 'fault tmp');
  fs.mkdirSync(faultbin);
  fs.mkdirSync(faulttmp);
  const realPy = VENV_PY || execFileSync('bash', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(faultbin, 'python3'),
    '#!/bin/sh\ncase " $* " in\n  *find_spec*) exit ${FAULT_RC:-1} ;;\nesac\n'
    + `exec ${realPy} "$@"\n`, { mode: 0o755 });
  for (const frc of [1, 2, 73]) {
    const fr = spawnSync('bash', ['-c', build],
      { cwd: tmp, env: Object.assign(fixtureEnv(tmp),
          { TMPDIR: faulttmp, PATH: `${faultbin}${path.delimiter}${process.env.PATH}`, FAULT_RC: String(frc) }),
        encoding: 'utf8' });
    ok(fr.status !== 0, `preflight fault rc=${frc} must abort the block`);
    ok(fr.stdout.includes(`probe failed (rc=${frc})`),
      `abort must name the probe failure rc=${frc}: ${fr.stdout}${fr.stderr}`);
    ok(!fs.readdirSync(faulttmp).some(f =>
      f.startsWith('d03env.') && fs.existsSync(path.join(faulttmp, f, 'env-drill'))),
      `preflight fault rc=${frc} must not create env-drill artifacts`);
  }
  fs.rmSync(faultbin, { recursive: true, force: true });
  fs.rmSync(faulttmp, { recursive: true, force: true });
  // NEGATIVE: same raw build block under umask 0777 in a sentinel caller dir.
  const neg2 = path.join(tmp, 'negcaller2');
  fs.mkdirSync(path.join(neg2, 't'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(neg2, 'caller_keep.txt'), 'PRIVATE SURROGATE KEEP\n');
  const neg2R = spawnSync('bash', ['-c', 'umask 0777; ' + build],
    { cwd: neg2, env: Object.assign(fixtureEnv(neg2), { TMPDIR: path.join(neg2, 't') }), encoding: 'utf8' });
  ok(neg2R.status !== 0, 'raw build block must abort on unusable private root');
  ok(fs.readFileSync(path.join(neg2, 'caller_keep.txt'), 'utf8') === 'PRIVATE SURROGATE KEEP\n',
    'caller sentinel must be unchanged after aborted setup');
  ok(!fs.readdirSync(neg2).some(f => f === 'env-drill' || f === 'tools' || f === 'app.py'),
    'aborted setup must not write exercise artifacts into the caller');
  execFileSync('bash', ['-c', 'for d in "$1"/t/*/; do chmod -R u+rwx "$d"; done', 'bash', neg2]);
  fs.rmSync(neg2, { recursive: true, force: true });
  // Block 2+3 threaded via the printed export — same contract the learner uses.
  const ev = runRaw(tmp, evidence, { SBX_ROOT: sbx });
  ok(ev.status === 0, `evidence block must exit 0: ${ev.stderr}`);
  ok(ev.stdout.includes('/env-drill'), `sys.path evidence must show env-drill: ${ev.stdout}`);
  ok(!ev.stdout.includes('/env-drill/tools'), `tools/ must be absent from sys.path: ${ev.stdout}`);
  ok(ev.stdout.includes('helper.py'), `ls must show helper.py exists: ${ev.stdout}`);
  // POST-02: setness and value are distinct, exact records — unset, empty,
  // and nonempty originals must each read back differently and unchanged.
  for (const [tag, val, rec] of [
    ['unset', undefined, 'PYTHONPATH {S}: unset'],
    ['empty', '', 'PYTHONPATH {S}: set value=<>'],
    ['nonempty', pre, `PYTHONPATH {S}: set value=<${pre}>`],
  ]) {
    const env = { SBX_ROOT: sbx };
    if (val !== undefined) env.PYTHONPATH = val;
    const fx = runRaw(tmp, fix, env);
    ok(fx.status === 0 && fx.stdout.includes('ok'),
      `recheck must print ok with PYTHONPATH ${tag}: ${fx.stdout}${fx.stderr}`);
    ok(fx.stdout.includes(rec.replace('{S}', 'before')) && fx.stdout.includes(rec.replace('{S}', 'after')),
      `exact ${tag} setness record must appear before AND after: ${fx.stdout}`);
  }
  // the literal cleanup line printed by the fix block removes the drill root;
  // the export is pasted VERBATIM — the printed line is the continuation.
  const fixClean = spawnSync('bash', ['-c', `${sbxExport}\n${fix}`],
    { cwd: tmp, env: fixtureEnv(tmp), encoding: 'utf8' });
  const rmLine = fixClean.stdout.split('\n').find(l => l.startsWith('rm -r -- '));
  ok(rmLine === `rm -r -- ${sbx}`, `fix block must print the literal cleanup for the drill root: ${fixClean.stdout}`);
  spawnSync('bash', ['-c', rmLine], { cwd: tmp, env: fixtureEnv(tmp) });
  ok(!fs.existsSync(sbx), 'literal cleanup must remove the drill root');

  // day-03-act-02 clamp check: bad patch fails, corrected patch passes.
  const checkCode = dedent(blocks(act('day-03', 'en', 'day-03-act-02').exercise_prompt, 'python')[0]);
  const ansBlocks = blocks(act('day-03', 'en', 'day-03-act-02').answer, 'python');
  ok(ansBlocks.length === 2, 'day-03-act-02 answer must contain bad + corrected patches');
  const bad = dedent(ansBlocks[0]), good = dedent(ansBlocks[1]);
  fs.writeFileSync(path.join(tmp, 'check_clamp.py'), checkCode);
  fs.writeFileSync(path.join(tmp, 'calc.py'), 'def add(a, b):\n    return a + b\n\n' + bad + '\n');
  let badFailed = null;
  try { runPy(tmp, 'import subprocess,sys; r=subprocess.run([sys.executable,"check_clamp.py"],capture_output=True,text=True); sys.exit(r.returncode)'); }
  catch (e) { badFailed = e; }
  ok(badFailed !== null, 'illustrative bad patch must fail the independent check');
  fs.writeFileSync(path.join(tmp, 'calc.py'), 'def add(a, b):\n    return a + b\n\n' + good + '\n');
  const goodOut = execFileSync('python3', ['check_clamp.py'], { encoding: 'utf8', env: fixtureEnv(tmp), cwd: tmp });
  ok(goodOut.trim() === 'clamp checks passed', `corrected patch must pass: ${goodOut}`);

  // day-03-act-03 report-sandbox sequence — identical across editions, run RAW.
  const repBlocks = LANGS.map(l => blocks(act('day-03', l, 'day-03-act-03').exercise_prompt, 'bash')[0]);
  ok(new Set(repBlocks).size === 1, 'day-03-act-03 sh block must be identical across editions');
  ok(repBlocks[0].startsWith('(\nset -e'), 'day-03-act-03 block must be a contained fail-stop subshell');
  const repR = runRaw(tmp, repBlocks[0]);
  ok(repR.status === 0, `day-03-act-03 raw run must exit 0: ${repR.stderr}`);
  const repLines = repR.stdout.split('\n').filter(Boolean);
  ok(repLines[0] === '3 data/sales-q1.csv', `wc output mismatch: ${repR.stdout}`);
  ok(repLines.includes('./archive/notes.txt') && repLines.includes('./archive/sales-q1.bak')
     && repLines.includes('./data/sales-q1.csv'), `find must list the three artifacts: ${repR.stdout}`);
  const repClean = repLines.find(l => l.startsWith('rm -r -- '));
  ok(repClean, `block must print a literal rm cleanup line: ${repR.stdout}`);
  const repRootName = fs.readdirSync(tmp).find(f => f.startsWith('d03rpt.'));
  ok(repRootName, `block must create a private d03rpt root: ${fs.readdirSync(tmp)}`);
  const repRoot = path.join(tmp, repRootName);
  ok(repClean === `rm -r -- ${repRoot}`, `literal cleanup must name the exact root: ${repClean}`);
  for (const lang of LANGS) {
    const a = act('day-03', lang, 'day-03-act-03');
    const blob = `${a.instructions}\n${a.exercise_prompt}\n${a.hint}\n${a.answer}`;
    ok(!blob.includes('case "$SBX_ROOT"'),
      `day-03/${lang} act-03 must not offer a lexical ownership pattern (POST-07)`);
  }
  const repDir = path.join(repRoot, 'report-sandbox');
  ok(!fs.existsSync(path.join(repDir, 'data/readme.txt')), 'readme.txt must be moved out of data/');
  ok(fs.readFileSync(path.join(repDir, 'archive/sales-q1.bak'), 'utf8')
     === fs.readFileSync(path.join(repDir, 'data/sales-q1.csv'), 'utf8'),
    'backup must be byte-identical');
  ok(!fs.readdirSync(tmp).some(f => ['report-sandbox', 'archive', 'data'].includes(f)),
    `report sequence must not write artifacts at caller level: ${fs.readdirSync(tmp)}`);
  // NEGATIVE (POST-02): same raw block under umask 0777 in a sentinel caller dir.
  const neg3 = path.join(tmp, 'negcaller3');
  fs.mkdirSync(path.join(neg3, 'data'), { recursive: true });
  fs.mkdirSync(path.join(neg3, 't'), { mode: 0o700 });
  fs.writeFileSync(path.join(neg3, 'data/sales-q1.csv'), 'PRIVATE SURROGATE KEEP\n');
  const neg3R = spawnSync('bash', ['-c', 'umask 0777; ' + repBlocks[0]],
    { cwd: neg3, env: Object.assign(fixtureEnv(neg3), { TMPDIR: path.join(neg3, 't') }), encoding: 'utf8' });
  ok(neg3R.status !== 0, 'raw report block must abort on unusable private root');
  ok(fs.readFileSync(path.join(neg3, 'data/sales-q1.csv'), 'utf8') === 'PRIVATE SURROGATE KEEP\n',
    'caller sentinel must be unchanged after aborted setup');
  ok(!fs.readdirSync(neg3).some(f => f === 'archive'),
    'aborted setup must not write exercise artifacts into the caller');
  execFileSync('bash', ['-c', 'for d in "$1"/t/*/; do chmod -R u+rwx "$d"; done', 'bash', neg3]);
  fs.rmSync(neg3, { recursive: true, force: true });
  // POST-07: the printed literal cleanup removes the report root verbatim.
  spawnSync('bash', ['-c', repClean], { cwd: tmp, env: fixtureEnv(tmp) });
  ok(!fs.existsSync(repRoot), 'literal cleanup must remove the report root');

  // POST-06: a TMPDIR containing spaces must not break the printed
  // continuation/cleanup lines — run each block under a spaced TMPDIR and
  // use the ACTUAL printed lines unchanged.
  const spaced = path.join(tmp, 'tmp dir with spaces');
  fs.mkdirSync(spaced);
  const sp = spawnSync('bash', ['-c', drillBlocks[0][0]],
    { cwd: tmp, env: Object.assign(fixtureEnv(tmp), { TMPDIR: spaced }), encoding: 'utf8' });
  ok(sp.status === 0, `build block must succeed under a spaced TMPDIR: ${sp.stderr}`);
  const spExport = sp.stdout.split('\n').find(l => l.startsWith('export SBX_ROOT='));
  ok(spExport, 'spaced run must print the export continuation line');
  ok(spExport.includes('\\'), `spaced path must be shell-escaped in the printed line: ${spExport}`);
  // paste the ACTUAL printed line, then run the next block — no manual repair.
  const spEv = spawnSync('bash', ['-c', `${spExport}\n${drillBlocks[0][1]}`],
    { cwd: tmp, env: Object.assign(fixtureEnv(tmp), { TMPDIR: spaced }), encoding: 'utf8' });
  ok(spEv.status === 0 && spEv.stdout.includes('/env-drill'),
    `pasted export must carry the spaced root into block 2: ${spEv.stdout}${spEv.stderr}`);
  const spFix = spawnSync('bash', ['-c', `${spExport}\n${drillBlocks[0][2]}`],
    { cwd: tmp, env: Object.assign(fixtureEnv(tmp), { TMPDIR: spaced }), encoding: 'utf8' });
  ok(spFix.status === 0 && spFix.stdout.includes('ok'),
    `pasted export must carry the spaced root into block 3: ${spFix.stdout}${spFix.stderr}`);
  const spRm = spFix.stdout.split('\n').find(l => l.startsWith('rm -r -- '));
  ok(spRm && spRm.includes('\\'), 'spaced cleanup line must be shell-escaped');
  spawnSync('bash', ['-c', spRm], { cwd: tmp, env: fixtureEnv(tmp) });
  ok(!fs.readdirSync(spaced).some(f => f.startsWith('d03env.')), 'literal cleanup removed the spaced root');

  // d02 + d03rpt under the spaced TMPDIR: actual printed rm lines verbatim.
  for (const [blk, prefix] of [[fsBlocks[0], 'd02sbx.'], [repBlocks[0], 'd03rpt.']]) {
    const r = spawnSync('bash', ['-c', blk],
      { cwd: tmp, env: Object.assign(fixtureEnv(tmp), { TMPDIR: spaced }), encoding: 'utf8' });
    ok(r.status === 0, `spaced-TMPDIR run must succeed (${prefix}): ${r.stderr}`);
    const line = r.stdout.split('\n').find(l => l.startsWith('rm -r -- '));
    ok(line && line.includes('\\'), `${prefix} cleanup must be shell-escaped: ${r.stdout}`);
    const before = fs.readdirSync(spaced).filter(f => f.startsWith(prefix));
    ok(before.length === 1, `one ${prefix} root must exist under spaced TMPDIR`);
    spawnSync('bash', ['-c', line], { cwd: tmp, env: fixtureEnv(tmp) });
    ok(!fs.existsSync(path.join(spaced, before[0])), `literal cleanup removed ${before[0]}`);
  }
  fs.rmSync(spaced, { recursive: true, force: true });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- 5. Review-activity structure ----------
console.log('5. Checking review-activity rigor...');
// day-02-act-04 (retrieval comparison) needs the rigorous no-error-found
// alternative; day-03-act-04 (spaced plan) is checked separately below.
const NONE_FOUND = {
  en: /none found|nothing (was )?missed/i,
  ja: /抜けがなかった|抜けなし/,
  'zh-Hans': /没有遗漏|未发现遗漏/,
  'zh-Hant': /沒有遺漏|未發現遺漏/,
};
const MISCONCEPT = { en: /misconception/i, ja: /誤解/, 'zh-Hans': /误解/, 'zh-Hant': /誤解/ };
for (const lang of LANGS) {
  for (const id of ['day-02-act-04', 'day-03-act-04']) {
    const day = id.slice(0, 6);
    const a = act(day, lang, id);
    const blob = `${a.instructions}\n${a.exercise_prompt}\n${a.answer}\n${a.mastery_criterion}`;
    ok(!/\b\d+ words?\b|characters|字数|字數|文字数/i.test(blob),
      `${day}/${lang} ${id}: no length quotas allowed`);
    ok(!/must (find|invent|have) (a|an|at least one) (mistake|error|misconception)/i.test(blob),
      `${day}/${lang} ${id}: must not require inventing an error`);
  }
  const a = act('day-02', lang, 'day-02-act-04');
  const blob = `${a.instructions}\n${a.exercise_prompt}\n${a.answer}\n${a.mastery_criterion}`;
  ok(NONE_FOUND[lang].test(blob), `day-02/${lang} act-04: needs explicit none-found alternative`);
  ok(MISCONCEPT[lang].test(blob), `day-02/${lang} act-04: needs misconception-rejection path`);
}
// day-03-act-04 is a concrete spaced plan, not a generic rubric repeat.
const plan = act('day-03', 'en', 'day-03-act-04');
ok(/\| *concept/i.test(plan.answer) && /date/i.test(plan.answer) && /recover/i.test(plan.answer),
  'day-03-act-04 answer must contain a concrete scheduled plan table');
ok(/evidence gaps?/i.test(plan.answer), 'day-03-act-04 must list actionable evidence gaps');

// ---------- 6. Localization + common labels ----------
console.log('6. Checking localization and common labels...');
for (const day of ['day-02', 'day-03']) {
  for (const id of Object.keys(content[`${day}/en`].activities)) {
    for (const lang of ['ja', 'zh-Hans', 'zh-Hant']) {
      const a = act(day, lang, id);
      const enA = act(day, 'en', id);
      for (const field of ['objective', 'instructions', 'exercise_prompt', 'hint', 'answer',
        'mastery_criterion', 'assistance_policy_label', 'prerequisites']) {
        ok(a[field] !== enA[field], `${day}/${lang} ${id}.${field} is still copied English`);
      }
      const prose = `${a.objective}\n${a.instructions}\n${a.mastery_criterion}`;
      if (lang === 'ja') ok(KANA.test(prose), `${day}/ja ${id} prose must be Japanese`);
      else ok(HAN.test(prose), `${day}/${lang} ${id} prose must be Chinese`);
    }
  }
  const enNotice = content[`${day}/en`].common.dev_slice_notice;
  ok(/pending|not claimed/i.test(enNotice) && !/Complete local curriculum/i.test(enNotice),
    `${day} en notice must be acceptance-pending, not a completeness claim`);
  for (const lang of LANGS) {
    ok(!('nav_legacy_roadmap' in content[`${day}/${lang}`].common), `${day}/${lang} still carries retired nav_legacy_roadmap`);
  }
  ok(KANA.test(content[`${day}/ja`].common.dev_slice_notice), `${day} ja notice still English`);
  ok(HAN.test(content[`${day}/zh-Hans`].common.dev_slice_notice), `${day} zh-Hans notice still English`);
  ok(HAN.test(content[`${day}/zh-Hant`].common.dev_slice_notice), `${day} zh-Hant notice still English`);
  for (const lang of LANGS) {
    const n = content[`${day}/${lang}`].common.dev_slice_notice;
    ok(!/Complete local curriculum/i.test(n), `${day}/${lang} notice still claims complete curriculum`);
    // CJK notices may contain 完備/完备 only inside an explicit negation.
    if (lang !== 'en') ok(/不(?:声称|聲稱)|不完备|不完備|主張しません|完全性は/.test(n) || !/完備|完备/.test(n),
      `${day}/${lang} notice uses completeness wording without a negation`);
  }
}

// ---------- 6b. POST-09 dedupe + block-form assertions ----------
console.log('6b. Checking POST-09 dedupe and block safety form...');
// The appended safety/continuation paragraph must appear exactly once in
// the English instructions of the three repaired activities.
for (const [day, id, marker] of [
  ['day-02', 'day-02-act-03', 'fail-stop'],
  ['day-03', 'day-03-act-01', 'fail-stop'],
  ['day-03', 'day-03-act-03', 'fail-stop'],
]) {
  const instr = act(day, 'en', id).instructions;
  ok((instr.match(/fail-stop/g) || []).length === 1,
    `${day}/en ${id}: appended paragraph must appear exactly once (POST-09)`);
}
for (const lang of LANGS) {
  const a = act('day-03', lang, 'day-03-act-01');
  const blob = `${a.instructions}\n${a.exercise_prompt}\n${a.hint}\n${a.answer}`;
  ok(!blob.includes('case "$SBX_ROOT"'),
    `day-03/${lang} act-01 must not offer a lexical ownership pattern`);
  ok(/find_spec|non-executing|実行しない|不执行|不執行/.test(blob),
    `day-03/${lang} act-01 must describe the non-executing check`);
}
for (const [day, id] of [['day-02', 'day-02-act-03'], ['day-03', 'day-03-act-01'],
  ['day-03', 'day-03-act-03']]) {
  for (const lang of LANGS) {
    const blob = `${act(day, lang, id).instructions}\n${act(day, lang, id).exercise_prompt}`;
    ok(blob.includes('rm -r --'), `${day}/${lang} ${id} must reference the literal cleanup line`);
    // shell-scope honesty: the required shell is Bash; no POSIX/zsh/dash/
    // Windows execution claim may remain.
    ok(!/POSIX ?\(bash\/zsh\)|POSIX（bash\/zsh）/.test(blob),
      `${day}/${lang} ${id} must not claim a POSIX (bash/zsh) sequence`);
    ok(/Bash/.test(blob), `${day}/${lang} ${id} must name Bash as the required shell`);
    ok(blob.includes('```bash'), `${day}/${lang} ${id} shell blocks must be fenced bash`);
  }
}
// ja day-02-act-03 hint: the disposable-sandbox sentence must appear once.
{
  const hint = act('day-02', 'ja', 'day-02-act-03').hint;
  ok((hint.match(/サンドボックスは使い捨てです。/g) || []).length === 1,
    'ja hint must not repeat the disposable-sandbox sentence');
}

// ---------- 6c. Bash assessed-path prerequisite contract ----------
console.log('6c. Checking prerequisite shell scope...');
const PREREQUISITE_TARGETS = [
  ['day-02', 'day-02-act-03'],
  ['day-03', 'day-03-act-01'],
  ['day-03', 'day-03-act-03'],
];
const BASH_PREREQUISITE = {
  en: /Bash is required for the assessed path; the verified execution scope is Linux Bash/i,
  ja: /評価対象の経路には Bash が必要です。検証済みの実行範囲は Linux Bash です。/,
  'zh-Hans': /评估路径需要 Bash；已验证的执行范围是 Linux Bash。/,
  'zh-Hant': /評量路徑需要 Bash；已驗證的執行範圍是 Linux Bash。/,
};
const LEGACY_POSIX_PROMISE = {
  en: /A POSIX shell \(bash\/zsh\)/i,
  ja: /POSIX シェル（bash\/zsh）/,
  'zh-Hans': /需要 POSIX shell（bash\/zsh）/,
  'zh-Hant': /需要 POSIX shell（bash\/zsh）/,
};
const LEGACY_WINDOWS_GIT_BASH_PROMISE = {
  en: /on Windows use Git Bash for the same commands/i,
  ja: /Windows では Git Bash で同じコマンドを使います/,
  'zh-Hans': /Windows 上可用 Git Bash 执行相同命令/,
  'zh-Hant': /Windows 上可用 Git Bash 執行相同命令/,
};
const NON_SUPPORT_QUALIFIER = {
  en: /not supported|unsupported|not verified|not executed|not established|not equivalent|not required/i,
  ja: /未対応|対応していません|サポートされません|未検証|未実行|同等ではありません|不要/,
  'zh-Hans': /不支持|未支持|未验证|未执行|不等价|不需要/,
  'zh-Hant': /不支援|未支援|未驗證|未執行|不等價|不需要/,
};
const EXPLICITLY_UNSUPPORTED = {
  en: 'A POSIX shell (bash/zsh) is unsupported; "on Windows use Git Bash for the same commands" is not established.',
  ja: 'POSIX シェル（bash/zsh）は未対応です。「Windows では Git Bash で同じコマンドを使います」という等価性は未検証です。',
  'zh-Hans': '需要 POSIX shell（bash/zsh）的说法不支持；“Windows 上可用 Git Bash 执行相同命令”的等价性未验证。',
  'zh-Hant': '需要 POSIX shell（bash/zsh）的說法不支援；「Windows 上可用 Git Bash 執行相同命令」的等價性未驗證。',
};
function hasPositiveLegacyPromise(text, lang, legacyPattern) {
  // A limitation in a different sentence/clause must not hide a promise.
  return text.split(/[.!?。！？;；\n]+/u).some(clause =>
    legacyPattern.test(clause) && !NON_SUPPORT_QUALIFIER[lang].test(clause));
}
for (const [day, id] of PREREQUISITE_TARGETS) {
  for (const lang of LANGS) {
    const prereq = act(day, lang, id).prerequisites;
    ok(BASH_PREREQUISITE[lang].test(prereq),
      `${day}/${lang} ${id}: prerequisite must require the verified Bash assessed path`);
    ok(!hasPositiveLegacyPromise(prereq, lang, LEGACY_POSIX_PROMISE[lang]),
      `${day}/${lang} ${id}: prerequisite must not claim generic POSIX/bash-zsh support`);
    ok(!hasPositiveLegacyPromise(prereq, lang, LEGACY_WINDOWS_GIT_BASH_PROMISE[lang]),
      `${day}/${lang} ${id}: prerequisite must not promise Windows/Git Bash equivalence`);
  }
}
for (const lang of LANGS) {
  ok(!hasPositiveLegacyPromise(EXPLICITLY_UNSUPPORTED[lang], lang, LEGACY_POSIX_PROMISE[lang]),
    `${lang}: an explicit unsupported POSIX statement must remain allowed`);
  ok(!hasPositiveLegacyPromise(EXPLICITLY_UNSUPPORTED[lang], lang, LEGACY_WINDOWS_GIT_BASH_PROMISE[lang]),
    `${lang}: an explicit unverified Windows/Git Bash statement must remain allowed`);
  const prereq = act('day-03', lang, 'day-03-act-01').prerequisites;
  ok(/python3/.test(prereq), `day-03/${lang} act-01 must retain python3`);
  const noInstall = {
    en: /no installs and no machine-wide changes/i,
    ja: /インストールもマシン全体の変更も不要/,
    'zh-Hans': /不安装软件包、不做机器级更改/,
    'zh-Hant': /不安裝套件、不做機器級更改/,
  };
  ok(noInstall[lang].test(prereq), `day-03/${lang} act-01 must retain no-install/no-machine-wide-change requirements`);
}

// ---------- 7. Ledger identity ----------
console.log('7. Checking ledger identity...');
// Batch-4 prerequisite repairs advance the three changed activities to rev6;
// prior revisions are retained for all other activities.
const REV_EXPECT = {
  'day-02-act-01': '2026.10.30-rev3', 'day-02-act-02': '2026.10.30-rev2',
  'day-02-act-03': '2026.10.30-rev6', 'day-02-act-04': '2026.10.30-rev2',
  'day-03-act-01': '2026.10.30-rev6', 'day-03-act-02': '2026.10.30-rev3',
  'day-03-act-03': '2026.10.30-rev6', 'day-03-act-04': '2026.10.30-rev3',
};
for (const day of ['day-02', 'day-03']) {
  const led = ledgers[day];
  assert.equal(led.active_minutes, 480, `${day} must total 480 minutes`);
  assert.equal(led.activities.reduce((s, a) => s + a.active_minutes, 0), 480, `${day} activity minutes must sum to 480`);
  for (const a of led.activities) {
    assert.equal(a.content_revision, REV_EXPECT[a.id], `${a.id} revision must record this repair`);
    ok(!a.quiz, `${a.id} must not gain a quiz object in this batch`);
    const want = a.id.endsWith('act-02') ? 'agent_assisted' : 'independent';
    assert.equal(a.assistance_policy, want, `${a.id} policy changed`);
    passed += 3;
  }
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(content[`${day}/${lang}`].activities).sort(),
      led.activities.map(a => a.id).sort(), `${day}/${lang} activity ids must match ledger`);
  }
}
// day-03-act-02 keeps its authored independent check but the label must not
// promise live-agent completion.
for (const lang of LANGS) {
  const label = act('day-03', lang, 'day-03-act-02').assistance_policy_label;
  ok(AGENT_REQ[lang].blocked.test(label), `day-03/${lang} act-02 label must carry the blocked/unexecuted boundary`);
}

console.log(`Day 02-03 acceptance-repair checks passed (${passed} assertions).`);
