# Curriculum Review: Study Days 79-81 (Deliver Engineering Work with an Agent)

## Scope & Purpose
Covers Days 79, 80, and 81 of the 90-Day AI Learning curriculum, reusing the merged
Ticket 22 bounded agent fixture (`projects/agent_learning`) and the Ticket 24
CI/delivery/rollback practice runner (`scripts/ci_practice_runner.py`):
- **Day 79**: Bounded requirement authoring with executable Given/When/Then acceptance criteria, independent task decomposition and minimal context-pack assembly, explicit permission boundaries and execution budgets (`max_steps=6`, `max_retries=2`, `tool_payload_bytes=4096`), the bounded agent run, and an evidence-backed acceptance verdict that does not trust the agent's own claims.
- **Day 80**: Line-by-line agent diff inspection against the six-point PR-style review checklist (spec alignment, test adequacy, no assertion tampering, compatibility, secrets scan, clean history), independent verification tests at the public seam, a deliberately failing agent change carried through CI RED diagnosis to a verified GREEN fix without touching assertions, and a defensible approve/reject merge decision.
- **Day 81**: Controlled delivery through clean-install packaging and versioned symlink releases, independent merge-conflict resolution and non-destructive recovery in a disposable repository, health-failure detection via observable exit codes, a verified rollback runbook restoring the known-good version, and the final auditable delivery report with limitations and the authorization boundary restated.

## Verification & Parity Across Language Editions
All four language editions (`en`, `ja`, `zh-Hans`, `zh-Hant`) were generated with authentic translations and verified:
- **Terminology Parity**:
  - English: `bounded requirement`, `acceptance criteria`, `context pack`, `permission`, `budget`, `trace`, `diff review`, `pull request`, `assertion tampering`, `merge conflict`, `rollback`, `health check`, `release evidence`.
  - Japanese: `境界付き要件`, `受入基準`, `コンテキストパック`, `権限`, `予算`, `トレース`, `差分レビュー`, `プルリクエスト`, `アサーション改竄`, `マージ競合`, `ロールバック`, `ヘルスチェック`, `リリース証跡`.
  - Simplified Chinese: `有界需求`, `验收标准`, `上下文包`, `权限`, `预算`, `追踪`, `差异审查`, `拉取请求评审`, `断言篡改`, `合并冲突`, `回滚`, `健康检查`, `发布证据`.
  - Traditional Chinese: `有界需求`, `驗收標準`, `脈絡套件`, `權限`, `預算`, `追蹤`, `差異審查`, `拉取請求評審`, `斷言竄改`, `合併衝突`, `回滾`, `健康檢查`, `發布證據`.

## Empirical & Quantitative Validation (reference workflows executed 2026-10-30)
1. **Bounded Agent Run (Ticket 22 fixture)**:
   - Command: `python -m projects.agent_learning.cli evaluate --fixture summarize-notes --output /tmp/agent-run.json`.
   - Verified outcome: `status=completed`, `termination=goal_reached`, `steps=4 <= 6`, `retries=0 <= 2`; trace contains only `action`/`observation` events (no chain-of-thought fields); independent scorer reports `outcome_passed`, `tool_behavior_passed`, `budget_passed`, `failure_handling_passed` all true.
   - Fault path verified via public API: `DeterministicModelAdapter(fault="invalid_arguments")` emits structured `{'ok': False, 'error': 'invalid_arguments'}` and terminates inside budget.
2. **Failing Change, CI Diagnosis, Verified Fix (Ticket 24 runner)**:
   - Command: `python3 scripts/ci_practice_runner.py --stage regression --json`.
   - Verified RED: controlled defect `unicode_multibyte_stripping` produced `test_failed_red=true` with `AssertionError: 11 != 17` in `test_multilingual_unicode_handling`.
   - Verified GREEN: reviewed implementation fix restored the suite with assertions untouched (`test_restored_green=true`).
3. **Merge/Recovery Case (disposable bare upstream)**:
   - Command: `python3 scripts/ci_practice_runner.py --stage conflict --json`.
   - Verified outcome: `conflict_detected=true`, `conflict_resolved=true`, `unrelated_changes_preserved=true`, `clean_history=true`; simulation explicitly labeled — no network or pushes performed.
4. **Controlled Delivery & Verified Rollback**:
   - Command: `python3 scripts/ci_practice_runner.py --stage deploy --json`.
   - Verified history: deploy `1.0.0` HEALTHY → deploy `1.1.0` UNHEALTHY (exit code 2, `FATAL ERROR: Incompatible database schema version 2`) → `rollback_restored` `1.0.0` HEALTHY; `restored_version=1.0.0`, `restored_health=HEALTHY`, stage `success=true`.
5. **Independent vs Agent-Assisted Separation**:
   - Days 80 and 81 mark test authorship, review verdicts, conflict resolution, and the delivery report as `independent` assistance policy; produced diffs and hunk summaries are labeled agent-assisted evidence in learner deliverables.

## Chosen-Track Learning Navigation
- Day pages render for all four languages at `/{lang}/day-{79,80,81}` with four activity cards, the shared source-resource cards, and the four-link language switcher; the calendar ledger gate (Day 79 requires `day-78`, etc.) remains a linear chain, so learners arriving from any Agent Tool Track land on the same shared objectives.
- Verified by `tests/browser/test_study_days_79_81.cjs` against the live `server.cjs` routes.

## Source Provenance & Rights
- `yang-swe-agent-2024`: SWE-agent agent-computer interface paper (arXiv open access).
- `jimenez-swe-bench-2024`: SWE-bench issue-resolution benchmark paper (arXiv open access).
- `fowler-continuous-integration`: Martin Fowler's canonical CI article (free public web article, linking only).
- `github-actions-docs`: GitHub Actions documentation (CC BY 4.0).
- `google-sre-release-engineering`: Google SRE Book Chapter 8, Release Engineering (free public web edition, linking only).
- `git-book`: Pro Git, Second Edition (CC BY-NC-SA 3.0, linking only; noncommercial + share-alike restrictions declared).
All citations include ≥ 2 compared candidates, safe fallbacks (the local Ticket 22/24 fixtures fully cover every required workflow offline), and complete rights verification. No source text is imported; reuse is `linking` only.

## Safety & Authorization Boundary
- All executable fixtures run in disposable temporary workspaces; no pushes, real deployments, paid execution, or destructive operations were performed, and the day content restates that each requires specific separate authorization.
- The deterministic-v1 adapter is a fixture; no live-provider capability is claimed anywhere in the days or this review.
