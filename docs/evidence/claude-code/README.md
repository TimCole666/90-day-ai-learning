# Claude Code evidence boundary

This directory deliberately separates three evidence classes:

1. **Documentation review:** `curriculum/agent-tracks/claude-code.md` links official Anthropic documentation and records the setup contract. Localized editions: `claude-code.ja.md`, `claude-code.zh-Hans.md`, `claude-code.zh-Hant.md` in the same directory.
2. **Deterministic substitute:** `projects/claude-code-disposable/` and the local test output below are runnable without credentials. They do not prove Claude Code ran.
3. **Real-tool evidence:** absent in this environment. `claude --version` returned `2.1.312`, but no authorized Anthropic account, API key, or spending authorization was supplied. No paid request or external side effect was attempted. Therefore live acceptance is blocked, not passed.

## Sanitized deterministic run

Run the bounded public command seam from the project directory:

```text
$ python3 verify_fixture.py
... AssertionError: 'hello, Learner!' != 'Hello, Learner!'
deliberate failure: exit=1
corrected result: exit=0
reviewed diff: src/greeter.py only
```

The verifier creates a temporary Git repository, runs the deliberately failing test, applies only the capitalization correction, reruns the test, and checks `git diff --check` plus the changed-path list. This is a deterministic substitute, not a Claude Code execution.

This output is a sanitized documentation/fixture record, not a transcript from Claude Code. A future authorized run must add a separately dated, redacted record with the actual provider/model, permission decisions, cost or plan quota, tool version, failure/correction, independent test output, and reviewed diff. Never add credentials, account identifiers, or unapproved external actions.
