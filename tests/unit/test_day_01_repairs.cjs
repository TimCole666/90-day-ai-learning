// Day 01 acceptance-repair regression (bounded batch, pass 2).
// Verifies, for all four Language Editions of curriculum/content/day-01/:
//   1. day-01-act-03 is a coherent INDEPENDENT Git-basics lesson: a complete
//      worked command sequence in a newly created disposable repo, repo-local
//      identity config, staging/diff/status checks, commit/log verification,
//      no pre-existing state, destructive commands only inside prohibition
//      wording, agent orientation only as optional/unassessed.
//   2. day-01-act-02 carries a runnable bounded offline venv sequence with
//      expected invariants: version gate, recorded before-state in a fresh
//      non-venv shell, named-shell activation, sys.executable vs prefix values
//      (symlink caveat), sys.prefix != sys.base_prefix, python -m pip pairing,
//      marker-file read proving non-filesystem-sandboxing, deactivation back
//      to the recorded before-state, POSIX-only assessment with correct but
//      unexecuted Windows diagnostics, and an honest no-Python fallback.
//   3. day-01-act-04 assesses a content rubric with distinguishable
//      unaided-recall vs reference-check phases: own-words recall, an actual
//      misconception with evidence OR an explicit none-found record plus a
//      plausible misconception rejected with evidence, a fresh unaided
//      transfer check with a recorded result, and a scheduled recovery step.
//      No invented-error requirement, no "single most effective" claim, no
//      word/character quotas; the worked log uses only evidence the worked
//      commands actually produce (marker.txt, prefix probes).
//   4. The worked ```sh blocks are identical across editions and actually run
//      in disposable fixtures under a controlled environment (private HOME,
//      GIT_CONFIG_NOSYSTEM, LC_ALL=C, no inherited VIRTUAL_ENV) with ordered,
//      parsed output verification — machine-readable git checks and parsed
//      prefix comparisons, not locale-dependent prose or /usr path guesses.
//   5. Learner-facing prose is written in each edition's language;
//      the retired nav_legacy_roadmap label is gone; dev_slice_notice is honest
//      availability/acceptance-pending wording, not a completeness claim;
//      act-01 keeps an Independent boundary (post-evidence assistance =
//      remediation only); act-01 quiz/answer use portable object-reference
//      wording in all editions (no heap/address/pointer claims).
//   6. The day-01 ledger keeps independent assistance_policy, activity ids and
//      quiz keys, while content_revision records this repair (rev3; act-01
//      bumped to rev4 for the portable-identity wording fix).
// Offline: no network, no providers, no access to owner git config or real
// learner files — fixtures run under a private temporary HOME.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const LANGS = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), 'utf8'));
const content = {};
for (const lang of LANGS) content[lang] = readJson('curriculum', 'content', 'day-01', `${lang}.json`);
const ledger = readJson('curriculum', 'days', 'day-01.json');

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };
const stripCode = s => s.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
const prose = act => ['objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'].map(f => act[f]).join('\n');
const PROSE_FIELDS = ['objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
// Controlled subprocess environment: no inherited venv, no owner git config,
// no system git config, C locale for deterministic output.
const fixtureEnv = home => ({
  PATH: process.env.PATH,
  HOME: home,
  GIT_CONFIG_NOSYSTEM: '1',
  LC_ALL: 'C',
});

// ---------- 1. act-03: independent Git-basics lesson ----------
console.log('1. Checking day-01-act-03 independent Git lesson coherence...');
const GIT_TOKENS = ['git init', 'git add', 'git commit', 'git log', 'git status', 'git diff'];
const AGENT_OPT = {
  en: /optional|unassessed/i, ja: /任意|評価外/, 'zh-Hans': /可选|不计入/, 'zh-Hant': /可選|不計入/,
};
const DISPOSABLE = {
  en: /disposable|newly created|new empty/i, ja: /使い捨て|新規/, 'zh-Hans': /一次性|新建/, 'zh-Hant': /一次性|新建/,
};
for (const lang of LANGS) {
  const act = content[lang].activities['day-01-act-03'];
  const blob = prose(act);
  for (const t of GIT_TOKENS) ok(blob.includes(t), `${lang}/act-03 missing command ${t}`);
  ok(/git config user\.name/.test(blob) && /git config user\.email/.test(blob), `${lang}/act-03 missing repo-local identity config`);
  // `--global` may appear only inside negated wording ("without --global").
  for (const m of blob.matchAll(/[^\n]{0,80}--global[^\n]{0,80}/g)) {
    const ctx = m[0];
    const NEGATED = {
      en: /without|no |not |never|untouched|leave/i, ja: /付けない|しない|なし|変更されない|変わりません/,
      'zh-Hans': /不|未|勿/, 'zh-Hant': /不|未|勿/,
    };
    ok(NEGATED[lang].test(ctx), `${lang}/act-03 --global used outside negated context: ${ctx.trim()}`);
  }
  ok(blob.includes('.git/config'), `${lang}/act-03 must state identity is stored in the repo's .git/config`);
  ok(/git diff --cached/.test(blob), `${lang}/act-03 missing staged-diff check`);
  ok(DISPOSABLE[lang].test(blob), `${lang}/act-03 must require a disposable/new directory`);
  // The assessed task must not require an agent; agent orientation is optional only.
  ok(!/ask the agent|ask an agent|エージェントに依頼|エージェントに頼/i.test(blob), `${lang}/act-03 still delegates the assessed task to an agent`);
  if (/Agent Tool Track|エージェント|Agent/i.test(act.instructions)) {
    ok(AGENT_OPT[lang].test(act.instructions), `${lang}/act-03 agent orientation not marked optional/unassessed`);
  }
  ok(!/agent|assist|エージェント|支援/i.test(act.exercise_prompt) || AGENT_OPT[lang].test(act.exercise_prompt),
    `${lang}/act-03 exercise_prompt must not demand agent use`);
  // Destructive commands only inside prohibition context.
  for (const m of blob.matchAll(/[^\n]{0,90}(reset --hard|git clean|push --force)[^\n]{0,90}/g)) {
    const line = m[0];
    const PROHIBIT = {
      en: /do not|never|forbidden|prohibit|not |avoid/i, ja: /使用しません|禁止|しない|使わない/,
      'zh-Hans': /不|禁止|不得|勿/, 'zh-Hant': /不|禁止|不得|勿/,
    };
    ok(PROHIBIT[lang].test(line), `${lang}/act-03 destructive command without prohibition: ${line.trim()}`);
  }
  // No-surprise alternative: an expected transition + cited output + why it
  // confirms the prediction — the prompt must not require inventing surprise.
  const NO_SURPRISE = {
    en: /if nothing surprised|expected status transition|confirms your prediction/i,
    ja: /予期しない点がなかった|予期どおりの状態遷移|予測を裏付ける/,
    'zh-Hans': /没有任何意外|符合预期|印证了你的预测/,
    'zh-Hant': /沒有任何意外|符合預期|印證了你的預測/,
  };
  ok(NO_SURPRISE[lang].test(act.exercise_prompt),
    `${lang}/act-03 must offer an expected-transition alternative (no invented surprise)`);
  ok(!/write down one thing `git status` reported that you did not expect/i.test(act.exercise_prompt),
    `${lang}/act-03 still requires an unexpected observation unconditionally`);
  // Commit model: tree + zero-or-more parent IDs + metadata (root has none).
  const COMMIT_MODEL = {
    en: /zero or more parent|root commit has no parent/i,
    ja: /0個以上の親|ルートコミットには親がない/,
    'zh-Hans': /零个或多个父|根提交没有父/,
    'zh-Hant': /零個或多個父|根提交沒有父/,
  };
  ok(COMMIT_MODEL[lang].test(act.answer), `${lang}/act-03 answer must describe commits as tree + zero-or-more parents + metadata`);
}
// The worked git sequence must be identical in all four editions.
function shBlocks(s) {
  const out = [];
  const re = /```sh\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[1].trim());
  return out;
}
const gitBlocks = LANGS.map(l => shBlocks(content[l].activities['day-01-act-03'].instructions));
ok(gitBlocks.every(b => b.length === 1), 'each edition must carry exactly one ```sh git sequence in act-03 instructions');
ok(gitBlocks.every(b => b[0] === gitBlocks[0][0]), 'act-03 git command sequence must be identical across editions');
// Execute the sequence in a disposable fixture under a controlled environment
// (private HOME, no system/global git config or hooks, C locale), then verify
// invariants with machine-readable commands.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'day01-git-'));
  try {
    const env = fixtureEnv(tmp);
    const out = execFileSync('bash', ['-c', `set -e; cd "$1"; ${gitBlocks[0][0]}`, 'bash', tmp],
      { encoding: 'utf8', env });
    ok(/Untracked files/.test(out), 'act-03 sequence: git status never reported untracked files (LC_ALL=C)');
    ok(/\+first line/.test(out), 'act-03 sequence: staged diff did not show +first line');
    ok(/\+second line/.test(out), 'act-03 sequence: unstaged diff did not show +second line');
    const repo = path.join(tmp, 'git-sandbox');
    const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repo, encoding: 'utf8', env });
    assert.equal(count.trim(), '2', 'act-03 sequence must produce exactly two commits');
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8', env });
    assert.equal(status.trim(), '', 'act-03 sequence must end with a clean working tree');
    const name = execFileSync('git', ['config', '--local', 'user.name'], { cwd: repo, encoding: 'utf8', env });
    assert.equal(name.trim(), 'Learner', 'act-03 identity must be configured repo-locally');
    const email = execFileSync('git', ['config', '--local', 'user.email'], { cwd: repo, encoding: 'utf8', env });
    assert.equal(email.trim(), 'learner@example.invalid', 'act-03 email must be configured repo-locally');
    ok(gitBlocks[0][0].includes('mkdir git-sandbox') && gitBlocks[0][0].startsWith('mkdir'),
      'act-03 sequence must start by creating its own directory (no pre-existing state)');
    ok(!/reset --hard|git clean|push --force|rm -rf|--global/.test(gitBlocks[0][0]),
      'act-03 sequence must not run destructive or global-scope commands');
    passed += 7;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- 2. act-02: runnable offline venv lesson ----------
console.log('2. Checking day-01-act-02 venv lesson completeness...');
const VENV_TOKENS = [
  'python3 --version', 'python3 -m venv .venv', 'activate', 'sys.executable',
  'sys.prefix', 'sys.base_prefix', 'sys.prefix == sys.base_prefix',
  'python -m pip', 'deactivate', 'VIRTUAL_ENV', 'marker.txt',
];
const SANDBOX_DISTINCTION = {
  en: /not a (filesystem|security)|not.*sandbox/i, ja: /サンドボックスでは(ない|ありません|なく)/,
  'zh-Hans': /不是.*沙箱|非.*沙箱/, 'zh-Hant': /不是.*沙箱|非.*沙箱/,
};
const FALLBACK = {
  en: /unexecuted|not.*mastery|recovery task/i, ja: /未実行|習得の証拠にならない|復習タスク/,
  'zh-Hans': /未执行|不构成掌握|补救任务/, 'zh-Hant': /未執行|不構成掌握|補救任務/,
};
const FRESH_SHELL = {
  en: /fresh (shell|terminal)|no (other )?(virtual )?environment (is )?active|before-state/i,
  ja: /新しいターミナル|新規シェル|有効化されていない|開始前/,
  'zh-Hans': /新终端|未激活|开始前/, 'zh-Hant': /新終端機|未啟動|開始前/,
};
const SYMLINK_NOTE = {
  en: /symlink|invoked path/i, ja: /シンボリックリンク|呼び出しパス/,
  'zh-Hans': /符号链接|调用路径/, 'zh-Hant': /符號連結|調用路徑/,
};
for (const lang of LANGS) {
  const act = content[lang].activities['day-01-act-02'];
  const blob = prose(act);
  for (const t of VENV_TOKENS) ok(blob.includes(t), `${lang}/act-02 missing token ${t}`);
  ok(FRESH_SHELL[lang].test(blob), `${lang}/act-02 must scope to a fresh non-venv shell with a recorded before-state`);
  ok(SYMLINK_NOTE[lang].test(blob), `${lang}/act-02 must note sys.executable may be a symlink (use prefix values)`);
  // POSIX-assessed sequence with correct, honestly-unexecuted Windows diagnostics.
  ok(/POSIX|bash|zsh/i.test(blob), `${lang}/act-02 must name the assessed shell scope (POSIX/bash/zsh)`);
  ok(/Activate\.ps1|activate\.bat/.test(blob), `${lang}/act-02 missing Windows activation alternatives`);
  ok(/\$env:VIRTUAL_ENV|%VIRTUAL_ENV%/.test(blob),
    `${lang}/act-02 must give Windows env-var diagnostics ($env:VIRTUAL_ENV / %VIRTUAL_ENV%), not only POSIX echo`);
  ok(/where\.exe|where python|%PATH%|\$env:PATH/.test(blob), `${lang}/act-02 Windows diagnostic must not rely on command -v/echo $PATH`);
  ok(SANDBOX_DISTINCTION[lang].test(blob), `${lang}/act-02 must distinguish interpreter isolation from filesystem/security sandboxing`);
  ok(FALLBACK[lang].test(blob), `${lang}/act-02 missing honest no-Python fallback (unexecuted != mastery)`);
  ok(!/pip install|pip3 install|install -r/.test(blob), `${lang}/act-02 must not require package installation`);
  ok(/command -v python3|where\.exe python|echo \$PATH/.test(blob), `${lang}/act-02 fallback must be concrete (command -v / PATH evidence)`);
  // The marker read is the only filesystem demonstration: it targets a file the
  // learner created inside the disposable sandbox, never real learner files.
  ok(/marker\.txt/.test(blob), `${lang}/act-02 missing the disposable marker-file demonstration`);
  // Deactivation is verified against the recorded before-state, not promised as
  // a generic "restore the base interpreter".
  const BEFORE_STATE = {
    en: /before-state|recorded before|recorded values/i, ja: /開始前|記録した|開始前の状態/,
    'zh-Hans': /之前状态|开始前|记录的/, 'zh-Hant': /之前狀態|開始前|記錄的/,
  };
  ok(BEFORE_STATE[lang].test(blob), `${lang}/act-02 must verify post-deactivate state against the recorded before-state`);
}
const venvBlocks = LANGS.map(l => shBlocks(content[l].activities['day-01-act-02'].instructions));
ok(venvBlocks.every(b => b.length === 1), 'each edition must carry exactly one ```sh venv sequence in act-02 instructions');
ok(venvBlocks.every(b => b[0] === venvBlocks[0][0]), 'act-02 venv command sequence must be identical across editions');
ok(venvBlocks[0][0].includes("print(open('marker.txt')"), 'marker.txt must be read by the venv interpreter itself (python -c), not cat');
ok(!venvBlocks[0][0].includes('cat marker.txt'), 'marker demonstration must not use cat — it must evidence the venv Python process');
{
  // Execute the lesson's own sequence in a private fixture: fresh HOME, no
  // inherited VIRTUAL_ENV, C locale. Parse ordered output values and compare
  // sys.prefix/sys.base_prefix — never /usr paths or .venv-absence heuristics.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'day01-venv-'));
  try {
    const env = fixtureEnv(tmp);
    ok(!env.VIRTUAL_ENV && !env.CONDA_PREFIX, 'fixture must not inherit an active environment');
    const out = execFileSync('bash', ['-c', `cd "$1"; ${venvBlocks[0][0]}`, 'bash', tmp],
      { encoding: 'utf8', env, timeout: 120000 });
    const lines = out.trim().split('\n').map(l => l.trim());
    ok(/^Python 3\./.test(lines[0]), `act-02 sequence must start with a version report, got: ${lines[0]}`);
    // Ordered layout: version | before-probe ×4 | VIRTUAL_ENV | inside-probe ×4
    // | marker | pip | after-probe ×4
    const venvDir = path.join(tmp, 'venv-sandbox', '.venv');
    const envLine = lines.find(l => l.endsWith('/.venv') || l === venvDir);
    ok(envLine, 'act-02 $VIRTUAL_ENV line must name the created .venv directory');
    const envIdx = lines.indexOf(envLine);
    // The four lines before the VIRTUAL_ENV echo output are the before-probe
    // (exe, prefix, base_prefix, equality). The four after it are the inside probe.
    const before = lines.slice(envIdx - 4, envIdx);
    const inside = lines.slice(envIdx + 1, envIdx + 5);
    assert.equal(before.length, 4, 'before-state probe must print 4 values');
    assert.equal(inside.length, 4, 'inside-venv probe must print 4 values');
    assert.equal(before[3], 'True', `fresh-shell before-state must report sys.prefix == sys.base_prefix, got: ${before}`);
    assert.equal(before[1], before[2], 'before-state prefix must equal base_prefix');
    assert.equal(inside[3], 'False', 'inside-venv probe must report sys.prefix != sys.base_prefix');
    assert.equal(inside[1], venvDir, 'inside-venv sys.prefix must equal the .venv path');
    assert.notEqual(inside[2], inside[1], 'inside-venv base_prefix must differ from prefix');
    ok(inside[0].includes('.venv'), 'inside-venv sys.executable must resolve under .venv');
    const markerIdx = lines.indexOf('marker');
    ok(markerIdx > envIdx, 'marker.txt must be read (observed output) inside the activated venv');
    const pipIdx = lines.findIndex(l => /pip \d+\.\d+/.test(l));
    ok(pipIdx > markerIdx && lines[pipIdx].includes('.venv'), 'python -m pip must report pip from .venv after the marker read');
    const after = lines.slice(-4);
    assert.equal(after[3], 'True', 'post-deactivate probe must report sys.prefix == sys.base_prefix');
    assert.equal(after[1], before[1], 'post-deactivate sys.prefix must match the recorded before-state');
    assert.equal(after[0], before[0], 'post-deactivate sys.executable must match the recorded before-state');
    passed += 15;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- 3. act-04: rubric-based retrieval log ----------
console.log('3. Checking day-01-act-04 retrieval rubric and worked example...');
const RUBRIC = { en: /rubric/i, ja: /ルーブリック/, 'zh-Hans': /量规/, 'zh-Hant': /量規/ };
const MISCONCEPTION = { en: /misconception/i, ja: /誤解/, 'zh-Hans': /误解/, 'zh-Hant': /誤解/ };
const EVIDENCE = { en: /evidence/i, ja: /根拠|証拠/, 'zh-Hans': /证据/, 'zh-Hant': /證據/ };
const RECOVERY = { en: /recovery step|schedul/i, ja: /復習ステップ|予定/, 'zh-Hans': /补救步骤|安排/, 'zh-Hant': /補救步驟|安排/ };
const CLOSED_BOOK = { en: /closed.?book|unaided|without looking|references closed/i, ja: /閉巻|支援なし|閉じた/, 'zh-Hans': /闭卷|不查|合上/, 'zh-Hant': /閉卷|不查|合上/ };
const OWN_WORDS = { en: /own words/i, ja: /自分の言葉/, 'zh-Hans': /自己的话/, 'zh-Hant': /自己的話/ };
const NONE_FOUND = {
  en: /none was found|no misconception|none found/i, ja: /見つからなかった|誤解なし|なかった場合/,
  'zh-Hans': /未发现|没有发现|未發現/, 'zh-Hant': /未發現|沒有發現/,
};
const FRESH_CHECK = {
  en: /fresh unaided|unaided (transfer|check|retrieval)/i, ja: /無支援.*(チェック|転用|自測)|新たな無支援/,
  'zh-Hans': /独立(迁移|检查|自测)|新的独立/, 'zh-Hant': /獨立(遷移|檢查|自測)|新的獨立/,
};
const PHASES = {
  en: [/unaided recall|references closed/i, /reference check/i],
  ja: [/無支援の想起|閉じた/, /参照確認/],
  'zh-Hans': [/独立回忆|不查任何资料|合上/, /对照检查/],
  'zh-Hant': [/獨立回憶|不查任何資料|合上/, /對照檢查/],
};
const REJECT_PERFECT = {
  en: /everything correct|unassessed|establishes nothing/i, ja: /全部正しかった|立証しない|未評価/,
  'zh-Hans': /全部正确|不能证明|未评估/, 'zh-Hant': /全部正確|不能證明|未評量/,
};
const UNIVERSAL = /single most effective|most effective (way|method)|最も有効(な)?(方法|手段|手法)?|最有效|唯一最適|唯一の方法|万能/;
const UNIVERSAL_NEG = {
  en: /not |no |isn't|rather than|instead of/i, ja: /ではありません|ではない|なく|ない|ありません/,
  'zh-Hans': /并非|不|非/, 'zh-Hant': /並非|不|非/,
};
for (const lang of LANGS) {
  const act = content[lang].activities['day-01-act-04'];
  const blob = prose(act);
  ok(CLOSED_BOOK[lang].test(blob), `${lang}/act-04 must require closed-book/unaided recall`);
  for (const phase of PHASES[lang]) ok(phase.test(blob), `${lang}/act-04 must distinguish unaided recall from reference checking: ${phase}`);
  ok(RUBRIC[lang].test(act.instructions) || RUBRIC[lang].test(act.mastery_criterion) || RUBRIC[lang].test(act.answer),
    `${lang}/act-04 must define an explicit content rubric`);
  ok(MISCONCEPTION[lang].test(blob), `${lang}/act-04 missing misconception item`);
  ok(EVIDENCE[lang].test(blob), `${lang}/act-04 missing evidence-for-correction item`);
  ok(NONE_FOUND[lang].test(blob), `${lang}/act-04 must offer an honest none-found alternative (no invented errors)`);
  ok(FRESH_CHECK[lang].test(blob), `${lang}/act-04 must require a fresh unaided transfer/retrieval check`);
  ok(RECOVERY[lang].test(blob), `${lang}/act-04 missing scheduled recovery step`);
  ok(OWN_WORDS[lang].test(blob), `${lang}/act-04 must require own-words restatement`);
  ok(REJECT_PERFECT[lang].test(blob), `${lang}/act-04 must still reject bare 'everything correct' claims`);
  for (const m of blob.matchAll(new RegExp(`.{0,80}(?:${UNIVERSAL.source}).{0,80}`, 'g'))) {
    ok(UNIVERSAL_NEG[lang].test(m[0]), `${lang}/act-04 un-negated "single most effective" claim: ${m[0].trim()}`);
  }
  // Mastery is rubric-based, not raw length: no word/character-count threshold.
  const LENGTH_BAR = /\d+\s*(words?|characters?)\b|\d+\s*(字|文字|字符|語)/i;
  ok(!LENGTH_BAR.test(act.mastery_criterion),
    `${lang}/act-04 mastery_criterion must not use a word/character count: ${act.mastery_criterion}`);
  ok(!LENGTH_BAR.test(blob), `${lang}/act-04 still carries a word/character length bar`);
  // The answer must be a worked example meeting the rubric, with evidence the
  // worked commands actually produced (marker.txt read, prefix probes) — not
  // sys.path claims or unperformed file-access experiments.
  ok(/```text[\s\S]*```/.test(act.answer), `${lang}/act-04 answer must contain a worked example log`);
  ok(MISCONCEPTION[lang].test(act.answer) && EVIDENCE[lang].test(act.answer), `${lang}/act-04 answer lacks misconception+evidence pairing`);
  ok(/marker\.txt|marker/.test(act.answer), `${lang}/act-04 worked log must cite the observed marker read, not unproduced evidence`);
  ok(!/cat marker\.txt/.test(act.answer), `${lang}/act-04 worked log must cite the venv-interpreter marker read, not cat`);
  // Objective acknowledges the none-found alternative like instructions/mastery.
  ok(NONE_FOUND[lang].test(act.objective), `${lang}/act-04 objective must acknowledge the none-found alternative`);
  // Step 3 must separate the unaided prediction from the observed/checked result.
  const STEP3_OBSERVED = {
    en: /ran it and|observed \[9, 0\]|actual output/i,
    ja: /実行して|実際に実行|観測|実際の出力/,
    'zh-Hans': /实际运行|观察到|实际输出/,
    'zh-Hant': /實際執行|觀察到|實際輸出/,
  };
  ok(STEP3_OBSERVED[lang].test(act.answer), `${lang}/act-04 step 3 must record an observed checked result, not only a prediction`);
  ok(!/sys\.path(?!\/|d)/.test(act.answer) || /marker/.test(act.answer), `${lang}/act-04 must not claim evidence (e.g. sys.path) the commands never produced`);
  ok(/\d{1,2}:\d{2}|Day 02|明日|明天/.test(act.answer), `${lang}/act-04 answer lacks a concrete scheduled step`);
}
// Cross-language substance parity: same rubric item count (4 bullets).
for (const lang of LANGS) {
  const items = (content[lang].activities['day-01-act-04'].instructions.match(/^- /gm) || []).length;
  assert.equal(items, 4, `${lang}/act-04 rubric must have 4 items, found ${items}`);
  passed++;
}

// ---------- 4. Localization and boundaries ----------
console.log('4. Checking per-edition localization and assistance boundaries...');
const KANA = /[\u3040-\u30ff\u31f0-\u31ff]/;
const HAN = /[\u4e00-\u9fff]/;
// English-prose leak detector: 6+ consecutive ASCII words outside code spans.
const EN_PROSE = /[A-Za-z][A-Za-z'-]*( [A-Za-z][A-Za-z'-]*){5,}/;
const ALLOWED_EN = [
  /Independent Mastery Check/g, /Agent Tool Track/g, /Practice & Prediction Log/g,
  /Roediger & Karpicke/g,
];
for (const lang of ['ja', 'zh-Hans', 'zh-Hant']) {
  for (const actId of ['day-01-act-02', 'day-01-act-03', 'day-01-act-04']) {
    const act = content[lang].activities[actId];
    for (const field of PROSE_FIELDS) {
      let text = stripCode(act[field]);
      for (const allow of ALLOWED_EN) text = text.replace(allow, '');
      ok(!EN_PROSE.test(text), `${lang}/${actId}.${field} contains copied English prose: ${(text.match(EN_PROSE) || [''])[0].slice(0, 80)}`);
      if (lang === 'ja') ok(KANA.test(text), `${lang}/${actId}.${field} contains no Japanese text`);
      else ok(HAN.test(text), `${lang}/${actId}.${field} contains no Chinese text`);
    }
  }
}
// The legacy roadmap link was retired (/lessons/index.html now redirects to /),
// so no edition may carry its nav label any more.
for (const lang of Object.keys(content)) {
  ok(!('nav_legacy_roadmap' in content[lang].common), `${lang} still carries retired nav_legacy_roadmap`);
}
// dev_slice_notice: honest availability/pending wording, not a completeness
// claim — and non-en editions must not ship raw English.
const NOTICE = {
  en: /pending|not claimed|acceptance/i,
  ja: /審査|進行中|主張しません/,
  'zh-Hans': /验收|进行中|不声称/,
  'zh-Hant': /驗收|進行中|不聲稱/,
};
for (const lang of LANGS) {
  const notice = content[lang].common.dev_slice_notice;
  ok(NOTICE[lang].test(notice), `${lang} dev_slice_notice must be availability/acceptance-pending wording: ${notice}`);
  ok(!/Complete local curriculum|已完备|完備です|完備している/.test(notice),
    `${lang} dev_slice_notice still claims complete local curriculum: ${notice}`);
  if (lang === 'ja') ok(KANA.test(notice), 'ja dev_slice_notice still English');
  if (lang.startsWith('zh')) ok(HAN.test(notice), `${lang} dev_slice_notice still English`);
}
// act-01 boundary: post-evidence assistance is remediation, not AI completion.
const act01En = content.en.activities['day-01-act-01'].assistance_policy_label;
ok(/remediation/i.test(act01En) && /unaided|independent/i.test(act01En),
  `en act-01 label must bound assistance to remediation, not completion: ${act01En}`);
const ACT01_BOUNDARY = {
  ja: /復習|修復/, 'zh-Hans': /补救|复习/, 'zh-Hant': /補救|複習/,
};
for (const lang of ['ja', 'zh-Hans', 'zh-Hant']) {
  const label = content[lang].activities['day-01-act-01'].assistance_policy_label;
  ok(ACT01_BOUNDARY[lang].test(label), `${lang} act-01 label missing remediation-only boundary: ${label}`);
}
// act-01 quiz + answer, all editions: no heap/stack/physical-address or
// pointer-as-address claims; `id()` may appear only as an identity comparison.
const LAYOUT_FORBID = {
  en: /heap|memory address|pointer|stack memory/i,
  ja: /ヒープ|メモリアドレス|ポインタ/,
  'zh-Hans': /堆内存|内存地址|堆栈|指针/,
  'zh-Hant': /堆疊|堆栈|記憶體位址|記憶體地址|内存地址/,
};
const OBJ_REF = {
  en: /same list object/,
  ja: /同一のリストオブジェクト/,
  'zh-Hans': /同一个列表对象/,
  'zh-Hant': /同一個串列物件/,
};
for (const lang of LANGS) {
  const act01 = content[lang].activities['day-01-act-01'];
  for (const q of act01.quiz.questions) {
    const blob = JSON.stringify(q);
    ok(!LAYOUT_FORBID[lang].test(blob),
      `${lang} act-01 ${q.id} still carries memory-layout wording`);
    ok(!/id\([^)]*\)\s*(?:is|=)\s*(?:the |a )?(?:physical |memory )?address/i.test(blob),
      `${lang} act-01 ${q.id} presents id() as an address`);
  }
  ok(!LAYOUT_FORBID[lang].test(act01.answer),
    `${lang} act-01 answer still carries memory-layout wording`);
  ok(OBJ_REF[lang].test(act01.quiz.questions[0].explanation),
    `${lang} q1 explanation must use object-reference wording`);
  // tracer_bullet is learner-facing instruction text — localized, not English.
  if (lang === 'ja') ok(KANA.test(act01.tracer_bullet), 'ja tracer_bullet still English');
  if (lang.startsWith('zh')) ok(HAN.test(act01.tracer_bullet), `${lang} tracer_bullet still English`);
  // MRE/identity witness is unconditional in every edition — evidence for the
  // identity claim, not conditional on unexpected behavior.
  const MRE_WITNESS = {
    en: /required even if every prediction was correct|identity claim/i,
    ja: /必須|同一性の主張/,
    'zh-Hans': /必须提交|同一性主张/,
    'zh-Hant': /必須提交|同一性主張/,
  };
  ok(MRE_WITNESS[lang].test(act01.exercise_prompt + act01.mastery_criterion),
    `${lang} act-01 must require the identity/mutation witness unconditionally`);
  ok(!/若出现非预期|若出現非預期|予期せぬ挙動が生じた場合|if unexpected/i.test(act01.exercise_prompt),
    `${lang} act-01 still makes the MRE conditional on unexpected behavior`);
}
// Ledger quiz keys preserved: q1=b, q2=c, q3=b.
const ledgerAct01 = ledger.activities.find(a => a.id === 'day-01-act-01');
assert.deepEqual(ledgerAct01.quiz.questions.map(q => [q.id, q.expected_answer]),
  [['q1', 'b'], ['q2', 'c'], ['q3', 'b']], 'act-01 quiz keys must stay b/c/b');
passed++;

// ---------- 5. Ledger alignment ----------
console.log('5. Checking day-01 ledger alignment...');
assert.equal(ledger.activities.length, 4, 'day-01 must keep exactly 4 activities');
assert.equal(ledger.activities.reduce((s, a) => s + a.active_minutes, 0), 480, 'day-01 must still total 480 active minutes');
for (const act of ledger.activities) {
  assert.equal(act.assistance_policy, 'independent', `${act.id} assistance_policy must stay independent`);
  // act-01 is at rev5 (portable identity + unconditional witness + localized
  // tracer_bullet); the other three at rev4 (marker-via-interpreter,
  // no-surprise status alternative, commit model, retrieval-log fixes).
  const want = act.id === 'day-01-act-01' ? '2026.10.30-rev5' : '2026.10.30-rev4';
  assert.equal(act.content_revision, want, `${act.id} content_revision must record this repair`);
  passed += 2;
}
for (const lang of LANGS) {
  assert.deepEqual(Object.keys(content[lang].activities).sort(),
    ledger.activities.map(a => a.id).sort(), `${lang} activity ids must match the ledger`);
}
ok(content.en.activities['day-01-act-01'].quiz.questions.length === 3, 'act-01 quiz must keep 3 questions');
passed++;

console.log(`Day 01 acceptance-repair checks passed (${passed} assertions).`);
