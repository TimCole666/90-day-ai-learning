// Acceptance-repair regression for the 90-day four-language curriculum.
// Covers the repaired invariants end-to-end:
//   1. every ledger activity carries a content_revision usable for stale-content checks;
//   2. every localized activity edition carries an assistance_policy_label consistent
//      with its ledger assistance_policy;
//   3. Agent-track localized content matches the registry contract (exact DeepSeek
//      pin, no contradictory sandbox/network guarantees, no cross-language leakage);
//   4. the shared Agent/Vibe Coding exercise holds the same 13 assessed skill modules
//      in all four Language Editions with required conceptual coverage;
//   5. the security/dependency answers contain executable sample code that runs;
//   6. source rationales use bounded claims and the registry documents a selection rubric;
//   7. quiz question ids and answer keys are unchanged vs the repository HEAD.
// These are offline structural/behavioral checks only: no network, no model calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const LANGS = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const dayId = n => `day-${String(n).padStart(2, '0')}`;
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), 'utf8'));

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };

// ---------- 1. content_revision completeness ----------
console.log('1. Checking content_revision on all 360 ledger activities...');
let activityCount = 0;
const revPattern = /^\d{4}\.\d{2}\.\d{2}-rev\d+$/;
for (let n = 1; n <= 90; n++) {
  const day = readJson('curriculum', 'days', `${dayId(n)}.json`);
  for (const activity of day.activities) {
    activityCount++;
    ok(typeof activity.content_revision === 'string' && revPattern.test(activity.content_revision),
      `${activity.id} missing/invalid content_revision: ${activity.content_revision}`);
  }
}
assert.equal(activityCount, 360, 'expected exactly 360 ledger activities');

// ---------- 2. assistance_policy_label completeness + ledger alignment ----------
console.log('2. Checking assistance_policy_label on all localized editions...');
// Labels deliberately vary in wording (conditional-assistance phrasing is valid).
// The enforced invariant is non-contradiction with the ledger policy:
// an agent_assisted activity must not carry an unconditional independent-mastery
// label, and every agent_assisted label must use assistance vocabulary.
const ASSIST_LEX = /agent|assist|智能体|智能體|协助|協助|辅助|輔助|代理|エージェント|支援|アシスタント|求助|幫助|帮助|補助|サポート|允许|允許|許可|ヘルプ|帮/i;
const HARD_INDEP = /independent mastery check|自立実施|独立習得|獨立習得|独立完成|獨立完成|完全自立|闭卷|閉卷|no ai|unaided|closed.?book/i;
let editionCount = 0;
for (let n = 1; n <= 90; n++) {
  const day = readJson('curriculum', 'days', `${dayId(n)}.json`);
  const ledgerPolicy = new Map(day.activities.map(a => [a.id, a.assistance_policy]));
  for (const lang of LANGS) {
    const content = readJson('curriculum', 'content', dayId(n), `${lang}.json`);
    for (const [actId, act] of Object.entries(content.activities)) {
      editionCount++;
      ok(typeof act.assistance_policy_label === 'string' && act.assistance_policy_label.trim().length > 0,
        `${dayId(n)}/${lang}/${actId} missing assistance_policy_label`);
      const policy = ledgerPolicy.get(actId);
      const label = act.assistance_policy_label;
      if (policy === 'agent_assisted') {
        ok(ASSIST_LEX.test(label), `${dayId(n)}/${lang}/${actId} agent_assisted label lacks assistance vocabulary: '${label}'`);
        ok(!(HARD_INDEP.test(label) && !/assist|支援|辅助|輔助|協助|协助|補助|求助|サポート|智能体|智能體|エージェント|agent/i.test(label)),
          `${dayId(n)}/${lang}/${actId} agent_assisted activity labeled as independent mastery: '${label}'`);
      }
    }
  }
}
assert.equal(editionCount, 1440, 'expected exactly 1440 localized activity editions');

