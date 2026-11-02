"""Day 11 fail-stop regression: stdlib only, no real lesson setup commands."""

import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "curriculum" / "content" / "day-11"
LANGS = ("en", "ja", "zh-Hans", "zh-Hant")
ACTIVITIES = ("day-11-act-03", "day-11-act-04")
FENCE = re.compile(r"```bash\n(.*?)\n```", re.S)
GUARD = " || exit 1"
MARKER = "DAY11_SAME_SHELL_MARKER"
# Safety allowlist: no unreviewed command can reach the shell harness.
PREFIX = ('work=$(mktemp -d)', 'cd "$work"')
COMMANDS = {
    ACTIVITIES[0]: PREFIX + ('python3 -m venv --without-pip .venv',),
    ACTIVITIES[1]: PREFIX + (
        'python3 -m venv --without-pip good',
        'python3 -m venv --without-pip .venv',
        'good_site=$(good/bin/python -c "import sysconfig; print(sysconfig.get_path(\'purelib\'))")',
        'printf \'def label():\\n    return "report ok"\\n\' > "$good_site/day11_helper.py"',
        "printf 'import day11_helper\\nprint(day11_helper.label())\\n' > report.py",
    ),
}
STEPS = {
    ACTIVITIES[0]: ("mktemp", "cd", "venv"),
    ACTIVITIES[1]: ("mktemp", "cd", "good", "venv", "purelib", "helper", "report"),
}
GUIDANCE = {
    "en": ("dedicated", "disposable", "same shell", "all later steps", "failure",
           "exits", "do not continue", "new shell", "rerun", "After setup", "pwd", "$work"),
    "ja": ("専用", "使い捨て", "同じシェル", "すべての手順", "失敗", "終了",
           "続行しない", "新しいシェル", "再実行", "セットアップ後", "pwd", "$work"),
    "zh-Hans": ("专用", "一次性", "同一个 shell", "所有步骤", "失败", "退出",
                "不要继续", "新 shell", "重新运行", "搭建后", "pwd", "$work"),
    "zh-Hant": ("專用", "一次性", "同一個 shell", "所有步驟", "失敗", "結束",
                "不要繼續", "新 shell", "重新執行", "建置後", "pwd", "$work"),
}


def unguarded(code):
    return code[:-len(GUARD)] if code.endswith(GUARD) else code


def check_chain(code, activity, require_guard=True):
    """Reject missing guards, broken interior &&, and any unreviewed command."""
    if require_guard and not code.endswith(GUARD):
        raise AssertionError("setup needs a final || exit 1")
    expected = " &&\n".join(COMMANDS[activity])
    if unguarded(code) != expected:
        raise AssertionError("setup commands or interior && chain changed")


def run_stubbed(code, activity, fail_step=""):
    """Execute the exact fence, but intercept ALL mutators with shell functions.

    Even good/bin/python is a Bash function, not a real interpreter. printf is
    a no-op; its shell redirections open test-owned /dev/null sink symlinks, so
    no learner-file bytes are written. mktemp returns our TemporaryDirectory;
    cd can only enter that directory. Only its owner performs cleanup. PATH is
    an empty test-owned directory and no environment/startup files are inherited.
    """
    check_chain(code, activity, require_guard=False)
    with tempfile.TemporaryDirectory(prefix="day11-guard-") as directory:
        work = Path(directory)
        (work / "empty-path").mkdir()
        (work / "sink").mkdir()
        (work / "sink" / "day11_helper.py").symlink_to("/dev/null")
        (work / "report.py").symlink_to("/dev/null")
        prelude = r'''
step() {
    builtin printf 'STEP:%s\n' "$1" >&2
    [[ "$FAIL_STEP" != "$1" ]]
}
mktemp() {
    [[ "$*" == '-d' ]] || return 90
    step mktemp || return 73
    builtin printf '%s\n' "$FIXTURE_WORK"
}
cd() {
    [[ "$#" == 1 && "$1" == "$FIXTURE_WORK" ]] || return 91
    step cd || return 73
    builtin cd "$FIXTURE_WORK"
}
python3() {
    case "$*" in
        '-m venv --without-pip good') step good ;;
        '-m venv --without-pip .venv') step venv ;;
        *) return 92 ;;
    esac
}
good/bin/python() {
    step purelib || return 73
    builtin printf '%s/sink\n' "$FIXTURE_WORK"
}
printf() {
    case "$1" in
        'def label():\n    return "report ok"\n') step helper ;;
        'import day11_helper\nprint(day11_helper.label())\n') step report ;;
        *) return 93 ;;
    esac
}
'''
        result = subprocess.run(
            ["/bin/bash", "--noprofile", "--norc", "-c",
             prelude + "\n" + code + "\nbuiltin printf '%s\\n' " + MARKER + "\n"],
            cwd=work,
            env={"PATH": str(work / "empty-path"), "HOME": directory,
                 "LC_ALL": "C", "FIXTURE_WORK": directory, "FAIL_STEP": fail_step},
            text=True, capture_output=True, timeout=5,
        )
        expected = {"empty-path", "sink", "sink/day11_helper.py", "report.py"}
        if {str(p.relative_to(work)) for p in work.rglob("*")} != expected:
            raise AssertionError("harness created an unexpected path")
        if not all(p.is_symlink() for p in (work / "report.py", work / "sink/day11_helper.py")):
            raise AssertionError("harness sink replaced")
        return result


