# Pi Agent Tool Track

This is the Pi route through the shared Agent-Assisted Engineering Check. Choose Pi only if you can obtain an approved model provider or run an approved local endpoint. The course does not treat an unavailable provider, a simulated transcript, or documentation alone as a passed run.

## Verification record

- **Pi release:** `v1.4.0`, official `earendil-works/pi` release, pinned for this edition.
- **Official setup checked:** 2026-10-30 against the official README and v1.4.0 release notes: https://github.com/earendil-works/pi and https://github.com/earendil-works/pi/releases/tag/v1.4.0.
- **Runtime:** Node.js `>=22.19`; prefer the official installer, or install the exact npm package with `--ignore-scripts`.
- **Provider/model:** Pi is a harness, not a model provider. This track uses the learner's approved provider and model, recorded in `run-record.json` as `provider`, `model`, and `model_version` before the run. The repository contains no provider credentials and no live model result.
- **Cost:** Pi has no separate model fee. API tokens, subscription quota, local electricity, and hosted inference are provider costs. Record the provider price page and an estimated ceiling before a paid run; stop when the ceiling is reached. No cost was incurred or measured by this repository-only documentation change.
- **Evidence state:** the curriculum author verified the official documentation and the deterministic disposable-project fixture. A live Pi/provider run is **not claimed here** without authorized credentials and execution.

## Official setup and access

```sh
# Official installer; inspect the script and release policy before running it.
curl -fsSL https://pi.dev/install.sh | sh

# Or use the package named by the official README (transitive dependencies are not pinned).
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.4.0
pi --version
```

Run `pi` in a disposable project. Use `/login` for a built-in provider, or configure an approved provider according to the official provider documentation. Never paste an API key into a prompt, commit it, or put it in a lesson example. Paid access, provider enrollment, and any purchase require the owner's separate authorization.

## Built-in capabilities versus extensions

**Built in in v1.4.0:** interactive and print/JSON modes, session/context management, compaction and branching, model/provider selection, and the standard file/read/write/edit, grep, find, and bash workflow documented by Pi. These capabilities are subject to the selected provider and local OS permissions.

**Not native:** sub-agent delegation and plan mode. The official README explicitly says Pi skips them. Do not describe them as built in. Extensions, skills, prompt templates, themes, packages, MCP, or an SDK can add behavior, but every extension is third-party code and must be audited and approved before installation. A package that adds delegation is evidence of that package, not evidence of Pi core.

## Context preparation and bounded execution

1. Create a new directory or Git worktree outside valuable repositories; copy only the fixture and its README.
2. State the one-file objective, acceptance checks, allowed paths, test command, timeout, and stop condition.
3. Give Pi the smallest useful context: the failing test, relevant function, and constraints. Do not provide secrets or unrelated history.
4. Start with read-only inspection. Approve writes only inside the disposable project; reject network, deployment, credential, and package-install requests.
5. Limit the provider budget and record the model, provider, start/end time, and whether any retry was paid.
6. Inspect `git status` and `git diff --check` after every write. Run the tests yourself, not from Pi's prose.

## Disposable project task

Use `curriculum/projects/pi_agent/fixture` and run `python3 -m unittest discover -s tests`. The fixture contains a deliberately failing `validate_record` test. Ask Pi to make the smallest fix, then introduce the documented bad fixture changes (a secret, deleted assertion, webhook, and unrelated dependency bump) as a review drill. The learner must reject them, restore the fixture, and rerun the untouched tests. This exercises context, execution permissions, diff review, tests, failure correction, and root-cause reasoning without touching a production repository.

Required evidence is a sanitized `run-record.json` (no prompt, key, or private path), the before/after test exit status, `git diff --check`, and a short explanation of the correction. A copied or simulated transcript is labeled simulation and cannot satisfy live-run acceptance.

## Troubleshooting

- **`pi: command not found`:** verify the install path and Node version, then open a new shell; do not install an unpinned package over the pinned environment.
- **Login or model errors:** check provider account access, model name, region, quota, and the official provider page. Do not disable TLS or print credentials while debugging.
- **Context too large:** remove unrelated files, compact intentionally, or start a fresh branch; never add secrets to make context complete.
- **Unexpected edits:** stop Pi, save the diff as evidence, restore only the disposable fixture, and rerun the baseline tests.
- **Repeated failures:** capture the exact command and exit code, form one root-cause hypothesis, change one thing, and retry once. Escalate instead of looping.
- **Extension problems:** disable the extension and reproduce with built-ins. Installation side effects require explicit authorization.

## Answers and acceptance criteria

**Reference answer:** The correct response rejects the secret, deleted tests, webhook, and unrelated dependency changes; runs `git diff -- tests config scripts package.json`, restores unauthorized files in the disposable project, and executes the published test command independently. “All tests passed” in Pi's message is not evidence. The learner records the actual exit code and explains why the original failure occurred.

**Agent-Assisted Engineering Check passes when:** the learner prepares bounded context, uses only the disposable project, refuses unapproved permissions, records provider/model/cost state, reviews the complete diff, runs tests independently, diagnoses a real failure, corrects it, and preserves the sanitized evidence. Missing provider access is marked blocked, not passed.

**Independent Mastery Check:** without Pi, explain the validator bug, write the smallest patch, predict the test result, and review a supplied diff. This result is separate from the assisted check.

## Authorization boundary

This material authorizes no purchase, paid API request, extension install, external message, credential use, deployment, or mutation outside the disposable fixture. Ask the owner before each such action. The maintained tests prove structure and deterministic fixture behavior only; they do not prove live provider access, model quality, billing, or Pi execution.
