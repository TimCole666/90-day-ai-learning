import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


PROJECT = ROOT / "curriculum" / "projects" / "pi_agent"


class PiAgentContentTests(unittest.TestCase):
    def test_project_has_four_equivalent_language_guides(self):
        docs = PROJECT / "docs"
        self.assertEqual(
            {p.stem.removeprefix("guide.") for p in docs.glob("guide.*.md")},
            {"en", "ja", "zh-Hans", "zh-Hant"},
        )

    def test_manifest_discloses_capabilities_and_unverified_live_run(self):
        manifest = json.loads((PROJECT / "project.json").read_text())
        self.assertEqual(manifest["tested_release"], "v1.4.0")
        self.assertEqual(manifest["live_run_status"], "blocked-without-authorized-provider-access")
        self.assertIn("sub-agent delegation", manifest["capabilities"]["extensions_required"])
        for criterion in ("complete diff is reviewed", "tests are run independently"):
            self.assertIn(criterion, manifest["acceptance"])

    def test_fixture_is_deterministic(self):
        self.assertEqual(
            __import__("subprocess").run(
                ["python3", "-m", "unittest", "discover", "-s", "tests"],
                cwd=PROJECT / "fixture",
                capture_output=True,
                text=True,
            ).returncode,
            0,
        )


if __name__ == "__main__":
    unittest.main()
