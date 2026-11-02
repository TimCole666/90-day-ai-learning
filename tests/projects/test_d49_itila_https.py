"""D4.9: ITILA links use HTTPS (the HTTPS page is byte-identical and has a valid cert).

Nielsen's neuralnetworksanddeeplearning.com stays on http because it has no valid
HTTPS certificate.
"""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = [ROOT / "curriculum/sources/registry.json", *sorted((ROOT / "curriculum/days").glob("day-*.json")),
         *sorted((ROOT / "curriculum/content").glob("*/*.json"))]


class ItilaHttpsTest(unittest.TestCase):
    def test_no_http_itila_links(self):
        offenders = [p.relative_to(ROOT).as_posix() for p in FILES
                     if "http://www.inference.org.uk/" in p.read_text(encoding="utf-8")]
        self.assertEqual(offenders, [])

    def test_https_itila_link_present(self):
        self.assertIn("https://www.inference.org.uk/itila/book.html",
                      (ROOT / "curriculum/sources/registry.json").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
