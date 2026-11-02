# Day 02–03 Acceptance-Repair Evidence Record

**Scope:** bounded handoff `handoff-days02-03.md` — the eight activities of Study Day 02 and Study Day 03 across en/ja/zh-Hans/zh-Hant, minimal `content_revision` bumps in `curriculum/days/day-02.json` + `day-03.json`, one focused test file, this record. Day 01, later days, the source registry, server, learner data, packaging, and unrelated owner files are untouched. No commits, staging, pushes, installs, or live provider/tool calls.

## What was broken (from the handoff)

1. All eight activities shared identical generic `instructions`/`exercise_prompt`/`hint`/`answer`/`mastery_criterion` boilerplate — no concrete inputs, commands, artifacts, worked solutions, or failure/recovery examples.
2. Independent activities passed on honest assistance disclosure alone; assisted remediation was not distinguished from unaided mastery.
3. ja/zh-Hans/zh-Hant contained copied English learner-facing prose; `dev_slice_notice` claimed "Complete local curriculum content"; `nav_legacy_roadmap` was Chinese-first in en and wrong-script in ja; `time_budget_label`/`category_label` were English in non-en editions.

## Repairs per activity (all four editions)

- **day-02-act-01** (independent): concrete strip-string request with a 3-line prediction snippet, a worked names/objects/allocation-vs-mutation decomposition tied to Day 01 tracer reasoning, a 2-line MRE, and a scheduled `name.upper()` variant check. Learner is not asked to invent a task.
- **day-02-act-02** (agent_assisted): bounded `agent-task-sandbox` exercise — exact prompt text, allowed/forbidden actions, human-approval-before-writes, 3-turn budget and stop rules, expected artifact + 5-item review checklist, "declared permission is a contract, not an OS sandbox", and a blocked/unexecuted path with a labelled offline illustration that cannot count as live evidence.
- **day-02-act-03** (independent): fully specified `fs-sandbox` POSIX sequence (`pwd`, `mkdir -p`, `printf`, `find`, `cat`, `ls`, `wc`) with before/after predictions; no real user files, no pre-existing state. Windows equivalents listed as unexecuted reference.
- **day-02-act-04** (independent review): phased recall → evidence comparison (against the learner's own recorded logs, not re-running) → fresh unaided dict-identity transfer check → dated recovery. Explicit none-found alternative with misconception rejection; no length quotas, no required mistakes.
- **day-03-act-01** (independent): harmless broken `env-drill` fixture — `ModuleNotFoundError` reproduction, resolved-`sys.path` + `ls tools` evidence, smallest justified fix (`PYTHONPATH=tools` for one invocation), `ok` recheck, empty-`PYTHONPATH` persistence proof. No machine-wide changes.
- **day-03-act-02** (agent_assisted): learner-authored `check_clamp.py` independent check, a labelled pre-authored bad patch (min/max swapped — real `AssertionError`, not a fabricated provider output), precise feedback template, corrected patch, `diff -u` + passing recheck. Budget + no-OS-sandbox boundary added; live portion blocked/unexecuted without an authorized tool.
- **day-03-act-03** (independent): fresh transfer `report-sandbox` task (`cp`/`mv`/`diff`/`wc`/`find`), distinct from the Day 02 transcript, with three exact artifact checks.
- **day-03-act-04** (independent review): concrete spaced-retrieval plan table (concept | evidence status | next unaided check | date | recovery), explicit actionable evidence gaps, committed dated unaided check — not the generic rubric.

Common fixes: independent labels now state assisted work is remediation requiring a fresh unaided check; `nav_legacy_roadmap` aligned to the Day 01 localized values; `dev_slice_notice` is acceptance-pending wording in all editions; `time_budget_label`/`category_label` localized where they were English.

## Verification executed (this machine, offline)

| Command | Result |
|---|---|
| `node tests/unit/test_days_02_03_repairs.cjs` | PASS — 486 assertions |
| `node tests/unit/test_day_01_repairs.cjs` | PASS — 446 assertions |
| `node tests/unit/test_study_days_01_03.cjs` | PASS |
| `.venv/bin/python -m unittest tests.projects.test_study_days_01_03` | PASS — 2 tests |
| `node tests/unit/test_acceptance_repairs.cjs` | PASS — 28,155 assertions (ids/keys vs HEAD unchanged) |
| `node tests/unit/test_candidate_regression.cjs` | PASS — 90 days, 43,200 min, 30 review records |
| `node tests/unit/test_calendar_ledger.cjs` + `scripts/audit_calendar_ledger.py` | PASS — DAG valid |
| `git diff --check` | clean |

Inside the focused test, the authored blocks were **executed** in `mkdtemp` fixtures under a controlled env (private `HOME`, `LC_ALL=C`, `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL=/dev/null`, no inherited `VIRTUAL_ENV`):

- strip snippet → `'data'`, `'  data  '`, `'data'` (predicted/observed match the answer)
- dict transfer → `{'a': 1, 'b': 2} True`
- `fs-sandbox` sequence → `pwd` lands in sandbox; `find` lists exactly the two created files; `cat`→`first note`; nested `pwd`/`ls` match; `wc -l`→`2`; nothing created outside the sandbox (fixture readdir assertion)
- `env-drill` → real `ModuleNotFoundError`; resolved `sys.path` shows `env-drill` but not `tools/`; `ls tools` shows the file; `PYTHONPATH=tools` recheck → `ok`; `PYTHONPATH=` empty afterwards
- `check_clamp.py` vs labelled bad patch → real `AssertionError`; vs corrected patch → `clamp checks passed`
- `report-sandbox` → `wc -l`→`3`; `diff` silent; `find` lists exactly the three artifacts; backup byte-identical

## Revision and identity notes

- All eight activities bumped `2026.10.30-rev1` → `2026.10.30-rev2` in `curriculum/days/day-02.json` / `day-03.json`. Prior `rev1` learner evidence correctly flags stale; history is preserved, not rewritten.
- IDs, activity types, `assistance_policy` (`independent` ×6, `agent_assisted` ×2), minutes (4×120/day), prerequisite topology unchanged. Days 02–03 have no quiz objects; none were added.

## Limitations and remaining uncertainty

- Sequences verified on this host only: Linux, bash, Python 3.14.8, git 2.56.0. Windows cmd/PowerShell equivalents are reference text labelled "not executed" — no Windows evidence claimed.
- No live agent tool was executed or authorized for act-02 activities; the live portions are explicitly marked blocked/unexecuted and illustrations are labelled non-evidence.
- Localization is structurally checked (script presence, no English-prose leakage, per-language boundary anchors, identical command blocks across editions); native-speaker review is not claimed.
- Learner-record stale flags and revalidation flow were not exercised against a real database — none exists in this repo state, and learner data was never touched.
- `diff -u` evidence capture in day-03-act-02 is described but the test verifies the check passes on both patch versions, not the diff artifact itself.

---

## POST batch — D02-03-POST-01..05 (instruction-contract follow-up)

Parent independently ran the **raw** authored blocks and reproduced that, on setup
failure (existing-directory / umask-0777 fixture), the learner-visible sequences
continued writing into the caller directory — the test harness's injected
`set -e`/`cd` had masked it. All fixes below are in the authored source, not
the test wrapper.

### POST-01/02 — day-02-act-03 and day-03-act-03 shell blocks

- Both blocks rewritten as contained fail-stop subshells: `( set -e; ... )` —
  the full displayed unit is one paste block, so `set -e` semantics apply to
  every authored command (a failing non-final `&&` element no longer exempts
  the chain — validation lines are standalone commands, not `&&` guards).
- Private root is `mktemp -d "${TMPDIR:-/tmp}/d02sbx.XXXXXX"` /
  `d03rpt.XXXXXX`; `-n`/`-d`/`-w`/`-x` validation runs **before any write**;
  all artifacts stay under the private root; the block prints
  `export SBX_ROOT=...` as the documented cleanup contract.
- Learner prose (all 4 locales) now says: paste the whole block into a fresh
  shell, failed setup aborts the subshell and writes nothing into the current
  directory, record the printed export line for optional cleanup. Cleanup
  commands are ownership-checked (`case "$SBX_ROOT" in "${TMPDIR:-/tmp}"/d02sbx.*)`,
  refuse foreign paths).

### POST-03/04 — day-03-act-01 environment/import exercise

- Build block: private `d03env.*` root; a `PYTHONDONTWRITEBYTECODE=1 python3 -c
  "import helper"` precondition probe aborts **before any write** if ambient
  Python config already resolves `helper` (the intended failure would be
  undemonstrable); the intended `ModuleNotFoundError` is captured to `err.txt`,
  shown, and `grep`-verified inside the subshell.
- Fix block: one-invocation `PYTHONPATH=tools python3 app.py` — the variable
  is never persistently exported. `PYTHONPATH before:`/`after:` lines print
  the recorded original value (`<unset>` when unset) so the learner compares
  against their real starting state, not an assumed empty one.
- Prompt/instructions (all 4 locales) corrected: block aborts before writing
  on setup failure or pre-importable `helper`; evidence compares the printed
  `export SBX_ROOT=` line and the recorded original `PYTHONPATH`.

### POST-05 — day-02-act-01 MRE label

- `answer` labelled the reproduction "2-line core" while the snippet is 3
  lines. Now "3-line core" in all 4 locales (`最小再現（核心の3行）` /
  `最小复现（核心三行）` / `最小重現（核心三行）`).

### Executed evidence (this host: Linux, bash, Python 3.14)

- Raw day-02-act-03 block: `pwd`→`fs-sandbox`, `find`/`cat`/`ls`/`wc` outputs
  match the answer, `export SBX_ROOT=` printed, caller dir untouched;
  ownership cleanup removes the owned root and **refuses** a foreign path.
- Raw day-02-act-03 block under `umask 0777` in a sentinel caller dir
  (`notes/todo.txt` = `PRIVATE SURROGATE KEEP`): aborts non-zero, sentinel
  byte-identical, no `drafts`/`ideas.txt` leaked into the caller.
- Raw env-drill block 1: real `ModuleNotFoundError: No module named 'helper'`
  shown; with `PYTHONPATH=<dir containing helper.py>` the same block aborts
  with `already resolves 'helper'` **before** any write (ambient dir listing
  unchanged).
- Block 2 (SBX_ROOT threaded via printed export): `sys.path` shows
  `env-drill`, not `tools/`; `ls tools`→`helper.py`.
- Block 3 under PYTHONPATH unset / empty / nonempty: `ok` printed each time,
  `PYTHONPATH after:` equals the original value each time.
- Raw day-03-act-03 block: `wc`→`3`, `diff` silent, `find` lists the three
  artifacts, backup byte-identical; under `umask 0777` the block aborts
  non-zero with sentinel unchanged and no `archive/` leaked.

### Test changes

- `tests/unit/test_days_02_03_repairs.cjs`: harness no longer prepends
  `set -e`/`cd` to authored blocks — every block is run **raw** via
  `spawnSync('bash', ['-c', block])` in the fixture cwd. New assertions:
  `(\nset -e` subshell prefix per block, `export SBX_ROOT=` contract,
  ownership-cleanup allow/refuse, umask-0777 sentinel negatives (both shell
  blocks), ambient-helper abort-before-write, PYTHONPATH unset/empty/nonempty
  preservation. Ledger expectations updated to per-activity map.
- Result: **514 assertions PASS** (was 486).

### Revisions

- `day-02`: act-01, act-03 → `2026.10.30-rev3`; act-02, act-04 stay `rev2`
  (untouched by this batch).
- `day-03`: act-01..04 → `2026.10.30-rev3` (all four substantively changed).
- IDs, policies (`independent`×6, `agent_assisted`×2), 4×120 minutes,
  quiz-absence, prerequisite/recovery topology: unchanged.

### Limits

- Bash/Linux/Python-3.14 evidence only; subshell+`set -e` semantics are
  authored for POSIX-ish bash as displayed — zsh/dash/Windows ports are
  reference-only as before; no OS sandbox is claimed (`env -i` not used here;
  PATH selects executables, is not a trust boundary).
- Learners pasting line-by-line instead of block-wise are outside the
  documented contract (the block is the unit).
- No acceptance claimed; local evidence only.

## Follow-up batch 2 — POST-02 residual, POST-06/07/08/09 (source-safety/evidence)

Parent-independent probes showed the prior repairs still contained four real
defects and one cosmetic one. All five are repaired in authored source.

### POST-02 residual — `PYTHONPATH` setness vs value

- `${PYTHONPATH:-<unset>}` logged unset and empty identically, and the old
  test's `includes('PYTHONPATH after: ')` falsely accepted `<unset>`.
- The fix block now defines `pp_state`, which prints
  `PYTHONPATH {before,after}: unset` or
  `PYTHONPATH {before,after}: set value=<...>` — setness and value are
  separate, unambiguous records. Verified exact distinct output for all
  three starting states (unset / `""` / nonempty).

### POST-06 — shell-safe continuation for spaced paths

- `printf 'export SBX_ROOT=%s\n'` emitted an unquoted path; pasting it broke
  whenever `TMPDIR` contained spaces.
- The emitted line is now `%q`-quoted (Bash builtin quoting — the display
  targets bash/zsh as before; no POSIX/dash/Windows verification is claimed
  or added). The regression pastes the **actual printed line** verbatim into
  a subsequent `bash -c`, under a private `TMPDIR` literally named
  `tmp dir with spaces`, and blocks 2/3 run to completion.

### POST-07 — false cleanup ownership boundary (authored-source fix)

- The previous `case "$SBX_ROOT" in "${TMPDIR:-/tmp}"/d02sbx.*)` pattern is a
  lexical name check, not ownership: `$TMPDIR/d02sbx.anchor/../foreign`
  passed it and deleted a foreign surrogate.
- Removed entirely. Each block now prints a **literal**
  `rm -r -- <exact-private-root>` command (`%q`-quoted) naming the root that
  invocation created. Hints/answers (4 locales) now state why a lexical
  pattern is not an ownership proof; no variable-based guard is offered.
- Regression: the printed line is executed verbatim — real root removed; a
  `foreign-surrogate` sibling and a `d02sbx.anchor` decoy remain untouched;
  running the same literal line under a poisoned
  `SBX_ROOT=$TMPDIR/d02sbx.anchor/../foreign-surrogate` cannot redirect it
  (the line carries the literal path, not the variable). All surrogates
  were invocation-owned private fixtures.

### POST-08 — ambient import executed during preflight

- `python3 -c "import helper"` executed the ambient module's import side
  effects (a private sentinel was written) before the abort printed.
- The check is now non-executing:
  a three-valued non-executing probe:
  resolvable → `exit 0` → abort `already resolves 'helper'`; not
  resolvable → `exit 1` → proceed; probe error → `exit 2` (caught and
  mapped, not swallowed) → abort `helper-resolvability probe failed`.
  `find_spec` resolves `helper` through the import machinery in the
  intended lookup context without running module code. Verified: a
  synthetic `helper.py` whose import writes a sentinel aborts with
  `already resolves 'helper'` and the sentinel is **never created**;
  `prehelper/` retains only `helper.py`.
- The intended `ModuleNotFoundError` evidence path, scoped
  `PYTHONPATH=tools` fix, and abort-before-any-write ordering are
  unchanged.

### POST-09 — duplicated appended paragraph (en only)

- The appended fail-stop/continuation paragraph appeared twice in the
  English `instructions` of day-02-act-03, day-03-act-01, day-03-act-03.
  Collapsed to one occurrence each; ja/zh-Hans/zh-Hant instructions never
  carried the duplicate (verified — single occurrence) and got the same
  semantic content once.

### Executed evidence (this host: Linux, bash 5.x, Python 3.14.8)

- All three authored blocks run **raw** (`spawnSync('bash', ['-c', block])`,
  no injected `set -e`/`cd`) to exit 0 in normal flow.
- Spaced-`TMPDIR` run: printed `export SBX_ROOT=/…/tmp\ dir\ with\ spaces/…`
  pasted verbatim → block 2 `sys.path` evidence correct, block 3 prints
  `ok`; printed `rm -r -- /…/tmp\ dir\ with\ spaces/…` executed verbatim →
  spaced root removed. Same verbatim-line flow verified for the d02sbx and
  d03rpt cleanup lines under the spaced `TMPDIR`.
- `pp_state` records: `unset`→`PYTHONPATH {b,a}: unset`;
  `""`→`set value=<>`; nonempty→`set value=</actual/path>` — before==after
  in each case, all three records pairwise distinct.
- Import-side-effect sentinel negative (POST-08) and
  traversal/stale/foreign cleanup negatives (POST-07) as above.
- umask-0777 sentinel negatives still pass for **all three** setup blocks
  (fs-sandbox, env-drill, report-sandbox): abort non-zero, caller sentinels
  byte-identical, no exercise artifacts in the caller directory.
- `test_days_02_03_repairs.cjs`: **573 assertions PASS**;
  `test_study_days_01_03`, `test_acceptance_repairs` (28,154),
  `test_candidate_regression`, `test_calendar_ledger`: all green;
  `git diff --check` clean on the allowed paths.

### Revisions

- `day-02-act-03` → `2026.10.30-rev4`; `day-03-act-01`, `day-03-act-03` →
  `2026.10.30-rev4`. All other activities keep their prior revisions —
  unchanged content means unchanged revision (day-02-act-01 stays rev3,
  day-02-act-02/04 stay rev2, day-03-act-02/04 stay rev3).
- IDs, `independent`×6/`agent_assisted`×2 policies, 4×120=480 minutes,
  quiz-absence, prerequisite/recovery topology, first-pass/none-found
  alternatives, three-line MRE label: unchanged.

### Limits (this batch)

- `%q` output is verified pasted into **bash** only, as the blocks display;
  it is also valid zsh syntax but that is not separately executed here.
  POSIX `dash` lacks `%q` — the printed line is still a valid literal
  command there (it contains no expansions), but that is reasoned, not
  executed. Windows remains reference-only, unchanged.
- The `find_spec` probe checks resolvability in the learner's lookup
  context; it does not guarantee absence of import-time hazards inside the
  *fixture* (the fixture's own `tools/helper.py` is intentionally imported
  by `app.py` — that is the exercise, not ambient).
- Literal `rm -r --` removes exactly the printed path — it is not a
  statement about a malicious environment or an OS sandbox; none is claimed.
- No acceptance claimed; parent freezes and re-verifies independently.

## Follow-up batch 3 — POST-08 residual (fail-closed probe), ja hint dup, shell scope

Parent probes found that the batch-2 probe still aliased *unverified*
absence to a verified one: `sys.exit(0 if find_spec('helper') is not None
else 1)` returns 1 both for positively verified absence AND for ordinary
Python/import failures (the `import sys, importlib.util` line sits outside
`try`). A controlled `python3` wrapper raising `ImportError`/exit1 on the
probe call let the block proceed, create `env-drill/app.py`, and print a
normal export — the precondition was never checked.

### Fail-closed resolvability protocol (day-03-act-01, all 4 locales)

- New encoding: `sys.exit(0)` is emitted **only** when
  `spec = importlib.util.find_spec('helper')` ran and returned `None`
  (verified absence). Resolvable `helper` → `sys.exit(3)` →
  `already resolves 'helper'` abort. `find_spec` raising → `sys.exit(4)`;
  any other nonzero (including `import`/init failures surfacing as exit1)
  → `abort: helper-resolvability probe failed (rc=<n>)`. Every nonzero
  except the resolvable code aborts — nothing proceeds on an unverified
  precondition.
- The check remains non-executing with respect to `helper` (no import, no
  module side effects); the intended `ModuleNotFoundError` demonstration,
  the single-invocation `PYTHONPATH=tools` fix, and the three-state
  `PYTHONPATH` setness/value evidence are unchanged.
- Verified with the parent's own fault shape: an invocation-owned
  `faultbin/python3` wrapper exits `${FAULT_RC}` (1, 2, 73) only when the
  argv contains `find_spec`, delegating every other call to the project
  `.venv` Python. Each fault aborts the block with
  `probe failed (rc=<n>)` and produces **no** `env-drill` artifacts;
  caller sentinel unchanged. Normal absence, real ambient resolvability,
  and the import-side-effect negative still behave as before.

### ja hint duplicate (day-02-act-03/ja)

- `サンドボックスは使い捨てです。` appeared twice consecutively (an
  artifact of the batch-2 replacement anchoring before the kept sentence).
  Collapsed to one occurrence; cleanup/ownership wording otherwise
  unchanged. No separate revision rationale is claimed for the dedupe —
  the activity already bumps for the batch-3 substantive changes.

### Shell-scope honesty (all three repaired activities, all 4 locales)

- day-02-act-03 instructions claimed the assessed sequence was
  "POSIX (bash/zsh)". It is not: the blocks and their printed
  `export`/`rm -r --` lines use **Bash `%q` quoting**. All three
  activities now say the blocks run under **Bash**, name Linux Bash as the
  executed scope, and mark zsh/dash/Windows as unexecuted references
  (the Windows/cmd equivalents remain in the answers for orientation only,
  unchanged). Prompt leads now say "a fresh Bash shell" (and localized
  equivalents).
- The five authored shell fences changed ```` ```sh ```` → ```` ```bash ````
  so the fence matches the required runtime. Block *bodies* are unchanged
  and still byte-identical across editions.
- dash was never executed (not found on the restricted test PATH) — no
  dash failure or success is claimed; zsh and Windows remain unexecuted;
  no OS-sandbox or malicious-environment guarantee is claimed.

### Executed evidence (this host: Linux, bash, project `.venv` Python 3.13.15)

- `test_days_02_03_repairs.cjs` now runs the blocks under the project
  `.venv` Python (fixture PATH prepends `.venv/bin`), matching the parent
  probe environment. New checks: three-valued probe source form,
  fault-injection aborts at rc=1/2/73 with no `env-drill` artifacts,
  `POSIX (bash/zsh)` absence, Bash-scope presence, ```` ```bash ```` fences,
  ja hint single-occurrence.
- Result: **620 assertions PASS**; `test_study_days_01_03`,
  `test_acceptance_repairs` (28,154), `test_candidate_regression`,
  `test_calendar_ledger`, `test_day_01_repairs`: all green;
  `git diff --check` clean on the allowed paths.

### Revisions

- `day-02-act-03`, `day-03-act-01`, `day-03-act-03` → `2026.10.30-rev5`
  (fail-closed probe and/or Bash-scope wording are substantive content
  changes; the ja hint dedupe rides on act-03's substantive bump — the
  style fix alone would not warrant one).
- All other activities keep their revisions; IDs, policies, 4×120=480,
  quiz-absence, prerequisite/recovery topology, first-pass/none-found
  alternatives, three-line MRE: unchanged.

### Limits (this batch)

- Bash + Linux only is the stated and executed scope; `%q` pasting is
  verified in bash alone. No dash/zsh/Windows execution claim; no dash
  failure claim either (unexecuted). The probe guards *resolvability*
  preflight only — it is not an ambient-safety proof, and no OS-sandbox or
  malicious-environment guarantee is implied. Worker evidence is not
  acceptance; parent freezes and re-verifies independently.
