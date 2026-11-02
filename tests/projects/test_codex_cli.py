"""Deterministic Codex-track seam tests; no model request or network call is made."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "curriculum/projects/docs/codex-agent-tool-track"
LANGS = ("en", "ja", "zh-Hans", "zh-Hant")
REQUIRED = (
    "setup", "configuration", "bounded_task", "context", "permissions",
    "inspection_and_tests", "failure_recovery", "troubleshooting", "answers",
    "acceptance_criteria", "evidence", "official_sources",
)


class CodexTrackContentTests(unittest.TestCase):
    def test_manifest_and_four_equivalent_editions(self):
        manifest = json.loads((DOCS / "manifest.json").read_text())
        self.assertEqual(manifest["supported_languages"], ["zh-Hans", "zh-Hant", "en", "ja"])
        self.assertEqual(manifest["verification_state"], "docs_and_cli_verified_live_model_blocked")
        for lang in LANGS:
            data = json.loads((DOCS / f"{lang}.json").read_text())
            for key in REQUIRED:
                self.assertIn(key, data, f"{lang} lacks {key}")
                self.assertTrue(data[key], f"{lang}.{key} must not be empty")
            self.assertEqual(data["track_id"], "codex")
            self.assertIn("2026-10-30", data["status"])
            self.assertIn("blocked", json.dumps(data, ensure_ascii=False).lower())
            self.assertGreaterEqual(len(data["official_sources"]), 3)

    def test_fixture_has_deliberate_failure_and_reference_correction(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            shutil.copy(DOCS / "fixture" / "validator.py", work / "validator.py")
            shutil.copy(DOCS / "fixture" / "test_validator.py", work / "test_validator.py")
            failed = subprocess.run(
                [sys.executable, "-m", "unittest", "-v", "test_validator.py"],
                cwd=work, capture_output=True, text=True,
            )
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("TypeError", failed.stderr + failed.stdout)
            shutil.copy(DOCS / "fixture" / "validator_solution.py", work / "validator.py")
            passed = subprocess.run(
                [sys.executable, "-m", "unittest", "-v", "test_validator.py"],
                cwd=work, capture_output=True, text=True,
            )
            self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
            self.assertRegex(passed.stdout + passed.stderr, r"Ran 4 tests")

    def test_local_codex_probe_is_safe_and_version_is_pinned_range(self):
        version = subprocess.run(["codex", "--version"], capture_output=True, text=True)
        self.assertEqual(version.returncode, 0, version.stderr)
        self.assertRegex(version.stdout.strip(), r"codex-cli 0\.\d+\.\d+")
        help_result = subprocess.run(
            ["codex", "sandbox", "--help"], capture_output=True, text=True
        )
        self.assertEqual(help_result.returncode, 0, help_result.stderr)
        self.assertIn("sandbox", (help_result.stdout + help_result.stderr).lower())
        en = json.loads((DOCS / "en.json").read_text())
        self.assertRegex(en["tested_release"], r"codex-cli 0\.148\.0")
        self.assertNotIn("--yolo", en["configuration"][0])
        self.assertIn("--yolo", " ".join(en["configuration"]))


if __name__ == "__main__":
    unittest.main()
