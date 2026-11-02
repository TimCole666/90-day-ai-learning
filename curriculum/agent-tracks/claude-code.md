# Claude Code Agent Tool Track

**Track status:** curriculum complete; real-tool acceptance is **blocked pending authorization**.
**Verification date:** 2026-10-30 (documentation and deterministic fixture audit only; no paid request made).
**Pinned tool observed:** `claude 2.1.312` (`claude --version`). Do not infer model or provider from the CLI version.

## Official sources and access

Use the [Claude Code overview](https://docs.claude.com/en/docs/claude-code/overview), [setup](https://docs.claude.com/en/docs/claude-code/setup), [permissions](https://docs.claude.com/en/docs/claude-code/permissions), [settings](https://docs.claude.com/en/docs/claude-code/settings), and [costs](https://docs.claude.com/en/docs/claude-code/costs) pages. Check them again before a live run because the CLI, flags, models, and pricing change.

A learner needs an authorized Anthropic account and either an approved Claude Code login/subscription path or an Anthropic API key with usable quota. The course does not provide credentials. A live run may create billable API usage; **do not log in, add a payment method, or spend money without specific learner authorization**. The provider is Anthropic. The model is selected by the authorized account/configuration; the exercise does not claim a fixed model. Record the model name and pricing page used on the day of a live run. `ANTHROPIC_API_KEY` must never be committed or placed in prompts.

## Reproducible setup and bounded configuration

```sh
# In a disposable clone/worktree, after authorization has been granted:
claude --version                 # record the observed version
claude login                     # or use an already-authorized account
claude                           # start from the fixture directory
```

Before accepting a tool action, inspect the permission prompt. Start with the least privilege offered by the current release; use the documented permission/settings controls rather than copying an unreviewed configuration. Deny network, deployment, credential, destructive, and out-of-worktree actions. Set a short session deadline, a maximum of two correction rounds, and a learner-approved cost ceiling. Use `/cost` when available and record the displayed provider/model/cost without secrets. The exact permission flags and setting names are release-sensitive: follow the official permissions/settings pages linked above and record what was actually selected.

## Disposable exercise

Copy `projects/claude-code-disposable/` to a temporary directory or worktree. Give the agent only the small bug report, `src/greeter.py`, and `tests/test_greeter.py`. Ask it to change `src/greeter.py` only. The fixture contains a deliberately failing test: the agent must first observe the failure, make the smallest change, run the test, and report the exit code. The learner then runs the test independently, reviews `git diff --check` and `git diff`, and rejects any file outside `src/greeter.py`. A second prompt must correct a deliberately wrong first result (the expected greeting is case-sensitive); record both the failed and corrected result.

Required local evidence commands:

```sh
cd projects/claude-code-disposable
python3 verify_fixture.py
```

The public verifier creates a temporary Git repository, records the deliberate red test, applies only the bounded capitalization correction, reruns the test, and checks `git diff --check` plus the changed-path list. For an actual Claude Code run, perform the same commands yourself after the tool exits; the verifier is only a deterministic substitute.

The first command is a **deterministic substitute**, not proof that Claude Code ran. It is useful when authorization is unavailable. The sanitized artifact in `docs/evidence/claude-code/` is documentation/fixture evidence only; it must not be presented as a real-tool transcript. A real run is accepted only when a learner supplies a redacted transcript or command log showing the actual Claude Code version, selected provider/model, permission decisions, cost (or plan/quota), failure, correction, independent test output, and reviewed diff. Never include API keys, account identifiers, prompt contents containing secrets, or external side effects.

## Acceptance criteria

- [ ] Setup and official-source links were checked on the run date.
- [ ] Version, provider, model, access path, cost/plan assumption, and authorization are recorded.
- [ ] Context is minimal; permissions are bounded; the project is disposable.
- [ ] A real agent change is reviewed line-by-line and restricted to the requested file.
- [ ] Learner-run tests show the deliberate failure and corrected success with exit codes.
- [ ] Sanitized real-run evidence is separated from this fixture and from documentation review.

**Current limitation:** this environment can observe `claude 2.1.312`, but no authorized Anthropic account/API key was supplied. No paid or external Claude Code call was made, so the real-run checkbox remains blocked rather than being simulated.
