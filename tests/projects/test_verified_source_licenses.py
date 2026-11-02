"""Source cards must carry the license the publisher states.

Verified 2026-10-31 against the publishers' pages; evidence is recorded in the
license-verification receipt:
- OpenStax CMS API: Calculus Volume 1 and Introductory Statistics 2e are
  CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/).
- sre.google chapter footers: "Copyright © 2017 Google, Inc. Published by
  O'Reilly Media, Inc. Licensed under CC BY-NC-ND 4.0".
- The old spring2024-assignment1-basics declares no license. The curriculum now
  links assignment1-basics at the spring2025 tag, whose LICENSE is MIT
  (verified 2026-11-01). License facts must follow the actual linked version.
Every card copy (registry, day descriptors, four language editions) must agree.
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {
    "openstax-calculus-1": ("CC BY-NC-SA 4.0", {"noncommercial", "share-alike"}),
    "openstax-introductory-statistics-2e": ("CC BY-NC-SA 4.0", {"noncommercial", "share-alike"}),
    "google-sre-release-engineering": ("CC BY-NC-ND 4.0", {"noncommercial"}),
    "google-sre-postmortem-culture": ("CC BY-NC-ND 4.0", {"noncommercial"}),
    "google-sre-cascading-failures": ("CC BY-NC-ND 4.0", {"noncommercial"}),
}
CS336 = "cs336-basics"


def cards(node, wanted):
    if isinstance(node, dict):
        if node.get("id") in wanted and "license" in node:
            yield node
        for value in node.values():
            yield from cards(value, wanted)
    elif isinstance(node, list):
        for value in node:
            yield from cards(value, wanted)


class VerifiedSourceLicenseTests(unittest.TestCase):
    def all_cards(self):
        wanted = set(EXPECTED) | {CS336}
        for path in sorted((ROOT / "curriculum").rglob("*.json")):
            for card in cards(json.loads(path.read_text(encoding="utf-8")), wanted):
                yield path.relative_to(ROOT), card

    def test_cards_match_publisher_license(self):
        count = 0
        for path, card in self.all_cards():
            count += 1
            with self.subTest(file=str(path), id=card["id"]):
                if card["id"] == CS336:
                    self.assertEqual(card["license"], "MIT")
                    self.assertEqual(card["original_url"],
                                     "https://github.com/stanford-cs336/assignment1-basics/tree/spring2025")
                    self.assertIn("spring2025", card["version_or_verification_date"])
                    continue
                license_name, restrictions = EXPECTED[card["id"]]
                self.assertEqual(card["license"], license_name)
                self.assertTrue(restrictions <= set(card.get("license_restrictions", [])))
                self.assertNotIn("CC BY 4.0", card.get("permission_basis", ""))
        self.assertGreater(count, 70)

    def test_compared_candidates_match_publisher_license(self):
        expected = {
            "https://github.com/stanford-cs336/spring2024-assignment1-basics": None,
            "https://openstax.org/details/books/introductory-statistics-2e": "CC BY-NC-SA 4.0",
        }
        count = 0

        def walk(node, path):
            nonlocal count
            if isinstance(node, dict):
                if "candidate_name" in node and node.get("url") in expected:
                    count += 1
                    want = expected[node["url"]]
                    with self.subTest(file=str(path), url=node["url"]):
                        if want is None:
                            self.assertNotIn("MIT", node["license"])
                        else:
                            self.assertEqual(node["license"], want)
                for value in node.values():
                    walk(value, path)
            elif isinstance(node, list):
                for value in node:
                    walk(value, path)

        for path in sorted((ROOT / "curriculum").rglob("*.json")):
            walk(json.loads(path.read_text(encoding="utf-8")), path.relative_to(ROOT))
        # Floor guards against a vacuous pass; merging duplicate registry ids
        # (registry.json merged_ids) removed one redundant copy.
        self.assertGreaterEqual(count, 34)


if __name__ == "__main__":
    unittest.main()
