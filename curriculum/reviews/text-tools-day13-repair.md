# Text Tools / Day 13 bounded repair — evidence record

Scope: `projects/text_tools/{core.py,cli.py}`, `curriculum/projects/text_tools/{en,ja,zh-Hans,zh-Hant}.json`,
`curriculum/content/day-13/{en,ja,zh-Hans,zh-Hant}.json`, `curriculum/days/day-13.json`,
`curriculum/days/day-15.json` (revision-only, justified below), `tests/projects/test_text_tools_integrity.py` (new).
Handoff: `/tmp/learn-acceptance-mvuzerj9-jo9igejn/handoff-day13-project-active.md`. Evidence probes:
`day13-project-behavior-probes.json`, `text-tools-guide-defect-probes.json`, `text-tools-baseline-focused-tests.json`.

This is a candidate record, not acceptance. Days 01 and 02–03 remain separately frozen and unmodified.

## Implementation fixes (core.py / cli.py)

1. **Input/output collision rejection** (`generate_artifacts`, before `mkdir` and any write):
   every generated artifact name (`train.txt`, `val.txt`, `test.txt`, `stats.json`, `vocab.json`,
   `manifest.json`) is checked against the input — resolved-path equality plus `os.path.samefile`
   for existing symlink/hardlink aliases. Verified privately: input at `out/train.txt` → exit 1,
   source bytes unchanged, no `manifest.json` written; hardlink alias at `out/val.txt` → rejected;
   symlink alias at `out/test.txt` → rejected; input inside `output_dir` under a non-artifact name
   (`corpus.txt`) → still succeeds.

2. **Original-byte provenance**: the source is snapshotted once as bytes; `source_sha256` is the
   SHA256 of the raw input bytes and `source_size_bytes` is `len(raw)` from the same snapshot.
   `decoded_text_sha256` separately identifies the decoded, universal-newline-normalized text
   (re-encoded UTF-8). `input_decoding` records `encoding`, `errors`, and the newline policy
   (`CRLF`/`CR` → `LF`, matching the previous text-mode read so stats are unchanged). Artifacts are
   written via explicit UTF-8 byte writes so recorded hashes describe on-disk bytes on any platform
   (Linux-verified; Windows behavior consistent but unexecuted). The CLI now reuses
   `result["stats"]` when `--split` ran, so printed stats and artifacts describe one snapshot —
   verified: `--stats --json --split` stdout equals `stats.json` byte-for-field.

3. **Ratio validation and count correction**: every ratio must be finite (`math.isfinite`) and in
   `[0.0, 1.0]` — the 200,000-record `(0, 1.000004, 0)` witness is now rejected
   (`Split ratio val=1.000004 is outside the allowed range [0.0, 1.0]`). NaN/inf and negatives
   rejected; sum tolerance `1e-5` retained but weights are normalized to sum exactly 1.0 and both
   `normalized_ratios` and the `ratio_normalization` note are recorded in the result and manifest.
   The negative-residual correction removes only the deficit and only from positive-weight
   partitions; a zero-weight residual partition's records move to the positive-weight partition
   with the largest fractional share. Verified: `seed7 .6/.2/.2` on 5 records → `3/1/1`;
   `(0.5, 0.5, 0.0)` on 5 → test count 0, all 5 allocated; names.txt → `25626/3203/3204`
   (unchanged); empty input → all zero counts.

## Shared-guide fixes (all four language editions)

1. `worked_examples[0]`: `vocab_size=32033` corrected to `vocab_size=29494` — unique tokens, not
   total occurrences (total_tokens stays 32033; real-data guard test asserts both on bundled
   `data/names.txt`). Split counts 25626/3203/3204 preserved.
2. Index-vs-content leakage aligned in `requirements[3]`, `exercises[1].check`, `debug-01`
   root/remediation, `ind-01`/`ind-02` criteria, `chk-04`, and the leakage pitfall: index
   disjointness verifies allocation integrity; repeated record *content* may still span splits
   (10 identical `echo` records; names.txt seed 42 → 424 shared train/val values). Shuffling is
   not a dedup fix; the manifest records identity, it does not enforce consumer separation.
3. `debug-04`: dict insertion order is stable per run — hash randomization does not reorder an
   identically constructed dict; a dict inherits unstable order only from an unordered source.
   Remediation: ordered lists + explicit index permutation; fix order before using unordered input.
4. `ind-03` criteria: per-glyph byte length is not constant — `A`=1cp/1B, `中`=1/3, `😀`=1/4,
   `❤️`=2/6, `👍🏽`=2/8, family ZWJ=7/25; distinguishes code points from grapheme/display sequences.
