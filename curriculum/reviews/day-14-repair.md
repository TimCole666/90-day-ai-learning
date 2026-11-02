# Day 14 (Git workflow) repair — evidence record

Scope: `curriculum/content/day-14/{en,ja,zh-Hans,zh-Hant}.json`,
`curriculum/days/day-14.json`, `tests/unit/test_day_14_repairs.cjs` (new),
`projects/text_tools/cli.py` (one human-label fix authorized by the handoff).
Handoff: `/tmp/learn-acceptance-mvuzerj9-jo9igejn/handoff-day14-git-active.md`.
Environment: Linux, bash, git 2.56, Python 3.14. Private `mktemp`/`mkdtemp`
fixtures only; the learning repository's Git state was never mutated; no
network, push, publish, credentials, or owner config access.

## Confirmed source findings (independently reproduced by reviewer, re-verified here)

1. Worked commands referenced stale placeholder cli.py text that no longer
   exists — the lesson's sed patterns would not apply.
2. `git worktree` was presented as an independent clone. It shares the base
   repository's refs and writes `.git/worktrees` metadata (verified); a real
   `git clone` of a private base is required.
3. Cloning the learning repository's HEAD omits its dirty/untracked project
   files — the exercise now copies exactly
   `projects/text_tools/{__init__.py,core.py,cli.py}` into a fresh private base
   and records sha256 hashes before committing.
4. Terminology/localization defects: ja act-01 prompt contained the English
   word "untouched"; zh-Hant used 固定裝置 ("fixture" as hardware) for the test
   fixture — replaced with 夾具; `time_budget_label`/`category_label` were
   English in non-en editions; every activity carried identical generic
   boilerplate prose.

## Executed examples/counterexamples (all run in the private fixture)

- **act-01 (branch + evidence)**: copy-3-files base → `git init` → sha256 →
  commit → `git clone` → `parser-help` branch → sed help-line change →
  `status --short` shows only ` M projects/text_tools/cli.py`; `diff`/`diff
  --cached`/`diff --check` recorded; focused commit; **behavioral check**:
  `--help` prints `Path to the input text corpus file (UTF-8 by default; ...)`.
- **act-02 (two-branch conflict)**: `desc-provenance` + `desc-unicode` branches
  edited the same description line → `git merge` exits non-zero with
  `CONFLICT (content)`; markers observed; resolution keeps BOTH terms
  (`Unicode-aware statistics … and original-byte provenance artifacts`);
  `git rev-list --parents -n 1 HEAD` prints three ids (two-parent merge); two
  separate `--help | grep -F` checks pass; status/diff --check clean.
- **act-03 (recovery boundaries)**: two edits on distant lines produce two
  hunks; whole-path restore would discard the unrelated KEEP edit (reviewer's
  counterexample confirmed); targeted undo leaves only the KEEP hunk
  (`--help` → `any integer`). Staged mistake: `git restore <path>` leaves
  `default=7` in `git diff --cached` — worktree is restored FROM the index;
  `--staged` then unstages it. `git revert --no-edit $BAD` creates a new
  commit; `default=42` restored, GOOD's `must be in [0, 1]` survives,
  `git log` shows Revert/GOOD/BAD — history not rewritten. Expected failure:
  `git revert <merge-sha>` exits 128, `is a merge but no -m option was given`.
- **act-04 (CLI-level review)**: reviewer-authored bad `--quiet` patch —
  weak check passes (`--help` lists the flag); strong check fails the
  requirement (`--quiet --split` stdout still contains `Data artifacts
  generated successfully`; the flag is parsed but never read).

## Content changes

- All four activities rewritten in all four editions: complete runnable
  private-workspace setup (mktemp + GIT_CONFIG_NOSYSTEM + private HOME +
  PYTHONDONTWRITEBYTECODE), real worked command sequences, verified
  observations in `answer`, localized `instructions`/`hint`/
  `mastery_criterion`/`assistance_policy_label`.
- act-02 assessed on the learner's OWN variant (different line, own terms);
  the description-line case is the labelled worked reference. No AI/copied
  resolution counts as mastery.
