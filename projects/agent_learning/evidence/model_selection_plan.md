# Ticket 23: Model and provider selection plan (proposal, not an executed choice)

This document records candidate legitimate, accessible models for the live
agent evaluation in `live_eval_contract.json`. It is a **proposal**. No model
was selected, downloaded, or executed; `model_selection.selected_*` fields in
the contract stay `null` until the authorization gate in
`authorization_gate.md` is satisfied. All license, price, and access statements
must be re-verified at execution time because terms and model identifiers
change.

## Requirements driving the choice

- The harness (`projects.agent_learning.agent.run_task`) consumes one JSON
  action `{"name", "arguments"}` per step against three bounded tools, so the
  model must reliably emit structured, schema-shaped output.
- The run must fit the declared ceilings (USD 5, 30 minutes, 36 model calls,
  6 steps per task).
- The evaluation needs failure categories (malformed requests, missing
  resources, budget exhaustion), so an imperfect small model is acceptable and
  even useful — the contract checks honest observation and termination, not a
  polished demo.
- Note content sent to the model is synthetic fixture text; no personal or
  secret data may be included regardless of candidate.

## Candidates

### A. Open-weight local model — recommended first choice

| | |
|---|---|
| Example model | `Qwen/Qwen2.5-1.5B-Instruct` (sibling sizes 0.5B/3B are acceptable if memory-bound) |
| Version | Pin an immutable revision (commit hash) after license review; do not float `main` |
| Access conditions | Public weight download; Apache-2.0 per publisher — re-read the model card and LICENSE before downloading |
| Data/usage conditions | Weights and prompts stay on the learner's machine; no provider data sharing; output is not training data for anyone |
| Estimated cost | USD 0 marginal per call (local compute only); electricity is not metered or claimed |
| Risks | Small instruct models sometimes emit malformed JSON or wrong tool names — acceptable here because the contract requires structured error observations, not guaranteed success; a CPU-only run may be slow, covered by the 30-minute ceiling |

Alternative open-weight option: `meta-llama/Llama-3.2-1B-Instruct` or
`Llama-3.2-3B-Instruct`. Gated access requires a Hugging Face account and
explicit acceptance of the Meta community license; use only if that gate is
acceptable to the approver.

### B. Provider API — documented alternatives

| | OpenAI `gpt-4o-mini` | Anthropic `claude-3-5-haiku-20241022` | DeepSeek `deepseek-chat` |
|---|---|---|---|
| Version | Exact dated identifier pinned at execution time | Same | Same |
| Access conditions | Paid API key, billing account, provider terms; key lives outside the repo | Same | Same |
| Data/usage conditions | Fixture prompt text leaves the machine; review the provider's data-use and retention policy first | Same | Same; additionally review jurisdiction/data-residency concerns |
| Estimated cost | Theoretical: well under USD 1 for all 36 capped calls at small-model list prices — re-quote from the provider pricing page before approval | Same | Same |
| Risks | Per-call billing, rate limits, billing lag; no hard spending cap guaranteed by the gate alone | Same | Same |

A local serving stack for candidate A (for example llama.cpp or an equivalent
offline runtime) may also front the open-weight model through the same JSON
action contract; it still counts as a local run, not a provider call.

## Recommendation

Recommend **candidate A: `Qwen/Qwen2.5-1.5B-Instruct` at a pinned revision,
run locally** for the first authorized run: zero marginal cost, no data leaves
the machine, and small-model failure modes exercise the contract's malformed
and failure categories honestly. Record one provider API candidate (B) in the
approval request as an optional comparison run only if the approver also
approves paid access. This recommendation is not an executed selection; the
contract's `selected_*` fields remain `null` until approval.
