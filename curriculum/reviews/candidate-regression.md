# Candidate Regression Report: Complete Four-Language Curriculum Candidate

**Ticket:** 55 — Verify the Complete Four-Language Curriculum Candidate
**Candidate revision:** `7c3347a` (tip of `integration/90-day-ai-learning`), audited
on branch `feature/ticket-55`; the only changes added by this ticket are this
report, `tests/unit/test_candidate_regression.cjs`, and the ticket record.
**Audit date:** 2026-10-30. Node v26.12.0, Python 3.14.8, Playwright/Chromium
via `NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules`, torch-enabled
interpreter `/home/tiancaijb/projects/learn/.venv/bin/python` where noted.
**Scope:** regression/verification only. No curriculum content was authored.
The 30 existing per-Lesson review records are aggregated, not replaced.
**Gate status:** this report does **not** declare the Course Readiness Gate
passed. That aggregation belongs to ticket 61.

## Commands executed and results

| Command | Result |
|---|---|
| `python3 scripts/audit_calendar_ledger.py` | **PASS** — 90 days, 43,200 min, DAG valid, no cycles, no dangling refs, all review records present |
| `python3 scripts/audit_curriculum.py` | **FAIL — 257 errors** — all pre-existing legacy `lessons/`↔`lab/` broken links and missing lab modules; the legacy lab submodule is uninitialized. Recorded, not fixed (out of scope). |
| `node tests/unit/*.cjs` (17 files) | **15 PASS, 2 FAIL** — failures are `test_calendar_ledger.cjs` and `test_source_rights.cjs` (details below) |
| `python3 tests/unit/*.py` (4 files) | autograd 14 OK; cloud_evidence 4 OK; lora/pretrain skipped under system python (no torch); with `.venv` python: pretrain 14 OK, lora 10 OK |
| `PYTHONPATH=. python3 tests/projects/*.py` (13 files) | **12 PASS, 1 env-dependent** — `test_lora_evidence.py` errors under system python (no torch), **4 OK under `.venv`**; `test_lora_cli.py` skipped under system python, **3 OK under `.venv`** |
| `python3 tests/engineering/test_ci_practice.py` | **PASS** — 7 tests |
| `node tests/packaging/test_package.cjs` | **PASS** — release package, clean-dir unpack/serve, backup/restore, rollback |
| `node tests/browser/*.cjs` (44 files) | **42 PASS, 2 FAIL** — failures are `test_day01.cjs` and `test_quiz_and_mastery.cjs` (details below) |
| `node tests/unit/test_candidate_regression.cjs` (new) | **FAIL on one strict claim** — all ledger/edition/track/review invariants verified; the final quiz-parity assertion records 6 real gaps (details below) |
| `git diff --check` | **clean** |

## Claims: PASSED

- **Candidate identity.** Exact audited revision `7c3347a`; candidate artifacts
  are `curriculum/days/day-01..day-90.json`, `curriculum/content/day-*/{en,ja,zh-Hans,zh-Hant}.json`,
  `curriculum/manifest.json`, `curriculum/agent-tracks/registry.json`,
  `curriculum/reviews/study-days-*.md`.
- **Ledger integrity.** Exactly 90 Study Days; every day declares
  `active_minutes: 480` and its activities sum to exactly 480; total 43,200
  minutes = 720 hours. Verified by `audit_calendar_ledger.py` and re-verified at
  the test seam by `test_candidate_regression.cjs`. Review, assessment, and
  project activity types all count inside the 480; no optional-activity type
  exists, so optional work cannot double-count into the total.
- **Category budget.** Activity minutes reconcile exactly to the manifest
  budget: self-directed/Python 10,800; mathematics 8,640; models/training
  17,280; agents 6,480 (1080h/144h/288h/108h ratio preserved).
- **Prerequisite DAG.** All `day-NN` prerequisite and `recovery_link`
  references resolve to existing earlier-numbered days; audit confirms no
  cycles and no dangling references. Free-text entry prerequisites coexist with
  structural refs by design.
- **Identity and references.** 360 unique required activities (no reused
  activity IDs); every `lesson_id` resolves to a manifest lesson; every
  manifest lesson is exercised by ≥1 activity; lesson status is consistent
  with its days' status.
- **Status discipline.** 88 days `available`; exactly `day-02`/`day-03` remain
  `planned` — the audit design (`REQUIRED_AVAILABLE_DAYS` excludes 02-03) and
  their `planned` status is required by `audit_calendar_ledger.py`, not an
  oversight. Activity status always matches day status.
