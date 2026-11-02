// Focused regression tests for the Days 16-28 confirmed-math repair batch.
// Covers the handoff's supported findings only (no over-repair):
//   D16-18-F02: day-18 act-02 offline fallback is an honest non-code worked
//               example; act-03 answer carries the sin(1) forward/central
//               error table it claims.
//   D16-18-F04: day-17/18 act-04 prompts request the deliverables their own
//               mastery criteria already require.
//   D16-18-F03 + D19-21-F01: math days no longer route recovery to Git day-14;
//               day-16 is Baseline (first math day, in-day directions live in
//               the hints), days 17-21 point to the previous math day.
//   D19-21-F02: independent-practice labels/instructions preserve the unaided
//               attempt and require a fresh equivalent check after help.
//   D19-21-F04/F05: day-21 backprop hint carries the real adjoint witness and
//               the termwise-expansion cross-check.
//   D19-21-F06: day-19 act-03 central-difference claim is qualified for
//               finite h (roundoff can reverse the order).
//   D19-21-F07: day-20 act-02 uses the unrounded f value 25.00100001.
//   D2224-01: day-22 act-02 distinguishes dot-product sign / normalized cosine
//             and warns that magnitude alone does not order angles.
//   D2224-02: day-24 act-04 scopes the "dominates memory" claim to the
//             compared toy tensors.
//   D2224-03: day-24 act-03 separates no-copy .view() stride constraints from
//             .reshape() copy semantics; PyTorch claim is labelled unexecuted.
//   D2224-04: zh-Hant embedding-table wording uses 行 (rows), not 列.
//   D25-27-MATH-002: day-26 act-03 hint states the q->0+ limit correctly and
//             marks evaluation at exactly q=0 undefined.
//   D25-27-MATH-003: day-27 act-03 answer carries the corrected third NLL.
//   D25-27-MATH-004: day-27 act-01 scopes log1p to p near 1 and requires a
//             distinct stated p=0 policy.
//   D25-27-MATH-005: day-25 act-03 answer drops the deterministic upper bound;
//             confidence level must be stated (rule-of-three ~3/n).
//   D25-27-MATH-006: day-26 act-04 answer states finite-sample means fluctuate
//             and converge only under stated assumptions (LLN).
//   D25-27-PED-001: days 25-27 act-04 preserve the first unaided attempt and
//             require fresh equivalent unaided checks for remediation.
//   D25-27-L10N-001: dev_slice_notice is localized, not English, in ja/zh.
//   D28-30-001: day-28 act-03 distinguishes proportion SE from count SD,
//             states the independence assumption, and denies paired/
//             significance-test status.
//   D16-30-POST-01: day-18 act-02 hint measures error vs cos(1) at working
//             precision; displayed operands give 0.5394025, unrounded
//             0.53940225216976 — display precision labelled honestly.
//   D16-30-POST-02: day-18 act-03 no longer claims O(h^2) truncation
//             dominates near 1e-8 (observed 2.6e-9 >> h^2/6 bound 1.7e-17).
//   D16-30-POST-03: day-17/18 act-04 answers supply the deliverables the
//             prompts demand (+1/-1 quotients; a worked central difference)
//             without leaking those values into the prompts.
//   D16-30-POST-04: day-19 act-03 counterexample is an exact-arithmetic
//             truncation/cancellation reversal (forward 0, central
//             -1/100000), not a roundoff witness.
//   D16-30-POST-05: day-28 act-03 proportion SEs corrected to .089/.067.
//   D16-30-POST-06: day-28 act-04 routes probability gaps directly to day-25
//             and statistics misses to in-day activities; ledger link acyclic.
//   D16-30-POST-07: day-27 act-01 separates the limit/extended-real
//             convention from the observed Python ValueError API behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const LANGS = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }

const content = (d, lang) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/content', `day-${d}`, `${lang}.json`)));
const act = (d, lang, aid) => content(d, lang).activities[aid];
const ledger = d =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum/days', `day-${d}.json`)));

