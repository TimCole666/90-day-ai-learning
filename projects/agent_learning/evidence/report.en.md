# Ticket 23: Live-model agent evaluation report

## Decision and gate

**Result: blocked-awaiting-authorization.** No model provider, paid API call,
gated weight download, or external side effect was used. The contract is a
plan and evidence schema, not a claim that a live run happened. `null` in
`live_eval_contract.json` means unavailable measured evidence, never zero.

Before any live call, an approver must record the execution route, model
identifier and pinned revision, data conditions, ceilings, and stop behavior
listed in `authorization_gate.md`. The deterministic gate is:

```bash
python projects/agent_learning/evidence/validate_contract.py
python projects/agent_learning/evidence/validate_contract.py --require-authorized  # intentionally fails now
```

The second command must remain failing until specific authorization exists. A
future runner must refuse to launch before this gate.

## Selection plan and fixed task set

`model_selection_plan.md` compares an open-weight local instruct model
(recommended) against three provider API alternatives with version, access,
data-use, and cost conditions; it is a proposal and nothing is selected. The
contract fixes six tasks on the `summarize-notes` fixture: one success task,
two malformed-request tasks (invalid arguments and unregistered tool), one
missing-resource failure, one step-budget exhaustion, and one termination
honesty task. Each task names its `deterministic-v1` fixture analog and its
expected observable contract.

## Evidence contract and metrics

Metrics are checkable independently of any model self-report: report content
equal to the fixture expectation (SHA-256 recorded), registered tool names
only, step/retry ceilings, structured error observations with honest
termination, a per-task baseline comparison, and measured cost. Baseline
values come from the deterministic fixture; every `live_value` is `null`
until an authorized run fills it.

## What is observed now

Only deterministic-v1 fixture runs exist. They validate harness mechanics —
action/observation traces, bounded tools, retries, budgets, safe termination —
and are **not** live-model evidence. No provider, model id, revision, elapsed
time, token count, task outcome, or cost is claimed; all such fields are
`null`. The `simulated`/`live` separation is enforced by the validator and by
the `evidence_kind` labels.

## Reproduction boundary

After authorization, run the six tasks through `run_task` with the approved
adapter under the contract configuration, record results into `live_results`,
keep credentials out of the repository, and update all four language editions
of this report. Simulated fixture tests continue to guard mechanics but can
never satisfy the live-run acceptance items.
