# Study Days 25–27 review record

**Review revision:** 2026.10.30-rev1
**Scope:** `day-25`, `day-26`, and `day-27` (mathematics track: probability, sampling, and information); English, Simplified Chinese, Traditional Chinese, and Japanese editions.

## Per-lesson findings

- Day 25 builds probability from counted outcomes: the 36 ordered pairs of two fair dice, conditioning by sample-space restriction, independence as a verified product identity, Bayes' rule with a total-probability denominator, and a seeded simulation separating empirical frequency (8/36 for sum-7 under `random.seed(25)`) from the guaranteed 1/6. The zero-count caveat is introduced explicitly.
- Day 26 defines discrete random variables and validates distribution tables; learners compute E[X], E[X²], Var(X)=E[X²]−E[X]² by hand (7/8, 15/8, 71/64 for the four-type table; 35/12 for a die; 0.1875 for Bernoulli(0.25)), sample 100 seeded die rolls (mean 3.47 vs 3.5, standard error ≈0.1708), and derive MLE for a Bernoulli coin (0.6) and a unigram corpus, where 'dog' exposes the zero-count failure and motivates add-1 smoothing.
- Day 27 measures surprisal in bits and nats, computes entropy by hand (1.75 bits for [0.5,0.25,0.125,0.125]; log2 6 ≈ 2.5850 for a die), then connects cross-entropy H(p,q)=2 bits and KL (0.25 bits vs uniform; asymmetric 0.0294/0.0290 for the skewed pair) to language-model loss: per-token −ln q, mean NLL 0.7675→perplexity 2.1544 and 1.3040→3.6840. Numerical stability (log(0), ε floors, log1p, smoothing) is required content, not an aside.
- The final activity on each day is an independent mastery check under the declared no-assistance condition; earlier activities require prediction before computation. No unattended runtime or break is counted.

## Numerical verification evidence

All hand-derived values were recomputed before publication: dice enumeration (6/36, 11/36, 3/18, 1/6, 3/36 vs 1/12), Bayes posterior 0.0099/0.0594 = 1/6 and 0.18/0.26 = 9/13, expectation/variance rows (7/8, 15/8, 71/64, 35/12, 0.1875, 1.9, 0.89), MLE (36/60, 3/9, Laplace 4/16 and 1/16), seeded draws (sum-7 count 8/36; 100-roll mean 3.47), surprisal/entropy tables (1,2,3,0.3219,3.3219 bits; 1.75 bits; 2.5850 bits), cross-entropy/KL (2, 0.25, 0.0294, 0.0290, 0.1536 bits), and perplexity (e^0.7675 ≈ 2.1544, e^1.3040 ≈ 3.6840, −ln 1e-9 ≈ 20.72).

## Language-edition review

All four editions use identical activity IDs, the same worked numbers, formulas, code commands, and mastery criteria, with terminology aligned across tracks (概率/機率/確率, 熵/熵/エントロピー, 交叉熵/交叉熵/交差エントロピー, 采样/採樣/サンプリング, 最大似然/最大概似/最尤推定, 奈特/奈特/ナット). Simplified and Traditional Chinese differ in script and regional terminology (e.g. 概率 vs 機率, 最大似然 vs 最大概似); Japanese keeps the technical register (カタカナ loanwords plus kanji terms). This deterministic review checks structural and numerical equivalence; it does not claim native-speaker certification.

## Source and rights review

Primary references: OpenStax Introductory Statistics 2e (CC BY 4.0) for Days 25–26 probability/sampling/discrete distributions; Stanford CS229 Review of Probability Theory (public course notes, linking only) as the ML-oriented bridge; MacKay Information Theory, Inference, and Learning Algorithms (Cambridge UP, authorized free PDF) and Cover & Thomas Elements of Information Theory (Wiley, linking only) for Day 27; PSF documentation for `random`/`math` used in the runnable experiments. All are linked, not reproduced; every worked example is original curriculum material with numbers verified locally. Compared candidates (MIT OCW 6.041/18.05, Khan Academy, Harvard Stat 110, Stone, Shannon 1948, d2l.ai, NumPy random) are recorded in `curriculum/sources/registry.json` with licenses and selection rationale.

## Execution and acceptance limits

Structural tests validate 480-minute accounting, content parity across four languages, stable IDs, localized probability/entropy/cross-entropy terminology, ≥2 source objects per activity, and no files under `lessons/`. Browser tests verify all four language routes render four activity cards. These checks do not prove learner mastery, live random behavior, or human translation review.