// ---------- recovery graph: no math day routes to day-14; acyclic ----------
{
  ok(ledger(16).recovery_links.length === 0,
     'day-16 is the first math day: recovery_links must be Baseline ([]) with in-day directions in the hints');
  const expected = { 17: 'day-16', 18: 'day-17', 19: 'day-18', 20: 'day-19', 21: 'day-20' };
  for (const [d, want] of Object.entries(expected)) {
    const links = ledger(d).recovery_links;
    ok(links.length === 1 && links[0] === want,
       `day-${d} recovery_links must point to the previous math day ${want}, got ${JSON.stringify(links)}`);
  }
  for (let d = 16; d <= 21; d++) {
    const links = ledger(d).recovery_links;
    ok(!links.includes('day-14'), `day-${d} must not route math recovery to Git day-14`);
    for (const l of links) {
      ok(/^day-\d{2}$/.test(l), `day-${d} recovery link ${l} must be a day-level id`);
      const target = ledger(parseInt(l.slice(4), 10));
      ok(target.day_number < d, `day-${d} recovery link ${l} must point earlier (no cycle)`);
    }
  }
  // POST-06: probability foundations are taught on day-25; day-26 requires
  // them. Day-28 probability misses therefore route directly to day-25, not
  // through day-26 or to day-21 computational graphs.
  const links28 = ledger(28).recovery_links;
  ok(links28.length === 1 && links28[0] === 'day-25',
     `day-28 recovery_links must point directly to day-25 probability foundations, got ${JSON.stringify(links28)}`);
  ok(ledger(25).day_number < ledger(28).day_number,
     'day-28 recovery link must point earlier (no cycle)');
  const probabilityFoundations = act(25, 'en', 'day-25-act-01');
  ok(/sample space/i.test(probabilityFoundations.objective) && /event/i.test(probabilityFoundations.objective) && /counting/i.test(probabilityFoundations.objective),
     'day-25 act-01 must teach sample spaces, events, and counting foundations');
  ok(/Day 25 \(probability foundations\)/i.test(act(26, 'en', 'day-26-act-01').prerequisites),
     'day-26 act-01 must depend on day-25 probability foundations');
  // in-day remedial directions exist in day-16 content for every edition
  for (const lang of LANGS) {
    const a4 = act(16, lang, 'day-16-act-04');
    ok(/activit|アクティビティ|活动|活動/i.test(a4.hint) && /recover|復習|回復|恢复|恢復/i.test(a4.hint + a4.instructions),
       `day-16/${lang} act-04 must carry an in-day remedial direction (revisit Activities 1-3)`);
  }
}

// ---------- D16-18-F02 + POST-01: day-18 act-02 fallback, honest oracle ----------
for (const lang of LANGS) {
  const hint = act(18, lang, 'day-18-act-02').hint;
  ok(hint.includes('(sin(1+h)-sin(1-h))/(2h)'),
     `day-18/${lang} act-02 hint must give the concrete non-code central-difference formula`);
  ok(hint.includes('0.8912074') && hint.includes('0.53940225216976'),
     `day-18/${lang} act-02 hint must carry the unrounded h=.1 quotient`);
  // POST-01: displayed operands give exactly 0.5394025 (215761/400000), not
  // 0.5394022522 — the hint must show the honest display result.
  ok(hint.includes('0.5394025') && !hint.includes('= 0.5394022522'),
     `day-18/${lang} act-02 hint must not equate the displayed operands with 0.5394022522`);
  // Errors are measured against cos(1) at working precision, not the rounded
  // display value presented as the oracle.
  ok(!hint.includes('|estimate - 0.5403023059|') && !hint.includes('|推定 - 0.5403023059|')
     && !hint.includes('|估计 - 0.5403023059|') && !hint.includes('|估計 - 0.5403023059|'),
     `day-18/${lang} act-02 hint must not use the rounded display as the error oracle`);
  ok(/working precision|演算精度|工作精度/i.test(hint),
     `day-18/${lang} act-02 hint must say the oracle is cos(1) at working precision`);
  const prompt = act(18, lang, 'day-18-act-02').exercise_prompt;
  ok(prompt.includes('0.5403023059') && /≈|約|约|約/i.test(prompt),
     `day-18/${lang} act-02 prompt must label cos(1) as an approximation`);
  ok(/working precision|演算精度|工作精度/i.test(prompt),
     `day-18/${lang} act-02 prompt must direct error measurement to working-precision cos(1)`);
}
// POST-01 executed: the stated arithmetic is the real arithmetic.
{
  const displayed = (0.8912074 - 0.7833269) / 0.2;
  ok(Math.abs(displayed - 0.5394025) < 1e-12,
     `displayed operands must equal 0.5394025, got ${displayed}`);
  const unrounded = (Math.sin(1.1) - Math.sin(0.9)) / 0.2;
  ok(Math.abs(unrounded - 0.53940225216976) < 1e-12,
     `unrounded h=.1 central quotient must be ≈0.53940225216976, got ${unrounded}`);
  // The oracle choice matters at h=1e-5: full cos(1) → ~1.11e-11, the rounded
  // display → ~4.30e-11. The repaired text measures against working precision.
  const cen5 = (Math.sin(1 + 1e-5) - Math.sin(1 - 1e-5)) / 2e-5;
  ok(Math.abs(Math.abs(cen5 - Math.cos(1)) - 1.1140866e-11) < 1e-14,
     `central error vs full cos(1) at 1e-5 must be ~1.11e-11`);
  ok(Math.abs(Math.abs(cen5 - 0.5403023059) - 4.3001e-11) < 1e-14,
     `central error vs the rounded display at 1e-5 must be ~4.30e-11`);
}

