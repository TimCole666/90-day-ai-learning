# Acceptance repair pass record: metadata, agent track, shared practice, source quality

**Scope:** repairs to the 90-day four-language curriculum candidate on `integration/90-day-ai-learning`, including a second pass after independent re-verification. This record documents only corrections proven by current local tests and artifacts. It does not claim Course Readiness, live readiness, live OAuth, paid tool verification, cloud training, or deployment.

## Verified repairs

### 1. Activity revision metadata

- All 360 ledger activities in `curriculum/days/day-*.json` now carry `content_revision` matching the existing `YYYY.MM.DD-revN` convention (`2026.10.30-rev1` / `2026.10.30-rev2`). 263 activities were missing the field; the server defaults absent revisions to `1.0.0`, which would have defeated stale-quiz rejection.
- **Migration caveat:** adding `content_revision` to previously unversioned activities changes what the server compares against stored learner quiz submissions and evidence records. Any submission recorded before this pass used the implicit `1.0.0` default; those records may now compare as stale against `2026.10.30-rev*` content. That is the intended stale-detection behavior for changed content, but it also means pre-existing learner evidence was effectively re-baselined by this migration — a data-migration risk, not a fabricated-history claim. Revisions describe content states; they do not backdate authoring events.
- Proven by `tests/unit/test_acceptance_repairs.cjs` section 1 (360/360 match the revision pattern).

### 2. Localized assistance labels

