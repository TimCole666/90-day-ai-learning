# Bounded agent project — English edition

## Ticket 23 live-evaluation evidence package

The authorized live-model evaluation contract and four-language report live in [`../evidence/`](../evidence/). Start with [`live_eval_contract.json`](../evidence/live_eval_contract.json) and run the deterministic validator before any paid or external action. It currently reports `blocked-awaiting-authorization`; no live model call or cost is claimed. The validator's `--require-authorized` mode must fail until a specific approval, model revision, and limits are recorded.

**Objective:** build and evaluate a useful small tool-using agent without a live LLM.

**Run:** `python -m projects.agent_learning.cli evaluate --fixture summarize-notes --output /tmp/agent-run.json`

**Practice:** predict `list_notes → read_note(alpha.txt) → read_note(beta.txt) → write_report`; run the command; inspect every action and observation; then use `DeterministicModelAdapter(fault="invalid_arguments")`, `fault="missing_note"`, and `fault="loop"` in a disposable temporary directory.

**Feedback:** `invalid_arguments` should be visible and corrected within the retry budget; `not_found` should produce safe failure without a report; `budget_exhausted` must stop at the declared step limit. Do not treat process exit 0 or model prose as evaluation evidence.

**Assessment:** independently verify report content, registered tool names and arguments, step/retry limits, structured failure observations, and absence of hidden reasoning fields. Resource limits are not OS sandbox guarantees. Live model/provider success is out of scope.