- **Four-edition structure.** All 90 days × {en, ja, zh-Hans, zh-Hant} = 360
  edition files present; `language` tags match; activity-ID keysets match the
  ledger exactly in every edition; all required learner-facing fields
  (`title, objective, instructions, exercise_prompt, hint, answer,
  mastery_criterion`, `prerequisites` key) are non-empty in all 360×4
  activities. Shared pages (agent-track, calendar, diagnostics) exist in all
  four editions.
- **Agent Tool Tracks.** Registry carries exactly the four tracks
  (`claude-code`, `codex`, `pi-agent`, `deepseek-harness`) with version,
  verification state/date, access, cost, and execution-boundary fields.
  Track unit/project tests pass (`test_agent_track.cjs`,
  `test_claude_code_track.py`, `test_codex_cli.py`, `test_pi_agent_track.py`,
  `test_deepseek_harness_track.py`, `test_deepseek_harness_curriculum.py`)
  and browser flows for track selection/switching pass
  (`test_agent_track.cjs`, `test_pi_agent_track.cjs`).
- **Browser seam: reading and navigation.** 42/44 browser suites pass: all
  30 per-block Study Day routes render 4 activity cards, day header, 4
  language links, and source cards at mobile viewport; calendar navigation,
  language switching preserving the same unit, root→default-language
  redirect, graceful degradation when external media fails, and legacy
  roadmap link are exercised.
- **Private-record flows (simulated-provider seam).** Pass at both DB/API and
  browser layers: auth+progress with two-user isolation
  (`test_db_and_auth.cjs`, `test_auth_and_progress.cjs`), diagnostics and
  review plans with fresh-session recovery and language switching
  (`test_diagnostics_*.cjs`), portable export with failure feedback
  (`test_export_api.cjs`, `test_export.cjs`), deliberate deletion
  (`test_learning_record_deletion_*.cjs`), project submissions with
  revision-stale detection, oversized-payload rejection, and no server-side
  link fetching (`test_project_submission_*.cjs`), and quiz
  attempts/mastery separation (`test_quiz_api/db.cjs`). Self-reported
  completion cannot mint verified evidence; pasted logs cannot mint verified
  evidence; content revision marks prior results stale.
- **Learning Project seam (process-isolated).** text_tools (10), agent_learning
  deterministic adapter incl. live-eval contract validators (6+8), autograd
  engine (14 unit + 9 CLI + 6 study-day), functions/limits (6), pretrain
  (14 under `.venv`), LoRA model/CLI/evidence-contract (10+3+4 under
  `.venv`), engineering CI practice (7), packaging/rollback (5 stages) — all
  pass. Deterministic fixtures are labelled as such; they are not live
  evidence.
- **Legacy preservation.** `lessons/` tree untouched; a green legacy surface
  remains regression evidence only. `git diff --check` clean; no files added
  under `lessons/`, `.pi/`, or `archive/`.