- act-04 requires a sealed+submitted unaided review BEFORE checks; optional
  assisted comparison is labelled `assisted` and never replaces the sealed
  draft; assisted corrections need a fresh unaided recheck; the bad patch is
  labelled reviewer-authored (not observed agent output); no-defect
  alternative requires recorded checks, never "looks fine".
- act-01/act-03 labels declare the blocked/unexecuted boundary for optional
  agent portions — no fabricated transcripts.
- Dangerous commands excluded: no reset --hard, clean, force-push, or
  recovery commands against the learning repository; nothing pushes.

## cli.py label fix (handoff-authorized)

- Human summary `No leakage:` → `No index overlap:` — the boolean verifies
  record-index disjointness only, not content uniqueness. JSON/manifest key
  `no_leakage_verified` unchanged for API compatibility; baseline tests
  untouched.

## Identity preservation

- Activity IDs `day-14-act-01..04`, policies
  `[agent_assisted, independent, agent_assisted, independent]`, 120 min each
  (480 total), prerequisite topology unchanged; no quiz objects added.
- `content_revision` → `2026.10.30-rev2` on all four activities (only ledger
  change; `content_revision` itself was a prior dirty-tree addition).

## Verification results

- `node tests/unit/test_day_14_repairs.cjs` — **138 assertions PASS**;
  replays all four authored sh blocks end-to-end in one private fixture and
  asserts on real output (conflict markers, three-id parents line, staged
  `--cached` diff, revert commit, exit-128 mainline message, `--quiet`
  stdout).
- `node tests/unit/test_study_days_13_15.cjs` — PASS.
- `node tests/unit/test_acceptance_repairs.cjs` — PASS (28,155 assertions).
- `node tests/unit/test_calendar_ledger.cjs` — PASS.
- `python3 -m unittest tests.projects.test_text_tools
  tests.projects.test_text_tools_curriculum
  tests.projects.test_text_tools_integrity` — 38 tests PASS (label change
  compatible).
- `git diff --check` — clean.

## Limitations

- Commands verified on Linux/bash with git 2.56, Python 3.14 only. `sed -i`
  is GNU-form; macOS (`sed -i ''`) and Windows commands are noted as
  unexecuted reference. Behaviour on other git versions not executed.
- No real agent/provider executed anything; the assisted portions are
  optional and the content records them blocked/unexecuted when the tool is
  unavailable. The bad `--quiet` patch is reviewer-authored illustration.
- Localization is structurally checked (CJK presence, no English residue in
  checked fields), not native-speaker reviewed.
- rev1 learner evidence flags are stale against rev2 by design.
- Passing tests are supporting evidence only — not instructional acceptance,
  Course Readiness, or live-deployment evidence.

## Post-verification repair (D14-POST-01, D14-POST-02 + canonical baseline)

Handoff: `/tmp/learn-acceptance-mvuzerj9-jo9igejn/handoff-day14-postverification.md`.
Parent independently executed the actual continuous authored sequence and a
two-private-repo ambient-GIT_DIR probe; both defects reproduced with saved
stdout/diffs. Revisions: all four activities -> `2026.10.30-rev3` (all four
were substantively changed).

### D14-POST-01: staged cleanup silently dropped the KEEP hunk (fixed)

Reproduced: in the old continuous act-03, the rescued KEEP edit
(`any integer`) remained UNCOMMITTED; `git add` staged it together with the
mistake, and `--staged` + whole-path restore discarded BOTH -- the answer's
"only unwanted changes remain" was false. Fix in all 4 editions: the valid
edit is now committed (`document that --seed accepts any integer`) BEFORE the
staged-mistake demo, so the destructive steps genuinely cannot drop it; the
answer claims the post-cleanup truth (clean `git status --porcelain` AND
`--help` still prints `any integer` because KEEP was committed). Test now
asserts the KEEP commit exists in `git log`, `status --porcelain` is empty
after teardown, and `any integer` remains in the committed file -- not merely
that the text once appeared in aggregate stdout.

### D14-POST-02: ambient Git environment could steer the setup (fixed)

