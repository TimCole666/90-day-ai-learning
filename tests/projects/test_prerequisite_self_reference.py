"""An activity's prerequisites must not list itself or a later activity of the same day.

Covers the "Day N Activities a-b" form in all four Language Editions.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "curriculum" / "content"
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")
PATTERNS = (
    re.compile(r"Day (\d+) Activit(?:y|ies) (\d+)(?:\s*[-–]\s*(\d+))?"),
    re.compile(r"第\s*(\d+)\s*天\s*活[动動]\s*(\d+)(?:\s*[-–至~〜]\s*(\d+))?"),
    re.compile(r"第\s*(\d+)\s*日\s*(?:アクティビティ|活動)\s*(\d+)(?:\s*[-–~〜]\s*(\d+))?"),
)


def activities(data):
    items = data.get("activities", [])
    if isinstance(items, dict):
        return [dict(value, id=key) for key, value in items.items()]
    return items


class PrerequisiteSelfReferenceTests(unittest.TestCase):
    def test_same_day_prerequisites_point_only_to_earlier_activities(self):
        matched = 0
        for unit in sorted(CONTENT.glob("day-*")):
            for locale in LOCALES:
                data = json.loads((unit / f"{locale}.json").read_text(encoding="utf-8"))
                for activity in activities(data):
                    ident = re.fullmatch(r"day-(\d+)-act-(\d+)", activity.get("id", ""))
                    text = activity.get("prerequisites")
                    if not ident or not isinstance(text, str):
                        continue
                    day, index = int(ident[1]), int(ident[2])
                    for pattern in PATTERNS:
                        for ref in pattern.finditer(text):
                            matched += 1
                            last = int(ref[3] or ref[2])
                            with self.subTest(file=f"{unit.name}/{locale}", activity=activity["id"]):
                                if int(ref[1]) == day:
                                    self.assertLess(last, index, text)
        # Guard against the patterns silently matching nothing.
        self.assertGreater(matched, 100)


if __name__ == "__main__":
    unittest.main()
