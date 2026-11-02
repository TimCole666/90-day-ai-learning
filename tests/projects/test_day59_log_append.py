"""Published Day 59 log examples must preserve the prompt's existing log.

Only the reviewed ``tee`` subcommand is executed, in a disposable directory.
No tmux, SSH, Python training command, shell pipeline, or learner code is run.
"""

import json
import re
import shlex
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")


def activity(locale):
    path = ROOT / "curriculum" / "content" / "day-59" / f"{locale}.json"
    return json.loads(path.read_text(encoding="utf-8"))["activities"]["day-59-act-01"]


class Day59LogAppendTests(unittest.TestCase):
    def test_reference_answer_appends_to_the_prompt_log(self):
        tee = shutil.which("tee")
        self.assertIsNotNone(tee, "The focused POSIX log-example check requires tee")
        for locale in LOCALES:
            with self.subTest(locale=locale):
                content = activity(locale)
                self.assertIn("training.log", content["exercise_prompt"])
                command = next(
                    line for line in content["answer"].splitlines()
                    if line.startswith("tmux ")
                )
                pipeline = shlex.split(command)[-1]
                self.assertEqual(pipeline.count("|"), 1)
                argv = shlex.split(pipeline.rsplit("|", 1)[1])
                self.assertEqual(argv[0], "tee")
                self.assertEqual(argv[-1], "training.log")
                self.assertTrue(all(flag in ("-a", "--append") for flag in argv[1:-1]))
                with tempfile.TemporaryDirectory(prefix="learn-day59-log-") as tmp:
                    log = Path(tmp) / "training.log"
                    log.write_text("previous-step\n", encoding="utf-8")
                    for record in ("new-step\n", "restarted-step\n"):
                        result = subprocess.run(
                            [tee, *argv[1:]],
                            cwd=tmp,
                            input=record,
                            text=True,
                            capture_output=True,
                            timeout=3,
                            check=False,
                        )
                        self.assertEqual(result.returncode, 0, result.stderr)
                        self.assertEqual(result.stdout, record)
                    self.assertEqual(
                        log.read_text(encoding="utf-8"),
                        "previous-step\nnew-step\nrestarted-step\n",
                    )

    def test_hint_does_not_truncate_or_redirect_to_a_different_log(self):
        for locale in LOCALES:
            with self.subTest(locale=locale):
                hint = activity(locale)["hint"]
                logs = re.findall(r"\b[\w.-]+\.log\b", hint)
                self.assertTrue(logs, "The logging hint must identify its output file")
                self.assertEqual(set(logs), {"training.log"})
                self.assertIsNone(re.search(r"(?<![>\d])>(?![>&])", hint))
                if re.search(r"\btee\b", hint):
                    self.assertRegex(hint, r"\btee\s+(?:-a|--append)\s+training\.log\b")
                else:
                    self.assertRegex(hint, r">>\s*training\.log\b")


if __name__ == "__main__":
    unittest.main()