Parent probe: with GIT_DIR pointing at an unrelated private repository, the
old setup's `git config user.name` modified THAT repository. Fix: every block
now defines and uses `d14env` -- `env -i` keeping only PATH (tool lookup
only), private HOME/XDG_CONFIG_HOME/TMPDIR, WORKDIR, LEARN,
GIT_CONFIG_NOSYSTEM, GIT_CONFIG_GLOBAL=/dev/null, GIT_TEMPLATE_DIR=private,
commit.gpgsign=false, LC_ALL=C, PYTHONDONTWRITEBYTECODE. Ambient
GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE/GIT_OBJECT_DIRECTORY/GIT_CONFIG*/XDG/
template/hook/signing variables are dropped before every tool invocation.
Lesson text states this is environment hygiene, NOT an OS sandbox, and that
PATH only locates tools.

### Canonical baseline caveat (clarified)

act-02's independent variant can diverge from the canonical post-merge text
the continuations expect. act-03 now establishes the reference baseline
explicitly: `d14-ref` branched from `parser-help` + one commit containing the
resolved description line -- deterministic whether or not the learner ran the
reference merge, and the sealed independent attempt's branches are never
discarded. The merge-revert probe uses `git rev-list --all --merges -n 1`
with a note that an existing merge is required (run the act-02 reference
merge first otherwise).

### Continuation ownership

Each continuation block is complete: `: "${WORKDIR:?...}"` guard + private-
clone existence check + a full local `d14env` definition. act-01 exports
WORKDIR/LEARN and prints WORKDIR for learners starting a new shell. No
unterminated subshells or interactive-shell dependence.

### Executed evidence (adversarial replay)

- Full 4-block sequence executed verbatim in a private fixture under a
  TAINTED environment (GIT_DIR/GIT_WORK_TREE at an unrelated private sentinel
  repo, trap GIT_CONFIG_GLOBAL with foreign user.name + executable
  post-checkout template hook, fake GIT_INDEX_FILE/GIT_OBJECT_DIRECTORY):
  sentinel HEAD and `user.name` unchanged, no `pwned` hook file, all fixture
  commits authored `Learner`, trap config untouched.
- Post-cleanup: `git status --porcelain` empty; `git log` contains the KEEP
  commit; `grep -F "any integer" cli.py` present; merge revert exits 128 with
  the `no -m option` message.
- `node tests/unit/test_day_14_repairs.cjs` -- **148 assertions PASS**.
- `test_study_days_13_15`, `test_acceptance_repairs` (28,155),
  `test_candidate_regression`, `git diff --check` -- all green.

### Limits

Same as before (Linux/bash/git 2.56 only; env hygiene is not an OS sandbox;
no live agent; localization structural not native-reviewed). The sentinel
proves the AUTHORED blocks resist ambient Git env vars; it does not prove
anything about pre-existing owner damage (none claimed).

### Semantic addendum (D14-POST-03, D14-POST-04)

- **D14-POST-03 (all 4 act-04)**: instructions demanded the evidence-bearing
  review be sealed/submitted BEFORE the learner's own weak/strong checks,
  while mastery required observed stdout inside it — an impossible
  chronology that invited fabricated observations or silent rewrites. Fixed
  to: record prediction unaided -> run own checks (part of the unaided
  attempt, not assistance) -> seal+submit the completed unaided report with
  actual evidence -> optional labelled assisted comparison -> fresh unaided
  recheck for any assisted correction. Instructions, policy label, mastery
  criterion, and a chronology line in the answer updated in all 4 editions.
- **D14-POST-04 (ja/zh-Hans/zh-Hant act-03 exercise prose)**: the scenario
  sentence reversed BAD/GOOD order vs the correct English/code. Now states
  BAD single-parent commit followed by an independent GOOD commit;
  zh-Hant 獨立複製的反例 -> 獨立重現反例 (editorial).
- `test_day_14_repairs.cjs`: new chronology-order and BAD-then-GOOD
  regression assertions -- **164 assertions PASS**. Suite reruns:
  `test_study_days_13_15`, `test_acceptance_repairs` (28,155),
  `test_candidate_regression`, `git diff --check` all green.

## Addendum: D14-POST-05 fail-stop safety repair (rev3 -> rev4)

Handoff: `handoff-day14-failstop.md` + `day14-postrepair-independent-probes.json`
(`raw-setup-failed-cd-private-surrogate-only`).

### Reproduced defect (private surrogate only)

