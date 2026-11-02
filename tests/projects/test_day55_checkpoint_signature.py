"""Day 55 CheckpointManager: the instructions' save/load signatures must match the answer in every locale."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ["en", "ja", "zh-Hans", "zh-Hant"]


def manager_activity(locale):
    data = json.loads((ROOT / f"curriculum/content/day-55/{locale}.json").read_text(encoding="utf-8"))
    stack = [data]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            if "class CheckpointManager" in node.get("answer", ""):
                return node
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    raise AssertionError(f"no CheckpointManager activity in {locale}")


class Day55CheckpointSignatureTest(unittest.TestCase):
    def test_instruction_signatures_match_answer(self):
        for locale in LOCALES:
            act = manager_activity(locale)
            for method in ("save", "load_latest"):
                answer_sig = re.search(rf"def {method}\(self, ([^)]*)\)", act["answer"]).group(1)
                for sig in re.findall(rf"\b{method}\(([^)]*)\)", act["instructions"]):
                    if sig != "...":
                        self.assertEqual(sig, answer_sig, f"{locale} {method}")

    def test_answer_has_no_scheduler_so_instructions_must_not_require_one(self):
        for locale in LOCALES:
            act = manager_activity(locale)
            self.assertNotIn("scheduler", act["answer"], locale)
            self.assertNotIn("scheduler", act["instructions"], locale)


if __name__ == "__main__":
    unittest.main()
