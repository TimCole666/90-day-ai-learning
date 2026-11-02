#!/usr/bin/env python3
"""Audit, repair and execute the Python snippets embedded in lessons/*.html.

Every lesson ships one runnable Python snippet inside a ``<textarea>`` block
(the Pyodide playground).  Two things can silently break them:

1. A *plain* (non triple-quoted) string authored across several physical
   lines.  That is a hard ``SyntaxError`` in CPython - the author clearly
   meant the newline to be part of the string payload, i.e. a ``\\n`` escape.
2. Snippets whose default assertions do not hold.

This tool therefore

* extracts every ``<textarea>`` with the standard library ``html.parser``
  (RCDATA aware, so ``<`` inside code is never mistaken for a tag),
* runs ``ast.parse`` on every snippet and reports the real syntax errors,
* repairs the "newline inside a plain string" class of errors *in the source
  HTML* (only inside the textarea body; every other byte of the page is left
  untouched),
* optionally executes the snippets in a throw-away subprocess (stdlib/numpy
  only - no torch, no training loops, no interactive input, 15 s timeout each).

Usage::

    python3 scripts/check_snippets.py check        # extract + ast.parse + report
    python3 scripts/check_snippets.py check --fix  # ... and repair the HTML
    python3 scripts/check_snippets.py run          # execute the snippets
    python3 scripts/check_snippets.py all          # fix + run
"""

from __future__ import annotations

import argparse
import ast
import html as html_mod
import json
import re
import subprocess
import sys
import tempfile
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LESSONS_DIR = ROOT / "lessons"
VENV_PY = ROOT / ".venv" / "bin" / "python"

# Lessons whose body text is being re-written by another agent right now:
# we may report their problems but must not touch their <textarea> blocks.
RESERVED_LESSONS = {
    "nn-01-derivative-limits-and-tangents.html",
    "nn-22-kaiming-he-weight-initialization.html",
    "nn-23-internal-covariate-shift.html",
    "nn-32-numerical-gradcheck-and-error-metrics.html",
    "nn-39-scaled-dot-product-attention-math.html",
    "nn-55-alignment-rlhf-ppo-and-dpo.html",
}

RUN_TIMEOUT = 15.0  # seconds, per snippet


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


@dataclass
class Textarea:
    ident: str
    raw: str  # exactly the bytes between <textarea> and </textarea>

    @property
    def code(self) -> str:
        """The Python source of the snippet (HTML entities decoded once)."""
        return html_mod.unescape(self.raw)