- All 1,440 localized activity editions carry `assistance_policy_label`. 563 were missing; labels were derived from each ledger activity's `assistance_policy`.
- Pre-existing labels with different wording were kept when semantically consistent (conditional-assistance phrasing is valid under `agent_assisted`).
- 20 stale labels contradicted the ledger: `day-46-act-02`, `day-47-act-02`, `day-52-act-02`, `day-53-act-02`, `day-54-act-03` were labeled "Independent Mastery Check" in all four editions while the ledger records `agent_assisted` (matching the block's three-agent-assisted-plus-one-mastery design; `day-48-act-02` confirms the intended label family). Replaced with the block's own consistent wording.
- Proven by `test_acceptance_repairs.cjs` section 2 (non-empty + non-contradiction invariants over 1,440 editions).

### 3. Agent Tool Track four-language correctness

- Removed Japanese text contaminating the Simplified and Traditional Chinese Pi Agent track descriptions.
- Rewrote the DeepSeek Harness entries in all four editions to match `curriculum/agent-tracks/registry.json`: pinned package `@deepseek-ai/dsh 0.1.1-preview`, explicit provider/model recorded at run time, preview/version sensitivity noted, no OS-sandbox or network-isolation guarantees claimed.
- Proven by `test_acceptance_repairs.cjs` section 3 (kana scan, exact pin, forbidden-claim patterns, `verification_state != verified`).

### 4. Shared Agent/Vibe Coding curriculum

- `shared_exercise` in `curriculum/content/agent-track/{en,ja,zh-Hans,zh-Hant}.json` expanded from a single seven-step scenario to the retained seven-step method plus 13 assessed modules `agent-shared-skill-01` … `agent-shared-skill-13`, identical IDs and structure across all four Language Editions.
- Coverage: task framing and acceptance criteria; repository exploration, plans and checkpoints; context management; least-privilege tool selection grounded in official docs (version sensitivity noted); prompt-injection/untrusted-content handling; secrets and privacy with exposure assessment; dependency and supply-chain review; the implement-verify-commit loop; independent verification (tests, types, lint, build, UI); diff review; non-destructive rollback; human approvals; and the reusable skill-authoring lifecycle (scope/trust review, SKILL.md description/trigger/instructions, least privilege, test and adversarial prompts, versioning/review/maintenance/retirement).
- `server.cjs` renders the modules and the new references section; `curriculum/assets/style.css` styles the cards.
- **Correction after scratch-repo verification (pass 2):** skill-02's reference answer previously advised `git commit -am 'baseline before fix'` on a clean tree, which fails with "nothing to commit"; it now instructs `git status --porcelain` then records `git rev-parse HEAD` as baseline on a clean tree, stashing/committing only when dirty — in all four editions (answer and hint). Skill-11's answer previously implied `git revert` of an older commit always preserves a later fix; it now states the revert may conflict when the later commit touched the same lines, with `git revert --continue` / `--abort` and per-file `git restore --source=cafe123^` recovery paths — in all four editions.
- **Module provenance (pass 2):** the 13 modules are original curriculum content; the spec asks to "integrate all confirmed Vibe Coding Practice skills", which requires traceable grounding rather than imported skill files. Added `shared_exercise.references` — six curated, link-only official sources (Claude Code permissions/settings docs, Anthropic agentic-coding best practices, OpenAI Codex sandbox docs, OWASP LLM01 prompt-injection standard, DeepSeek Harness repository, Claude Agent Skills/SKILL.md docs). Each records official URL, source type, observed date (2026-10-30), scope, rights/link-only status, selection rationale, and an evidence boundary separating documented facts from this curriculum's original adaptation. No third-party SKILL.md or documentation text is copied, and no live tool verification is claimed.
- Proven by `test_acceptance_repairs.cjs` section 4 (exact module IDs, field completeness, per-language semantic anchors, reference parity) and section 5 (scenario semantics).

### 5. Security answer

- The capstone scenario and skill-06 answer require exposure assessment (uncommitted file vs committed vs transmitted) before response; revoke/rotate at the provider is required when the credential may have left the control boundary, while local-only exposure requires deletion plus history/artifact scanning.
- Dependency review requires provenance and lockfile checks; the README "maintenance note" is classified as prompt injection; recovery uses `git diff` snapshot, per-file `git restore`, and `git revert` — destructive reset/clean commands appear only inside prohibition language.
- Embedded sample code (credential-line scanner, dependency-delta checker) executes offline and prints PASS.
- Proven by `test_acceptance_repairs.cjs` section 5, which extracts and runs the embedded Python blocks from a private `mkdtempSync` directory with `finally` cleanup.

### 6. Source quality and rights

- Removed superlative claims ("Peerless", "Gold standard", "globally recognized", "Top-tier") from `selection_rationale`/`comparison_rationale` in 19 day ledgers, `curriculum/content/day-01/en.json`, and `curriculum/sources/registry.json`, replacing them with bounded, verifiable descriptions. The paper title "PEFT: State-of-the-art Parameter-Efficient Fine-Tuning Methods" is a proper name and was left unchanged.
- Added `selection_process` to `curriculum/sources/registry.json`: a seven-criterion rubric (subject fit, prerequisites, exercises, accuracy, provenance, version/date, rights) and a five-step selection process.
- **Honesty caveat:** the rubric documents the process by which sources were selected; it does not retroactively prove that all 138+ registry records (and the ~815 source references across day files) were individually re-ranked under it during this pass. The superlative scan is a proven, tested invariant; individual source quality judgments remain as authored and are not re-certified here.
- No transcript text was imported or redistributed; video/subtitle sources remain `reuse_category: linking` with rights recorded per source.
- Proven by `test_acceptance_repairs.cjs` section 6 (superlative scan, rubric completeness, `reuse_category` enforcement on video/lecture sources, positive transcript-import claim detection).

### 7. Stub reference answers repaired (pass 2)

- Nine placeholder answers containing a bare Python `pass` were replaced with complete reference implementations semantically aligned to the other editions: `day-59-act-04` (en + ja TelemetryMonitor with NaN detection and MFU), and ja `day-55-act-04` (CheckpointManager), `day-56-act-04` (ResourcePlanner), `day-64-act-04` (LoRALinear), `day-65-act-03` (count_target_params), `day-66-act-03` (save_adapter), `day-67-act-04` (FinetunePreflightValidator), `day-68-act-04` (FinetuneWatchdog).
- All nine compile; the TelemetryMonitor reference executes correctly (MFU ≈ 0.94 on an A100-class peak, NaN alert fires).
- A full-content scan for other stub patterns (empty/TODO/placeholder/very short answers) found only semantically aligned short answers, not stubs.
- **Residual human-quality limit (honest bound):** structural tests verify presence, parity, compilability, and concept coverage; they cannot certify that all 1,440 × 7 activity fields are pedagogically optimal prose. Translation quality and exercise difficulty calibration remain human-review concerns.

### 8. Acceptance tests hardened (pass 2)

- `tests/unit/test_acceptance_repairs.cjs` now: compares quiz question ids **and** `expected_answer` keys over the union of HEAD and current activity ids in both directions; runs embedded samples in a private `mkdtempSync` directory with `finally` cleanup; validates `reuse_category === 'linking'` on video/lecture/course/YouTube sources and detects positive transcript-import claims; checks reference parity (identical ids/urls across editions, required fields, link-only rights wording, documented-vs-adaptation evidence boundary).

## Verification results

**Local offline suite (this pass):**
- `node tests/unit/test_acceptance_repairs.cjs` — PASS (28,155 assertions).
- All 43 `tests/unit/*.cjs` — PASS, including `test_candidate_regression.cjs` (90 days, 43,200 minutes, 4 editions, 4 tracks, 30 review records).
- `python -m unittest discover tests/projects` — 71 tests PASS; `tests/unit` Python — 42 tests PASS (`.venv`).
- `git diff --check` — clean; `node --check server.cjs` — OK; localhost render smoke test shows all 13 modules in all 4 languages.
- All 41 `tests/browser/*.cjs` suites — PASS, re-run locally with `NODE_PATH=/home/tiancaijb/.npm-global/lib/node_modules` (Playwright IS available at that NODE_PATH; an earlier revision of this record incorrectly said it was unavailable).

**Independent verifier (reported):**
- Independently confirmed the same 41 browser suites pass, and clicked hint/answer toggles on all 13 skill modules in all four languages.

## Remaining authorized blockers (unchanged, not claimed as complete)

- Live OAuth, live agent/tool runs, paid provider calls, cloud GPU training, VPS preview, and deployment remain pending authorized credentials and are outside this repair scope. Local test/render evidence must not be conflated with live readiness.
- `scripts/audit_curriculum.py` reports legacy `lessons/`↔`lab/` findings because the legacy lab submodule is uninitialized; pre-existing and out of scope.
- `archive/cs336-legacy/cs336-lectures` submodule was not touched.
- Residual human-quality limits are recorded in section 7: structural parity and compilability are proven; per-activity prose quality is bounded by human review.
