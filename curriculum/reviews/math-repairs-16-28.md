# Confirmed-math repair record: Study Days 16–28 (bounded batch)

**Review revision:** 2026.10.30-rev1
**Scope:** `curriculum/content/day-{16,17,18,19,20,21,22,24,25,26,27,28}/{en,ja,zh-Hans,zh-Hant}.json`, `curriculum/days/day-{16..21,22,24,25,26,27,28}.json`, `tests/unit/test_math_repairs_16_28.cjs`.
**Handoff:** `/tmp/learn-acceptance-mvuzerj9-jo9igejn/days16-30-parent-adjudication/handoff-confirmed-math.md` — supported findings only; uncertain/downgraded findings were not repaired.
**Evidence:** `node tests/unit/test_math_repairs_16_28.cjs` (317 assertions), study-day structural suites 16–30, `test_candidate_regression.cjs`, `test_calendar_ledger.cjs`, independent Python recomputation of every claimed number.

## Findings repaired

### Recovery graph (D16-18-F03, D19-21-F01)

- Days 16–21 all routed `recovery_links` to `day-14` (Git/PR recovery), which cannot remediate calculus/linear-algebra concepts.
- Days 17–21 now point to the previous math day — the declared prerequisite (`day-17→16`, `18→17`, `19→18`, `20→19`, `21→20`). All links are day-level IDs pointing strictly earlier: no cycles, no invented prerequisites.
- Day-16 is the first math day, so `recovery_links: []` (Baseline, same schema value day-01 uses). Its in-day remedial directions already live in the per-activity hints (e.g. act-04: "Recovery: revisit Activities 1-3 or the OpenStax Sections 2.1-2.3 link"). Activity IDs were deliberately not placed in `recovery_links`: every other entry in the corpus is a day-level `day-NN` id and the dangling-link check only matches `/^day-\d{2}$/`, so non-day entries would be silently unverified.
- The wrong `day-14` pointer was removed rather than relabelled: the finding was misrouting, not unlabelled generic help.

### Days 16–18 (D16-18-F02, F04)

- day-18-act-02 `hint` (×4): the promised "provided pure-Python loop" did not exist. The fallback is now an honest non-code worked example plus a learner-written loop spec: `(sin(1+h)-sin(1-h))/(2h)` with `|estimate − 0.5403023059|`, and the worked h=.1 step `(0.8912074 − 0.7833269)/0.2 = 0.5394022522` (verified: `sin(1.1)=0.8912073600`, `sin(0.9)=0.7833269096`).
- day-18-act-03 `answer` (×4): now carries the required sin(1) forward/central error table. Recomputed values: forward `4.29e-2, 4.21e-4, 4.21e-6, 2.97e-9, 4.32e-5`; central `9.00e-4, 9.01e-8, 1.11e-11, 2.58e-9, 1.23e-5` at `h = .1, 1e-3, 1e-5, 1e-8, 1e-12` — central leads while O(h²) truncation dominates near 1e-5..1e-8, then roundoff degrades both. The sqrt-cancellation paragraph is preserved.
- day-17-act-04 `exercise_prompt` (×4): now requests the full tangent-line equation (not slope alone) and both one-sided difference quotients `lim(h->0+)` / `lim(h->0-)` for `|x|` — matching its existing mastery criterion.
- day-18-act-04 `exercise_prompt` (×4): now requests a worked central-difference calculation on a learner-chosen, explicitly stated function/point/h.

### Days 19–21 (D19-21-F02, F04–F07)

- act-02 `assistance_policy_label` + `instructions` (days 19, 20, 21, ×4): "ask for help only after recording your attempt" upgraded to preserve-the-attempt semantics — later help is a distinct assisted-recovery phase, the original stays unchanged, and a fresh equivalent unaided check is required before the idea counts as independent evidence.
- day-21-act-01 `hint` (×4): corrected the adjoint-direction witness — the adjoint at n2 travels backwards over forward edges n1→n2 and c→n2, giving `dL/dn2 = dL/dn1 = dL/dc = 14` and input gradients `dL/da = 42, dL/db = 28, dL/dc = 14` (verified by recomputation of the toy graph).
- day-21-act-02 `hint`/`answer` (×4): expansion cross-check now complete — `w = (x²+2x)² = x⁴+4x³+4x²`, `w' = 4x³+12x²+8x = 24` at x=1, matching the chain-rule result.
- day-19-act-03 `hint` (×4): the blanket "central is more accurate" claim is now qualified — O(h²) vs O(h) holds in exact arithmetic under smoothness, but finite-h roundoff can reverse it (worked counterexample `f(x) = x² − 100000x³` at x=0, h=1e-5: central ≈ −1e-5, forward = 0).
- day-20-act-02 `answer` (×4): `f(3.00006, 4.00008) = 25.00100001`, so the quotient `(25.00100001−25)/0.0001 ≈ 10.0001` — the rounded display `25.001` alone would only give ≈10 and cannot support the claimed digit (verified: 3.00006² + 4.00008² = 25.00100001 exactly at double precision).

