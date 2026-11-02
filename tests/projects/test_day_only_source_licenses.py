"""Day-only sources (not in the registry) must carry the terms their owners state.

Verified 2026-10-31; evidence is recorded in the day-source-sweep receipt:
- conventionalcomments.org footer: "License Creative Commons - CC BY 3.0".
- github/choosealicense.com README: site content is CC BY 3.0 Unported;
  the code that formats it is MIT. Nothing states CC0.
- ksylor/ohshitgit README: "This site is my copyrighted content"; the site
  footer shows only a copyright notice. No Creative Commons license.
- pytorch.org/docs/stable/generated/torch.autograd.gradcheck.html now
  redirects to a 404; the live page is torch.autograd.gradcheck.gradcheck.html.
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GRADCHECK_URL = "https://docs.pytorch.org/docs/stable/generated/torch.autograd.gradcheck.gradcheck.html"


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


def matching(fragment):
    return [(p, n) for p, link, n in licensed_objects() if fragment in link]


class DayOnlySourceLicenseTests(unittest.TestCase):
    def test_conventional_comments_is_cc_by_3(self):
        found = matching("conventionalcomments.org")
        self.assertGreaterEqual(len(found), 1)
        for path, node in found:
            with self.subTest(file=str(path)):
                self.assertEqual(node["license"], "CC BY 3.0")

    def test_choosealicense_content_is_cc_by_3_not_cc0(self):
        found = matching("choosealicense.com")
        self.assertGreaterEqual(len(found), 1)
        for path, node in found:
            with self.subTest(file=str(path)):
                self.assertNotIn("CC0", node["license"])
                self.assertIn("CC BY 3.0", node["license"])
                self.assertIn("MIT", node["license"])

    def test_ohshitgit_is_author_copyright(self):
        found = matching("ohshitgit.com")
        self.assertGreaterEqual(len(found), 2)
        for path, node in found:
            with self.subTest(file=str(path)):
                self.assertNotIn("CC BY", node["license"])
                self.assertIn("copyright", node["license"].lower())

    def test_gradcheck_link_is_live_page(self):
        self.assertEqual(matching("torch.autograd.gradcheck.html"), [])
        found = matching(GRADCHECK_URL)
        # The Day 32 card plus its registry entry (added in D4.7).
        self.assertEqual(sorted(str(p) for p, _ in found),
                         ["curriculum/days/day-32.json", "curriculum/sources/registry.json"])


if __name__ == "__main__":
    unittest.main()