5. `requirements[4]`: valid empty, repeated, Unicode, and `--errors replace` cases must succeed
   (exit 0); missing files, strict-undecodable bytes, non-finite/out-of-range ratios, and
   input/output collisions must fail descriptively — in all four editions (the ja/zh versions
   previously lumped success cases under non-zero-exit requirements).
6. Worked examples: fixed `/tmp/artifacts` and uncreated `/tmp/corrupt.txt` replaced with
   invocation-owned `WORKDIR=$(mktemp -d)` setup and real malformed bytes (`printf 'ok line \xff
   bad\n'`); summaries labeled illustrative and document that absolute cli.py/input/output paths
   let the same call run from an unrelated cwd (verified: strict → exit 1 descriptive,
   replace → exit 0, absolute-path split from `cwd=/` → exit 0). Ordinary process isolation is
   stated as such — no OS-sandbox claim.

Preserved: `project_id`, `pred-01..03`, `debug-01..04`, `ind-01..03`, `agent-01..02`,
`chk-01..06`, `requirements` count, all required sections, and every unchanged field.

## Day 13 content fixes (all four editions)

- act-01: private-workspace requirement with the complete invocation
  `python3 projects/text_tools/cli.py --input "$WORKDIR/corpus.txt" --stats --json --split
  --output-dir "$WORKDIR/artifacts"`; manifest verification now includes original-byte
  `source_sha256` (`sha256sum` comparison) and `input_decoding`; answer records the new fields and
  collision rejection.
- act-02: the assessed interface is explicit — exactly one of `analyze_text(text) -> dict` or
  `compute_splits(lines, train_ratio, val_ratio, test_ratio, seed) -> dict`, chosen and stated by
  the learner; answer notes non-finite/out-of-range ratio rejection.
- act-03: "hidden test" reworded to "held-out behavior check" (no platform-evaluator claim); the
  reference answer now covers collision rejection before writes and ratio-bounds rejection.
- act-04: sealed/submitted unaided report is the independent evidence; assisted polish is a
  separately labeled, unassessed artifact that never replaces the sealed draft; substantive gaps
  found via assistance require a fresh unaided check before mastery counts.
- Common labels: `time_budget_label`/`category_label` localized in ja/zh-Hans/zh-Hant.

## Revision decisions

- `curriculum/days/day-13.json`: all four activities → `2026.10.30-rev2` (all four changed).
- `curriculum/days/day-15.json`: all four activities → `2026.10.30-rev2`. Justification: every
  day-15 activity links `curriculum/projects/text_tools/project.json` as a source resource and its
  objectives exercise the changed behaviors (CLI execution from unrelated cwd, ratio validation,
  manifest fields, reproducibility); rev1 learner evidence should flag stale. No day-15 content
  edits — its prose already describes held-out checks and sealed handoffs consistent with the fixes.
- IDs, `assistance_policy` (`agent_assisted`/`independent` alternation), 4×120-minute ledgers,
  prerequisite/recovery links, and quiz absence preserved everywhere.

## Commands run and results

- `.venv/bin/python -m unittest tests.projects.test_text_tools_integrity` — 26 tests PASS
  (collision×3 + non-artifact-name input, CRLF/Latin-1 raw-byte hashes, replacement-decoding record,
  single-snapshot stats, 200k witness + 6 invalid ratio vectors + zero-weight/seed7/empty counts,
  real-data vocab guard, guide path/ID/localization/sealed-report/ledger checks; the guide's own
  printf recipe executed privately).
- `.venv/bin/python -m unittest tests.projects.test_text_tools tests.projects.test_text_tools_curriculum`
  — 12 baseline tests PASS unchanged (20-line `.8/.1/.1` → 16/2/2, names.txt counts, malformed
  strict/replace, missing-file, invalid-sum, unicode, empty, repeated, seed reproducibility).
- `node tests/unit/test_study_days_13_15.cjs` — PASS; `node tests/unit/test_acceptance_repairs.cjs`
  — 28,155 assertions PASS; `node tests/unit/test_candidate_regression.cjs` — PASS;
  `git diff --check` — clean.
- Private probes (in-process `generate_artifacts`/`compute_splits` and CLI subprocess, all under
  `TemporaryDirectory`/`mktemp`): outputs quoted above.

## Limitations

- Linux/bash + Python 3.14 verified; Windows newline/byte-write equivalence is consistent by
  construction but unexecuted. `os.path.samefile` covers existing symlinks/hardlinks where the
  filesystem supports them; exotic cases (dangling links, cross-device bind mounts) fall back to
  resolved-path equality.
- Ratio sums within `1e-5` are still accepted then normalized — documented in the manifest rather
  than rejected; sums outside tolerance fail as before.
