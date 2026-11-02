"""Book and tutorial sources must carry the license their source repository states.

Verified 2026-10-31 via raw.githubusercontent.com; evidence is recorded in the
other-sources receipt:
- d2l-ai/d2l-en README: "This open source book is made available under the
  Creative Commons Attribution-ShareAlike 4.0 International License"; sample
  code is under a modified MIT license. There is no noncommercial term.
- harvardnlp/annotated-transformer LICENSE: MIT License (Alexander Rush).
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def licensed_objects():
    def walk(node):
        if isinstance(node, dict):
            if "license" in node:
                yield node
            for value in node.values():
                yield from walk(value)
        elif isinstance(node, list):
            for value in node:
                yield from walk(value)

    for path in sorted((ROOT / "curriculum").rglob("*.json")):
        for node in walk(json.loads(path.read_text(encoding="utf-8"))):
            link = " ".join(str(node.get(k, "")) for k in ("url", "original_url"))
            yield path.relative_to(ROOT), link, node


class BookSourceLicenseTests(unittest.TestCase):
    def test_d2l_is_cc_by_sa(self):
        count = 0
        for path, link, node in licensed_objects():
            if "d2l.ai" not in link:
                continue
            count += 1
            with self.subTest(file=str(path), link=link):
                self.assertIn("CC BY-SA 4.0", node["license"])
                self.assertNotIn("NC", node["license"])
                if "license_restrictions" in node:
                    self.assertEqual(node["license_restrictions"], ["share-alike"])
                self.assertNotIn("noncommercial", node.get("permission_basis", "").lower())
                self.assertNotIn("BY-NC", node.get("permission_basis", ""))
        self.assertGreaterEqual(count, 22)

    def test_annotated_transformer_is_mit(self):
        count = 0
        for path, link, node in licensed_objects():
            if "annotated-transformer" not in link:
                continue
            count += 1
            with self.subTest(file=str(path)):
                self.assertEqual(node["license"], "MIT")
                self.assertNotIn("Apache", node.get("permission_basis", ""))
        self.assertGreaterEqual(count, 34)


if __name__ == "__main__":
    unittest.main()