- **Per-Lesson review coverage.** 30 review records cover days 1-90 with no
  day double-covered and no day uncovered (asserted by
  `test_candidate_regression.cjs`, mirroring the audit's `REVIEW_RECORDS`).

## Claims: FAILED

- **`node tests/unit/test_source_rights.cjs` — FAIL (pre-existing).**
  Registry entries with <2 `compared_candidates`
  (`py-docs-exceptions`, `py-docs-pathlib`, `py-tutorial-errors`,
  `py-tutorial-venv`, `py-docs-unittest`, `py-docs-tempfile`,
  `scipy-derivative`, `3blue1brown-gradient-descent`, `py-docs-math`, plus
  day-04's `py-docs-builtins-ticket26`/`git-scm-book-diffs`, etc.) and entries
  whose licenses contain noncommercial/share-alike conditions without
  explicit `license_restrictions` (`anthropic-tool-use-docs`,
  `openai-function-calling-guide`, `google-sre-postmortem-culture`,
  `stripe-idempotent-apis`, `aws-exponential-backoff-jitter`,
  `git-scm-book-diffs`). Measured scope: only **521 of 650**
  activity source objects carry `compared_candidates` — a candidate-wide
  provenance gap, not just test noise. Sources themselves are well-formed
  (10 required fields + valid `reuse_category` verified for all 650).
- **`node tests/unit/test_calendar_ledger.cjs` — FAIL (stale contract,
  pre-existing).** Asserts every post-Day-01 day must be `planned`; the
  published ledger has 88 `available` days. The test encodes the old
  "nothing may appear ready" gate; Python audit encodes the current design.
  Same class of stale contract noted by ticket 54.
- **`node tests/browser/test_day01.cjs` — FAIL (stale contract,
  pre-existing).** Steps 1-4 pass; step 5 asserts the day-01 page still
  declares a "development slice" notice, but `dev_slice_notice` now truthfully
  reads "Complete local curriculum content for Study Days 01–03…". Test drift
  after the days 01-03 content ticket landed.
- **`node tests/browser/test_quiz_and_mastery.cjs` — FAIL (real locator
  defect, pre-existing).** Bob's checkbox flow: `#day-01-act-01
  .badge-self-reported` resolves to **two** elements — the quiz
  `.mastery-evidence-panel` badge ("Self-Reported Checkbox", server.cjs:643)
  and the project `.project-evidence-panel` badge ("Self-Reported Evidence",
  server.cjs:714) — strict-mode violation. Either the badge class is
  ambiguous in markup or the locator needs panel scoping. Steps 1-4
  (four-language quiz structure, independent + agent-assisted submission,
  imperfect-retry) pass before the failure.
- **`node tests/unit/test_candidate_regression.cjs` — FAIL on one real
  defect (new finding).** `day-35-act-04` and `day-36-act-04` declare a
  3-question quiz in the day ledger and ship it in `en`, but the `ja`,
  `zh-Hans`, and `zh-Hant` editions omit the quiz entirely — 6 missing
  localized quiz objects. Non-en learners lose that mastery check. The
  days 34-36 review record does not mention quizzes; this defect was not
  surfaced by per-block review. All other sections of the new test pass.
- **`python3 scripts/audit_curriculum.py` — FAIL, 257 errors
  (pre-existing, expected).** All errors are legacy `lessons/`↔`lab/`
  references (e.g., `py-13…` through `py-19…` broken `../lab/…` links and
  missing `lab/01_python_craftsmanship` modules); the nested lab submodule
  is uninitialized. Recorded as known debt; not fixed per ticket scope.
- **Per-activity source depth below later convention.** 56 activities
  carry <2 source objects (42 with one, 14 with zero): days 01, 02-03
  (`planned`), 07-15, and 31-33-act-04s. These blocks predate the ≥2-source
  convention used from day-04/16+ blocks onward; the per-day reviews
  acknowledged single-primary-source use but the candidate-level count
  shortfall is recorded here as a failed full-coverage claim.

## Claims: APPROVAL-BLOCKED

- **Cloud-GPU pretraining evidence (ticket 19).**
  `curriculum/projects/docs/pretrain-cloud-evidence/` contract exists;
  `run_status` = `blocked-awaiting-authorization`. No GPU run, runtime, or
  billing claim is made anywhere in the curriculum.
- **Real-model LoRA comparison run (ticket 21).**
  `projects/lora/evidence/comparison_contract.json` = `blocked-awaiting-
  authorization`, `authorization.approved: false`, USD 5.00 ceiling;
  `validate_contract.py` validators pass (shape only, explicitly not a run).
- **Live-model agent evaluation (ticket 23).**
  `projects/agent_learning/evidence/live_eval_contract.json` =
  `blocked-awaiting-authorization`; deterministic-v1 baseline bound by
  fixture hash; `live_value = null` semantics verified.
- **Agent Tool Track live verification.** All four tracks show
  `verification_state: "pending"` — CLI/docs/deterministic fixtures checked
  (claude-code 2.1.312 observed; codex 0.148.0 probes; pi v1.4.0 docs; dsh
  0.1.1-preview fixture exit 1→0), but no authorized provider credential or
  paid live run exists. Track acceptance remains blocked, honestly labelled.
- **Live Google/GitHub OAuth (tickets 58-59).** All OAuth evidence uses the
  substituted test provider at the Adapter seam (approved seam). Live
  provider credentials, redirect registration, cancellation/uptime, and the
  production deployment/VPS acceptance are not exercised — blocked pending
  authorization.

## Claims: UNTESTED

- **Legacy-progress import/migration.** No import path is offered
  (`localStorage` only backs drafts/legacy self-marks; `lib/db.cjs` contains
  only schema migrations). Nothing to test; legacy state remains honestly
  labelled self-reported historical data — verified indirectly via
  `test_quiz_db.cjs` self-report scoping.
- **Dedicated keyboard-traversal suite.** No test drives Tab-order/focus
  across controls; only semantic-control markup and a focus-preservation
  assertion in `test_day01.cjs` step 4 exist. Keyboard usability claim is
  untested as an end-to-end claim.
- **Real concurrent-session writes.** Optimistic-concurrency version
  conflict is covered at the DB seam (`test_db_and_auth.cjs` step 5); true
  parallel HTTP sessions racing one activity are not exercised.
- **Backup/restore of learner records in a deployed environment.** The
  packaging test exercises `scripts/backup.cjs`/`restore.cjs` against a
  disposable deployment; production-backup retention after deletion is
  documented but not exercised against a real host.
- **External source availability over time.** `original_url`s carry
  verification dates (2026-10-30) but live reachability of all 650 source
  URLs was not re-fetched in this pass; link checks are point-in-time.

## Claims: INCONCLUSIVE

- **`is_review_day` flag vs `manifest.weekly_review_days`.** Flags set on
  {7,14,21,28,35,42,48,49,54,63,70,77,84,89,90}; manifest lists
  {7,14,21,28,35,42,49,56,63,70,77,84,89,90}. Days 48/54 flag review
  without being weekly slots (they contain `review` activities inside
  lesson blocks); day 56 is the weekly slot but is an `assessment` day with
  `is_review_day: false`. Whether the flag means "weekly review slot" or
  "contains a review activity" is a semantic decision for the maintainer —
  recorded, not adjudicated.
  *Resolution (fix/review-issues):* adjudicated to "weekly review slot" —
  `is_review_day` must equal membership in `manifest.weekly_review_days`.
  Day 48/54 flags cleared, day 56 flag set, and the audit now errors on any
  flag/manifest drift.
- **Content-declared quizzes absent from the ledger.** Days 04-06 ship a
  quiz in all four editions' content for every activity while the day
  ledger carries no `quiz` field — the reverse asymmetry of the day-35/36
  defect. Learners still get the check, but ledger and content disagree on
  which activities are quizzed; severity depends on whether the ledger is
  normative for quiz delivery.
  *Resolution (fix/review-issues):* the ledger is normative for grading —
  `getActivityQuizDef` returned null so POST /api/quiz/submit 404'd. Ledger
  quiz definitions were added for all 12 activities, and the stub options
  were normalized to the lettered-key convention used by days 01/31+.
- **Substantive mathematical/translation correctness of early blocks.**
  The 30 review records document scoped correctness review (e.g.,
  re-derived answers in days 88-90), but early-block reviews
  (days 01-15) are primarily structural + terminology parity; none claim
  native-speaker certification. Aggregated verdict: structural equivalence
  verified, full substantive equivalence not uniformly established.

## Aggregation of existing per-Lesson reviews (not a replacement pass)

All 30 records under `curriculum/reviews/` were re-read. Common honest
limits they disclose (aggregated here once rather than repeated per day):

- Deterministic structural/browser checks validate shape, minutes, language
  parity, navigation, and disclosure — never learner mastery, live OAuth,
  paid tool access, cloud training, deployment, or native-speaker review.
- Days 82-90 reviews explicitly carry the ticket-19/21/23
  `blocked-awaiting-authorization` labels; numeric teaching claims are
  grounded in real artifacts (`run_artifact.json` 7,440-param smoke,
  `eval_results.json` loss_delta 0.0031 marked random-weight mechanics).
- The days 34-36 record does not discuss the quiz objects — consistent with
  the quiz-parity defect found above; no other unresolved substantive
  finding was discovered in the records beyond those listed under FAILED
  and BLOCKED.

## Honest summary

- **Verified at candidate scope:** the complete 90×480 ledger, DAG,
  identity/reference integrity, 4-edition structural parity, per-day review
  coverage, simulated-provider platform flows incl. isolation/export/
  deletion, process-isolated project regressions, packaging/rollback.
- **Failed claims:** source-rights registry gaps (129/650 sources without
  compared candidates, 5+ NC/SA undeclared), 2 stale test contracts, 2 real
  defects (quiz badge ambiguity; 6 missing localized quizzes day-35/36),
  257 legacy lab-link errors, sub-2-source depth in 56 activities.
- **Blocked:** cloud-GPU pretraining, real-model LoRA run, live-model agent
  eval, all four live tool runs, live OAuth, deployment — all awaiting
  owner authorization, all honestly labelled in the artifacts.
- **Not declared:** Course Readiness Gate. That aggregation is ticket 61.