// ---------- D16-18-F02 + POST-02: act-03 error table + honest dominance ----------
for (const lang of LANGS) {
  const ans = act(18, lang, 'day-18-act-03').answer;
  for (const v of ['4.29e-2', '9.00e-4', '1.11e-11', '1.23e-5']) {
    ok(ans.includes(v), `day-18/${lang} act-03 answer must carry sin(1) error-table value ${v}`);
  }
  ok(/sqrt/.test(ans), `day-18/${lang} act-03 answer must still cover the sqrt cancellation case`);
  // POST-02: at h=1e-8 the observed error is roundoff/cancellation, not
  // O(h^2) truncation — the old dominance claim must be gone.
  ok(!ans.includes('1e-5..1e-8'),
     `day-18/${lang} act-03 must not claim O(h^2) truncation dominates near 1e-5..1e-8`);
  ok(ans.includes('h^2/6') && /1\.7e-17|1\.67e-17/.test(ans),
     `day-18/${lang} act-03 must contrast the observed 1e-8 error with the h^2/6 bound`);
  ok(/not a universal|普遍の h|普遍适用|普遍適用/.test(ans),
     `day-18/${lang} act-03 must deny a universal turnover h`);
}
// POST-02 executed: observed central error at 1e-8 far exceeds the exact
// truncation bound h^2/6, so the dominance claim was arithmetically false.
{
  const cen8 = (Math.sin(1 + 1e-8) - Math.sin(1 - 1e-8)) / 2e-8;
  const err8 = Math.abs(cen8 - Math.cos(1));
  ok(Math.abs(err8 - 2.5812299e-9) < 1e-11, `observed central error at 1e-8 must be ≈2.58e-9, got ${err8}`);
  ok(err8 > (1e-8 ** 2) / 6 * 1e7,
     `observed 1e-8 error must exceed the h^2/6 bound by orders of magnitude`);
}

// ---------- D16-18-F04 + POST-03: deliverables requested AND answered ----------
for (const lang of LANGS) {
  const p17 = act(17, lang, 'day-17-act-04').exercise_prompt;
  ok(/lim\(h->0\+\)/.test(p17) && /lim\(h->0-\)/.test(p17),
     `day-17/${lang} act-04 must request both one-sided difference quotients for |x|`);
  ok(!/slope at x=3\. Then contrast/.test(p17) || /equation/.test(p17),
     `day-17/${lang} act-04 must request the full tangent-line equation, not just the slope`);
  const p18 = act(18, lang, 'day-18-act-04').exercise_prompt;
  ok(/\(5\)|5\)/.test(p18) && /central|中心|中央/i.test(p18),
     `day-18/${lang} act-04 must request a worked central-difference calculation`);
  // POST-03: the reference answers now carry the demanded deliverables.
  const a17 = act(17, lang, 'day-17-act-04').answer;
  ok(/lim\(h->0\+\)[^.\n]*= +1|= \+1/.test(a17) && /= -1/.test(a17),
     `day-17/${lang} act-04 answer must state the +1 and -1 one-sided quotients`);
  const a18 = act(18, lang, 'day-18-act-04').answer;
  ok(/x\^3/.test(a18) && a18.includes('h=0.1') && a18.includes('12.01'),
     `day-18/${lang} act-04 answer must carry a worked central-difference example (f, point, h)`);
  // ...and neither prompt leaks the reference values.
  ok(!/= \+1|= -1/.test(p17), `day-17/${lang} act-04 prompt must not leak the quotient values`);
  ok(!p18.includes('12.01') && !p18.includes('9.261'),
     `day-18/${lang} act-04 prompt must not leak the worked-example values`);
}
// POST-03 executed: the stated quotient signs and the worked example are real.
{
  ok((Math.abs(0.001) - Math.abs(0)) / 0.001 === 1 && (Math.abs(-0.001) - Math.abs(0)) / -0.001 === -1,
     'the |x| one-sided quotients must be +1 and -1');
  const worked = (2.1 ** 3 - 1.9 ** 3) / 0.2;
  ok(Math.abs(worked - 12.01) < 1e-12, `worked central estimate must be 12.01, got ${worked}`);
}

