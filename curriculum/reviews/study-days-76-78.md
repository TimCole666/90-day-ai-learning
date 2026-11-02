# Curriculum Review: Study Days 76-78 (Agent State, Retries, and Execution Limits)

## Scope & Purpose
Covers Days 76, 77, and 78 of the 90-Day AI Learning curriculum, grounded end-to-end in the Ticket 22 bounded evaluable-agent Learning Project at `projects/agent_learning` (`deterministic-v1` adapter, `summarize-notes` fixture):

- **Day 76**: Agent run-state model — the `run_task` loop's mutable state (`trace`, `retries`, implicit `len(trace)` steps), the three legal terminal states (`goal_reached`, `tool_failure`, `step_budget`), checkpoint/replay against recorded trace prefixes (event-sourced recovery), and idempotent tool effects (`write_report` overwrite semantics vs non-idempotent append/spend counter-examples).
- **Day 77**: Weekly consolidation review — closed-book retrieval of control vocabulary (step budget vs retry budget, checkpoint vs trace, timeout vs deadline), a failure-taxonomy drill classifying all three injected faults plus the `size_limit` observation, a blameless SRE-style post-mortem for the stuck-`loop` run, and an independently assembled evidence pack.
- **Day 78**: Execution limits — retry budgets with exponential backoff and full jitter, the empirical kill boundary (`subprocess.run(timeout=...)` terminates the direct child only; no process-group kill for escaped descendants), the five-layer isolation ladder (AST gates → argument validation → resource limits → disposable workspace → namespaces/microVMs), and a guarantee-matrix audit where every negative claim is corroborated by evidence or documentation.

## Verification & Parity Across Language Editions
All four language editions (`en`, `ja`, `zh-Hans`, `zh-Hant`) were authored with genuine translations and verified:
- **Terminology Parity**:
  - English: `run state`, `trace`, `checkpoint`, `replay`, `idempotent`, `retry budget`, `exponential backoff`, `jitter`, `timeout`, `deadline`, `process group`, `kill boundary`, `namespace`, `microVM`, `sandbox`, `post-mortem`.
  - Japanese: `実行状態`, `トレース`, `チェックポイント`, `リプレイ`, `冪等`, `リトライ予算`, `指数バックオフ`, `ジッター`, `タイムアウト`, `デッドライン`, `プロセスグループ`, `kill境界`, `名前空間`, `microVM`, `サンドボックス`, `事後検証`.
  - Simplified Chinese: `运行状态`, `轨迹`, `检查点`, `重放`, `幂等`, `重试预算`, `指数退避`, `抖动`, `超时`, `截止时间`, `进程组`, `终止边界`, `命名空间`, `microVM`, `沙箱`, `事后复盘`.
  - Traditional Chinese: `執行狀態`, `軌跡`, `檢查點`, `重播`, `冪等`, `重試預算`, `指數退避`, `抖動`, `逾時`, `截止期限`, `行程群組`, `終止邊界`, `命名空間`, `microVM`, `沙箱`, `事後複盤`.
- Uniform activity schema (title, prerequisites, objective, instructions, exercise_prompt, hint, answer, mastery_criterion) and identical activity IDs across all editions.

## Empirical Validation Against the Real Project
All behavioral claims in the lessons were re-executed against `projects/agent_learning` in disposable temporary workspaces:

1. **Nominal run**: `status=completed`, `termination=goal_reached`, `steps=4`, `retries=0`; trace = `list_notes → read_note(alpha.txt) → read_note(beta.txt) → write_report`.
2. **`fault="invalid_arguments"`**: `read_note {"filename": "../outside.txt"}` rejected by the basename check (`Path(filename).name != filename`) with `error=invalid_arguments`; adapter corrected within the retry budget → `completed/goal_reached` at `steps=5`, `retries=1`.
3. **`fault="missing_note"`**: `not_found` three times → `retries=3 > max_retries=2` → `failed/tool_failure` at `steps=3`; no `report.txt` produced.
4. **`fault="loop"`**: six identical `list_notes` calls, zero error observations → `budget_exhausted/step_budget` at `steps=6`, `retries=0`; scorer marks `budget_passed=false`.
5. **Idempotent write**: two identical `write_report` calls left `report.txt` byte-identical (sha256 match); a 4097-byte payload returned `size_limit`.
6. **Kill boundary**: a child spawning `subprocess.Popen(["sleep","60"])` then sleeping, run under `timeout=1`, was killed at ~0.20s while the detached descendant survived — direct confirmation that the repo's subprocess timeouts (`scripts/check_snippets.py` `RUN_TIMEOUT=15.0`; `lab/run_all_tests.py` finite-positive validation) terminate only the direct child. Process groups (`setpgid`/`killpg`) are the documented missing mechanism; no cleanup guarantee for escaped descendants is claimed anywhere in the lessons.

## Honest Capability Boundary (explicit in learner-facing content)
- The project's controls are input validation and resource budgets, **not** an OS sandbox: no namespaces, cgroups, seccomp, or microVM isolation (`README.md`: "Resource limits ... are teaching controls, not an OS sandbox"; `project.json` `evidence.resource_limit_note`).
- AST gating (`ast.parse` in `check_snippets.py` plus `classify()` skip-hints) inspects source structure only and cannot evaluate runtime behavior.
- The disposable `TemporaryDirectory` workspace is hygiene, not confinement; absolute paths outside it remain writable.
- Escaped descendant processes are a documented gap, not a defect: the guarantee matrix in Day 78 Activity 4 requires evidence-linked negative claims.

## Source Provenance & Rights
Twelve new sources registered in `curriculum/sources/registry.json`; each carries $\ge 2$ compared candidates, prerequisites, permission basis, and offline safe fallbacks:
- `langgraph-persistence-docs` (MIT/docs): agent checkpointing — production analogue of the trace.
- `temporal-durable-execution` (MIT/docs): event-history replay recovery model.
- `stripe-idempotent-apis` (linked vendor docs): idempotency-key contract for safe retries.
- `aws-exponential-backoff-jitter` (AWS Architecture Blog, Marc Brooker): full-jitter retry policy.
- `google-sre-cascading-failures` (SRE book ch. 22, free online edition): retry amplification/cascading failures.
- `google-sre-postmortem-culture` (SRE book ch. 15): blameless post-mortem structure.
- `python-subprocess-docs` (PSF License): `subprocess` timeout/`DEVNULL`/kill semantics.
- `python-ast-docs` (PSF License): `ast.parse` static admission gate.
- `man7-process-groups` (Linux man-pages): PGID/session/`killpg` semantics.
- `man7-namespaces` (Linux man-pages): the eight namespace types behind genuine OS isolation.
- `agache-firecracker-2020` (USENIX NSDI'20 open access): hardware-virtualized microVM boundary reference.
- `kubernetes-resource-limits` (CC BY 4.0): kernel-enforced cgroup CPU/memory limits contrasted with app-level counters.

Fixture-attribution note: the deterministic adapter and `summarize-notes` fixture originate from the merged Ticket 22 project; no fixture code is re-vendored into curriculum files — lessons cite the live artifact paths and observed outputs only.