class TextareaParser(HTMLParser):
    """Collect the raw body of every ``<textarea>`` element.

    ``textarea`` is an RCDATA element in HTML5: its content is text, and
    ``<`` inside Python code (``if a < b:``) must never be parsed as a tag.
    Python 3.13+ knows this natively; for older interpreters we switch to
    CDATA mode ourselves.  Character references are decoded exactly once,
    in :meth:`Textarea.code`.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.items: list[Textarea] = []
        self._open = False
        self._buf: list[str] = []
        self._ident = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "textarea" and not self._open:
            self._open = True
            self._buf = []
            self._ident = dict(attrs).get("id", "") or ""
            if "textarea" not in getattr(self, "RCDATA_CONTENT_ELEMENTS", ()):
                # Python < 3.13: emulate RCDATA manually.
                self.set_cdata_mode("textarea")

    def handle_endtag(self, tag: str) -> None:
        if tag == "textarea" and self._open:
            self.items.append(Textarea(self._ident, "".join(self._buf)))
            self._open = False
            self._buf = []

    def handle_data(self, data: str) -> None:
        if self._open:
            self._buf.append(data)

    def handle_entityref(self, name: str) -> None:
        if self._open:
            self._buf.append("&" + name + ";")

    def handle_charref(self, name: str) -> None:
        if self._open:
            self._buf.append("&#" + name + ";")


def iter_lesson_files() -> list[Path]:
    return sorted(LESSONS_DIR.glob("*.html"))


def extract(path: Path) -> list[Textarea]:
    parser = TextareaParser()
    parser.feed(path.read_text(encoding="utf-8"))
    parser.close()
    return parser.items


# ---------------------------------------------------------------------------
# A tolerant Python lexer, just good enough to locate string literals
# ---------------------------------------------------------------------------

_IDENT = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")
# CPython's own string-prefix set (Lib/tokenize.py).
_PREFIX_RE = re.compile(r"(?i)(?:[rurb]|fr|rf)(?=['\"])")


@dataclass
class Str:
    """A string literal found by the lexer."""

    quote_at: int  # index of the opening quote
    quote: str
    triple: bool
    prefix: str
    end: int | None  # index just past the closing quote, None when unterminated
    broken: bool  # unterminated *and* the payload spans a line break
    candidates: list[int] = field(default_factory=list)  # possible closing quotes


def _read_string(code: str, quote_at: int) -> Str:
    """Scan the string literal that starts at ``quote_at``."""
    quote = code[quote_at]
    triple = code[quote_at : quote_at + 3] == quote * 3
    i = quote_at + (3 if triple else 1)
    n = len(code)
    candidates: list[int] = []
    saw_newline = False
    while i < n:
        ch = code[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "\n":
            if triple:
                i += 1
                continue
            saw_newline = True
            i += 1
            continue
        if ch == quote:
            if triple:
                if code[i : i + 3] == quote * 3:
                    return Str(quote_at, quote, True, "", i + 3, False, candidates)
                i += 1
                continue
            candidates.append(i)
            if not saw_newline:
                return Str(quote_at, quote, False, "", i + 1, False, candidates)
            # The literal runs over a line break: remember this quote as a
            # possible terminator and keep looking for better ones.
            i += 1
            continue
        i += 1
    return Str(quote_at, quote, False, "", None, saw_newline, candidates)


def first_broken_string(code: str) -> Str | None:
    """Return the first plain string literal that breaks across a line."""
    i = 0
    n = len(code)
    after_ident = False
    while i < n:
        ch = code[i]
        if ch == "#":
            while i < n and code[i] != "\n":
                i += 1
            continue
        if ch in "\"'":
            s = _read_string(code, i)
            if s.broken:
                return s
            i = s.end if s.end is not None else n
            after_ident = False
            continue
        if ch in _IDENT and not after_ident:
            m = _PREFIX_RE.match(code, i)
            if m:
                s = _read_string(code, m.end())
                if s.broken:
                    s.prefix = m.group(0)
                    return s
                i = s.end if s.end is not None else n
                after_ident = False
                continue
            after_ident = True
            i += 1
            continue
        after_ident = False
        i += 1
    return None


# ---------------------------------------------------------------------------
# Repair
# ---------------------------------------------------------------------------


def _escape_newlines(code: str, lo: int, hi: int) -> tuple[str, set[int]]:
    """Escape every physical newline in ``code[lo:hi]`` as ``\\n``.

    Returns the rewritten text and the set of line numbers (0-based) whose
    terminating newline was escaped.
    """
    out: list[str] = []
    lines: set[int] = set()
    line_no = code.count("\n", 0, lo)
    i = lo
    while i < hi:
        ch = code[i]
        if ch in "\r\n":
            out.append("\\n")
            lines.add(line_no)
            if ch == "\r" and i + 1 < hi and code[i + 1] == "\n":
                i += 2
            else:
                i += 1
            line_no += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out), lines


def repair_code(code: str) -> tuple[str, set[int], list[str]]:
    """Repair "newline inside a plain string" errors.

    Returns ``(repaired_code, escaped_line_numbers, notes)``.
    """
    notes: list[str] = []
    escaped_lines: set[int] = set()
    current = code
    for _ in range(64):
        token = first_broken_string(current)
        if token is None:
            break
        if token.prefix.lower().startswith("r"):
            notes.append(f"raw string at offset {token.quote_at} cannot host a \\n escape")
            break
        if not token.candidates:
            notes.append(f"unterminated string at offset {token.quote_at}")
            break
        chosen: tuple[str, set[int]] | None = None
        for cand in token.candidates:
            body, lines = _escape_newlines(current, token.quote_at + 1, cand)
            candidate_code = current[: token.quote_at + 1] + body + current[cand:]
            nxt = first_broken_string(candidate_code)
            if nxt is None:
                try:
                    ast.parse(candidate_code)
                except SyntaxError:
                    continue
                chosen = (candidate_code, lines)
                break
            if nxt.quote_at > cand:
                # Progress: the string we just fixed is fine, the next broken
                # string sits further down the file.
                chosen = (candidate_code, lines)
                break
        if chosen is None:
            notes.append(f"string at offset {token.quote_at}: no candidate terminator works")
            break
        candidate_code, lines = chosen
        kind = "f-string" if token.prefix else "plain string"
        notes.append(f"escaped {len(lines)} line break(s) inside a {kind}")
        escaped_lines |= lines
        current = candidate_code
    return current, escaped_lines, notes


# ---------------------------------------------------------------------------
# Check / fix
# ---------------------------------------------------------------------------


@dataclass
class Report:
    path: Path
    ident: str
    ok: bool
    error: str = ""
    lineno: int = 0
    reserved: bool = False


def check_file(path: Path) -> list[Report]:
    reports: list[Report] = []
    reserved = path.name in RESERVED_LESSONS
    for ta in extract(path):
        try:
            ast.parse(ta.code)
            reports.append(Report(path, ta.ident, True, reserved=reserved))
        except SyntaxError as exc:
            reports.append(
                Report(
                    path,
                    ta.ident,
                    False,
                    f"{exc.msg} (line {exc.lineno}, col {exc.offset})",
                    exc.lineno or 0,
                    reserved,
                )
            )
    return reports


def escape_lines(raw: str, lines: set[int]) -> str:
    """Escape the line terminator of the given (0-based) line numbers."""
    parts = raw.split("\n")
    out: list[str] = []
    for i, part in enumerate(parts):
        if i == len(parts) - 1:
            out.append(part)
            continue
        if i in lines:
            out.append(part[:-1] if part.endswith("\r") else part)
            out.append("\\n")
        else:
            out.append(part)
            out.append("\n")
    return "".join(out)


def splice_textarea(path: Path, ident: str, new_code: str, escaped_lines: set[int]) -> bool:
    """Rewrite the body of one textarea, leaving the rest of the page alone."""
    text = path.read_text(encoding="utf-8")
    parser = TextareaParser()
    parser.feed(text)
    parser.close()
    target = next((t for t in parser.items if t.ident == ident), None)
    if target is None:
        return False
    raw = target.raw
    if raw == html_mod.unescape(raw):
        # No entities in this body: the decoded text *is* the raw text.
        new_raw = new_code
    else:
        # The body carries character references: apply the very same line
        # surgery to the raw bytes so the entities stay untouched.
        new_raw = escape_lines(raw, escaped_lines)
        if html_mod.unescape(new_raw) != new_code:
            new_raw = (
                new_code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            )
    if new_raw == raw:
        return False
    # Locate the body precisely: right after this textarea's opening tag.
    opening = re.search(r'<textarea\b[^>]*\bid=["]' + re.escape(ident) + r"[^>]*>", text)
    if opening is None:
        return False
    start = opening.end()
    if text[start : start + len(raw)] != raw:
        return False
    path.write_text(text[:start] + new_raw + text[start + len(raw) :], encoding="utf-8")
    return True


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

_REVIEWED_LIGHTWEIGHT: frozenset[tuple[str, str]] = frozenset(
    {
        ("nn-06-topological-sort-and-backprop-engine.html", "editor-nn06"),
        ("nn-07-neural-lego-neuron-layer-mlp.html", "editor-nn07"),
        ("nn-08-loss-functions-and-gradient-descent.html", "editor-nn08"),
        ("py-13-test-driven-development-tdd.html", "editor-py13"),
    }
)


_SKIP_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("torch", ("import torch", "from torch", "torch.", "torchvision")),
    ("interactive input", ("input(", "sys.stdin.read", "getpass")),
    (
        "training / backprop",
        (".backward(", "optimizer", "requires_grad", "nn.Module", "torch.optim"),
    ),
)


def classify(code: str, file: str = "", ident: str = "") -> str | None:
    """Return a skip reason, or None when the snippet may be executed."""
    low = code.lower()
    for reason, hints in _SKIP_HINTS:
        if reason == "training / backprop" and (file, ident) in _REVIEWED_LIGHTWEIGHT:
            continue
        for hint in hints:
            if hint.lower() in low:
                return f"{reason} ({hint})"
    return None


@dataclass
class RunResult:
    file: str
    ident: str
    status: str  # pass | fail | skip | timeout
    reason: str = ""
    rc: int = 0
    elapsed: float = 0.0
    stdout: str = ""
    stderr: str = ""


def run_snippet(code: str, python: str) -> tuple[int, str, str, float]:
    with tempfile.TemporaryDirectory(prefix="snip-") as tmp:
        script = Path(tmp) / "snippet.py"
        script.write_text(code, encoding="utf-8")
        t0 = time.monotonic()
        try:
            proc = subprocess.run(
                [python, str(script)],
                cwd=tmp,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                timeout=RUN_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return 124, "", f"TIMEOUT after {RUN_TIMEOUT:g}s", time.monotonic() - t0
        return proc.returncode, proc.stdout, proc.stderr, time.monotonic() - t0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def do_check(files: list[Path], fix: bool) -> dict:
    out: dict = {"snippets": 0, "syntax_ok": 0, "syntax_bad": 0, "fixed": [], "problems": []}
    reports: list[Report] = []
    for path in files:
        reports.extend(check_file(path))

    out["snippets"] = len(reports)
    out["syntax_ok"] = sum(1 for r in reports if r.ok)
    out["syntax_bad"] = sum(1 for r in reports if not r.ok)

    for rep in reports:
        if rep.ok:
            continue
        tag = "RESERVED" if rep.reserved else "BROKEN"
        print(f"[{tag}] {rep.path.name} :: {rep.ident} :: {rep.error}", file=sys.stderr)
        out["problems"].append(
            {"file": rep.path.name, "id": rep.ident, "error": rep.error, "reserved": rep.reserved}
        )

    if not fix:
        return out

    for rep in reports:
        if rep.ok:
            continue
        if rep.reserved:
            print(f"[SKIP-RESERVED] {rep.path.name}: owned by another agent", file=sys.stderr)
            continue
        ta = next(t for t in extract(rep.path) if t.ident == rep.ident)
        new_code, escaped_lines, notes = repair_code(ta.code)
        if new_code == ta.code:
            print(f"[UNFIXED] {rep.path.name}: no automatic repair", file=sys.stderr)
            continue
        try:
            ast.parse(new_code)
        except SyntaxError as exc:
            print(f"[UNFIXED] {rep.path.name}: repair invalid ({exc.msg})", file=sys.stderr)
            continue
        if splice_textarea(rep.path, rep.ident, new_code, escaped_lines):
            out["fixed"].append({"file": rep.path.name, "id": rep.ident, "notes": notes})
            print(f"[FIXED] {rep.path.name} :: {rep.ident} :: {'; '.join(notes)}")

    after = [r for path in files for r in check_file(path)]
    out["syntax_ok"] = sum(1 for r in after if r.ok)
    out["syntax_bad"] = sum(1 for r in after if not r.ok)
    print(
        f"\n== after fix: {out['syntax_ok']} ok / {out['syntax_bad']} still broken", file=sys.stderr
    )
    return out


def do_run(files: list[Path], python: str) -> tuple[dict, list[RunResult]]:
    results: list[RunResult] = []
    for path in files:
        for ta in extract(path):
            code = ta.code
            try:
                ast.parse(code)
            except SyntaxError as exc:
                results.append(RunResult(path.name, ta.ident, "fail", f"syntax error: {exc.msg}"))
                continue
            reason = classify(code, path.name, ta.ident)

            if reason:
                results.append(RunResult(path.name, ta.ident, "skip", reason))
                continue
            rc, out, err, dt = run_snippet(code, python)
            if rc == 0:
                results.append(RunResult(path.name, ta.ident, "pass", rc=rc, elapsed=dt, stdout=out))
            elif rc == 124:
                results.append(RunResult(path.name, ta.ident, "timeout", err, rc, dt))
            else:
                tail = err.strip().splitlines()[-1] if err.strip() else ""
                results.append(RunResult(path.name, ta.ident, "fail", tail, rc, dt, out, err))
    summary = {
        "total": len(results),
        "pass": sum(1 for r in results if r.status == "pass"),
        "fail": sum(1 for r in results if r.status == "fail"),
        "skip": sum(1 for r in results if r.status == "skip"),
        "timeout": sum(1 for r in results if r.status == "timeout"),
    }
    print(
        f"\n== run: {summary['pass']} pass / {summary['fail']} fail / {summary['skip']} skipped / "
        f"{summary['timeout']} timeout (of {summary['total']})",
        file=sys.stderr,
    )
    for r in results:
        if r.status != "pass":
            print(f"  [{r.status.upper()}] {r.file} :: {r.ident} :: {r.reason}", file=sys.stderr)
    return summary, results


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("mode", choices=["check", "fix", "run", "all"])
    ap.add_argument("--json", action="store_true", help="emit machine readable results")
    ap.add_argument("--python", default=None, help="interpreter used for execution")
    ap.add_argument("--only", default=None, help="only process files whose name contains this")
    args = ap.parse_args(argv)

    files = iter_lesson_files()
    if args.only:
        files = [f for f in files if args.only in f.name]
    python = args.python or (str(VENV_PY) if VENV_PY.exists() else sys.executable)

    report: dict = {"mode": args.mode, "files": len(files)}
    if args.mode in ("check", "fix", "all"):
        report["check"] = do_check(files, fix=args.mode in ("fix", "all"))
    if args.mode in ("run", "all"):
        summary, results = do_run(files, python)
        report["run"] = summary
        report["run_detail"] = [r.__dict__ for r in results]
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    if args.mode in ("check", "fix"):
        return 1 if report["check"]["syntax_bad"] else 0
    if args.mode == "all":
        return 1 if report["check"]["syntax_bad"] or report["run"]["fail"] or report["run"]["timeout"] else 0
    if args.mode == "run":
        return 1 if report["run"]["fail"] or report["run"]["timeout"] else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
