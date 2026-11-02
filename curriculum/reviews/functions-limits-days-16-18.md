# Study Days 16–18 review record: functions, limits, and derivatives

**Review revision:** 2026.10.30-rev1
**Scope:** `day-16`, `day-17`, and `day-18`; English, Japanese, Simplified Chinese, and Traditional Chinese editions.
**Evidence:** `tests/unit/test_study_days_16_18.cjs`, `tests/projects/test_functions_limits_study_days.py`, `tests/browser/test_study_days_16_18.cjs`, `scripts/audit_calendar_ledger.py`, and the numerical calculations recorded below.

## Time and learning-flow review

- Each day has four activities of 120 active minutes, totaling exactly 480 minutes. The sequence is explanation/derivation, independent practice, numerical or counterexample practice, and retrieval plus an Independent Mastery Check.
- Day 16 moves from function domain/range to secant slope and then to a removable-hole limit. The bridge calculation for `p(x)=x²` at `x=3` gives `(p(3+h)-p(3))/h = 6+h`, hence limit 6.
- Day 17 derives the limit definition at `x=3`, applies polynomial rules with domain assumptions, and uses `|x|` at zero as a genuine nondifferentiable counterexample: the left quotient is -1 and the right quotient is +1.
- Day 18 compares forward, backward, and central differences; the `x²` example at `x=3,h=.1` gives 6.1, 5.9, and 6.0. It explicitly treats finite differences as approximations and verification evidence, not exact proof.
- F6 update (2026-11-01, revision `2026.11.01-rev3`): the shared boilerplate instruction ("State assumptions, predict before calculating...") was removed. Every activity now has its own numbered steps and a closing time plan that splits its 120 minutes into reading, exercise and check, with the same split in all four editions. Days 16 and 17 also received full worked answers. The 120-minute blocks themselves were kept by owner decision; see the sixth pass in `.scratch/90-day-ai-learning/acceptance-review.md`.

## Numerical derivation review

- Independent Python evaluation for central differences of `sin(1)` produced approximately: `h=.1 -> .5394022522`, `1e-3 -> .5403022158`, `1e-5 -> .5403023059`, `1e-8 -> .5403023084`, and `1e-12 -> .5402900349`; the analytical reference is `cos(1)=.5403023059`.
- The observed trend supports a balanced step-size policy: truncation error decreases initially, while cancellation and floating-point roundoff eventually dominate. The smallest tested step is not the best.
- For the independent cancellation example `sqrt(1+h)-sqrt(1)`, the forward estimates are about `.5` at `1e-8`, `.50004445` at `1e-12`, and `0.0` at `1e-16`; the last value demonstrates loss of distinguishable significance, not a zero derivative.

## Four-language translation review

- All four editions retain the same four activity IDs and required fields: objective, step-by-step instructions, exercise, hint, answer, source recovery, and mastery criterion.
- Equations, constants, assumptions (`h != 0`, one-sided limits, domain restrictions), expected outputs, and Independent Mastery boundaries were checked for equivalence. Executable identifiers and source URLs remain unchanged.
- Japanese, Simplified Chinese, and Traditional Chinese localize navigation, titles, policy labels, instructions, answers, and recovery guidance; they are not represented as an English-only placeholder or as an unauthorized full-text translation of a source.
- The browser test visits all 12 routes at mobile and desktop widths, checks four activity cards, localized titles, source cards, and no horizontal overflow. This is deterministic presentation evidence, not native-speaker certification.

## Source and rights review

- OpenStax Calculus Volume 1 (CC BY 4.0) is linked by section for functions, limits, and derivative rules. MIT OCW 18.01SC (CC BY-NC-SA 4.0), SciPy derivative documentation (BSD-3-Clause), and a rights-restricted Paul's Online Math Notes page were compared and their rights/selection decisions are recorded in `curriculum/sources/registry.json`.
- Only links, attribution metadata, and independently authored derivations are included. No textbook prose, transcript, or full-text translation is imported. The activity derivations and pure-Python numerical tables are the safe offline recovery path.

## Review limits

This record covers structural integrity, worked arithmetic, finite-difference behavior, language-field equivalence, source provenance, and local browser presentation. It does not claim native-speaker certification, external source availability, or independent learner performance; those require separate evidence.