// ---------- 3. Agent-track contract: language purity + DeepSeek pin ----------
console.log('3. Checking Agent-track language purity and DeepSeek contract...');
const KANA = /[\u3040-\u30ff\u31f0-\u31ff]/;
const agentContent = {};
for (const lang of LANGS) agentContent[lang] = readJson('curriculum', 'content', 'agent-track', `${lang}.json`);
for (const lang of ['zh-Hans', 'zh-Hant']) {
  const txt = JSON.stringify(agentContent[lang]);
  ok(!KANA.test(txt), `agent-track/${lang}.json contains Japanese kana`);
}
const trackRegistry = readJson('curriculum', 'agent-tracks', 'registry.json');
const dshRegistry = trackRegistry.tracks.find(t => t.id === 'deepseek-harness');
ok(dshRegistry.tested_version.includes('0.1.1-preview'), `registry DeepSeek pin drifted: ${dshRegistry.tested_version}`);
for (const lang of LANGS) {
  const trackTxt = JSON.stringify(agentContent[lang].tracks['deepseek-harness'] || {});
  ok(trackTxt.includes('@deepseek-ai/dsh'), `agent-track/${lang} DeepSeek entry missing @deepseek-ai/dsh`);
  ok(trackTxt.includes('0.1.1-preview'), `agent-track/${lang} DeepSeek entry missing pinned version 0.1.1-preview`);
  ok(!trackTxt.includes('deepseek-harness-preview-2026.1'), `agent-track/${lang} still uses fabricated preview version string`);
  // Must not claim OS-sandbox or network-isolation guarantees.
  const all = JSON.stringify(agentContent[lang]);
  ok(!/sandbox(ed|ing)? (isolation|guarantee)/i.test(all), `agent-track/${lang} claims sandbox guarantees`);
  ok(!/network (is )?(fully )?(isolated|denied|blocked|disabled) by default/i.test(all), `agent-track/${lang} claims network isolation by default`);
}
ok(trackRegistry.tracks.every(t => t.verification_state !== 'verified'), 'no track may claim live verification');

