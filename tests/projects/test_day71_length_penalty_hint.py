"""Day 71 activity 3: the hint must use the same length penalty as the instructions and answer.

The instructions (step 4) and every locale's reference answer divide by
((5 + T) ** alpha) / (6 ** alpha). A hint that divides by a bare T ** alpha
ranks the prompt's own candidates differently, so it misleads the learner.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "curriculum" / "content" / "day-71"
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")
BARE_PENALTY = re.compile(r"/\s*\(?\s*(?:length|len|T)\s*\*\*\s*alpha")


class Day71LengthPenaltyHintTests(unittest.TestCase):
    def test_hint_does_not_state_a_bare_length_power_penalty(self):
        for locale in LOCALES:
            activity = json.loads((CONTENT / f"{locale}.json").read_text(encoding="utf-8"))[
                "activities"]["day-71-act-03"]
            with self.subTest(locale=locale):
                self.assertIn("(5.0 + length) ** alpha / (6.0 ** alpha)", activity["answer"])
                self.assertNotRegex(activity["hint"], BARE_PENALTY)

    def test_english_hint_names_the_answer_penalty(self):
        hint = json.loads((CONTENT / "en.json").read_text(encoding="utf-8"))[
            "activities"]["day-71-act-03"]["hint"]
        self.assertIn("(5 + length) ** alpha", hint)
        self.assertIn("6 ** alpha", hint)


if __name__ == "__main__":
    unittest.main()