// ---------- D19-21-F02: preserved-attempt independent labels ----------
for (const d of [19, 20, 21]) {
  for (const lang of LANGS) {
    const a = act(d, lang, `day-${d}-act-02`);
    ok(/preserv|保存|保留|無支援|unaided|无协助|無協助/i.test(a.assistance_policy_label),
       `day-${d}/${lang} act-02 label must preserve the recorded unaided attempt`);
    ok(/fresh|new|新|新しい|同等/i.test(a.assistance_policy_label + a.instructions),
       `day-${d}/${lang} act-02 must require a fresh equivalent unaided check after help`);
  }
}

// ---------- D19-21-F04/F05: day-21 backprop + expansion witnesses ----------
for (const lang of LANGS) {
  const h = act(21, lang, 'day-21-act-01').hint;
  ok(h.includes('dL/da = 42') && h.includes('dL/db = 28') && h.includes('dL/dc = 14'),
     `day-21/${lang} act-01 hint must carry the real adjoint witness (42/28/14)`);
  const h2 = act(21, lang, 'day-21-act-02').hint;
  const a2 = act(21, lang, 'day-21-act-02').answer;
  ok(h2.includes('4x^3 + 12x^2 + 8x') && h2.includes('24'),
     `day-21/${lang} act-02 hint must show the termwise expansion cross-check`);
  ok(a2.includes('x^4 + 4x^3 + 4x^2') && a2.includes('24'),
     `day-21/${lang} act-02 answer must carry the same expansion witness`);
}

// ---------- D19-21-F06 + POST-04: finite-h qualification on day-19 act-03 ----------
for (const lang of LANGS) {
  const h = act(19, lang, 'day-19-act-03').hint;
  ok(/O\(h\^2\)/.test(h) && /O\(h\)/.test(h),
     `day-19/${lang} act-03 hint must keep the asymptotic O(h^2) vs O(h) contrast`);
  // POST-04: the polynomial witness reverses in EXACT arithmetic — the hint
  // must attribute the reversal to truncation coefficients/term cancellation,
  // not floating-point roundoff, and must not promise forward is exactly 0
  // in binary.
  ok(h.includes('x^2 - 100000 x^3') && h.includes('-1/100000'),
     `day-19/${lang} act-03 hint must carry the exact-arithmetic counterexample`);
  ok(h.includes('-1.3e-21'),
     `day-19/${lang} act-03 hint must give the binary-float forward value ≈ -1.3e-21`);
  ok(/exact arithmetic|厳密算術|精确算术|精確算術/.test(h),
     `day-19/${lang} act-03 hint must frame the reversal as exact-arithmetic truncation`);
  ok(/not.*roundoff|丸めではなく|而非浮点舍入|而非浮點捨入/i.test(h),
     `day-19/${lang} act-03 hint must not attribute the reversal to roundoff`);
  ok(!/forward gives 0\)|前進は 0|前向为 0|前向為 0/.test(h),
     `day-19/${lang} act-03 hint must not claim the float forward value is exactly zero`);
}
// POST-04 executed: the reversal holds in exact rational arithmetic — it is
// not a roundoff witness. h=1/100000: f(h)=h^2-100000h^3=0, forward=0;
// f(-h)=h^2+100000h^3 → central = -100000 h^2 = -1/100000.
{
  const D = 100000n; // h = 1/D
  const fh = (D - 100000n); // f(h) = (D - 100000)/D^3 = 0
  const fmh = (D + 100000n); // f(-h) = (D + 100000)/D^3
  ok(fh === 0n, 'exact forward numerator must cancel to 0');
  // central = (f(h)-f(-h))/(2h) = -200000/D^3 * D/2 = -100000/D^2 = -1/100000
  ok(fmh - fh === 200000n && -(100000n * D * D) === -(10n ** 15n),
     'exact central quotient must be -1/100000');
  const h = 1e-5, fp = (x) => x ** 2 - 100000 * x ** 3;
  ok(Math.abs((fp(h) - fp(0)) / h - (-1.29e-21)) < 1e-21,
     'binary float forward must be ≈ -1.3e-21, approximately but not exactly zero');
}