- Localization structurally checked (per-language anchors, required markers, identical commands);
  not native-speaker reviewed.
- rev1 learner evidence for days 13/15 flags stale against rev2 by design; no learner history was
  touched.

## Follow-up: shared-guide narrow corrections (post-Day-14 batch)

Handoff: `/tmp/learn-acceptance-mvuzerj9-jo9igejn/handoff-text-tools-guide-followup.md`.
Scope: exact guide fields in the 4 `curriculum/projects/text_tools/*.json`,
`core.py` docstring/comment/`ratio_normalization` text only, and the focused
tests. No computation, IDs, ledgers, or other lessons changed.

### Corrections (all four editions)

1. **ind-01 criteria used `train_indices & val_indices` on list values** —
   `compute_splits` returns lists; `list & list` raises TypeError (parent
   reproduced). Now `len(set(train_indices) & set(val_indices)) == 0` with a
   real public-interface regression: the test calls `compute_splits`, proves
   `&` raises TypeError on the lists and the `set()` form works.
2. **worked_examples[1] (split) was cwd-relative** — stored command now
   captures and validates absolute repo/CLI/corpus paths BEFORE `cd`, creates
   two invocation-owned `mktemp` dirs, and invokes the CLI from an unrelated
   private cwd with absolute paths + private `--output-dir`, ending in `ls`
   of the artifacts. Summary scoped to bash; ordinary process isolation, not
   an OS sandbox.
3. **worked_examples[2] (malformed bytes)** — printf switched to octal `\377`
   (parent-executed portable form; dash is NOT installed here, no dash claim);
   the stored command embeds a python assert verifying the 0xFF byte; replace
   exits 0, strict variant documented separately.
4. **agent-01 criteria demanded fabricated fixes** — now requires real edge
   checks + recorded evidence; fixes only when a genuine defect exists, else
   the learner records checks run, no-defect evidence, and testing limits.
5. **requirements[2]** — appended a narrow reproducibility qualifier: same
   input bytes/ratios/seed/decoding options/this implementation+environment,
   not cross-implementation or cross-platform.
6. **core.py text only** — docstring now says index-overlap check only (no
   duplicated-content or dedup-policy claim); normalization comment and
   `ratio_normalization` result text say "sum to 1.0 within floating-point
   precision (not bit-exact)" instead of "exactly 1.0" (parent witness:
   (0.500002, 0.5, 0) yields weights summing 1.0000000000000002). No
   computation, allocation, clamp, or rounding changes; keys/interfaces
   preserved.

### Executed evidence

- Stored commands executed verbatim via `bash -c` with `TMPDIR` pinned to a
  private dir, cwd=repo root: WE1 → exit 0, six artifacts listed and present,
  stats `total_tokens=32033`, `No index overlap` label shown; WE2 → exit 0,
  `corrupt.txt` contains literal `0xFF`, `--errors replace` prints stats;
  strict variant → exit 1 with descriptive decode error.
- `python3 -m unittest tests.projects.test_text_tools
  tests.projects.test_text_tools_curriculum
  tests.projects.test_text_tools_integrity` — **41 tests PASS** (29 in the
  integrity module).
- `node tests/unit/test_day_14_repairs.cjs` — **139 assertions PASS** after
  the harness-safety tightening below.
- `test_study_days_13_15`, `test_acceptance_repairs` (28,155),
  `test_candidate_regression`, `git diff --check` — all green.

### Day-14 test harness safety (authorized TEST-only change)

`tests/unit/test_day_14_repairs.cjs`: `fixtureEnv` now pins `TMPDIR` to the
invocation-owned outer `mkdtemp` root so authored `mktemp -d` stays inside
it; the captured `workdir` path is verified to be an actual descendant of
that root before any use; cleanup removes only the outer root (safe even if
the script dies before `workdir.path` exists). Lesson bytes and assertions
unchanged — harness safety, not a learner-behavior correction.

### Limitations

- Bash-only execution evidence; zsh/Windows/dash not claimed (dash absent).
- Normalization remains accept-then-rescale; weights are float-sums, not
  bit-exact — now stated in code and manifest text.
- ind-01 still checks record indices, not content identity.
- Localization structurally checked, not native-speaker reviewed.
- Passing tests are supporting evidence, not instructional acceptance.

## Addendum: Day 13/15 instruction-contract batch (2026-10-30)

Handoff: `handoff-days13-15-instruction-contract.md`. Bounded contract
repairs only — no Day 14, no Day-13 act-04, no algorithm/computation
changes, no other days.

### Shared-guide same-shell fix (all 4 editions)

