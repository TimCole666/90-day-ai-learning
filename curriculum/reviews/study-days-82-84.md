# Curriculum Review: Study Days 82-84 (Scientific Agent Evaluation)

## Scope & Purpose
Covers Days 82, 83, and 84 of the 90-Day AI Learning curriculum (Block 28, Ticket 52, `agents` category):
- **Day 82**: Evaluation pre-registration — fixing a six-task suite with `deterministic_analog` fixture mappings, declaring the `deterministic-v1` baseline, writing falsifiable hypotheses and stop conditions, specifying the four contract metric families (`outcome_passed`, `tool_behavior_passed`, `budget_passed`, `failure_handling_passed`), and recomputing the deterministic baseline from actual artifacts.
- **Day 83**: Confounder analysis (model identity/revision, decoding configuration, harness/tool surface, sample-size limits with a Wilson-interval argument), failure attribution taxonomy driven by recorded action/observation traces only, cost/retry/latency accounting with independent tool-behavior audits, and a statistical interpretation memo with explicit non-claims.
- **Day 84** (review day): Retrieval practice on evidence kinds and pre-registration discipline, a metric recomputation drill from raw traces, four-language report assembly with verified parity, and a closing mastery check converting gaps into a spaced-review plan.

## Evidence Basis and Honest-Scoping Audit
This block deliberately grounds all measured claims in the ticket-23 evidence package (`projects/agent_learning/evidence/`, landed in commit `0e2a67a`):
- The deterministic baseline is real and reproducible: `python -m projects.agent_learning.cli evaluate --fixture summarize-notes --output <scratch>` plus `python -m unittest discover -s tests/projects -p 'test_agent_learning.py'`; the recorded baseline metrics are `outcome_passed=1`, `tool_behavior_passed=1`, `budget_passed=1`, `failure_handling_passed=1` over the deterministic task set.
- The live evaluation remains **blocked-awaiting-authorization**. Every lesson states that `live_value = null` means unavailable measured evidence — never zero — and that `validate_contract.py --require-authorized` must fail until specific authorization exists. No lesson fabricates live results, model identifiers, latencies, token counts, or costs.
- All mastery checks use action/observation evidence; no exercise asks learners to trust hidden chain-of-thought or model self-report.

## Verification & Parity Across Language Editions
All four language editions (`en`, `ja`, `zh-Hans`, `zh-Hant`) were authored with authentic translations and verified:
- **Terminology Parity**:
  - English: `pre-registration`, `task suite`, `baseline`, `metric`, `termination honesty`, `confounder`, `failure attribution`, `trace`, `cost ledger`, `uncertainty`, `recomputation`, `catch-up plan`.
  - Japanese: `事前登録`, `タスク群`, `ベースライン`, `メトリクス`, `終了誠実性`, `交絡`, `帰因`, `トレース`, `コスト台帳`, `不確実性`, `再計算`, `補習計画`.
  - Simplified Chinese: `预注册`, `任务集`, `基线`, `指标`, `终止诚实性`, `混杂`, `失败归因`, `轨迹`, `成本台账`, `不确定性`, `重算`, `追赶计划`.
  - Traditional Chinese: `預註冊`, `任務集`, `基準`, `指標`, `終止誠實性`, `混雜`, `失敗歸因`, `軌跡`, `成本台帳`, `不確定性`, `重算`, `追趕計畫`.

## Empirical & Quantitative Validation
1. **Active-minute ledger**: each day carries four 120-minute activities summing to 480; activity minute totals verified by `audit_calendar_ledger.py` and the unit suite.
2. **Deterministic baseline recomputation**: Day 82 Activity 3 requires learners to re-execute the fixture evaluation and unittest suite, reconcile the four recorded baseline metrics against `live_eval_contract.json`, and confirm the authorization gate still fails by design.
3. **Small-sample statistics**: Day 83 Activity 1 quantifies that one flipped outcome on a six-task suite moves the success rate by ~17 percentage points; learners compute a Wilson interval for 6/6 to bound honest reporting.
4. **Metric independence**: Day 83 Activity 3 separates `tool_behavior_passed` (all recorded action names in `allowed_tools`, arguments are JSON objects) from `outcome_passed` (report SHA-256 equality), so a passing task with illegal tool calls and a failing task with correct calls are both visible.
5. **Non-claims discipline**: the Day 83 memo requires at least three explicit non-claims — no absolute tool rankings, no harness-versus-model attribution without controlled ablation, no success claims from self-report.

## Source Provenance & Rights
- `liu-agentbench-2023`: AgentBench, ICLR 2024 multi-environment agent benchmark (arXiv open access).
- `jimenez-swe-bench-2024`: SWE-bench, ICLR 2024 real GitHub-issue benchmark (arXiv open access), reused from the existing registry.
- `zhou-webarena-2023`: WebArena, ICLR 2024 functional-outcome web environment (arXiv open access).
- `yao-taubench-2024`: tau-bench, ICLR 2025 tool-agent-user benchmark with pass^k reliability metric (arXiv open access).
- `openai-evals-framework`: OpenAI evals repository (MIT), reused from the existing registry.
All newly registered and reused sources carry $\ge 2$ compared candidates (OSWorld, Mind2Web, HumanEval, Multi-SWE-bench, WorkArena, VisualWebArena, ToolSandbox, BFCL, LM Evaluation Harness, Lighteval), verified dates, license notes, prerequisites, and offline-safe fallbacks anchored to the deterministic-v1 fixture.

## Outstanding Limitations
- Live-model evidence remains blocked until the ticket-23 authorization gate is satisfied; the curriculum text and tests treat this as a standing condition, not a defect to paper over.
- External benchmark numbers (e.g., AgentBench or SWE-bench leaderboard results) are cited as protocol exemplars only; learners do not reproduce those runs inside the 480-minute budget.
