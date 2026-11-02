"""Day 45 act-03 must not say a -1e9 mask "works" in float16.

Verified 2026-10-31 with torch 2.15 (day45-fp16-mask receipt): writing -1e9
into a float16 tensor with masked_fill or index assignment raises
"value cannot be converted to type c10::Half without overflow"; an explicit
cast gives -inf, and a fully masked row of -inf then softmaxes to NaN.
The ja/zh editions already ask only why -1e4 is safer than -1e9.
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")


def act03(locale):
    data = json.loads((ROOT / f"curriculum/content/day-45/{locale}.json").read_text(encoding="utf-8"))
    acts = data["activities"]
    items = acts.items() if isinstance(acts, dict) else ((a.get("id"), a) for a in acts)
    for key, act in items:
        if str(key).endswith("act-03"):
            return act
    raise AssertionError(f"day-45 act-03 missing in {locale}")


class Day45Fp16MaskClaimTests(unittest.TestCase):
    def test_no_locale_says_minus_1e9_works_in_float16(self):
        for locale in LOCALES:
            with self.subTest(locale=locale):
                text = act03(locale)["instructions"]
                self.assertIn("-1e9", text)
                self.assertIn("-1e4", text)
                self.assertNotIn("which works", text)

    def test_en_names_the_overflow_error_and_nan_hazard(self):
        text = act03("en")["instructions"]
        self.assertIn("masked_fill", text)
        self.assertIn("NaN", text.split("Case 3")[1])


if __name__ == "__main__":
    unittest.main()