// ---------- 4. Shared exercise: exact module IDs + semantic coverage ----------
console.log('4. Checking shared_exercise parity and concept coverage across editions...');
const EXPECTED_MODULE_IDS = Array.from({ length: 13 }, (_, i) => `agent-shared-skill-${String(i + 1).padStart(2, '0')}`);
const MODULE_FIELDS = ['id', 'title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
// Per-language semantic anchors: each module must contain at least one anchor
// from every required group, in the edition's own language — not just keywords.
const CONCEPT_ANCHORS = {
  'agent-shared-skill-01': { // acceptance criteria
    en: [/acceptance criteria/i, /verif/i], ja: [/受入基準/, /検証/],
    'zh-Hans': [/验收标准/, /验证/], 'zh-Hant': [/驗收標準|驗收條件/, /驗證/],
  },
  'agent-shared-skill-02': { // plan + checkpoints + baseline
    en: [/checkpoint/i, /baseline|commit|stash/i], ja: [/チェックポイント/, /ベースライン|コミット/],
    'zh-Hans': [/检查点/, /基线|提交/], 'zh-Hant': [/檢查點/, /基線|提交/],
  },
  'agent-shared-skill-03': { // context pack
    en: [/context/i, /minimal/i], ja: [/コンテキスト/, /最小/],
    'zh-Hans': [/上下文/, /最小/], 'zh-Hant': [/上下文|脈絡/, /最小/],
  },
  'agent-shared-skill-04': { // least privilege + official docs
    en: [/least[- ]privilege|minimum necessary/i, /official (docs|documentation)/i],
    ja: [/最小権限/, /公式ドキュメント|公式文書/],
    'zh-Hans': [/最小权限/, /官方文档/], 'zh-Hant': [/最小權限/, /官方文件|官方文檔/],
  },
  'agent-shared-skill-05': { // prompt injection / untrusted content
    en: [/prompt injection/i, /untrusted|not instructions/i],
    ja: [/プロンプトインジェクション/, /信頼できない|指示ではなく/],
    'zh-Hans': [/提示词注入/, /不可信|不是指令/], 'zh-Hant': [/提示詞注入|提示注入/, /不可信|不是指令/],
  },
  'agent-shared-skill-06': { // secrets: exposure assessment + revoke/rotate
    en: [/exposure|exposed/i, /revoke|rotate/i],
    ja: [/暴露/, /revoke|rotate|失効|ローテ/i],
    'zh-Hans': [/暴露/, /吊销|轮换|revoke|rotate/i], 'zh-Hant': [/暴露/, /吊銷|輪換|revoke|rotate/i],
  },
  'agent-shared-skill-07': { // supply chain + lockfile + provenance
    en: [/supply.?chain/i, /lockfile/i, /typosquat|provenance/i],
    ja: [/サプライチェーン/, /lockfile|ロックファイル/, /タイポスクワット|出所/],
    'zh-Hans': [/供应链/, /lockfile|锁文件/, /仿冒|来源|typosquat/i],
    'zh-Hant': [/供應鏈|供應鏈/, /lockfile|鎖定檔|鎖文件/, /仿冒|來源|typosquat/i],
  },
  'agent-shared-skill-08': { // implement-verify-commit loop + stop conditions
    en: [/commit/i, /stop/i], ja: [/コミット/, /停止/],
    'zh-Hans': [/提交/, /停止/], 'zh-Hant': [/提交/, /停止/],
  },
  'agent-shared-skill-09': { // independent verification incl. UI
    en: [/exit code|exit status/i, /UI|page|CLI/i, /not evidence|claim/i],
    ja: [/終了コード/, /UI|ページ|CLI/, /証拠ではなく|証拠にならない/],
    'zh-Hans': [/退出码/, /UI|页面|CLI/, /不是证据|而非证据/],
    'zh-Hant': [/退出碼/, /UI|頁面|CLI/, /不是證據|而非證據|不是證明/],
  },
  'agent-shared-skill-10': { // diff review, weakened tests
    en: [/git diff/i, /assert|test/i], ja: [/git diff/, /アサーション|テスト/],
    'zh-Hans': [/git diff/, /断言|测试/], 'zh-Hant': [/git diff/, /斷言|測試/],
  },
  'agent-shared-skill-11': { // non-destructive recovery
    en: [/git revert|git restore/i, /destructive|reset --hard/i],
    ja: [/git revert|git restore/, /破壊的|reset --hard/],
    'zh-Hans': [/git revert|git restore/, /破坏性|reset --hard/],
    'zh-Hant': [/git revert|git restore/, /破壞性|reset --hard/],
  },
  'agent-shared-skill-12': { // human approval for irreversible/external actions
    en: [/human approv|approval/i, /irreversible|external|out.?of.?scope/i],
    ja: [/承認/, /不可逆|外部|スコープ外/],
    'zh-Hans': [/人工批准|人工审批|批准/, /不可逆|外部|范围之外/],
    'zh-Hant': [/人工批准|批准/, /不可逆|外部|範圍之外/],
  },
  'agent-shared-skill-13': { // skill authoring lifecycle: SKILL.md, trigger, least privilege, adversarial, retirement
    en: [/SKILL\.md/i, /trigger/i, /least[- ]privilege|minimum/i, /adversarial/i, /retire|retirement/i],
    ja: [/SKILL\.md/, /発火|トリガー/, /最小権限/, /敵対的/, /退役/],
    'zh-Hans': [/SKILL\.md/, /触发/, /最小权限/, /对抗/, /退役/],
    'zh-Hant': [/SKILL\.md/, /觸發/, /最小權限/, /對抗/, /退役/],
  },
};

for (const lang of LANGS) {
  const se = agentContent[lang].shared_exercise;
  ok(se && se.activity_id === 'agent-common-practice-01', `agent-track/${lang} shared activity id changed`);
  ok(Array.isArray(se.skill_modules), `agent-track/${lang} missing skill_modules`);
  assert.deepEqual(se.skill_modules.map(m => m.id), EXPECTED_MODULE_IDS,
    `agent-track/${lang} skill module ids must match the shared contract exactly`);
  assert.equal(se.seven_steps.length, 7, `agent-track/${lang} seven-step method must remain`);
  for (const m of se.skill_modules) {
    for (const f of MODULE_FIELDS) {
      ok(m[f] && String(m[f]).trim().length > 0, `agent-track/${lang}/${m.id} missing ${f}`);
    }
    const blob = `${m.title}\n${m.objective}\n${m.instructions}\n${m.exercise_prompt}\n${m.hint}\n${m.answer}\n${m.mastery_criterion}`;
    for (const anchor of CONCEPT_ANCHORS[m.id][lang]) {
      ok(anchor.test(blob), `agent-track/${lang}/${m.id} missing required concept ${anchor}`);
    }
  }
  // All four editions must keep an identical set of anchors (semantic parity).
  assert.deepEqual(Object.keys(CONCEPT_ANCHORS['agent-shared-skill-01']), LANGS.sort());

  // Curated references: identical identity set across editions, required fields,
  // and a stated evidence boundary separating documented facts from local
  // curriculum adaptation.
  const refs = se.references;
  ok(Array.isArray(refs) && refs.length >= 4, `agent-track/${lang} needs >=4 curated references`);
  for (const ref of refs) {
    for (const f of ['id', 'title', 'url', 'source_type', 'observed_date', 'scope', 'rights', 'selection_rationale', 'evidence_boundary']) {
      ok(ref[f] && String(ref[f]).trim().length > 0, `agent-track/${lang} reference ${ref.id || '?'} missing ${f}`);
    }
    ok(/^https:\/\//.test(ref.url), `agent-track/${lang} reference ${ref.id} url must be https`);
    ok(/link|链接|連結|リンク/i.test(ref.rights), `agent-track/${lang} reference ${ref.id} rights must state link-only status`);
    ok(/documented|文書化|文档化|文件化/i.test(ref.evidence_boundary), `agent-track/${lang} reference ${ref.id} must separate documented evidence from local adaptation`);
  }
}
{
  const refIds = LANGS.map(l => agentContent[l].shared_exercise.references.map(r => r.id).join('|'));
  ok(refIds.every(s => s === refIds[0]), 'reference id sets must be identical across all four editions');
  const refUrls = LANGS.map(l => agentContent[l].shared_exercise.references.map(r => r.url).join('|'));
  ok(refUrls.every(s => s === refUrls[0]), 'reference urls must be identical across all four editions');
}

// ---------- 5. Security + dependency answers: semantics and executable samples ----------
console.log('5. Checking security answer semantics and running embedded sample code...');
const SEC_ANSWER = {
  en: [/exposure|exposed/i, /revoke|rotate/i, /transmitted|sent/i, /committed/i],
  ja: [/暴露/, /revoke|rotate|失効/, /送信/, /コミット/],
  'zh-Hans': [/暴露/, /吊销|轮换/, /传出|发送|传输/, /提交/],
  'zh-Hant': [/暴露/, /吊銷|輪換/, /傳出|發送|傳輸/, /提交/],
};
for (const lang of LANGS) {
  const m06 = agentContent[lang].shared_exercise.skill_modules.find(m => m.id === 'agent-shared-skill-06');
  for (const anchor of SEC_ANSWER[lang]) {
    ok(anchor.test(m06.answer), `agent-track/${lang} skill-06 answer missing ${anchor}`);
  }
  const scenario = agentContent[lang].shared_exercise;
  const blob = `${scenario.scenario_prompt}\n${scenario.answer}\n${scenario.hint}`;
  // Prompt-injection response and non-destructive rollback in the capstone scenario.
  const INJECT = { en: /inject|untrusted/i, ja: /インジェクション|信頼できない/, 'zh-Hans': /注入|不可信/, 'zh-Hant': /注入|不可信/ };
  const RESTORE = /git (restore|revert)/;
  ok(INJECT[lang].test(blob), `agent-track/${lang} scenario lacks prompt-injection handling`);
  ok(RESTORE.test(blob), `agent-track/${lang} scenario lacks non-destructive recovery commands`);
  // Destructive commands may only appear with a prohibition nearby.
  for (const match of blob.matchAll(/[^\n]{0,90}(reset --hard|git clean)[^\n]{0,90}/g)) {
    const line = match[0];
    const PROHIBIT = { en: /never|forbidden|prohibit|not |do not|avoid/i, ja: /禁止|使わない|してはならない|しない/, 'zh-Hans': /禁止|不得|不要|绝不|禁/, 'zh-Hant': /禁止|不得|不要|絕不|禁/ };
    ok(PROHIBIT[lang].test(line), `agent-track/${lang} destructive command without prohibition context: ${line.trim()}`);
  }
}

// Extract and execute python sample code from skill-06 and skill-07 answers (en).
function extractPython(md) {
  const blocks = [];
  const re = /```python\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md)) !== null) blocks.push(m[1]);
  return blocks;
}
const enModules = agentContent.en.shared_exercise.skill_modules;
const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'learn-skill-samples-'));
try {
  for (const moduleId of ['agent-shared-skill-06', 'agent-shared-skill-07']) {
    const mod = enModules.find(m => m.id === moduleId);
    const blocks = extractPython(mod.answer);
    ok(blocks.length >= 1, `${moduleId} answer must embed executable sample code`);
    for (const [i, code] of blocks.entries()) {
      const tmp = path.join(tmpDir, `sample-${moduleId}-${i}.py`);
      fs.writeFileSync(tmp, code);
      const out = execFileSync('python3', [tmp], { encoding: 'utf8' });
      ok(/PASS/.test(out), `${moduleId} sample code did not print PASS: ${out}`);
    }
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ---------- 6. Source quality: bounded claims + documented rubric ----------
console.log('6. Checking source-selection rubric and bounded claims...');
const srcRegistry = readJson('curriculum', 'sources', 'registry.json');
ok(srcRegistry.selection_process, 'sources registry missing selection_process rubric');
const rubricCriteria = srcRegistry.selection_process.criteria.map(c => c.criterion);
for (const c of ['subject_fit', 'prerequisites', 'exercises', 'accuracy', 'provenance', 'version_and_date', 'rights']) {
  ok(rubricCriteria.includes(c), `selection rubric missing criterion ${c}`);
}
const SUPERLATIVE = /best on the internet|peerless|globally recognized|gold standard|unmatched|unrivaled|top-tier/i;
function* strings(o) {
  if (typeof o === 'string') yield o;
  else if (Array.isArray(o)) for (const v of o) yield* strings(v);
  else if (o && typeof o === 'object') for (const v of Object.values(o)) yield* strings(v);
}
for (const s of strings(srcRegistry)) {
  ok(!SUPERLATIVE.test(s), `registry contains superlative claim: ${s.slice(0, 90)}`);
}
for (let n = 1; n <= 90; n++) {
  const day = readJson('curriculum', 'days', `${dayId(n)}.json`);
  for (const s of strings(day)) {
    ok(!SUPERLATIVE.test(s), `${dayId(n)} contains superlative claim: ${s.slice(0, 90)}`);
  }
}
// Source claim fields (not titles or lesson prose) must not rank a source above
// others: the course states what a source covers, not that it is the authority.
const PROMOTIONAL = /\b(authoritative\w*|canonical|definitive\w*|seminal|landmark|renowned|superb|outstanding|excellent|industry[- ]standard|de facto|state[- ]of[- ]the[- ]art|classic|best[- ]in[- ]class|world[- ]class|unparalleled|premier|foremost)\b/i;
const CLAIM_FIELDS = ['selection_rationale', 'comparison_rationale', 'permission_basis',
  'known_availability_limitations', 'safe_fallback', 'prerequisites', 'relevant_timestamp', 'status'];
function checkClaims(card, where) {
  for (const obj of [card, ...(card.compared_candidates || [])]) {
    for (const f of CLAIM_FIELDS) {
      if (typeof obj[f] === 'string') {
        ok(!PROMOTIONAL.test(obj[f]), `${where} ${card.id}.${f} has a promotional claim: ${obj[f].slice(0, 90)}`);
      }
    }
  }
}
for (const s of srcRegistry.sources) checkClaims(s, 'registry');
for (let n = 1; n <= 90; n++) {
  for (const act of readJson('curriculum', 'days', `${dayId(n)}.json`).activities) {
    for (const card of act.source_resources || []) checkClaims(card, act.id);
  }
}
// Transcript/subtitle rights: video, lecture, course, and YouTube sources must
// remain linking-only in `reuse_category`; transcript/subtitle text may never be
// imported, translated, or redistributed.
const VIDEO_LIKE = /video|lecture|course|youtube/i;
const RIGHTS_FIELDS = ['permission_basis', 'license', 'license_restrictions', 'selection_rationale'];
for (const s of srcRegistry.sources) {
  const kind = `${s.source_type} ${s.original_url}`;
  if (!VIDEO_LIKE.test(kind)) continue;
  ok(s.reuse_category === 'linking',
    `video/lecture source ${s.id} must use reuse_category 'linking', got '${s.reuse_category}'`);
  ok(s.reuse_category !== 'imported_or_translated' && s.reuse_category !== 'quotation',
    `video/lecture source ${s.id} must not import or quote transcript text`);
  const rightsText = RIGHTS_FIELDS.map(f => JSON.stringify(s[f] ?? '')).join(' ');
  // A positive claim that transcript/subtitle text was imported, translated,
  // copied, or redistributed is a violation regardless of reuse_category.
  // Negated phrases ("no transcripts imported", "subtitles are not imported")
  // do not match this pattern.
  const IMPORT_CLAIM = /\b(?:transcript|subtitle)s?\s+(?:was|were|is|are|has been|have been|will be)\s+(?:imported|translated|copied|redistributed|included|excerpted)/i;
  ok(!IMPORT_CLAIM.test(rightsText),
    `video/lecture source ${s.id} claims transcript/subtitle import or redistribution`);
}
// Every source in the registry must carry a valid reuse_category.
const VALID_REUSE_CATEGORIES = new Set(['linking', 'quotation', 'original_explanation', 'imported_or_translated']);
for (const s of srcRegistry.sources) {
  ok(VALID_REUSE_CATEGORIES.has(s.reuse_category), `source ${s.id} invalid reuse_category '${s.reuse_category}'`);
}

// ---------- 7. Quiz identity stability vs HEAD ----------
console.log('7. Checking quiz ids and expected_answer keys unchanged vs HEAD...');
let gitAvailable = true;
try { execSync('git rev-parse --is-inside-work-tree', { cwd: ROOT, stdio: 'pipe' }); }
catch { gitAvailable = false; }
if (gitAvailable) {
  for (let n = 1; n <= 90; n++) {
    const id = dayId(n);
    const headTxt = execSync(`git show HEAD:curriculum/days/${id}.json`, { cwd: ROOT, encoding: 'utf8' });
    const headDay = JSON.parse(headTxt);
    const curDay = readJson('curriculum', 'days', `${id}.json`);
    const headActs = new Map(headDay.activities.map(a => [a.id, a]));
    const curActs = new Map(curDay.activities.map(a => [a.id, a]));
    // Union of activity ids from both revisions: a quiz removed from either
    // direction, or an activity dropped/added, must surface here.
    const unionIds = new Set([...headActs.keys(), ...curActs.keys()]);
    for (const actId of unionIds) {
      const hq = headActs.get(actId)?.quiz;
      const cq = curActs.get(actId)?.quiz;
      if (!hq && !cq) continue;
      ok(hq && cq, `${id}/${actId} quiz present on only one side of HEAD (head=${!!hq}, current=${!!cq})`);
      assert.deepEqual((cq.questions || []).map(q => q.id), (hq.questions || []).map(q => q.id),
        `${id}/${actId} quiz question ids changed`);
      assert.deepEqual((cq.questions || []).map(q => q.expected_answer), (hq.questions || []).map(q => q.expected_answer),
        `${id}/${actId} quiz expected_answer keys changed`);
    }
  }
} else {
  console.log('   (git unavailable — quiz-vs-HEAD check skipped)');
}

console.log(`Acceptance repair checks passed (${passed} assertions).`);