class Day11SetupGuardTests(unittest.TestCase):
    def setUp(self):
        self.editions = {}
        for language in LANGS:
            data = json.loads((CONTENT / f"{language}.json").read_text(encoding="utf-8"))
            for activity in ACTIVITIES:
                text = data["activities"][activity]["instructions"]
                matches = list(FENCE.finditer(text))
                self.assertEqual(len(matches), 1, (language, activity))
                self.editions[language, activity] = (text, matches[0])
        self.assertEqual(len(self.editions), 8)

    def test_actual_chains_have_final_guard_and_intact_interior(self):
        for key, (_, fence) in self.editions.items():
            with self.subTest(edition=key):
                check_chain(fence[1], key[1])

    def test_all_failure_and_session_guidance_precedes_setup(self):
        for key, (text, fence) in self.editions.items():
            with self.subTest(edition=key):
                before = text[:fence.start()]
                for term in GUIDANCE[key[0]]:
                    self.assertIn(term, before)

    def test_checker_rejects_missing_guard_and_each_broken_interior_and(self):
        for key, (_, fence) in self.editions.items():
            original = unguarded(fence[1])
            with self.subTest(edition=key, mutation="missing final guard"):
                with self.assertRaises(AssertionError):
                    check_chain(original, key[1])
            for position in (m.start() for m in re.finditer(" &&\n", original)):
                with self.subTest(edition=key, mutation=position):
                    broken = original[:position] + original[position:].replace(" &&\n", "\n", 1)
                    with self.assertRaises(AssertionError):
                        check_chain(broken + GUARD, key[1])

    def test_harness_proves_original_falls_through_and_repair_exits_at_every_step(self):
        for key, (_, fence) in self.editions.items():
            activity = key[1]
            original = unguarded(fence[1])
            for index, failure in enumerate(STEPS[activity]):
                with self.subTest(edition=key, failure=failure):
                    old = run_stubbed(original, activity, failure)
                    fixed = run_stubbed(original + GUARD, activity, failure)
                    trace = ["STEP:" + step for step in STEPS[activity][:index + 1]]
                    self.assertEqual(old.stderr.splitlines(), trace)
                    self.assertEqual(fixed.stderr.splitlines(), trace)
                    self.assertEqual(old.returncode, 0, old.stderr)
                    self.assertEqual(old.stdout, MARKER + "\n")
                    self.assertNotEqual(fixed.returncode, 0, fixed.stderr)
                    self.assertEqual(fixed.stdout, "")
            with self.subTest(edition=key, failure="none"):
                success = run_stubbed(original + GUARD, activity)
                self.assertEqual(success.returncode, 0, success.stderr)
                self.assertEqual(success.stdout, MARKER + "\n")
                self.assertEqual(success.stderr.splitlines(), ["STEP:" + s for s in STEPS[activity]])

    def test_actual_fences_exit_before_same_shell_later_step_on_any_failure(self):
        for key, (_, fence) in self.editions.items():
            for failure in STEPS[key[1]]:
                with self.subTest(edition=key, failure=failure):
                    result = run_stubbed(fence[1], key[1], failure)
                    self.assertNotEqual(result.returncode, 0, result.stderr)
                    self.assertNotIn(MARKER, result.stdout)


if __name__ == "__main__":
    unittest.main()