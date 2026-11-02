"""The zh-Hant edition must use Taiwan-standard character forms.

爲 is the mainland-Traditional / Hong Kong variant; Taiwan standard is 為.
"""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NON_TAIWAN_VARIANTS = {"爲": "為"}


class ZhHantVariantTests(unittest.TestCase):
    def test_no_non_taiwan_variants_in_zh_hant_content(self):
        files = sorted((ROOT / "curriculum" / "content").glob("*/zh-Hant.json"))
        self.assertTrue(files)
        for path in files:
            text = path.read_text(encoding="utf-8")
            for variant, standard in NON_TAIWAN_VARIANTS.items():
                with self.subTest(file=path.parent.name, variant=variant):
                    self.assertNotIn(variant, text, f"use {standard} instead of {variant}")


if __name__ == "__main__":
    unittest.main()