### Days 22–24 (D2224-01..04)

- day-22-act-02 `hint`/`answer` (×4): dot-product sign decides acute/right/obtuse for nonzero vectors; normalized cosine measures directional alignment; zero vector has no defined angle. Answer carries the magnitude counterexample `u=(1000,0), v=(1,1000)`: `u·v = 1000` yet `cos ≈ 0.001`, angle ≈ 89.94° (verified: cos = 1000/(1000·√1000001) ≈ 0.0009999, acos ≈ 89.9427°).
- day-24-act-04 `answer` (×4): "logits dominate memory" scoped — the 1,200,000-byte vocab logits are the largest tensor *in this compared toy set*; whether they dominate a real model's total/training memory depends on unmeasured parameter/activation/optimizer counts.
- day-24-act-03 `answer` (×4): distinguishes no-copy `.view()` (stride-constrained, raises here) from `.reshape(6)` (may copy). PyTorch behavior labelled documented-not-executed.
- day-22-act-01 zh-Hant: embedding-table rows were described with 列 (column); corrected to 行 (row): "也是一行數字", "取出一行，該行", "嵌入表的行". day-22-act-03 (行視角/列視角) and day-24-act-01 already used the book's 行/列 distinction correctly — untouched.

### Days 25–27 (D25-27-MATH-002..006, PED-001, L10N-001)

- day-26-act-03 `hint` (×4): was `−ln 0 = −∞`; now `q→0⁺ ⇒ −ln q → +∞`, with evaluation at exactly q=0 marked undefined (not "merely −∞").
- day-27-act-03 `answer` (×4): third NLL corrected `2.0794 → 1.3863` (= −ln .25; mean NLL 0.7675, perplexity 2.1544 verified).
- day-27-act-01 `instructions`/`mastery_criterion` (×4): log1p scoped to p near 1 (`log1p(p−1)` computes ln p precisely); a distinct stated p=0 policy is required (positive floor, smoothing, or declared infinite loss) — naming log1p alone is not a zero-probability safeguard.
- day-25-act-03 `answer` (×4): removed the deterministic-bound claim — zero observed successes cannot bound the unknown probability; a bound requires a stated confidence level (rule-of-three ≈ 3/n at ~95%); smoothing avoids literal zero.
- day-26-act-04 `answer` (×4): finite-sample mean is not guaranteed equal to E[X] — it fluctuates, may coincide by chance, and converges under the stated i.i.d./finite-variance assumptions (LLN).
- act-04 `instructions` + `mastery_criterion` (days 25–27, ×4): first unaided attempt preserved unchanged; error review/assisted recovery is a distinct later phase; a missed idea counts as remediated only after a fresh equivalent unaided check whose answer is not shown in advance. Day-27's mastery had no recovery-link clause, so the full clause was appended.
- `common.dev_slice_notice` (days 25–27): ja/zh-Hans/zh-Hant were storing the English sentence; now localized (en unchanged).

### Day 28 (D28-30-001)

- day-28-act-03 `instructions` (×4): distinguishes the *proportion* SE `√(p(1−p)/20) ≈ 0.08–0.11` from *count-unit* SD `√(20p(1−p))` ≈ 1.79 (p=.8) / 1.34 (p=.9) (verified); ±2-count gap is ordinary fluctuation only under a stated independence assumption; the shared held-out set leaves A/B covariance unspecified, so the comparison is explicitly not a paired or significance test.

## Revisions and identity preservation

