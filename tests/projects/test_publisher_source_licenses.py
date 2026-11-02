"""Publisher-hosted sources must carry the terms the publisher states.

Verified 2026-10-31; evidence is recorded in the publisher-sweep receipt:
- 3Blue1Brown pages show "© Grant Sanderson"; the site FAQ allows only short
  clips under stated conditions. CC BY-NC-SA 4.0 is the license of the
  3b1b/videos animation-code repository, not of the lessons or videos.
- ACL Anthology footer: material before 2016 is CC BY-NC-SA 3.0; material
  from 2016 on is CC BY 4.0.
- J96-2001 is "Estimating Lexical Priors ..."; Chen & Goodman's smoothing
  study is P96-1041.
- The Stanford CRFM Alpaca post shows only "© Stanford CRFM"; no CC license.
- modelcontextprotocol/modelcontextprotocol LICENSE: the specification is
  moving from MIT to Apache-2.0; unrelicensed contributions remain MIT.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACL_PRE_2016 = {"P02-1040", "W04-1013", "W04-3250", "D12-1091", "P96-1041", "W05-0909", "W15-3049"}
ACL_2016_ON = {"P16-1162", "D18-2012", "P18-1128", "Q18-1041"}


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


class PublisherSourceLicenseTests(unittest.TestCase):
    def test_3blue1brown_is_not_creative_commons(self):
        count = 0
        for path, link, node in licensed_objects():
            if "3blue1brown.com" not in link:
                continue
            count += 1
            with self.subTest(file=str(path), link=link):
                self.assertNotIn("CC BY", node["license"])
                self.assertIn("copyright", node["license"].lower())
                if "permission_basis" in node:
                    self.assertNotIn("under CC BY-NC-SA", node["permission_basis"])
                    self.assertNotIn("stated CC", node["permission_basis"])
                    self.assertNotIn("noncommercial", node["license_restrictions"])
        self.assertGreaterEqual(count, 59)

    def test_acl_anthology_license_follows_year(self):
        seen = set()
        for path, link, node in licensed_objects():
            match = re.search(r"aclanthology\.org/([A-Z]\d{2}-\d{4})", link)
            if not match:
                continue
            paper = match.group(1)
            seen.add(paper)
            with self.subTest(file=str(path), paper=paper):
                self.assertNotEqual(paper, "J96-2001")
                if paper in ACL_PRE_2016:
                    self.assertIn("CC BY-NC-SA 3.0", node["license"])
                    if "license_restrictions" in node:
                        self.assertTrue({"noncommercial", "share-alike"} <= set(node["license_restrictions"]))
                else:
                    self.assertIn(paper, ACL_2016_ON)
                    self.assertIn("CC BY 4.0", node["license"])
        self.assertEqual(seen, ACL_PRE_2016 | ACL_2016_ON)

    def test_alpaca_post_and_mcp_spec(self):
        counts = {"alpaca": 0, "mcp": 0}
        for path, link, node in licensed_objects():
            if "crfm.stanford.edu/2023/03/13/alpaca" in link:
                counts["alpaca"] += 1
                with self.subTest(file=str(path), source="alpaca"):
                    self.assertNotIn("CC", node["license"])
                    self.assertNotIn("Creative Commons", node.get("permission_basis", ""))
            if "modelcontextprotocol.io" in link:
                counts["mcp"] += 1
                with self.subTest(file=str(path), source="mcp"):
                    self.assertTrue(node["license"].startswith("Apache-2.0"))
                    self.assertNotIn("under MIT license", node.get("permission_basis", ""))
        self.assertGreaterEqual(counts["alpaca"], 10)
        self.assertGreaterEqual(counts["mcp"], 4)


if __name__ == "__main__":
    unittest.main()
