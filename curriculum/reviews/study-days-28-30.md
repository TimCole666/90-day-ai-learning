# Study Days 28–30 review record

**Review revision:** 2026.10.30-rev1
**Scope:** `day-28`, `day-29`, and `day-30`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.
**Evidence:** `tests/unit/test_study_days_28_30.cjs`, `tests/browser/test_study_days_28_30.cjs`, `scripts/audit_calendar_ledger.py`, `tests/unit/test_source_rights.cjs`, and manual re-derivation of every worked number.

## Per-lesson findings

### Lesson 28 — statistics: summaries, standard error, inference

- The four activities total 480 active minutes, and `is_review_day` is honored by a retrieval/checkpoint final activity that also carries recovery link `day-21`.
- Worked numbers were re-derived by execution: for `[2,4,4,4,5,5,7,9]` the mean is 5.0, median 4.5, Σ(x−μ)² = 32, population variance 4.0, population std 2.0, sample variance 32/7 ≈ 4.571 (sample std ≈ 2.138). The comparison dataset `[4,5,5,5,5,5,5,6]` shares the mean 5.0 with population variance 0.25 and std 0.5, demonstrating that the mean alone hides spread.
- Standard-error claims were verified: σ/√n gives 0.5 at n = 16 and 0.25 at n = 64 (σ = 2); √(0.25/n) gives 0.25, 0.05, 0.025 at n = 4, 100, 400, halving per 4× sample increase.
- The misleading-single-result counterexample was computed exactly: P(X ≥ 7 heads in 10 fair flips) = 176/1024 ≈ 0.1719 via `math.comb`, so a 7/10 observation is a toy observation, not a statistical claim. The two-model 16/20 vs 18/20 example discloses a ±2-count swing within noise (per-model SE ≈ 0.08–0.11).
- The independent checkpoint asks for `data3 = [1,3,3,5]`: mean 3.0, median 3.0, SS = 8, population variance 2.0, std √2 ≈ 1.414, sample variance 8/3 ≈ 2.667, std ≈ 1.633; solving √(0.25/n) = 0.05 yields n = 100.

### Lesson 29 — evaluation methodology

- The four activities total 480 active minutes and separate training from evaluation: 1,000 examples split 600/200/200; the assessment day scenario uses 800 examples split 480/160/160 with an 80/20 class ratio and majority baseline 0.80.
- Leakage teaching names three mechanisms with fixes: preprocessing fitted on all rows before splitting (fix: fit on the training split only), duplicated rows crossing the split (fix: deduplicate), and label-derived features (fix: drop). The lesson requires reporting the honest lower number, not the inflated 0.92 against a 0.90 baseline (real lift 0.02).
- Metric numbers were verified: −ln 0.9 = 0.105, −ln 0.5 = 0.693, −ln 0.1 = 2.303; for probabilities [0.9,0.8,0.7,0.6], mean NLL ≈ 0.2990 and perplexity = e^0.2990 ≈ 1.35 (base-2 gives the identical value); uniform over 4 options gives perplexity 4, constant p = 0.5 gives perplexity 2, and the floor is 1.0.
- Distribution shift is presented as a new evaluation of a new distribution (daytime vs night photos), explicitly distinguished from a model defect, with the same follow-up check — a matched-distribution held-out set.
- The assessment requires a written protocol (splits, baseline, two metrics, three leakage checks, single test read) and an honest negative-result sentence, satisfying the ticket's "fix comparisons before tuning" requirement.

### Lesson 30 — optimization and failure modes

- The four activities total 480 active minutes. Every iterate was re-derived by execution on `f(x) = x²`, `x₀ = 4`, where `x_k = 4·(1−2η)^k`.
- Convergent case η = 0.1: x₁ = 3.2, x₂ = 2.56, x₃ = 2.048, x₁₀ ≈ 0.4295. Exact case η = 0.5: factor 0, one-step convergence. Boundary η = 1.0: factor −1, permanent ±4 oscillation.
- Divergence counterexample η = 1.2: factor −1.4, x₁ = −5.6, x₂ = 7.84, x₃ = −10.976, |x₁₀| ≈ 115.70 — a rising-loss failure mode, not an anomaly. Slow-crawl η = 0.01: factor 0.98, x₁₀ ≈ 3.268 — converging but a practical failure.
- The general bound was derived: for `f(x) = (a/2)x²` the factor is (1 − ηa) and |1 − ηa| < 1 ⇔ 0 < η < 2/a; for `x²`, a = 2 gives η < 1.
- Saddle analysis on `f(x,y) = x² − y²` was verified numerically: `∇f(0,0) = 0` but `f(0,ε) = −ε² < 0`; with η = 0.1 a run from `(0.5, 0)` reaches `(≈0.0537, 0)` — GD terminates at a saddle — while `y₀ = 0.001` escapes (y₁₀ ≈ 0.0062, f < 0 by k = 20).
- The independent assessment transfers to `g(x) = 2x²`: factor (1 − 4η), so x_k = 2·(1−4η)^k; η = 0.3 gives factor −0.2 and iterates −0.4, 0.08, −0.016 (convergent oscillation), with stability bound η < 0.5.
- Failure analysis is taught without fabricated success: the rising trace 2.0 → 6.8 is reported as an η-too-large hypothesis with a halve-and-rerun fix; no improvement is claimed until observed.

## Language-edition review

All four editions use the same stable activity IDs (`day-28-act-01` … `day-30-act-04`), identical numbers, formulas, and code tokens (`f(x) = x²`, `η`, `x₁₀`, `math.comb`, `2¹⁰`, `√(0.25/n)`), and equivalent objectives, exercises, hints, reference answers, and mastery criteria. Prose is localized; mathematics is not translated. Required localized terms were checked per activity: statistics (统计/統計/統計), evaluation (评估/評估/評価), optimization (优化/優化/最適化). This deterministic review checks structural equivalence; it does not claim native-speaker certification.

## Source and rights review

Each activity carries two full source-resource objects: NIST/SEMATECH e-Handbook (public domain U.S. government work) and OpenIntro Statistics 4e (CC BY-SA 3.0, share-alike declared) for Lesson 28; Dive into Deep Learning (CC BY-NC-SA 4.0, noncommercial and share-alike declared) and Google Machine Learning Crash Course (CC BY 4.0) for Lesson 29; d2l.ai's Optimization Algorithms chapter and 3Blue1Brown "Gradient Descent" (CC BY-NC-SA 4.0) for Lesson 30. Every source is `linking`-category only — no text, video, or transcript is imported — and each embeds at least two `compared_candidates` (Seeing Theory, Stat 110, Goodfellow Deep Learning, fast.ai, Boyd's Convex Optimization, scikit-learn docs) with selection rationales. The same five sources are registered in `curriculum/sources/registry.json` with full rights fields. A statistical claim and a toy observation are kept distinct throughout, and no video subtitle material is used.

## Execution and acceptance limits

Structural tests validate 480-minute accounting, four-language parity, stable IDs, required localized terminology, source validation for the new days, and that `lessons/` is untouched. The browser test visits all twelve localized Day 28–30 routes and checks the activity-card count, header, text depth, and language switcher. All worked numbers were re-derived by execution during authoring. These checks do not prove learner mastery, live statistical power, or human translation review.