- `content_revision` → `2026.10.30-rev2` on exactly the changed activities: day-17-act-04; day-18-act-02/03/04; day-19-act-02/03; day-20-act-02; day-21-act-01/02; day-22-act-01/02; day-24-act-03/04; day-25-act-03/04; day-26-act-03/04; day-27-act-01/03/04; day-28-act-03. All were rev1.
- day-16 ledgers: only `recovery_links` changed (no `content_revision` bump — ledgers carry no per-day revision field; content edits were none beyond pre-existing worker changes).
- All activity IDs, assistance policies, 120-minute topology, source_resources, and statuses preserved. No quizzes added (D16-18-F01 recorded as "missing confirmed; acceptance defect not established" per handoff).

## Test coverage

`tests/unit/test_math_repairs_16_28.cjs` — 317 assertions across all four editions:

- recovery graph: day-16 Baseline; 17–21 previous-math-day; no day-14 routing; day-ID schema; strictly-earlier (no cycle); in-day remedial direction present in day-16 hints.
- all repaired values/strings asserted per language (witness numbers, scope qualifiers, localized notices).
- ledger: rev2 activity sets match the changed-activity list exactly; IDs/minutes/status/topology preserved.

## Results

- `node tests/unit/test_math_repairs_16_28.cjs` — **317 assertions PASS**
- `test_study_days_16_18`, `19_21`, `22_24`, `25_27`, `28_30` — all PASS
- `test_candidate_regression` — PASS (90 days, 43,200 min, 4 editions, 30 review records)
- `test_calendar_ledger` — PASS
- `git diff --check` — clean

## Not repaired (handoff exclusions honored)

- Downgraded/uncertain findings were not touched. No day-29/30 edits were authorized by this handoff's supported list beyond day-28-act-03.
- No code/algorithm changes: all math claims are in authored prose; numerical witnesses were recomputed offline with CPython doubles (Linux).
- No earlier-batch files touched: day-14 rev4 fail-stop work, day-13/15 instruction contract, day-01/02-03 repairs all intact.

## Addendum: D25-27-MATH-001 (single-feature posterior is Bayes alone)

This finding was omitted from the first math handoff and repaired in a separate
bounded pass; it does not redo any of the 19 groups above.

- **Defect:** `day-25-act-04.exercise_prompt` (all 4 locales) asked what
  conditional-independence assumption a naive Bayes classifier adds "in (a)" —
  but (a) uses a single word feature $w$. With one feature, conditional
  independence is vacuous; the 9/13 posterior is pure Bayes' rule, not a
  feature-independence factorization.
- **Fix:** part (c) now explicitly scopes the question to a **multi-feature**
  naive Bayes classifier scoring a message with several suspicious words, and
  states that (a) used a single feature so its posterior comes from Bayes' rule
  alone. The answer now says the CI assumption applies in the multi-feature
  case, that the single-feature posterior needed no such assumption, and keeps
  the "computationally convenient but only approximately true for real text"
  wording.
- **Preserved:** `9/13 ≈ 0.6923`, `1/221 ≈ 0.00452`, all stated probabilities
  (0.2/0.9/0.1), the two-card exercise, activity/question IDs, independent
  assessment boundary, 4x120-minute topology, and the PED-001 preserved-attempt
  wording from the earlier batch.
- **Revision:** `day-25-act-04` → `2026.10.30-rev3` (its content changed
  post-rev2); act-01/02 stay rev1, act-03 stays rev2. No other bumps.
- **Regression:** `test_math_repairs_16_28.cjs` now asserts the multi-feature
  scoping, the single-feature/Bayes-alone note, the absence of any "in (a)" CI
  claim, and all preserved values — **355 assertions PASS**; study-days 25–27
  structural suite, candidate regression, `git diff --check` all green.

## Limitations

- Numerical witnesses verified in CPython/IEEE-754 doubles on Linux only; no cross-platform float claim added.
- Localization is structural editing, not native-speaker review.
- `env`-independent evidence only — no live deployment, learner performance, or Course Readiness claim. This record is supporting local evidence, not parent acceptance.

---

## POST batch — D16-30-POST-01..07 (independently confirmed residuals)

Parent's post-repair probes found seven residual defects in the first math batch.
All fixes are in authored source; every number was recomputed locally
(Node float64) and cross-checked against the parent's witnesses.

### POST-01 — day-18-act-02: honest display precision and oracle (4 locales)

- `hint` no longer equates the displayed operands with the unrounded result:
  `(0.8912074 - 0.7833269)/0.2 = 0.5394025` is the literal quotient of the
  displayed operands; the unrounded-sine quotient `≈ 0.53940225216976` is
  shown separately. The error oracle is `cos(1)` at working precision, with
  `0.5403023059` labelled a 10-decimal display, not the oracle. Verified:
  error vs full-precision cos(1) at h=1e-5 is ~1.11e-11; vs the rounded
  display it would read ~4.30e-11.
