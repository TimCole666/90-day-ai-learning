"""Day 68 act-03: the reference answer must run as written (it used `os` without importing it)."""
import json
import os
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")


def answer(locale):
    path = ROOT / f"curriculum/content/day-68/{locale}.json"
    return json.loads(path.read_text(encoding="utf-8"))["activities"]["day-68-act-03"]["answer"]


class Day68CheckpointSizeAnswerTest(unittest.TestCase):
    def run_answer(self, locale, size_bytes):
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as work:
            os.chdir(work)
            try:
                Path("checkpoints").mkdir()
                Path("checkpoints/step-200.safetensors").write_bytes(b"\0" * size_bytes)
                exec(answer(locale), {})  # a fresh namespace: the answer must import what it uses
            finally:
                os.chdir(cwd)

    def test_answer_runs_standalone_in_every_locale(self):
        for locale in LOCALES:
            self.run_answer(locale, 1024)

    def test_answer_rejects_an_oversized_checkpoint(self):
        with self.assertRaises(AssertionError):
            self.run_answer("en", 51 * 1024**2)


if __name__ == "__main__":
    unittest.main()
