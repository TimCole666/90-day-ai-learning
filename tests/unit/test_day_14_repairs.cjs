// Focused regression tests for the Day 14 Git-workflow repair batch.
//
// Executes the authored ```sh blocks end-to-end in an invocation-owned private
// fixture (private HOME, GIT_CONFIG_NOSYSTEM, GIT_CONFIG_GLOBAL=/dev/null,
// LC_ALL=C, no inherited VIRTUAL_ENV, no owner git config/hooks/signing):
//   act-01: private base + clone of 3 copied files, branch, evidence, --help check
//   act-02: real two-branch conflict, resolution keeping both terms, 2-parent merge
//   act-03: same-file hunk survival, staged-vs-worktree, single-parent revert,
//           expected merge-revert failure (exit 128)
//   act-04: reviewer-authored bad --quiet patch — weak check passes, strong fails
// Also checks localization, independent/assisted boundaries, ledger identity,
// and the cli.py record-index-only label fix. No repo .git mutation, no network.
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
for (const lang of LANGS) {
  content[lang] = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'curriculum/content/day-14', `${lang}.json`)));
}
const ledger = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'curriculum/days/day-14.json')));
function act(lang, id) { return content[lang].activities[id]; }

const BLOCK = /```sh\s*\n([\s\S]*?)```/g;
function shBlocks(text) {
  return [...text.matchAll(BLOCK)].map(m => m[1]);
}
function fixtureEnv(tmp) {
  return {
    PATH: process.env.PATH, HOME: tmp, LC_ALL: 'C', TMPDIR: tmp,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    PYTHONDONTWRITEBYTECODE: '1', TERM: 'dumb',
  };
}
function runSh(tmp, script, env) {
  return execFileSync('bash', ['-c', `set -e; cd "$1"; ${script}`, 'bash', tmp],
    { encoding: 'utf8', env: env || fixtureEnv(tmp) });
}

// ---------- 1. Replay the authored sh blocks ----------
const enPrompt = id => act('en', id).exercise_prompt;
const blocks = [1, 2, 3, 4].map(i => shBlocks(enPrompt(`day-14-act-0${i}`))[0]);
ok(blocks.every(Boolean), 'all four activities must provide sh blocks');
for (const [i, b] of blocks.entries()) {
  ok(b.startsWith('(\nset -e\n') || b.startsWith('(\r\nset -e'),
     `act-0${i + 1} block must run in a fail-stop subshell`);
}
ok(blocks[0].includes('mktemp -d') && blocks[0].includes('GIT_CONFIG_NOSYSTEM'),
   'act-01 setup must be invocation-owned and config-isolated');
ok(blocks[0].includes('[ -w "$WORKDIR" ]') && blocks[0].includes('exit 1'),
   'act-01 must validate the fresh WORKDIR before any use');
ok(!/\$LEARN\/\.git|cp -r \$LEARN|cp "\$LEARN"\/\.git/.test(blocks[0]),
   'setup must not copy the repo .git');
