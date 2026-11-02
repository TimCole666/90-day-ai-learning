"""Chinese editions must not misspell "dot product will" (点积会) as "point chance" (点机会).

Found in Day 43 activity 3 exercise_prompt in both zh-Hans and zh-Hant.
"""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "curriculum" / "content"
TYPOS = {"zh-Hans": "点机会", "zh-Hant": "點機會"}


class ZhDotProductTypoTests(unittest.TestCase):
    def test_no_dot_product_homophone_typo(self):
        for locale, typo in TYPOS.items():
            for path in sorted(CONTENT.glob(f"*/{locale}.json")):
                with self.subTest(file=str(path.relative_to(ROOT))):
                    self.assertNotIn(typo, path.read_text(encoding="utf-8"))

    def test_day43_prompt_names_the_dot_product(self):
        for locale, word in (("zh-Hans", "未缩放点积会导致"), ("zh-Hant", "未縮放點積會導致")):
            text = (CONTENT / "day-43" / f"{locale}.json").read_text(encoding="utf-8")
            with self.subTest(locale=locale):
                self.assertIn(word, text)


if __name__ == "__main__":
    unittest.main()
