# Day 01 acceptance-repair record (bounded first repair batch)

**Date:** 2026-10-30
**Branch:** `integration/90-day-ai-learning` (HEAD `3d9c330a838716d8223a4473efa7c983e5020264`)
**Scope:** `curriculum/content/day-01/{en,ja,zh-Hans,zh-Hant}.json`, `curriculum/days/day-01.json` (content revisions only), `tests/unit/test_day_01_repairs.cjs` (new focused suite), this record. No other days, the source registry, `lessons/`, or learner data were touched. This record documents local offline checks only; it is not a Course Readiness claim.

## Defects and resolutions

### 1. day-01-act-03 — restored independent Git Fundamentals lesson

- **Defect:** objective/instructions required selecting an Agent Tool Track and delegating a change to an agent (in English even in ja/zh editions), while the exercise, mastery criterion, and ledger `assistance_policy: independent` demanded an unaided modify–stage–commit–log cycle.
- **Fix:** replaced objective/instructions/exercise_prompt/hint/answer/mastery_criterion with a coherent independent Git-basics lesson in all four editions:
  - complete worked ```sh sequence in a newly created disposable directory (`mkdir git-sandbox`, `git init`), no pre-existing repository state;
  - repo-local identity via `git config user.name`/`user.email` **without** `--global`, with the `.git/config`-only scope stated explicitly;
  - explicit `git status`, `git diff`/`git diff --cached`, staging, commit, and `git log --oneline` verification steps, each paired with an expected invariant;
  - destructive commands (`reset --hard`, `clean`, `push --force`) appear only inside prohibition wording;
  - agent orientation retained only as an explicitly **optional, unassessed** note outside the checked task.
- Activity ID `day-01-act-03` preserved; the activity has no ledger quiz (nothing to preserve there).

### 2. day-01-act-02 — real virtual-environment reference solution

- **Defect:** claimed venv creation/activation/isolation but shipped a one-sentence `VIRTUAL_ENV` answer and referenced an unspecified "shell-only fallback".
- **Fix:** all four editions now carry a runnable, bounded, offline command sequence plus expected invariants:
  - `python3 --version` gate (3.12+ target), creation in an empty `venv-sandbox` directory;
  - activation scoped explicitly to POSIX bash/zsh (`. .venv/bin/activate`) with named Windows alternatives (`py -m venv`, `.venv\Scripts\Activate.ps1`, `.venv\Scripts\activate.bat`);
  - invariants: `$VIRTUAL_ENV` set, `sys.executable` inside `.venv`, `sys.prefix` != `sys.base_prefix`, `python -m pip --version` reporting `.venv`'s site-packages, `deactivate` returning `sys.executable` to the base interpreter;
  - explicit scope note: venv isolates interpreter/packages via `sys.prefix`/`sys.path`, it is **not** a filesystem/security sandbox;
  - honest fallback: older interpreter → record version and repeat checks scoped to it; no interpreter → record `command -v python3`, `python3 --version`, `echo $PATH`, the observed error, and a scheduled install recovery task. An unexecuted task is not mastery. No installs or downloads anywhere.

### 3. day-01-act-04 — rubric-based retrieval log

- **Defect:** prompt/instructions/mastery were misaligned; the answer was motivational prose; the hint claimed retrieval is "the single most effective" method; en demanded 200 words while ja/zh demanded 200 characters.
- **Fix:** all four editions now specify a three-step closed-book protocol (recall unaided → correct one misconception with concrete evidence → schedule a recovery step), an explicit 4-item content rubric (own-words restatement ×2, misconception+evidence pair, marked missed/uncertain item, scheduled step), and a worked example log as the reference answer. The "single most effective" claim was replaced by a bounded statement citing Roediger & Karpicke (2006). All word/character count bars removed in every edition — raw length is not evidence of conceptual mastery.

### 4. Localization and boundary repairs

- act-02/03/04 learner-facing prose (objective, instructions, exercise_prompt, hint, answer, mastery_criterion) rewritten in each edition's language; code/API names preserved; identical ```sh command sequences across editions.
- `common.nav_legacy_roadmap`: en was `"📅 历史年度路线 (Legacy Annual Roadmap)"` (Chinese primary label) → `"📅 Legacy Annual Roadmap"`; ja/zh-Hans/zh-Hant given per-edition labels (the same Chinese string had been copied into all of them — other days still carry it; out of this batch's scope).
- `common.dev_slice_notice` localized in ja/zh-Hans/zh-Hant (was raw English).
- act-01 `assistance_policy_label` boundary clarified in all four editions: post-evidence assistance is **remediation only** — the assessed explanation must be produced unaided, and assisted remediation requires a fresh independent attempt before mastery is claimed. Ledger `assistance_policy` unchanged (`independent`).
- zh-Hant act-01 quiz repaired: `堆疊記憶體` ("stack", mistranslation of "heap memory") and `記憶體位址` (id-as-address) replaced with precise object-reference wording in q1/q2 explanations and the q3 distractor; act-01 `answer` root-cause wording aligned. Tracer code, `q1/q2/q3` ids, and answer keys `b/c/b` preserved (verified below).

### 5. Content revisions

- All four day-01 activities bumped `2026.10.30-rev1` → `2026.10.30-rev2` in `curriculum/days/day-01.json` (the project's `YYYY.MM.DD-revN` mechanism; same convention as day-35/36 repairs).
- **Stale-evidence implication:** any learner quiz attempt or project submission recorded against `rev1` will now compare as stale against `rev2` content and require revalidation on reload. This is the intended behavior for changed assessed material; it does not erase history. Because act-01's assessed quiz keys are unchanged but its content (label, zh-Hant explanations) did change, its bump is conservative and documented here rather than silently skipping the marker.

## Verification executed (commands and observed results)

| Command | Result |
|---|---|
| `node tests/unit/test_day_01_repairs.cjs` | PASS — 340 assertions |
| `node tests/unit/test_study_days_01_03.cjs` | PASS |
| `.venv/bin/python -m unittest tests.projects.test_study_days_01_03 -v` | PASS — 2 tests |
| `node tests/unit/test_acceptance_repairs.cjs` | PASS — 28,155 assertions (incl. quiz id/key stability vs HEAD over all 90 days) |
| `node tests/unit/test_candidate_regression.cjs` | PASS — 90 days, 43,200 min, 4 editions, 30 review records |
| `.venv/bin/python scripts/audit_calendar_ledger.py` | PASS — DAG valid, no dangling refs |
| `git diff --check` | clean |
| Worked-fixture execution (inside the new test, `mkdtemp` + `bash -c`) | act-03 extracted ```sh block executed: 2 commits created, clean `git status`, `user.name` confirmed repo-local. act-02 extracted ```sh block executed: real `.venv` created under the temp dir, `VIRTUAL_ENV`/`sys.executable`/`sys.prefix` vs `sys.base_prefix`/`python -m pip`/`deactivate` invariants all observed. Both fixtures deleted via `finally`. |
| Manual pre-write fixture run | Same two sequences run by hand in `/tmp/tmp.*` before authoring content; outputs matched the embedded reference transcripts (Python 3.14.8, git 2.56.0). |

## Pass 2 — interim-review corrections (same bounded batch)

Independent interim review found five remaining issues; all were corrected in the same allowed files.

### 1. `common.dev_slice_notice` — completeness claim removed

- Was: "Complete local curriculum content for Study Days 01–03 …" (and its new translations). Days 02–03 have unresolved content defects, so this was an overclaim.
- Now: availability/acceptance-pending wording in all four editions (e.g., en: "…available for review while acceptance is pending … Completeness is not claimed."). Other days' notices were not touched, per scope.

### 2. day-01-act-04 — no invented-error requirement

- Rubric item two is now either/or: an actual misconception recorded with correcting evidence, **or** an explicit "none found" statement plus one plausible common misconception rejected with evidence. A fresh unaided transfer/retrieval check with a recorded result is a separate required item. A bare "everything correct" claim still establishes nothing — it fails the evidence items.
- Instructions restructured into four distinguishable steps: unaided recall (references closed) → reference check/correction (annotate, don't overwrite) → fresh unaided check → scheduled recovery. Identical assessment demand in all four editions.

### 3. act-04 worked log — only actually-observed evidence

- The log previously claimed `sys.path` changed although no command prints `sys.path`, and inferred non-sandboxing from absent restrictions. It now cites the `marker.txt` read that the act-02 sequence actually performs: inside the activated `.venv`, `cat marker.txt` still prints `marker` — a file outside `.venv` but inside the disposable sandbox. No real learner files are read and no network access is tested.
- The worked log uses the new four-step phase structure and satisfies the revised rubric (checked by the test's content anchors).

### 4. day-01-act-02 — honest deactivation semantics

- Corrected per the reviewer's isolated nested-venv probe (`/tmp/learn-acceptance-mvuzerj9-jo9igejn/day01-nested-venv-probe.json`): standard activation deactivates an already-active outer venv, so a generic "restores the base interpreter" claim was wrong in both directions. The sequence is now explicitly scoped to a **fresh shell with no active environment**, proven by a before-state probe (`sys.prefix == sys.base_prefix` → `True`, recorded), and `deactivate` is verified by a closing probe matching that recorded before-state — no outer-restoration claim.
- `sys.executable` is documented as the invoked path (possibly a symlink inside `.venv`); the checkable invariants use `sys.prefix`/`sys.base_prefix` values.
- A disposable `marker.txt` read was added inside `venv-sandbox` (outside `.venv`) as the observed filesystem-isolation boundary demonstration.

### 5. Windows alternatives — correct diagnostics, honest execution boundary

- The assessed sequence is explicitly POSIX (bash/zsh). Windows equivalents are labeled reference commands **not executed in this material**, with the correct shell-specific diagnostics: `py -m venv`, `Activate.ps1`/`activate.bat`, `$env:VIRTUAL_ENV` (PowerShell), `%VIRTUAL_ENV%` (cmd.exe), `where.exe python`, `%PATH%`/`$env:PATH`. No execution-policy changes, no Windows execution evidence claimed on this Linux host.

### 6. Retrieval citation bounded

- The claim is now limited to the paper's actual result: in controlled experiments, retrieval practice improved delayed prose retention relative to repeated study. Source: Roediger, H. L. III & Karpicke, J. D. (2006), "Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention", *Psychological Science* 17(3):249–255, DOI `10.1111/j.1467-9280.2006.01693.x` (already in the day-01 ledger as `roediger-karpicke-2006`; registry untouched, no paper text copied).

### 7. Content revisions

- All four day-01 activities bumped `2026.10.30-rev2` → `2026.10.30-rev3`. Same stale-evidence implication as pass 1: `rev1`/`rev2` learner records flag for revalidation; history is preserved, not rewritten.

### 8. Test hardening (per review of `test_day_01_repairs.cjs`)

- Fixture subprocesses now run under a controlled environment: private `HOME`, `GIT_CONFIG_NOSYSTEM=1`, `LC_ALL=C`, and no inherited `VIRTUAL_ENV` — the owner's git config/hooks/signing and locale are never read or depended on.
- The venv fixture verifies **ordered, parsed values**: before-probe (4 values, `True`), `$VIRTUAL_ENV` line, inside-probe (4 values, `False`, `sys.prefix` == `.venv` path, `base_prefix` ≠ prefix), observed `marker`, pip line, closing probe equal to the recorded before-state. No `/usr` prefix matching and no `.venv`-absence heuristics.
- The git fixture verifies with machine-readable commands (`rev-list --count`, `status --porcelain`, `config --local`) plus the C-locale transcript checks.
- Added anchors for all five content corrections (pending notice, none-found alternative, fresh check, phase distinction, marker evidence, fresh-shell precondition, symlink note, Windows diagnostics, before-state verification).

### Pass-2 verification results

| Command | Result |
|---|---|
| `node tests/unit/test_day_01_repairs.cjs` | PASS — 418 assertions (git + venv sequences re-executed in controlled fixtures) |
| `node tests/unit/test_study_days_01_03.cjs` | PASS |
| `.venv/bin/python -m unittest tests.projects.test_study_days_01_03 -v` | PASS — 2 tests |
| `node tests/unit/test_acceptance_repairs.cjs` | PASS — 28,155 assertions |
| `node tests/unit/test_candidate_regression.cjs` | PASS |
| `git diff --check` | clean |
| Manual fixture pre-checks (this pass) | Revised venv sequence verified under `env -i` controlled environment on Linux/bash (Python 3.14.8); git sequence verified under `GIT_CONFIG_NOSYSTEM`+fresh `HOME`+`LC_ALL=C` — produced `master` branch, consistent with the lesson's "main/master varies" note. |

## Pass 3 — portable object-identity wording (narrow act-01 fix)

The portable-identity wording previously applied only to zh-Hant was still un-portable in en/ja/zh-Hans: en q1/q3 explanations + q3 option (`heap memory`, `memory address`, `(pointers)`), ja q1/q2 explanations + q3 option (`ヒープ`, `メモリアドレス`), zh-Hans answer + q1/q2 explanations + q3 option (`内存地址`, `堆内存`). Per the official Python 3.12 data-model reference (https://docs.python.org/3.12/reference/datamodel.html#objects-values-and-types — `id()` returns "an integer which is guaranteed to be unique and constant for this object during its lifetime"; identity-as-address is a CPython implementation detail), all four editions now use language-level object-reference wording: names refer to objects; `is`/`id(a) == id(b)` test identity only. Quiz ids, option keys, and ledger expected answers `b/c/b` are unchanged. `day-01-act-01` bumped to `content_revision: 2026.10.30-rev4`; the other three activities remain `rev3`. The focused test now asserts the no-layout-claim + object-reference anchors across all four editions (446 assertions, PASS).

## Pass 4 — consistency follow-up (frozen-candidate review)

Five bounded items from the frozen Day 01 verification:

1. **act-03 no-surprise alternative** — the prompt no longer demands an unexpected `git status` observation. All editions now offer: an unexpected observation, **or** one expected status transition with its actual output and an explanation of why it confirms the prediction; raw prediction and raw output are preserved as recorded.
2. **`tracer_bullet` localized** — act-01's learner-facing instruction field is now ja/zh-Hans/zh-Hant (key and IDs unchanged); it is the only un-localized extra field — `optional_media`, quiz titles/hints/explanations were already localized.
3. **Unconditional identity witness** — en required an MRE unconditionally while ja/zh made it conditional on unexpected behavior. All four editions now require a small identity/mutation witness snippet (MRE) regardless of prediction outcome — it is evidence for the identity claim, not only a remedy for surprise — in both `exercise_prompt` and `mastery_criterion`.
4. **Marker read via the venv interpreter** — `cat marker.txt` replaced with `python -c "print(open('marker.txt').read().strip())"` inside the activated `.venv`, so the demonstration evidences the venv Python process itself, not merely the shell. Sh block, `exercise_prompt` wording, answer transcript/comments, boundary paragraphs, and act-04's worked-log citation updated in all four editions. Executed privately: prints `marker` (venv Python 3.14, Linux); the reviewer's separate `.venv/bin/python` marker read is a different witness and is not conflated with this course command.
5. **Small consistency** — commit description now reads "snapshot of the staged tree plus zero or more parent commit IDs and metadata (the initial root commit has no parent)"; act-04 `objective` acknowledges the none-found alternative like its instructions/mastery; act-04 worked log Step 3 separates the unaided prediction (`d == [9, 0]`) from the observed checked result (`[9, 0]` — actually executed privately before inclusion).

**Revisions:** `day-01-act-01` → `2026.10.30-rev5`; act-02/03/04 → `2026.10.30-rev4`. Quiz ids/keys `b/c/b`, policies, and the 90/120/150/120-minute ledger unchanged. `node tests/unit/test_day_01_repairs.cjs` → **483 assertions PASS** (fixture re-executes the updated venv sequence including the interpreter marker read).

## Limitations and remaining uncertainty

- The ` ```sh ` sequences were executed on this machine (Linux, bash, Python 3.14.8, git 2.56.0). Windows PowerShell/cmd alternatives are provided in text but were **not** executed — flagged in the lesson as platform alternatives, not verified output.
- `python3 -m venv` requires `ensurepip`; if absent on a learner's distro, `python -m pip --version` inside the venv may fail. The lesson's fallback path covers an absent interpreter, not a broken `ensurepip`; this edge is unverified here.
- Localization quality is checked structurally (script presence, no English-prose leakage, semantic anchors, identical command sequences). Native-speaker review is not claimed. `tracer_bullet` is localized in all editions as of rev5.
- The git transcript's hashes and default-branch name (`main` vs `master`) vary by environment; the lesson states this. `git init` output naming and `git status` phrasing vary by git version.
- Other days still carry the Chinese `nav_legacy_roadmap` label and English `dev_slice_notice` in non-en editions; this batch fixed day-01 only, per the bounded handoff.