- `exercise_prompt` now writes `cos(1)≈0.5403023059` and states errors are
  measured at working precision.

### POST-02 — day-18-act-03: corrected turnover explanation (4 locales)

The answer claimed O(h²) truncation dominates near 1e-5..1e-8. In fact at
h=1e-8 the observed central error ≈2.58e-9 is ~10⁸× the exact truncation
bound h²/6 ≈ 1.7e-17 — roundoff/cancellation already dominates. The answer
now says truncation dominates at 1e-5 (observed ≈1.1e-11 ≈ bound ≈1.7e-11),
roundoff/cancellation dominates at 1e-8 and worsens both stencils at 1e-12,
and that the turnover h is not universal (depends on function scale, point,
and working precision). Consistent with act-02's "roundoff visible at 1e-8".

### POST-03 — act-04 reference answers supply the demanded deliverables (4 locales)

- day-17-act-04 answer now states the one-sided quotients explicitly:
  lim(h→0+) (|h|−|0|)/h = +1, lim(h→0−) = −1.
- day-18-act-04 answer adds a worked central difference: f(x)=x³ at x=2,
  h=0.1 → (9.261 − 6.859)/0.2 = 12.01 vs exact 12 (error ≈0.01, O(h²)).
- Verified: the prompts request these deliverables but do not contain the
  values (no answer leakage).

### POST-04 — day-19-act-03: counterexample cause corrected (4 locales)

The f(x)=x²−100000x³ reversal is an exact-arithmetic cancellation of
truncation terms, not a roundoff witness: forward is exactly 0, central
exactly −1/100000 (verified rationally). The hint now says so, notes the
binary-float forward is ≈ −1.3e-21 (approximately, not guaranteed exactly,
zero), and keeps the "never claim universal fixed-h superiority" conclusion.

### POST-05 — day-28-act-03: proportion SEs corrected (4 locales)

√(p(1−p)/20) ≈ 0.089 at p=.8 and ≈ 0.067 at p=.9 (was "0.08–0.11"). Count
SDs √(20p(1−p)) ≈ 1.79 / 1.34 and the covariance / not-a-paired-test caveat
are preserved.

### POST-06 — day-28-act-04: recovery routed to probability, not graphs (4 locales)

`day-21` (computational graphs) → `day-26` (probability/statistics) in the
ledger `recovery_links` and in prerequisites/instructions; statistics misses
route to in-day Activities 28-01..03. Acyclic, day-level, other prerequisites
untouched.

### POST-07 — day-27-act-01: log(0) limit vs API (4 locales)

`log(0) = −∞` is now presented as the limit/extended-real convention
(`log p → −∞` as `p → 0⁺`), explicitly not an API guarantee: this checkout's
`math.log(0)`/`math.log1p(-1)` raise `ValueError`, and other libraries may
differ. The positive-floor / smoothing / declared-infinite-loss p=0 policy
and the log1p p≈1 scoping are preserved.

## Revisions

- rev3: day-17-act-04; day-18-act-02/03/04; day-19-act-03; day-27-act-01;
  day-28-act-03.
- rev1→rev2: day-28-act-04 (first content change).
- Ledger `day-28.recovery_links`: `['day-21']` → `['day-26']`.
- All other activities/revisions untouched; IDs, policies, 4×120 minutes,
  quiz-absence unchanged.

## Evidence

- `node tests/unit/test_math_repairs_16_28.cjs` — **485 assertions PASS**
  (up from 355): now recomputes the displayed/unrounded quotients, the
  1e-5/1e-8 oracle-dependent errors, the exact rational counterexample
  (BigInt), the |x| quotients, the worked x³ example, and the SE values.
- `test_study_days_16_18`, `19_21`, `25_27`, `28_30`: PASS.
- `test_acceptance_repairs` 28,154 PASS; `test_candidate_regression` PASS;
  `test_calendar_ledger` PASS; `git diff --check` clean.

## Limits

- Numerical witnesses are float64 (Node 26) on this host; CPython-double
  probes match to the shown precision. `ValueError` asserted; exact message
  text is platform-dependent and not claimed.
- Localization is structural/semantic-parity review, not native-speaker
  certification. No live-agent, provider, or learner-performance evidence.