Executed the unmodified act-01 authored block under default Bash + `umask 0777`
with cwd inside a private surrogate repo (TMPDIR pinned to a private dir):
`mktemp -d` produced a mode-000 dir, `mkdir`/`cp`/`cd` then failed silently, and
the unguarded sequence continued **in the caller's repository** —
`d14env git init` printed `Reinitialized existing Git repository in
.../surrogate/.git/` and `git config user.name` overwrote
`Surrogate Private Owner` with `Learner` in `.git/config`. This matched the
parent's witness exactly (surrogate only; the learning repo was never touched).

### Learner-visible fix (all 4 editions, blocks byte-identical)

- Each displayed block now runs inside `( set -e; ... )` — a contained,
  controlled child Bash complete per block: a failed mktemp/mkdir/cp/cd aborts
  inside the subshell instead of falling through into the caller repo, and
  exports (WORKDIR/LEARN) no longer leak into the caller shell. The printed
  `export WORKDIR=...` line is the documented way to continue later blocks
  (their `:?` + clone-existence guards remain).
- act-01 validates the fresh WORKDIR (`-n`, `-d`, `-w`, `-x`) BEFORE any
  `$WORKDIR/...` expansion and validates `LEARN` before copying.
- Expected failures explicitly handled under `set -e`: act-02 merge wrapped in
  `if/else` printing `expected non-zero exit (content conflict): $?`; act-03
  merge revert guarded by a non-empty `MERGE_SHA` check, wrapped in `if/else`,
  stderr captured to `$WORKDIR/merge_revert.err` and grepped for `no -m option`.
- Tool selection documented honestly: each block prints `command -v git sed
  python3` (PATH only *selects executables* — not a trust boundary) and pins
  Python to the absolute `PYTHON_BIN=$(command -v python3)` for every check.
- Overstated claim corrected in all four languages' instructions: `env -i`
  drops ambient Git/config vars so they cannot steer THESE authored commands,
  but alone does not stop writes outside WORKDIR — the validated preconditions
  and fail-stop do that. PATH is not a trusted-tool list; hygiene, not an OS
  sandbox. Exercise prompts now ask why the fail-stop prevents caller-repo
  fall-through.

### Test changes (`test_day_14_repairs.cjs`)

- Replay now runs each authored block in its OWN `bash -c` invocation, threading
  WORKDIR via the printed `export WORKDIR=` line — the learner contract, not a
  joined-script accident. Harness no longer rewrites expected-failure lines.
- NEW negative regression: raw act-01 block (no test-added `set -e`) under
  `umask 0777`, cwd = private surrogate → asserts non-zero abort from the
  authored WORKDIR validation, surrogate `.git/config` byte-identical, HEAD
  identical, no `Learner` identity. Permission restore is chmod 0700 inside the
  invocation-owned neg-tmp only.
- Empty-WORKDIR verbatim variant intentionally NOT executed (static risk only).
- Structural: every block asserted `(\nset -e`-wrapped; act-01 asserted to
  validate `-w "$WORKDIR"` before use; PYTHON_BIN pinning asserted in all 4.

### Evidence

- Negative probe: exit 1, `abort: WORKDIR '...' is missing or unusable`;
  surrogate user.name `Surrogate Private Owner` preserved, config+HEAD identical.
- Positive 4-block replay (default env AND hostile ambient-Git env): all blocks
  exit 0; markers verified — `expected non-zero exit (content conflict)`,
  `merge: keep both requirements`, both help terms, `no -m option`,
  `expected non-zero exit (merge needs -m)`, KEEP commit, clean porcelain,
  `--quiet` flag parsed but unused (`Data artifacts generated successfully`).
- `test_day_14_repairs.cjs`: **178 assertions PASS** (was 164).
- `test_study_days_13_15`, `test_acceptance_repairs` (28,155),
  `test_candidate_regression`, `git diff --check` — all green.
- Ledger: all four activities `2026.10.30-rev4` (all blocks changed);
  no other days/fields bumped.

### Limits (unchanged)

- Linux/bash + git 2.56 evidence; subshell/`set -e` semantics are Bash —
  no zsh/Windows/dash claims. env -i hygiene != OS sandbox.
- The guard cannot rescue an already-running caller shell pasting blocks
  line-by-line instead of as blocks — documented unit is the block.
- Local evidence only; not whole-day acceptance.