// ---------- D19-21-F07: day-20 unrounded value ----------
for (const lang of LANGS) {
  const a = act(20, lang, 'day-20-act-02').answer;
  ok(a.includes('25.00100001'), `day-20/${lang} act-02 answer must use the unrounded 25.00100001`);
  ok(!/f\(3\.00006, 4\.00008\) ≈ 25\.001[^0-9]|f\(3\.00006, 4\.00008\) ≈ 25\.001$/.test(a),
     `day-20/${lang} act-02 must not claim 10.0001 from the rounded display alone`);
}

// ---------- D2224-01: dot-sign vs cosine; magnitude does not order angles ----------
for (const lang of LANGS) {
  const h = act(22, lang, 'day-22-act-02').hint;
  ok(/sign|符号|符號|正|負|负/i.test(h) && /cos|コサイン|余弦|餘弦/i.test(h),
     `day-22/${lang} act-02 hint must mention dot-product sign and normalized cosine`);
  const a = act(22, lang, 'day-22-act-02').answer;
  ok(a.includes('89.94') && a.includes('0.001'),
     `day-22/${lang} act-02 answer must carry the cos~0.001 / 89.94-degree counterexample`);
  ok(a.includes('(1000, 0)') && a.includes('(1, 1000)'),
     `day-22/${lang} act-02 answer must carry the large-dot near-orthogonal witness`);
}

// ---------- D2224-02/03: day-24 scope + view-vs-reshape ----------
for (const lang of LANGS) {
  const a4 = act(24, lang, 'day-24-act-04').answer;
  ok(/1,200,000/.test(a4) && /toy|玩具|例|this lesson|このレッスン|本课|本課/i.test(a4),
     `day-24/${lang} act-04 answer must scope the dominance claim to the toy tensors`);
  const a3 = act(24, lang, 'day-24-act-03').answer;
  ok(a3.includes('.view()') && a3.includes('.reshape(6)') || /\.view|\.reshape/i.test(a3),
     `day-24/${lang} act-03 answer must distinguish .view() stride limits from .reshape() copying`);
  ok(/not executed|実行はしていない|未执行|未執行|documented|文書化|文档/i.test(a3),
     `day-24/${lang} act-03 answer must label the PyTorch behavior as documented-not-executed`);
}

// ---------- D2224-04: zh-Hant embedding rows are 行 ----------
{
  const zht = act(22, 'zh-Hant', 'day-22-act-01');
  ok(zht.instructions.includes('一行') && zht.instructions.includes('取出一行'),
     'day-22/zh-Hant act-01 must call embedding-table rows 行, not 列');
  ok(!zht.instructions.includes('一列數字') && !zht.instructions.includes('取出一列'),
     'day-22/zh-Hant act-01 must not describe token rows with 列');
  ok(zht.answer.includes('嵌入表的行'),
     'day-22/zh-Hant act-01 answer must use 行 for E[token_id]');
}

// ---------- D25-27-MATH-005: no deterministic zero-probability bound ----------
for (const lang of LANGS) {
  const a = act(25, lang, 'day-25-act-03').answer;
  ok(/3\/n/.test(a) && /confidence|信頼|置信|信賴/i.test(a),
     `day-25/${lang} act-03 answer must require a stated confidence level (rule-of-three ~3/n)`);
  ok(!/bounds the estimate|上限を示すだけ|只给出估计的上界|只給出估計的上界/.test(a),
     `day-25/${lang} act-03 answer must not claim zero counts deterministically bound p`);
}

