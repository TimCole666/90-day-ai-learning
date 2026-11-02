# Study Days 31–33 review record: automatic differentiation project

**Review revision:** 2026.10.30-rev1
**Scope:** `day-31`, `day-32`, and `day-33`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.
**Evidence:** `tests/projects/test_autograd_study_days.py`, `tests/projects/test_autograd_cli.py`, `tests/browser/test_autograd_study_days.cjs`, `scripts/audit_calendar_ledger.py`, and the public commands under `projects/autograd/`.

## Per-Lesson mathematical review findings

### Lesson 31 — forward graphs and the chain rule

- The four activities total 480 active minutes and progress from forward scalar nodes to local derivatives, a neuron backward trace, and an AI-free derivation check.
- The worked graph `f(x,y) = (xy + 2)^2` evaluates to `u=-3`, `v=-1`, `f=1`, with reference gradients `df/dx=4` and `df/dy=-3`.
- The neuron preset is checked against `tanh(n)`, including `d(tanh(n))/dn = 1 - tanh(n)^2` and the reported `x1=-1.5`, `w1=1.0` gradients.
- The implementation uses local chain-rule closures and the supported operator table in `projects/autograd/docs/guide.*.md`; no third-party autodiff package is used.

### Lesson 32 — topology, accumulation, and numerical evidence

- The four activities total 480 active minutes and cover post-order DFS, shared-node accumulation, central differences, tolerances, and an independent verification check.
- For `f=(a+b)a` at `(3,4)`, the reference derivative `df/da=10` is decomposed into the direct contribution `7` and the shared-node contribution `3`; `df/db=3`.
- The gradcheck uses central differences with explicit `h`, `rtol`, and `atol`; the complex preset passes, while ReLU at zero is disclosed as a nondifferentiable kink rather than treated as an implementation failure.
- The learner-facing answer explains why `+=` is required and why a single absolute tolerance is not a universal policy.

### Lesson 33 — failure diagnosis, repeated backward, and project mastery

- The four activities total 480 active minutes and separate assisted diagnosis from an AI-free implementation, derivation, and numerical-verification check.
- The overwrite diagnostic intentionally runs a defective engine on the shared-node MRE `f=(a+b)a`, compares its analytical result with an independent finite difference, and reports the pinpointed node, error, cause, and fix. The observed defective result is traversal-dependent in a set-backed pedagogical graph; the command output is the authoritative captured result, not a claimed correct gradient.
- Repeated backward calls intentionally accumulate leaf gradients until `zero_grad()` is used; `backward_multiple` demonstrates vector-Jacobian product seeds for multiple outputs.
- The lesson explicitly limits the scalar Python engine: it is an educational project, not evidence that a 7B model can be pretrained with per-scalar Python objects.

## Four-language translation review findings

For every target day and each language (`en`, `zh-Hans`, `zh-Hant`, `ja`):

- The edition contains the same four activity IDs, the same activity field set (`title`, `prerequisites`, `objective`, `instructions`, `exercise_prompt`, `hint`, `answer`, and `mastery_criterion`), and the same final quiz shape.
- Numeric constants, equations, CLI commands, code identifiers, tolerance values, assistance-policy distinctions, and mastery boundaries were checked against the English source. Code/API names remain unchanged where they are executable identifiers.
- Navigation, prompts, hints, reference answers, quiz explanations, policy labels, and fallback/source labels are localized rather than represented by an English-only placeholder. Traditional Chinese is a separately authored edition, not a character-conversion claim.
- The browser seam visits all 12 language/day routes at desktop width and the target routes at mobile width, checks all four activity cards, hint/answer disclosure, language-link preservation, and the CLI reference. This is deterministic presentation evidence, not native-speaker certification.

## Source and rights review

The day ledgers retain attribution, original URLs, verification dates, selection rationale, license/restriction notes, permission basis, availability limitations, and safe local fallbacks. The curriculum links to MIT micrograd/CS336/PyTorch and cites the SIAM text without importing restricted prose or transcripts. The local authored guide and project commands remain usable when external pages or media are unavailable.

## Review limits

This record documents mathematical consistency, structural four-language equivalence, deterministic project execution, and browser presentation checks. It does not claim live OAuth, cloud-GPU execution, production deployment, or independent native-speaker review. Those remain outside this ticket's local evidence boundary.
