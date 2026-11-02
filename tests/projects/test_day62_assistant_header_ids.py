"""Day 62 act-02: the prompt and hint must name the same parameter as the answer in every locale."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ["en", "ja", "zh-Hans", "zh-Hant"]


class Day62AssistantHeaderIdsTest(unittest.TestCase):
    def test_prompt_and_hint_use_answer_parameter(self):
        for locale in LOCALES:
            data = json.loads((ROOT / f"curriculum/content/day-62/{locale}.json").read_text(encoding="utf-8"))
            act = data["activities"]["day-62-act-02"]
            param = re.search(r"def mask_prompt_labels\(input_ids, (\w+)\)", act["answer"]).group(1)
            self.assertEqual(param, "assistant_header_ids", locale)
            self.assertIn(f"mask_prompt_labels(input_ids, {param})", act["exercise_prompt"], locale)
            self.assertIn(param, act["hint"], locale)
            for field in ("exercise_prompt", "hint"):
                self.assertNotIn("assistant_token_id", act[field], f"{locale} {field}")


if __name__ == "__main__":
    unittest.main()