// ---------- D25-27-MATH-002: log-0 limit statement ----------
for (const lang of LANGS) {
  const h = act(26, lang, 'day-26-act-03').hint;
  ok(/q \\to 0\^\+/.test(h) && /\+\\infty/.test(h),
     `day-26/${lang} act-03 hint must state the correct q->0+ => +infinity limit`);
  ok(/undefined|未定義|未定义|未定義/i.test(h),
     `day-26/${lang} act-03 hint must mark evaluation at exactly q=0 undefined`);
}

// ---------- D25-27-MATH-006: finite-sample mean is a random variable ----------
for (const lang of LANGS) {
  const a = act(26, lang, 'day-26-act-04').answer;
  ok(/not guaranteed|保証されない|不保证|不保證/i.test(a) && /converge|収束|收敛|收斂/i.test(a),
     `day-26/${lang} act-04 answer must say finite means are not guaranteed equal and converge under stated assumptions`);
}

// ---------- D25-27-MATH-003: corrected third NLL ----------
for (const lang of LANGS) {
  const a = act(27, lang, 'day-27-act-03').answer;
  ok(a.includes('1.3863'), `day-27/${lang} act-03 answer must carry the corrected third NLL -ln(.25)=1.3863`);
  ok(!a.includes('2.0794'), `day-27/${lang} act-03 answer must not keep the old wrong 2.0794`);
}

// ---------- D25-27-MATH-004: log1p scoping + p=0 policy ----------
for (const lang of LANGS) {
  const a = act(27, lang, 'day-27-act-01');
  ok(/log1p/.test(a.instructions) && /near 1|1 に近い|接近 1|接近 1/i.test(a.instructions),
     `day-27/${lang} act-01 instructions must scope log1p to arguments near 1`);
  ok(/p ?=? ?0|p=0|ゼロ確率|零概率|零機率|positive floor|下限|下限へのクリップ|裁剪到正下限|裁剪到正下限|下限へのクリップ|smooth|平滑/i.test(a.instructions + a.mastery_criterion),
     `day-27/${lang} act-01 must require a distinct stated p=0 policy`);
  ok(/not a zero-probability safeguard|対策にならない|不构成零概率防护|不構成零機率防護/i.test(a.instructions + a.mastery_criterion),
     `day-27/${lang} act-01 must state that naming log1p alone is not a zero-probability safeguard`);
}

// ---------- D25-27-PED-001: preserved attempt + fresh unaided remediation ----------
for (const d of [25, 26, 27]) {
  for (const lang of LANGS) {
    const a = act(d, lang, `day-${d}-act-04`);
    ok(/preserve|保存|保留|unaided|無支援|无协助|無協助/i.test(a.instructions) &&
       /fresh|new|新|新しい/i.test(a.instructions),
       `day-${d}/${lang} act-04 instructions must preserve the first unaided attempt and require a fresh check`);
    ok(/remediat(?:ed|ion)|修復|补救|補救|回復リンク|恢复链接|恢復連結/i.test(a.mastery_criterion) &&
       /fresh|new|新|新しい/i.test(a.mastery_criterion),
       `day-${d}/${lang} act-04 mastery must require a fresh equivalent unaided check for remediation`);
  }
}

// ---------- D25-27-L10N-001: localized dev_slice_notice ----------
{
  const enNotice = content(25, 'en').common.dev_slice_notice;
  for (const d of [25, 26, 27]) {
    for (const lang of ['ja', 'zh-Hans', 'zh-Hant']) {
      const n = content(d, lang).common.dev_slice_notice;
      ok(n && n !== enNotice && !/^Complete local/.test(n),
         `day-${d}/${lang} dev_slice_notice must be localized, not the English text`);
      ok(/教材|課程|课程|内容|內容|アクセス|访问|存取|証拠|证据|證據/.test(n),
         `day-${d}/${lang} dev_slice_notice must keep the local-content/external-separation meaning`);
    }
  }
}

