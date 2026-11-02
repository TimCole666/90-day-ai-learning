# Ticket 23: Authorization gate for the live agent evaluation

No live model call, paid access, gated weight download, or external side
effect may happen until a human approves the scope below. This mirrors the
Ticket 19/21 approval-gate pattern: the deterministic package is delivered
now; the live run stays `blocked-awaiting-authorization`.

## What runs without approval (and what does not)

Allowed now, offline only:

- The deterministic fixture: `python -m projects.agent_learning.cli evaluate --fixture summarize-notes`
- The contract validator: `python projects/agent_learning/evidence/validate_contract.py`
- The deterministic test suite: `python -m unittest discover -s tests/projects -p 'test_agent*'`

Forbidden without approval:

- Any call to a model provider API or paid service
- Downloading gated model weights or accepting gated license terms
- Sending any content to an external endpoint, or any external side effect
- Filling any `live_results` or `live_value` field — they remain `null`

## Approval request

Before any live call, the approver must confirm, in writing outside this
repository (record a reference, not secrets):

1. Execution route: local open-weight runtime or a named provider API, taken
   from `model_selection_plan.md`.
2. Model identifier **and** pinned revision; license/access terms reviewed.
3. The fixed task set and configuration in `live_eval_contract.json`.
4. Data conditions: only the synthetic fixture notes and the documented
   action-JSON scaffold are sent to the model; no secrets, personal data, or
   unrelated repository content.
5. The ceilings and stop behavior below.
6. Where credentials live (environment/private store only — never the repo).

## Limits (binding ceilings)

| Limit | Value |
|---|---|
| Total cost | USD 5.00 maximum; local open-weight runs target USD 0 marginal |
| Wall-clock runtime | 30 minutes maximum for the whole evaluation |
| Steps per task | 6 (`AgentConfig.max_steps`) |
| Retries per task | 2 (`AgentConfig.max_retries`) |
| Total model calls | 36 (6 tasks x 6 steps) — a hard counter, not an estimate |
| Output tokens per step | 256 maximum; the model may only emit one JSON action |

## Stop behavior

- Stop **before launch** if approval, pinned revision, access terms, or a
  provider price quote is missing.
- Stop **immediately** at any ceiling above, on provider errors, on repeated
  unparseable actions after the retry budget, or on any attempted
  network/file access outside the disposable fixture workspace.
- On a mid-run failure, preserve a sanitized trace/manifest for the report;
  do not silently retry paid calls.
- Do not delete retained artifacts or storage without separate confirmation.

## After an authorized run

Record provider/runtime, model id and revision, adapter version, git SHA,
start time, elapsed seconds, token counts, and per-task results into
`live_eval_contract.json` `live_results`, plus a billing export reference for
`cost_usd` where a provider was used. Keep credentials, account IDs, and
private run-log identifiers out of this repository. The four-language report
templates already mark where each measured value goes; unfilled fields stay
`null` and `blocked-awaiting-authorization`.
