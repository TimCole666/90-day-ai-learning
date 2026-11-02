"""Cross-locale parity checks for every curriculum content unit.

Each Language Edition must expose the same content keys as the English edition,
so the server never falls back to a placeholder label in one language only.
Localized editions may carry their own per-activity ``source_resources`` (the
English edition reads those from ``curriculum/days``), so that subtree is
excluded from the key comparison.
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "curriculum" / "content"
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")


def leaf_paths(node, prefix=""):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from leaf_paths(value, f"{prefix}/{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from leaf_paths(value, f"{prefix}/{index}")
    else:
        yield prefix


def comparable_paths(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return {p for p in leaf_paths(data) if "/source_resources/" not in p}


class LanguageEditionKeyParityTests(unittest.TestCase):
    def test_every_unit_has_all_four_locales(self):
        for unit in sorted(p for p in CONTENT.iterdir() if p.is_dir()):
            for locale in LOCALES:
                with self.subTest(unit=unit.name, locale=locale):
                    self.assertTrue((unit / f"{locale}.json").is_file())

    def test_localized_keys_match_english(self):
        for unit in sorted(p for p in CONTENT.iterdir() if p.is_dir()):
            english = comparable_paths(unit / "en.json")
            for locale in LOCALES[1:]:
                with self.subTest(unit=unit.name, locale=locale):
                    localized = comparable_paths(unit / f"{locale}.json")
                    self.assertEqual(
                        [],
                        sorted(english ^ localized),
                        "keys present in only one of en/" + locale,
                    )

    def test_source_card_labels_use_rendered_key_names(self):
        # server.cjs renderSourceResources reads these exact common keys.
        # Without them every locale silently shows the English fallback labels.
        rendered = (
            "source_author_label",
            "source_url_label",
            "source_range_label",
            "source_verification_label",
            "source_rationale_label",
            "source_prereqs_label",
            "source_fallback_label",
            "compared_candidates_heading",
        )
        for unit in sorted(p for p in CONTENT.iterdir() if p.is_dir()):
            for locale in LOCALES:
                common = json.loads((unit / f"{locale}.json").read_text(encoding="utf-8")).get("common", {})
                if "sources_heading" not in common:
                    continue
                for key in rendered:
                    with self.subTest(unit=unit.name, locale=locale, key=key):
                        self.assertIn(key, common)
    def test_day_88_retrieval_inventory_matches_english(self):
        english = json.loads(
            (CONTENT / "day-88" / "en.json").read_text(encoding="utf-8")
        )["activities"]["day-88-act-01"]["answer"]
        for locale in LOCALES[1:]:
            with self.subTest(locale=locale):
                localized = json.loads(
                    (CONTENT / "day-88" / f"{locale}.json").read_text(encoding="utf-8")
                )["activities"]["day-88-act-01"]["answer"]
                self.assertEqual(
                    english[: english.index("assert")].rstrip(),
                    localized[: localized.index("assert")].rstrip(),
                )
                self.assertIn("assert len(tasks) == 15", localized)
    def test_day_48_describes_permutation_equivariance(self):
        for locale in LOCALES:
            with self.subTest(locale=locale):
                activity = json.loads(
                    (CONTENT / "day-48" / f"{locale}.json").read_text(encoding="utf-8")
                )["activities"]["day-48-act-01"]
                markers = {
                    "en": "equiv",
                    "ja": "同変性",
                    "zh-Hans": "等变性",
                    "zh-Hant": "等變性",
                }
                self.assertIn(markers[locale], activity["objective"].lower())
                self.assertIn(markers[locale], activity["mastery_criterion"].lower())
                wrong_phrase = {
                    "en": "identical outputs",
                    "ja": "出力が同一",
                    "zh-Hans": "输出相同",
                    "zh-Hant": "輸出相同",
                }[locale]
                self.assertNotIn(wrong_phrase, activity["instructions"])

    def test_day_56_labels_decimal_and_binary_memory_units(self):
        for locale in LOCALES:
            with self.subTest(locale=locale):
                answer = json.loads(
                    (CONTENT / "day-56" / f"{locale}.json").read_text(encoding="utf-8")
                )["activities"]["day-56-act-01"]["answer"]
                normalized = answer.replace(",", "").replace("，", "")
                self.assertIn("248713728", normalized)
                self.assertRegex(answer, r"237[.,]2.*MiB")
                self.assertRegex(answer, r"248[.,]7.*MB")


class LanguageEditionCompletenessTests(unittest.TestCase):
    # Japanese text normally runs 1.0-1.3x the length of the Simplified Chinese
    # text. An abridged translation that drops inputs and worked steps fell to
    # 0.71-0.93x, so a 0.9 floor catches wholesale abridgement of a Study Day.
    FIELDS = ("objective", "instructions", "exercise_prompt", "hint", "answer", "mastery_criterion")
    MIN_JA_TO_ZH_RATIO = 0.9

    def test_japanese_activity_text_is_not_abridged(self):
        for unit in sorted(p for p in CONTENT.iterdir() if p.is_dir() and p.name.startswith("day-")):
            ja = json.loads((unit / "ja.json").read_text(encoding="utf-8"))["activities"]
            zh = json.loads((unit / "zh-Hans.json").read_text(encoding="utf-8"))["activities"]
            ja_len = sum(len(ja[a].get(f) or "") for a in zh for f in self.FIELDS)
            zh_len = sum(len(zh[a].get(f) or "") for a in zh for f in self.FIELDS)
            with self.subTest(unit=unit.name):
                self.assertGreaterEqual(ja_len / zh_len, self.MIN_JA_TO_ZH_RATIO)


if __name__ == "__main__":
    unittest.main()