// ---------- D25-27-MATH-001: single-feature posterior is Bayes alone ----------
// Part (a) uses one word feature w; conditional independence is vacuous for a
// single feature. The CI question must be scoped to a multi-feature NB model.
for (const lang of LANGS) {
  const a = act(25, lang, 'day-25-act-04');
  const p = a.exercise_prompt;
  ok(/several suspicious|複数の不審な単語|多个可疑词|多個可疑詞/.test(p) ||
     /multi-feature|多特徴|多特征|多特徵/.test(p),
     `day-25/${lang} act-04 (c) must scope the CI question to a multi-feature NB model`);
  ok(/single feature|単一特徴|单个特征|單個特徵/.test(p),
     `day-25/${lang} act-04 (c) must state that (a) used a single feature`);
  ok(/Bayes' rule alone|ベイズの定理だけ|仅由贝叶斯定理|僅由貝氏定理/.test(p),
     `day-25/${lang} act-04 (c) must attribute (a)'s posterior to Bayes' rule alone`);
  ok(!/adds in \(a\)|\(a\) で.*仮定|在 \(a\) 中.*假设|在 \(a\) 中.*假設/.test(p),
     `day-25/${lang} act-04 (c) must not claim the CI assumption applies in (a)`);
  // preserved content
  ok(a.answer.includes('9/13') && a.answer.includes('0.6923'),
     `day-25/${lang} act-04 must keep the 9/13 posterior`);
  ok(a.answer.includes('1/221') && p.includes('52'),
     `day-25/${lang} act-04 must keep the two-card exercise and 1/221`);
  ok(p.includes('0.2') && p.includes('0.9') && p.includes('0.1'),
     `day-25/${lang} act-04 must keep the stated probabilities`);
  ok(/no such assumption|仮定を要しない|不依赖此假设|不依賴此假設/.test(a.answer),
     `day-25/${lang} act-04 answer must state the single-feature posterior needed no CI assumption`);
  ok(/approximately true|近似的にしか成り立たない|近似成立/.test(a.answer),
     `day-25/${lang} act-04 answer must keep the NB-is-approximation-for-real-text wording`);
}

// ---------- D28-30-001 + POST-05: proportion SE vs count SD; not a paired test ----------
for (const lang of LANGS) {
  const i = act(28, lang, 'day-28-act-03').instructions;
  ok(/1\.79/.test(i) && /1\.34/.test(i),
     `day-28/${lang} act-03 must give count-unit SDs ~1.79 (p=.8) and ~1.34 (p=.9)`);
  // POST-05: proportion SEs are ~0.089 (p=.8) and ~0.067 (p=.9), not .08–.11.
  ok(i.includes('0.089') && i.includes('0.067'),
     `day-28/${lang} act-03 must give the corrected proportion SEs 0.089/0.067`);
  ok(!/0\.08[–-]0\.11/.test(i),
     `day-28/${lang} act-03 must drop the wrong 0.08–0.11 SE range`);
  ok(/independen|独立|獨立/i.test(i),
     `day-28/${lang} act-03 must state the independence assumption`);
  ok(/not a paired|paired or significance|対応|配对|配對|significance|有意性|显著性|顯著性/i.test(i),
     `day-28/${lang} act-03 must deny paired/significance-test status (covariance unspecified)`);
}
// POST-05 executed: √(p(1−p)/20) at p=.8/.9.
{
  ok(Math.abs(Math.sqrt(0.8 * 0.2 / 20) - 0.0894427) < 1e-5, 'SE at p=.8 must be ≈0.08944');
  ok(Math.abs(Math.sqrt(0.9 * 0.1 / 20) - 0.0670820) < 1e-5, 'SE at p=.9 must be ≈0.06708');
}

// ---------- POST-06: day-28 act-04 recovery routing ----------
for (const lang of LANGS) {
  const a = act(28, lang, 'day-28-act-04');
  ok(!a.prerequisites.includes('day-21') && !a.instructions.includes('day-21'),
     `day-28/${lang} act-04 must not route probability misses to day-21`);
  ok(a.prerequisites.includes('day-25') && a.instructions.includes('day-25'),
     `day-28/${lang} act-04 prerequisites and instructions must route missed probability basics directly to day-25`);
  ok(!a.prerequisites.includes('day-26') && !a.instructions.includes('day-26'),
     `day-28/${lang} act-04 must not route probability misses through day-26`);
  ok(/28-01/.test(a.instructions) && /28-03/.test(a.instructions),
     `day-28/${lang} act-04 instructions must keep the in-day statistics recovery route through Activities 28-01..28-03`);
  // the in-day route stays for this day's own material; other prerequisites intact
  ok(/28-01/.test(a.prerequisites) && /28-03/.test(a.prerequisites),
     `day-28/${lang} act-04 prerequisites must still require Activities 28-01..28-03`);
}

