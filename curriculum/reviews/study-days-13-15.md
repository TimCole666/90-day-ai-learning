# Study Days 13–15 review record

**Review revision:** 2026.10.30-rev1
**Scope:** `day-13`, `day-14`, and `day-15`; English, Simplified Chinese, Traditional Chinese, and Japanese editions; the real `projects/text_tools/` implementation; the disposable-repository Git exercises.

## Per-lesson findings

- Day 13 turns the actual `text_tools` project into the exercise: prediction before `python3 projects/text_tools/cli.py`, all seven learner-facing flags (`--input`, `--stats`, `--split`, `--output-dir`, `--seed`, `--encoding`, `--errors`), an independent re-implementation of `analyze_text`/`compute_splits`, held-out debugging cases, and a report that must cite real manifest fields.
- Day 14 is the review day: branches and `git diff`/`git diff --check`, an independent merge-conflict resolution, safe recovery limited to `git restore`/`git revert`, and PR-style review. Every exercise runs in a disposable clone or `git worktree`; `reset --hard`, `clean`, `force-push`, and recovery commands are explicitly prohibited against the learning repository. External publication is not authorized.
- Day 15 reproduces the complete pipeline from a clean directory, evaluates held-out cases independently (Unicode, empty input, malformed encoding, duplicate records, ratio validation, seed reproducibility), and traces the provenance chain `source_sha256 → ordered records → seed → split_sha256` to the `reusable_by_projects` consumers (`makemore`, `minbpe`, `nanogpt`) before the portfolio handoff.

## Execution-verified claims

The reference behavior described in all four editions was exercised against the checked-in implementation on 2026-10-30: `--help` lists exactly the documented flags; `--split` writes `train.txt`, `val.txt`, `test.txt`, `stats.json`, `vocab.json`, and `manifest.json`; missing input, `--split` without `--output-dir`, strict decoding of malformed bytes, and ratio sums other than 1.0 each exit non-zero with a diagnostic; `--errors replace` produces U+FFFD; an empty file yields valid zero statistics; identical seeds reproduce split file bytes while `created_at` keeps manifests non-byte-identical. Content that names these behaviors is therefore verified rather than aspirational.

## Language-edition review

All four editions share the same stable activity IDs and equivalent objectives, instructions, exercises, hints, reference answers, mastery criteria, and independent-versus-assisted rubrics. Requirements, instructions, hints, answers, and rubrics are localized into each edition; code, CLI flags, file and artifact names, function names, JSON field names, and Git safety boundaries remain invariant where executable or safety-critical. This review checks structural and semantic equivalence; it does not claim native-speaker certification.

## Source and rights review

Python Standard Library documentation (`stdtypes` str type, `argparse`) is linked under the PSF license; Pro Git Second Edition is linked for Day 14 under CC BY-NC-SA 3.0 with compared candidates recorded. No source text is imported. The internal `text_tools` project is attributed as an `original_explanation` resource (`source_type: internal-project`, Apache-2.0 AND CC-BY-SA-4.0 per `curriculum/projects/text_tools/project.json`) rather than listed as an external source in the registry; its `original_url` is a repository-relative path since no public URL exists, which the legacy URL-format check in `test_source_rights.cjs` flags alongside pre-existing errors on earlier days.

## Execution and acceptance limits

Structural tests validate 480-minute accounting, four-activity parity across languages, required fields, localized terms, and the `lessons/` boundary. Browser tests verify all twelve localized routes render. These checks and the CLI verification above do not prove learner mastery, live Git behavior, or human translation certification.
