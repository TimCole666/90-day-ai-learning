import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / "curriculum" / "projects" / "docs" / "deepseek_harness"
LANGS = ("en", "ja", "zh-Hans", "zh-Hant")
REQUIRED_KEYS = {
    "official_sources", "setup_and_access", "configuration", "release_and_risk_record",
    "provider_model_plugins_and_cost", "requirements", "workflow", "exercises",
    "debugging_cases", "independent_mastery_checks", "agent_assisted_checks", "answers",
    "acceptance_checklist",
}
REQUIRED_MARKERS = (
    "DEEPSEEK_API_KEY", "0.1.1-preview", "2026-10-30", "git diff",
    "git diff --check", "exit=1", "exit=0", "plugin", "blocked",
)


class DeepSeekHarnessTrackTest(unittest.TestCase):
    def test_four_language_editions_have_equivalent_track_contract(self):
        for language in LANGS:
            data = json.loads((PROJECT / f"{language}.json").read_text())
            self.assertEqual(data["project_id"], "deepseek_harness")
            self.assertTrue(data.keys() >= REQUIRED_KEYS, language)
            text = json.dumps(data, ensure_ascii=False)
            for marker in REQUIRED_MARKERS:
                self.assertIn(marker, text, f"{language} omits {marker}")
            self.assertGreaterEqual(len(data["debugging_cases"]), 4)
            self.assertGreaterEqual(len(data["acceptance_checklist"]), 6)

    def test_fixture_records_real_failure_then_correction_without_secret(self):
        source = ROOT / "projects" / "deepseek-harness-disposable"
        with tempfile.TemporaryDirectory() as directory:
            worktree = Path(directory) / "fixture"
            shutil.copytree(source, worktree)
            subprocess.run(["git", "init", "-q"], cwd=worktree, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.invalid"], cwd=worktree, check=True)
            subprocess.run(["git", "config", "user.name", "Fixture Test"], cwd=worktree, check=True)
            subprocess.run(["git", "add", "."], cwd=worktree, check=True)
            subprocess.run(["git", "commit", "-qm", "baseline"], cwd=worktree, check=True)
            test_file = worktree / "tests" / "test_greeter.py"
            original = test_file.read_text()
            test_file.write_text(original.replace("Hello, Ada!", "Goodbye, Ada!"))
            failed = subprocess.run(
                ["python3", "-m", "unittest", "discover", "-s", "tests", "-v"],
                cwd=worktree, capture_output=True, text=True,
            )
            self.assertEqual(failed.returncode, 1)
            test_file.write_text(original)
            passed = subprocess.run(
                ["python3", "-m", "unittest", "discover", "-s", "tests", "-v"],
                cwd=worktree, capture_output=True, text=True,
            )
            self.assertEqual(passed.returncode, 0)
            diff_check = subprocess.run(
                ["git", "diff", "--check"], cwd=worktree, capture_output=True, text=True
            )
            self.assertEqual(diff_check.returncode, 0)

        evidence = (ROOT / "docs/evidence/deepseek-harness/README.md").read_text()
        self.assertIn("not a DeepSeek Harness transcript", evidence)
        self.assertIn("Real-tool evidence", evidence)
        self.assertIn("blocked-pending-authorized-access", evidence)
        self.assertNotIn("DEEPSEEK_API_KEY=", evidence)


if __name__ == "__main__":
    unittest.main()
