"""The Claude Code Agent Tool Track guide must exist in all four editions and
the editions must agree on every checkable fact: links, commands, version
pin, section count, and acceptance checklist size.
"""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRACKS = ROOT / "curriculum" / "agent-tracks"
EDITIONS = {
    "en": TRACKS / "claude-code.md",
    "ja": TRACKS / "claude-code.ja.md",
    "zh-Hans": TRACKS / "claude-code.zh-Hans.md",
    "zh-Hant": TRACKS / "claude-code.zh-Hant.md",
}


def facts(text: str) -> dict:
    code = re.findall(r"```sh\n(.*?)```", text, re.S)
    return {
        "links": sorted(set(re.findall(r"\((https://[^)\s]+)\)", text))),
        # Commands must match; trailing comments are prose and get translated.
        "commands": [[line.split("#")[0].rstrip() for line in block.splitlines()] for block in code],
        "sections": len(re.findall(r"^## ", text, re.M)),
        "checklist": len(re.findall(r"^- \[ \] ", text, re.M)),
        "version_pin": "claude 2.1.312" in text,
        "fixture": "projects/claude-code-disposable" in text,
        "evidence_dir": "docs/evidence/claude-code/" in text,
    }


class ClaudeCodeTrackGuideTests(unittest.TestCase):
    def test_all_four_editions_exist(self):
        for locale, path in EDITIONS.items():
            with self.subTest(locale=locale):
                self.assertTrue(path.is_file(), path)

    def test_editions_agree_on_checkable_facts(self):
        reference = facts(EDITIONS["en"].read_text(encoding="utf-8"))
        self.assertTrue(reference["links"] and reference["commands"] and reference["checklist"])
        for locale, path in EDITIONS.items():
            if locale == "en" or not path.is_file():
                continue
            with self.subTest(locale=locale):
                self.assertEqual(facts(path.read_text(encoding="utf-8")), reference)

    def test_translations_keep_the_blocked_status_and_spend_rule(self):
        markers = {
            "ja": ("ブロック", "認可"),
            "zh-Hans": ("阻塞", "授权"),
            "zh-Hant": ("阻塞", "授權"),
        }
        for locale, words in markers.items():
            path = EDITIONS[locale]
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8")
            with self.subTest(locale=locale):
                for word in words:
                    self.assertIn(word, text)


if __name__ == "__main__":
    unittest.main()
