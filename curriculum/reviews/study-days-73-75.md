# Curriculum Review: Study Days 73-75 (Agent Loops and Tool Protocols)

## Scope & Purpose
Covers Days 73, 74, and 75 of the 90-Day AI Learning curriculum, all grounded in the real
bounded evaluable-agent Learning Project (`projects/agent_learning`, model adapter
`deterministic-v1`; no network, no shell, no live model):
- **Day 73**: The five-stage tool-using agent control loop (model request, action proposal,
  tool dispatch, structured observation, loop-or-terminate), ReAct's action/observation
  interleaving, falsifiable trace prediction for the `summarize-notes` fixture, execution
  of the public CLI, and the termination state machine (`goal_reached`, `tool_failure`,
  `step_budget`).
- **Day 74**: Tool schemas as contracts (name, description, JSON Schema `parameters`),
  Anthropic `tool_use`/`tool_result` and OpenAI `tool_calls`/`role:"tool"` request shapes,
  MCP host/client/server roles over JSON-RPC 2.0, layered validation (serialization,
  schema, dispatch, tool runtime, resource limits), and an explicit compliance boundary:
  the three-tool teaching harness demonstrates loop and validation shape, not protocol
  compliance.
- **Day 75**: Documented fault injection (`invalid_arguments`, `missing_note`, `loop`),
  structured error feedback (`unknown_tool`, `invalid_arguments`, `not_found`,
  `size_limit`), the controlled repair path inside a bounded retry budget, safe
  termination audits, independent scoring via `evaluate()`, evidence ledger assembly,
  limitations disclosure, and scheduled spaced review.

## Verification & Parity Across Language Editions
All four language editions (`en`, `ja`, `zh-Hans`, `zh-Hant`) were authored with equivalent
objectives, exercises, hints, worked answers, and mastery criteria, and verified:
- **Terminology Parity**:
  - English: `control loop`, `model request`, `action`, `observation`, `tool schema`,
    `validation`, `termination`, `retry budget`, `repair path`, `evidence ledger`,
    `compliance boundary`, `fault injection`.
  - Japanese: `制御ループ`, `モデルリクエスト`, `アクション`, `観測`, `ツールスキーマ`,
    `検証`, `終了`, `リトライ予算`, `修復経路`, `証拠台帳`, `準拠境界`, `障害注入`.
  - Simplified Chinese: `控制循环`, `模型请求`, `动作`, `观察`, `工具 Schema`, `验证`,
    `终止`, `重试预算`, `修复路径`, `证据台账`, `合规边界`, `故障注入`.
  - Traditional Chinese: `控制循環`, `模型請求`, `動作`, `觀察`, `工具 Schema`, `驗證`,
    `終止`, `重試預算`, `修復路徑`, `證據台帳`, `合規邊界`, `故障注入`.
- **Invariant structure**: identical activity IDs, code identifiers, commands, error-code
  vocabulary, numeric budgets (max_steps=6, max_retries=2, 4096-byte payload cap), and
  JSON answers across editions; prose and UI strings localized.

## Empirical & Quantitative Validation (executed 2026-10-30)
1. **Deterministic successful run**:
   - `python -m projects.agent_learning.cli evaluate --fixture summarize-notes --output /tmp/agent-run.json`
     run twice: artifacts byte-identical (`diff` empty).
   - Result: `status=completed`, `steps=4`, `retries=0`, `termination=goal_reached`.
   - Metrics: `outcome_passed=1, tool_behavior_passed=1, budget_passed=1,
     failure_handling_passed=1, tasks=1`.
   - Chain-of-thought scan: `grep -c '"thought"'` = 0, `grep -c 'chain_of_thought'` = 0;
     `evidence.trace_policy` = "actions and observations only".
2. **Controlled repair path** (`fault="invalid_arguments"`, `max_steps=6`, `max_retries=2`):
   - First observation error `invalid_arguments` (rejected `../outside.txt` basename);
     adapter re-planned and recovered: `status=completed`, `steps=5`, `retries=1`,
     `termination=goal_reached`; `report.txt` bytes equal `expected_report()`.
3. **Safe terminations**:
   - `fault="missing_note"` (`max_steps=4`, `max_retries=1`): `status=failed`, `steps=2`,
     `retries=2`, `termination=tool_failure`, last error `not_found`, no `report.txt`.
   - `fault="loop"` (`max_steps=2`, `max_retries=1`): `status=budget_exhausted`,
     `steps=2`, `retries=0`, `termination=step_budget`, no `report.txt`.
4. **Project test seam**: `python -m unittest tests.projects.test_agent_learning -v`
   passed all 6 tests (trace shape, repair path, tool_failure, step_budget, CLI
   reproducibility, config validation).
5. **Selected-track navigation**: `/{lang}/day-73..75` pages render the `nav-track-link`
   to `/{lang}/agent-track`; the track page lists exactly 4 alternative tracks and
   preserves client-side selection state (verified in the browser seam test).

## Translation Review
- Spot-checked technical invariants across all four editions: commands, fixture names,
  `AgentConfig` parameters, termination vocabulary, and error codes are identical.
- Rubrics are explicitly separated in every edition: Independent Mastery Checks
  (unaided trace prediction, termination audit, schema authoring, classification table)
  versus Agent-Assisted Engineering Checks (agent may run commands or draft tables; the
  learner must personally verify against source and artifacts).
- Known limitation acknowledged in all editions: `deterministic-v1` is a fixture policy,
  not a live model; resource budgets are teaching controls, not an OS sandbox.

## Source Provenance & Rights
- `yao-react-2022`: ReAct, ICLR 2023 / arXiv:2210.03629v2 (arXiv open access) — the
  interleaved action/observation loop.
- `schick-toolformer-2023`: Toolformer, NeurIPS 2023 / arXiv:2302.04761v1 (arXiv open
  access) — tool-invocation seam between generation and execution.
- `shinn-reflexion-2023`: Reflexion, NeurIPS 2023 / arXiv:2303.11366v4 (arXiv open
  access) — failure feedback and controlled repair loops.
- `anthropic-tool-use-docs`: Claude API tool_use/tool_result specification (verified
  2026-10-30) — production request/response shape.
- `openai-function-calling-guide`: OpenAI tool_calls specification (verified 2026-10-30)
  — industry-standard schema contract.
- `anthropic-mcp-spec`: Model Context Protocol Specification 2024-11-05, MIT License —
  host/client/server architecture concepts (scope-limited; no compliance claim).
- `json-schema-core-2020`: JSON Schema Draft 2020-12 (IETF Trust License) — normative
  parameter-schema standard.
- `rfc-8259-json`: RFC 8259 JSON grammar (IETF Trust License) — serialization layer.
All eight sources are registered in `curriculum/sources/registry.json` with >=2 compared
candidates each, license/rights fields, and safe offline fallbacks; full provenance is
embedded per-activity in the day files.
