"""Day 70 activity 3: the prompt must ask for the signature the reference answer implements.

Every locale's answer defines check_contamination(train_docs, test_items, n=13) and
iterates over a list of documents. A prompt asking for a single train_doc would make a
learner pass one string, which the answer would split into characters.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "curriculum" / "content" / "day-70"
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")
SIGNATURE = re.compile(r"check_contamination\(([^)]*)\)")


class Day70ContaminationSignatureTests(unittest.TestCase):
    def test_prompt_signature_matches_answer(self):
        for locale in LOCALES:
            activity = json.loads((CONTENT / f"{locale}.json").read_text(encoding="utf-8"))[
                "activities"]["day-70-act-03"]
            answer_args = re.search(r"def check_contamination\(([^)]*)\)", activity["answer"])[1]
            self.assertEqual(answer_args, "train_docs, test_items, n=13")
            with self.subTest(locale=locale):
                for args in SIGNATURE.findall(activity["exercise_prompt"]):
                    self.assertEqual(args, answer_args)


if __name__ == "__main__":
    unittest.main()