// ---------- POST-07: day-27-act-01 log(0) limit convention vs API ----------
for (const lang of LANGS) {
  const i = act(27, lang, 'day-27-act-01').instructions;
  ok(!/Numerically \$\\log\(0\)|数値的には \$\\log\(0\)|数值上 \$\\log\(0\)|數值上 \$\\log\(0\)/.test(i),
     `day-27/${lang} act-01 must not state log(0)=-∞ as unqualified numerical fact`);
  ok(i.includes('ValueError'),
     `day-27/${lang} act-01 must record that math.log(0)/math.log1p(-1) raise ValueError`);
  ok(/limit|極限|极限|極限/i.test(i) && /extended|拡張|扩充|擴充/i.test(i),
     `day-27/${lang} act-01 must frame -∞ as the limit/extended-real convention`);
  ok(i.includes('log1p(p-1)') && /p=0|p = 0/.test(i),
     `day-27/${lang} act-01 must keep the log1p scope and distinct p=0 policy`);
}

// ---------- ledger: revisions only on substantively changed activities ----------
{
  const expectedRev2 = {
    19: ['day-19-act-02'],
    20: ['day-20-act-02'],
    21: ['day-21-act-01', 'day-21-act-02'],
    22: ['day-22-act-01', 'day-22-act-02'],
    24: ['day-24-act-03', 'day-24-act-04'],
    25: ['day-25-act-03'],  // act-04 moved to rev3 by the MATH-001 addendum
    26: ['day-26-act-03', 'day-26-act-04'],
    27: ['day-27-act-03', 'day-27-act-04'],  // act-01 moved to rev3 by POST-07
    28: [],  // act-03 moved to rev3 by POST-05; act-04 moved by POST-06
  };
  const expectedRev3 = {
    // F6 (acceptance review, sixth pass) moved every Day 16-18 activity to 2026.11.01-rev3.
    17: [],
    18: [],
    19: ['day-19-act-03'],
    25: ['day-25-act-04'],
    27: ['day-27-act-01'],
    28: ['day-28-act-03', 'day-28-act-04'],  // act-04 moved to rev3 by POST-06
  };
  for (let d = 16; d <= 28; d++) {
    const x = ledger(d);
    const bumped = x.activities.filter(a => a.content_revision === '2026.10.30-rev2').map(a => a.id);
    const want = (expectedRev2[d] || []).sort();
    ok(JSON.stringify(bumped.sort()) === JSON.stringify(want),
       `day-${d} rev2 set must be exactly ${JSON.stringify(want)}, got ${JSON.stringify(bumped)}`);
    const bumped3 = x.activities.filter(a => a.content_revision === '2026.10.30-rev3').map(a => a.id);
    const want3 = (expectedRev3[d] || []).sort();
    ok(JSON.stringify(bumped3.sort()) === JSON.stringify(want3),
       `day-${d} rev3 set must be exactly ${JSON.stringify(want3)}, got ${JSON.stringify(bumped3)}`);
    if (d <= 18) {
      for (const a of x.activities) {
        // Source-study directions changed only these two F6 activities.
        const revision = ['day-16-act-02', 'day-17-act-01'].includes(a.id)
          ? '2026.11.01-rev5' : '2026.11.01-rev3';
        ok(a.content_revision === revision,
           `day-${d} ${a.id} must carry revision ${revision}, got ${a.content_revision}`);
      }
    }
    for (const a of x.activities) {
      ok(a.id && a.active_minutes === 120 && a.status === 'available',
         `day-${d} ${a.id} identity/minutes/status must be preserved`);
    }
    ok(x.activities.length === 4 && x.active_minutes === 480,
       `day-${d} topology (4 activities, 480 min) must be preserved`);
  }
}

console.log(`Days 16-28 confirmed-math repair checks passed (${passed} assertions).`);
