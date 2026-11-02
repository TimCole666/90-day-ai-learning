import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
LANGS = ("en", "ja", "zh-Hans", "zh-Hant")
REQUIRED = (
    "docs.claude.com",
    "claude --version",
    "ANTHROPIC_API_KEY",
    "disposable",
    "git diff",
    "git diff --check",
)


class ClaudeCodeTrackPublicSeamTest(unittest.TestCase):
    def test_all_language_editions_publish_equivalent_claude_run_contract(self):
        texts = []
        for language in LANGS:
            content = json.loads(
                (ROOT / "curriculum/content/agent-track" / f"{language}.json").read_text()
            )
            track = content["tracks"]["claude-code"]
            text = track["tool_operations"]
            texts.append(text)
            for required in REQUIRED:
                self.assertIn(required, text, f"{language} omits {required}")
            self.assertTrue(any(word in text for word in ("blocked", "保留", "阻塞")), f"{language} must disclose live limitation")
        self.assertEqual(len(texts), 4)

    def test_registry_does_not_claim_unperformed_live_acceptance(self):
        registry = json.loads(
            (ROOT / "curriculum/agent-tracks/registry.json").read_text()
        )
        claude = next(track for track in registry["tracks"] if track["id"] == "claude-code")
        self.assertEqual(claude["tested_version"], "2.1.312")
        self.assertEqual(claude["verification_state"], "pending")
        self.assertIn("blocked", claude["verification_evidence"])

    def test_fixture_and_evidence_keep_real_run_distinct(self):
        fixture = ROOT / "projects/claude-code-disposable"
        evidence = (ROOT / "docs/evidence/claude-code/README.md").read_text()
        self.assertTrue((fixture / "src/greeter.py").exists())
        self.assertTrue((fixture / "tests/test_greeter.py").exists())
        self.assertIn("not a transcript from Claude Code", evidence)
        self.assertIn("Real-tool evidence", evidence)
        self.assertIn("exit=1", evidence)
        self.assertIn("exit=0", evidence)
        self.assertNotIn("ANTHROPIC_API_KEY=", evidence)


if __name__ == "__main__":
    unittest.main()
