# Bounded Agent Learning Project

This is a small, offline Learning Project for practicing requirements, tool contracts,
observable traces, retries, and independent evaluation. It uses the public CLI and
never calls a model provider, network, shell, or arbitrary learner code.

## Run

From the repository root:

```bash
python -m projects.agent_learning.cli evaluate --fixture summarize-notes --output /tmp/agent-run.json
python -m unittest tests.projects.test_agent_learning -v
```

The CLI creates a disposable temporary workspace containing two notes and prints a
stable JSON artifact. The artifact contains only `action` and `observation` events;
it does not collect chain of thought. `deterministic-v1` is a model adapter fixture,
not evidence of live-model quality.

## Learner sequence

1. Predict the three-tool plan: list notes, read both notes, write a report.
2. Run the command and compare each action with its observation.
3. Inspect `projects/agent_learning/agent.py` and explain the argument and path limits.
4. Exercise failure feedback with the public API using `fault="invalid_arguments"`,
   `fault="missing_note"`, and `fault="loop"`.
5. Re-run the independent scorer and explain outcome, tool, budget, and failure
   dimensions separately. A passing process exit is not sufficient evidence.

Resource limits (step/retry budgets, payload limits, and path checks) are teaching
controls, not an OS sandbox. They do not make arbitrary code safe to execute.

## Acceptance

A learner passes when the expected report is present, all actions are registered
bounded tools, steps stay within budget, and failure observations are structured and
lead to correction or safe termination. The four language guides state the same
objectives, commands, exercises, feedback, and criteria.
