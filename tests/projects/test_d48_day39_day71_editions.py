"""D4.8: Day 39 act-01 and Day 71 act-03 must give every edition the same task.

- Day 39 act-01: EN says Unicode strings decompose into UTF-8 bytes and use the same
  merge loop; ja/zh dropped that sentence.
- Day 71 act-03: EN gives concrete totals and lengths; ja/zh gave only a signature.
  EN called the per-candidate totals "token log-probabilities" although the answer
  takes a total (summed) log-probability per candidate. The zh hints reversed the
  division (penalty / log_prob).
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")


def act(day, act_id, locale):
    path = ROOT / "curriculum" / "content" / day / f"{locale}.json"
    return json.loads(path.read_text(encoding="utf-8"))["activities"][act_id]


class Day39Day71EditionTests(unittest.TestCase):
    def test_day39_every_edition_mentions_utf8_decomposition(self):
        for locale in LOCALES:
            with self.subTest(locale=locale):
                self.assertIn("UTF-8", act("day-39", "day-39-act-01", locale)["instructions"])

    def test_day71_prompt_gives_the_same_data_everywhere(self):
        for locale in LOCALES:
            prompt = act("day-71", "day-71-act-03", locale)["exercise_prompt"]
            with self.subTest(locale=locale):
                self.assertIn("rank_with_length_penalty", prompt)
                self.assertIn("[-1.2, -0.8, -0.5, -2.1]", prompt)
                self.assertIn("[1, 2, 3, 5]", prompt)
                self.assertIn("alpha=0.7", prompt)

    def test_day71_en_prompt_says_total_log_probability(self):
        prompt = act("day-71", "day-71-act-03", "en")["exercise_prompt"]
        self.assertNotIn("token log-probabilities", prompt)
        self.assertIn("total log-probabilit", prompt)

    def test_day71_hint_divides_log_prob_by_penalty(self):
        for locale in LOCALES:
            hint = act("day-71", "day-71-act-03", locale)["hint"]
            with self.subTest(locale=locale):
                self.assertIn("(5 + length) ** alpha / (6 ** alpha)", hint)
                self.assertIn("log_prob / penalty", hint)


if __name__ == "__main__":
    unittest.main()
