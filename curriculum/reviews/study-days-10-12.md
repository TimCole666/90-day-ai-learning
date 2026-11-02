# Study Days 10–12 review record

**Review revision:** 2026.10.30-rev1
**Scope:** `day-10`, `day-11`, and `day-12`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.

## Per-lesson findings

- Day 10 teaches cwd-relative paths, explicit UTF-8 reads inside `with`, and evidence-first diagnosis: `Path.cwd()` plus `Path.exists()` separate a genuinely absent file from a wrong working directory, and a tolerant per-line parser records skipped line numbers while distinguishing `UnicodeDecodeError` (fix the declared encoding) from `ValueError` (one bad row).
- Day 11 covers precise exception handling: `try`/`except`/`else`/`finally` clause roles, the ban on bare `except`, and `with` as predefined cleanup. The environment block creates a real `.venv`, proves interpreter identity through differing `sys.executable` paths, and reproduces `ModuleNotFoundError` inside the fresh environment so the fix targets the environment, not the import line.
- Day 12 builds unittest assertions over `tempfile.TemporaryDirectory` fixtures (valid, missing, and invalid file cases), then requires diagnosis of a seeded failure — `AssertionError: 20 != 30` caused by a `[1:]` slice assuming a header — classified as a code bug with the test kept authoritative. The capstone assembles a repeatable program plus `requirements.txt` in a clean directory.
- Every activity embeds at least one of the ticket-required failure shapes: a missing file (`FileNotFoundError` with `e.filename`), invalid content (`ValueError` / `UnicodeDecodeError`), a wrong environment (`ModuleNotFoundError` under `.venv`), and a failing test requiring diagnosis rather than regeneration.
- The final activity on each day is an independent mastery check; no unattended runtime or break is counted in the 480-minute ledger.

## Language-edition review

All four editions use the same stable activity IDs and equivalent objectives, instructions, exercises, hints, reference answers, and mastery criteria. Python identifiers, command lines, exception names, expected outputs (`3 True`, `{"ana": 8, "bo": 9}`, `skipped [2]`, `20 != 30`, `Ran 3 tests ... OK`), and file names remain invariant where executable or safety-critical. Prose is localized; program behavior is not translated. This deterministic review checks structural equivalence; it does not claim native-speaker certification.

## Source and rights review

Eight Python Software Foundation documentation pages are linked as primary sources (tutorial sections on files, errors, and venv; library references for exceptions, pathlib, unittest, tempfile; the Unicode HOWTO) and registered in `curriculum/sources/registry.json` with licenses and compared candidates. No source text is imported; all explanations and examples are original course text. Real Python, W3Schools, the Joel Spolsky essay, MIT OCW, pytest, and pip docs were compared and kept as alternatives or rejected with recorded rationale. Every drill runs offline on the installed interpreter.

## Execution and acceptance limits

All code claims were executed during authoring on Python 3.14: `[Errno 2] No such file or directory: 'data/notes.txt'`, `UnicodeDecodeError` on a latin-1 fixture read as UTF-8, `ValueError` on `int("12x")`/`int("x9")`, `f.closed is True` after a `with` block, differing `sys.executable` paths between system and `.venv` interpreters, `ModuleNotFoundError: No module named 'packaging'` in a fresh venv, the three-fixture `unittest` run ending `Ran 3 tests ... OK`, the seeded `20 != 30` failure, and `Ran 0 tests` when discovery finds nothing. Structural tests validate 480-minute accounting, content parity, stable IDs, and localized terminology; browser tests verify all twelve localized routes render. They do not prove learner mastery or human translation review. No files under `lessons/` were changed.