- Reproduced the parent's finding before fixing: executing stored
  `worked_examples[1].command` then `worked_examples[2].command` in one
  `bash -c` invocation exited 2 — Example 2 ended `cd`-ed in its unrelated
  `mktemp` dir, so Example 3's relative `projects/text_tools/cli.py`
  resolved under it (`can't open file ...`).
- Fix: Example 2's entire recipe now runs inside `( ... )` — a subshell
  contains the `cd`, preserves `mktemp` ownership and the absolute
  `CLI`/input/output paths, and the caller's cwd is unchanged. Verified:
  `bash -c "we1\nwe2"` now exits 0, `manifest.json` appears in stdout and
  Example 3 prints `Total Tokens`.
- New regression `test_guide_examples_run_consecutively_same_shell`
  executes the two stored commands in ONE bash process under a private
  `TMPDIR` — the previous per-command shells masked the leak.
- Narrow omissions restored: `acceptance_checklist[4]` missing-file
  wording added to ja/zh-Hans/zh-Hant; ja `exercises[2]` now states the
  ratios, ja `exercises[3]` states `--errors strict|replace|ignore`.
- `acceptance_checklist[2]` in all editions now bounds byte identity to
  identical input bytes/ratios/seed/decoding+newline
  policy/implementation-runtime-platform and notes manifest `created_at`
  differs (semantic provenance vs manifest bytes).

### Day 13 act-02 both-route alignment (all 4 editions)

- Prompt declares ONE assessed interface and requires a DISTINCT fresh
  unaided input with a predicted result. Route A `analyze_text` contract
  lists the real returned keys; Route B `compute_splits` keeps the
  5-record `.6/.2/.2` seed-7 → 3/1/1 case plus index-disjointness proof.
- Answer contains the executed witness for `'a a\n猫🙂'`:
  `total_chars=6, total_tokens=3, vocab_size=2, char_vocab_size=5,
  token_frequencies={'a':2,'猫🙂':1}, char_frequencies per-code-point,
  min=1, max=2, avg_token_length=1.3333 (exact 4/3 rounded to 4 dp),
  char_distribution={3,0,2,0,1}`; empty input → zeros. Canonical cases
  labeled public reference, not hidden evaluation; same assessment ID,
  `independent` policy, 120 min preserved.
- act-03 answer's overbroad "identical seeds reproduce split text
  byte-for-byte" bounded to identical original input bytes/ratios/
  decoding/newline policy/implementation-runtime-platform; manifest
  `created_at` excluded (all 4 languages).

### Day 15 (all 4 editions)

- act-04 rewritten to the preserved sealed-original contract: record
  prediction → run own checks to collect real evidence (own checks are
  part of the unaided attempt) → write, lock/submit/date, and PRESERVE
  the completed first unaided report BEFORE any editorial/reference/AI
  review → later polish is separately labeled, unassessed, cannot
  overwrite the original → substantive gaps found later need fresh
  unaided remediation. No implication that assistance is cheating;
  existing independence/disclosure rules are the safeguards.
- act-01/act-02 answers: seed-reproducibility claims bounded the same
  way as Day-13 act-03.
- `time_budget_label`/`category_label` localized for ja (`480 分のアク
  ティブな学習時間…` / `自律学習と Python`), zh-Hans (`480 分钟主动学
  习时间（不含休息与无人值守运行）` / `自主学习与 Python`), zh-Hant
  (`480 分鐘主動學習時間…` / `自主學習與 Python`). English left as-is.
  480 minutes retained; no minute-by-minute pacing invented.

### Revisions (narrow, changed-activities only)

- day-13: act-02, act-03 → `2026.10.30-rev3`; act-01, act-04 stay rev2.
- day-15: act-01, act-02, act-04 → `rev3`; act-03 stays rev2.
- No day-14 or other-ledger bumps.

### Evidence run

- `python3 -m unittest tests.projects.test_text_tools
  tests.projects.test_text_tools_curriculum
  tests.projects.test_text_tools_integrity` — 47 tests, OK (was 41).
- `node tests/unit/test_study_days_13_15.cjs` — passed.
- `node tests/unit/test_acceptance_repairs.cjs` — 28,155 assertions OK.
- `node tests/unit/test_candidate_regression.cjs` — 90 days / 43,200 min
  / 4 editions / 4 tracks / 30 review records.
- `GIT_OPTIONAL_LOCKS=0 git diff --check` — clean.
- Day-14 files byte-identical to the post-verification end state; F08
  metadata untouched as instructed.

### Limitations (unchanged scope)

- Bash/Linux/Python-3.14 evidence only; subshell containment is Bash
  semantics — zsh/Windows/dash still unclaimed.
- Reproducibility bound is wording, not a cross-version guarantee.
- Localization structurally checked, not native-speaker reviewed.
- Local evidence ≠ Course Readiness; no acceptance claimed.