for (const b of blocks) {
  ok(b.includes('PYTHON_BIN=$(command -v python3)') || b.includes('PYTHON_BIN="$(command -v python3)"'),
     'each block must pin the absolute Python interpreter');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd14rep-'));
let workdir = '';
// Run each authored block in its own bash invocation, threading WORKDIR via
// the printed `export WORKDIR=` line -- the same contract the learner follows.
function runBlocks(env, capturePath) {
  let outs = [];
  let wd = null;
  for (const blk of blocks) {
    const body = blk.replace('LEARN=/absolute/path/to/your/clone', `LEARN=${ROOT}`);
    const script = (wd ? `export WORKDIR=${wd}\n` : '') + body;
    const res = spawnSync('bash', ['-c', script],
      { cwd: tmp, env: env || fixtureEnv(tmp), encoding: 'utf8' });
    outs.push(res.stdout + '\n' + res.stderr);
    assert.equal(res.status, 0,
      `authored block must exit 0: ${res.stderr.slice(-400)}`);
    if (!wd) {
      const m = res.stdout.match(/export WORKDIR=(\S+)/);
      assert.ok(m, 'act-01 must print the export WORKDIR line');
      wd = m[1];
    }
  }
  fs.writeFileSync(capturePath, wd);
  return { out: outs.join('\n'), workdir: wd };
}
try {
  const { out, workdir: wd } = runBlocks(null, `${tmp}/workdir.path`);
  workdir = wd;
  // Owned-root invariant: the authored mktemp must have stayed beneath the
  // fixture root because TMPDIR is pinned there. Never delete a path merely
  // because captured text names it -- verify actual descent first.
  const resolved = path.resolve(workdir) + path.sep;
  ok(resolved.startsWith(path.resolve(tmp) + path.sep),
     `authored WORKDIR must be a descendant of the fixture root, got ${workdir}`);
  fs.writeFileSync(path.join(tmp, 'replay.out'), out);

  // act-01 evidence
  ok(out.includes(' M projects/text_tools/cli.py'),
     'act-01 status must show only the cli.py modification');
  ok(out.includes('UTF-8 by default'),
     'act-01 --help must contain the new help text');
  ok(out.includes('cli: document --input decoding defaults'),
     'act-01 log must show the focused commit');

  // act-02 merge + two parents + both requirements
  ok(out.includes('expected non-zero exit (content conflict)'),
     'act-02 merge must fail and be reported as an expected conflict');
  ok(out.includes('>>>>>>>'), 'act-02 conflict markers observed');
  const parentsLine = out.split('\n').find(l => /^[0-9a-f]{7,40} [0-9a-f]{7,40} [0-9a-f]{7,40}/.test(l));
  ok(parentsLine, 'act-02 rev-list --parents must show three ids (two-parent merge)');
  ok(out.includes('Unicode-aware') && out.includes('original-byte'),
     'act-02 resolution must satisfy both requirement terms');

  // act-03
  ok(out.includes('any integer'), 'act-03 same-file KEEP hunk must survive');
  ok(out.includes('default=7'), 'act-03 staged mistake visible in --cached diff');
  ok(out.includes('reference baseline'),
     'act-03 canonical baseline commit must run');
  ok(out.includes('no -m option') && out.includes('expected non-zero exit (merge needs -m)'),
     'act-03 merge revert must fail with the mainline message');
  ok(out.includes('Revert "BAD: change default seed to 7"'),
     'act-03 revert must create a new commit');

  // act-04
  ok(out.includes('--quiet'), 'act-04 weak --help check observes the flag');
  ok(out.includes('Data artifacts generated successfully'),
     'act-04 --quiet run must still print the summary (blocking finding)');

  // post-state: clone holds only the three copied sources + git dir
  const tree = runSh(tmp, `find "${workdir}/clone/projects" -name "*.py" | sort`);
  ok(tree.trim().split('\n').length === 3,
     'clone must contain exactly the three copied files');
  const hashes = runSh(tmp,
    `cd "${workdir}/clone" && sha256sum projects/text_tools/core.py projects/text_tools/__init__.py && sha256sum "${workdir}/base/projects/text_tools/core.py" "${workdir}/base/projects/text_tools/__init__.py"`);
  const h = hashes.split('\n').filter(Boolean).map(l => l.split(' ')[0]);
  ok(h[0] === h[2] && h[1] === h[3],
     'untouched files stay byte-identical between clone and base');
  const log = runSh(tmp, `cd "${workdir}/clone" && git log --oneline | head -10`);
  ok(log.includes('add --quiet flag'), 'act-04 commit present in history');
  ok(log.includes('document that --seed accepts any integer'),
     'KEEP must be preserved by its own commit, not merely rescued uncommitted');
  const counts = runSh(tmp, `cd "${workdir}/clone" && git rev-list --count HEAD`);
  ok(parseInt(counts.trim(), 10) >= 8, 'history grew via new commits, never rewritten');
  // After-cleanup checkpoint: the staged-mistake teardown left a clean tree
  // and the KEEP text still present in the committed file itself.
  const porcelain = runSh(tmp, `cd "${workdir}/clone" && git status --porcelain`);
  ok(porcelain.trim() === '', 'post-cleanup tree must be clean');
  const keepGrep = runSh(tmp,
    `cd "${workdir}/clone" && grep -F "any integer" projects/text_tools/cli.py`);
  ok(keepGrep.includes('any integer'),
     'KEEP text must remain in cli.py after the staged cleanup');

  // ---------- Ambient-Git sentinel: the authored setup must not be steerable
  // by inherited GIT_DIR/GIT_WORK_TREE/config/template/hook/signing vars.
  const st = path.join(tmp, 'sentinel');
  const senv = fixtureEnv(tmp);
  fs.mkdirSync(st, { recursive: true });
  execFileSync('git', ['init', st], { env: senv });
  execFileSync('git', ['-C', st, 'config', 'user.name', 'Sentinel Keeper'], { env: senv });
  execFileSync('git', ['-C', st, 'config', 'user.email', 's@example.invalid'], { env: senv });
  fs.writeFileSync(path.join(st, 'keep.txt'), 'keep\n');
  execFileSync('git', ['-C', st, 'add', '.'], { env: senv });
  execFileSync('git', ['-C', st, 'commit', '-m', 'sentinel'], { env: senv });
  const head0 = execFileSync('git', ['-C', st, 'rev-parse', 'HEAD'],
    { env: senv, encoding: 'utf8' }).trim();
  // ambient traps: unrelated GIT_DIR/GIT_WORK_TREE, trap global config with a
  // foreign user.name and a malicious template post-checkout hook
  const eviltpl = path.join(tmp, 'eviltpl', 'hooks');
  fs.mkdirSync(eviltpl, { recursive: true });
  const hook = path.join(eviltpl, 'post-checkout');
  fs.writeFileSync(hook, `#!/bin/sh\ntouch "${tmp}/pwned"\n`);
  fs.chmodSync(hook, 0o755);
  const trapCfg = path.join(tmp, 'ambient-gitconfig');
  fs.writeFileSync(trapCfg,
    `[user]\n\tname = Trap User\n[init]\n\ttemplateDir = ${tmp}/eviltpl\n`);
  const tainted = {
    ...fixtureEnv(tmp),
    GIT_DIR: path.join(st, '.git'), GIT_WORK_TREE: st,
    GIT_CONFIG_GLOBAL: trapCfg, GIT_INDEX_FILE: path.join(tmp, 'fake-index'),
    GIT_OBJECT_DIRECTORY: path.join(tmp, 'fake-obj'),
  };
  const { workdir: workdir2 } = runBlocks(tainted, `${tmp}/workdir2.path`);
  const head1 = execFileSync('git', ['-C', st, 'rev-parse', 'HEAD'],
    { env: senv, encoding: 'utf8' }).trim();
  const sname = execFileSync('git', ['-C', st, 'config', 'user.name'],
    { env: senv, encoding: 'utf8' }).trim();
  ok(head0 === head1, 'ambient GIT_DIR must not redirect commits into the sentinel repo');
  ok(sname === 'Sentinel Keeper',
     'ambient GIT_DIR must not let the setup reconfigure the sentinel repo');
  ok(!fs.existsSync(path.join(tmp, 'pwned')),
     'ambient template/hook config must not execute sentinel hooks');
  const authors = execFileSync('git', ['-C', path.join(workdir2, 'clone'),
    'log', '--format=%an'], { env: senv, encoding: 'utf8' });
  ok(authors.includes('Learner') && !authors.includes('Trap User'),
     'trap global user.name must not leak into fixture commits');
  ok(fs.readFileSync(trapCfg, 'utf8').includes('Trap User'),
     'ambient global config file must be untouched');

  // ---------- D14-POST-05 negative regression: run the RAW authored setup
  // (no test-added set -e; the block carries its own fail-stop) under
  // umask0777 with cwd inside a private surrogate repo. The mode-000 mktemp
  // must abort BEFORE any mkdir/cp/cd/Git so the caller's repository is
  // never reinitialized or reconfigured.
  const sur = path.join(tmp, 'surrogate');
  fs.mkdirSync(sur);
  execFileSync('git', ['init', sur], { env: senv });
  execFileSync('git', ['-C', sur, 'config', 'user.name', 'Surrogate Private Owner'], { env: senv });
  execFileSync('git', ['-C', sur, 'config', 'user.email', 's@example.invalid'], { env: senv });
  fs.writeFileSync(path.join(sur, 'f.txt'), 'x\n');
  execFileSync('git', ['-C', sur, 'add', '.'], { env: senv });
  execFileSync('git', ['-C', sur, 'commit', '-m', 'init'], { env: senv });
  const surHead0 = execFileSync('git', ['-C', sur, 'rev-parse', 'HEAD'],
    { env: senv, encoding: 'utf8' }).trim();
  const surCfg0 = fs.readFileSync(path.join(sur, '.git', 'config'), 'utf8');
  const negTmp = path.join(tmp, 'neg-tmp');
  fs.mkdirSync(negTmp);
  const raw = 'umask 0777\n' +
    blocks[0].replace('LEARN=/absolute/path/to/your/clone', `LEARN=${ROOT}`);
  const neg = spawnSync('bash', ['-c', raw],
    { cwd: sur, env: { ...fixtureEnv(tmp), TMPDIR: negTmp }, encoding: 'utf8' });
  ok(neg.status !== 0,
     `raw setup under umask0777 must abort non-zero, got ${neg.status}`);
  ok(neg.stderr.includes('abort:') || neg.stderr.includes('WORKDIR'),
     'abort must come from the authored WORKDIR validation, not a late failure');
  const surCfg1 = fs.readFileSync(path.join(sur, '.git', 'config'), 'utf8');
  const surHead1 = execFileSync('git', ['-C', sur, 'rev-parse', 'HEAD'],
    { env: senv, encoding: 'utf8' }).trim();
  ok(surCfg0 === surCfg1,
     'surrogate config must be byte-identical (no Learner user.name leak)');
  ok(surHead0 === surHead1,
     'surrogate HEAD must be identical (no reinit/commit in caller repo)');
  ok(!/Learner/.test(surCfg1), 'surrogate must not gain the Learner identity');
} finally {
  // Restore permissions ONLY inside the invocation-owned fixture root:
  // the umask0777 case may leave a mode-000 mktemp dir that rmSync cannot
  // traverse. Then remove the outer root -- never a captured path alone.
  try {
    for (const top of fs.readdirSync(tmp, { withFileTypes: true })) {
      const tp = path.join(tmp, top.name);
      if (top.isDirectory()) {
        fs.chmodSync(tp, 0o700);
        for (const e of fs.readdirSync(tp, { withFileTypes: true })) {
          if (e.isDirectory()) fs.chmodSync(path.join(tp, e.name), 0o700);
        }
      }
    }
  } catch { /* best-effort permission restore inside owned root */ }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- 2. cli.py record-index-only label ----------
const cliSrc = fs.readFileSync(path.join(ROOT, 'projects/text_tools/cli.py'), 'utf8');
ok(cliSrc.includes('No index overlap:'),
   'cli.py human label must scope the guarantee to record indices');
ok(!cliSrc.includes('No leakage:'),
   'unscoped "No leakage" label must be gone');
ok(cliSrc.includes("no_leakage_verified"),
   'JSON/API key no_leakage_verified stays for compatibility');

// ---------- 3. Independent / assisted boundaries ----------
for (const lang of LANGS) {
  const a2 = act(lang, 'day-14-act-02');
  const a4 = act(lang, 'day-14-act-04');
  const blob2 = a2.assistance_policy_label + a2.instructions + a2.mastery_criterion;
  const need2 = {
    en: ['Independent', 'unaided', 'variant'],
    ja: ['独立', '無支援', 'バリアント'],
    'zh-Hans': ['独立', '无协助', '变体'],
    'zh-Hant': ['獨立', '無協助', '變體'],
  }[lang];
  for (const w of need2) ok(blob2.toLowerCase().includes(w.toLowerCase()),
    `${lang} act-02 missing '${w}'`);
  const blob4 = a4.assistance_policy_label + a4.instructions + a4.mastery_criterion;
  const need4 = {
    en: ['seal', 'unaided'],
    ja: ['確定', '無支援'],
    'zh-Hans': ['封存', '无协助'],
    'zh-Hant': ['封存', '無協助'],
  }[lang];
  for (const w of need4) ok(blob4.toLowerCase().includes(w.toLowerCase()),
    `${lang} act-04 missing '${w}'`);
  for (const id of ['day-14-act-01', 'day-14-act-03']) {
    const a = act(lang, id);
    ok(/blocked\/unexecuted/.test(a.assistance_policy_label + a.instructions),
       `${lang} ${id} must declare the blocked/unexecuted boundary`);
  }
  // no fabricated agent output: illustrative material must be labelled
  const a4b = act(lang, 'day-14-act-04').instructions + act(lang, 'day-14-act-04').exercise_prompt;
  ok(/reviewer-authored|レビューア作成|评审者编写|評審者編寫/.test(a4b),
     `${lang} act-04 must label the bad patch as reviewer-authored`);

  // D14-POST-03: the sealed evidence-bearing report must come AFTER the
  // learner's own unaided checks, not before them.
  const ins4 = act(lang, 'day-14-act-04').instructions;
  const order = {
    en: ['record your prediction', 'run the weak and strong checks yourself', 'seal (submit'],
    ja: ['予測/初期仮説を無支援で記録', 'チェックを\n自分で実行', '確定（提出・日付記録）'],
    'zh-Hans': ['记录你的预测', '运行弱检查和强检查', '封存（提交、注明日期）'],
    'zh-Hant': ['記錄你的預測', '執行弱檢查和強檢查', '封存（提交、註明日期）'],
  }[lang].map(s => s.replace(/\n/g, ''));
  let pos = -1;
  for (const marker of order) {
    const idx = ins4.replace(/\s+/g, '').indexOf(marker.replace(/\s+/g, ''));
    ok(idx > pos, `${lang} act-04 chronology broken at '${marker}'`);
    pos = idx;
  }
}

// D14-POST-04: BAD-then-GOOD order in the localized act-03 scenarios
const badGood = {
  ja: '悪い単一親コミットの後に続く独立した良いコミット',
  'zh-Hans': '跟在单父坏提交之后的独立良好提交',
  'zh-Hant': '跟在單親壞提交之後的獨立良好提交',
};
for (const lang of ['ja', 'zh-Hans', 'zh-Hant']) {
  ok(act(lang, 'day-14-act-03').exercise_prompt.includes(badGood[lang]),
     `${lang} act-03 must state BAD commit followed by GOOD, not reversed`);
}
ok(!act('zh-Hant', 'day-14-act-03').answer.includes('獨立複製的反例') &&
   !act('zh-Hant', 'day-14-act-03').exercise_prompt.includes('獨立複製的反例'),
   'zh-Hant must use 獨立重現反例, not the hardware-sounding 獨立複製的反例');

// ---------- 4. Localization ----------
const CJK = /[\u4e00-\u9fff\u3040-\u30ff]/;
for (const lang of ['ja', 'zh-Hans', 'zh-Hant']) {
  for (const id of ['day-14-act-01', 'day-14-act-02', 'day-14-act-03', 'day-14-act-04']) {
    const a = act(lang, id);
    for (const f of ['instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion']) {
      ok(CJK.test(a[f]), `${lang} ${id}.${f} must be genuinely localized`);
    }
  }
}
for (const lang of ['ja', 'zh-Hans', 'zh-Hant']) {
  ok(CJK.test(content[lang].time_budget_label) && CJK.test(content[lang].category_label),
     `${lang} common labels localized`);
}
ok(!act('ja', 'day-14-act-01').exercise_prompt.includes('untouched'),
   'ja act-01 must not contain English "untouched"');
ok(!JSON.stringify(content['zh-Hant']).includes('固定裝置'),
   'zh-Hant must not use hardware-sounding 固定裝置');

// ---------- 5. Ledger identity ----------
assert.equal(ledger.activities.length, 4);
const wantPol = ['agent_assisted', 'independent', 'agent_assisted', 'independent'];
ledger.activities.forEach((a, i) => {
  assert.equal(a.id, `day-14-act-0${i + 1}`);
  assert.equal(a.assistance_policy, wantPol[i]);
  assert.equal(a.active_minutes, 120);
  assert.equal(a.content_revision, '2026.10.30-rev4');
});
passed += ledger.activities.length * 4 + 1;
ok(!JSON.stringify(ledger).includes('"quiz"'), 'day-14 ledger must not add quiz objects');

console.log(`Day 14 acceptance-repair checks passed (${passed} assertions).`);
