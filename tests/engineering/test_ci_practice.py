import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CURRICULUM_DIR = REPO_ROOT / "curriculum" / "engineering" / "ci_delivery_rollback"
SUPPORTED_LANGS = ["zh-Hans", "zh-Hant", "en", "ja"]
REQUIRED_SECTIONS = [
    "practice_id",
    "title",
    "category",
    "prerequisites",
    "requirements",
    "branching_and_commits",
    "diff_and_pr_review_checklist",
    "ci_workflow_documentation",
    "regression_exercise",
    "conflict_resolution_guide",
    "deployment_and_health_checks",
    "rollback_runbook",
    "simulated_collaboration_notice",
    "acceptance_checklist",
]


class TestCIPracticeCurriculum(unittest.TestCase):
    """
    Validates that the CI, Deployment, and Rollback practice guide provides
    a complete four-language specification across zh-Hans, zh-Hant, en, and ja.
    """

    def test_curriculum_directory_and_manifest_exist(self):
        self.assertTrue(CURRICULUM_DIR.exists(), f"{CURRICULUM_DIR} must exist")
        manifest_file = CURRICULUM_DIR / "manifest.json"
        self.assertTrue(manifest_file.exists(), f"{manifest_file} must exist")
        meta = json.loads(manifest_file.read_text(encoding="utf-8"))
        self.assertEqual(meta["practice_id"], "ci_delivery_rollback")
        self.assertEqual(meta["supported_languages"], SUPPORTED_LANGS)

    def test_all_four_language_editions_exist_and_conform(self):
        for lang in SUPPORTED_LANGS:
            lang_file = CURRICULUM_DIR / f"{lang}.json"
            self.assertTrue(lang_file.exists(), f"Missing Language Edition file: {lang_file}")
            data = json.loads(lang_file.read_text(encoding="utf-8"))

            for section in REQUIRED_SECTIONS:
                self.assertIn(section, data, f"Language '{lang}' missing required section '{section}'")
                val = data[section]
                if isinstance(val, (str, list, dict)):
                    self.assertTrue(len(val) > 0, f"Section '{section}' in '{lang}' must not be empty")

            # Check specific contents
            self.assertGreaterEqual(
                len(data["diff_and_pr_review_checklist"]), 4,
                f"Language '{lang}' must define at least 4 PR review checklist items"
            )
            self.assertGreaterEqual(
                len(data["acceptance_checklist"]), 5,
                f"Language '{lang}' must define at least 5 acceptance checklist items"
            )
            # Ensure honest labeling of simulations
            notice = data["simulated_collaboration_notice"]
            self.assertTrue(
                any(keyword in notice.lower() for keyword in ["disposable", "simulate", "sandbox", "fixture", "模拟", "沙箱"]),
                f"Language '{lang}' notice must explicitly label simulated external collaboration"
            )


# Import runner from scripts
sys.path.insert(0, str(REPO_ROOT))
from scripts.ci_practice_runner import CIPracticeRunner  # noqa: E402 -- standalone test needs the root path above


class TestCIPracticeRunnerCleanInstall(unittest.TestCase):
    """
    Validates reproducible packaging and clean-install execution of the
    project artifact in a pristine disposable directory.
    """

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_clean_install_and_run_in_disposable_directory(self):
        runner = CIPracticeRunner(work_dir=self.work_dir)
        result = runner.run_clean_install()

        self.assertTrue(result["success"], f"Clean install failed: {result.get('error')}")
        self.assertEqual(result["stage"], "clean_install")
        self.assertTrue(Path(result["artifact_dir"]).exists())

        # Verify CLI execution generated required outputs
        out_dir = Path(result["output_dir"])
        self.assertTrue((out_dir / "stats.json").exists())
        self.assertTrue((out_dir / "manifest.json").exists())
        self.assertTrue((out_dir / "train.txt").exists())
        self.assertTrue((out_dir / "val.txt").exists())
        self.assertTrue((out_dir / "test.txt").exists())

        # Verify stats content
        stats = json.loads((out_dir / "stats.json").read_text(encoding="utf-8"))
        self.assertGreater(stats["total_tokens"], 0)
        self.assertGreater(stats["vocab_size"], 0)


class TestCIPracticeRunnerRegression(unittest.TestCase):
    """
    Validates the controlled regression injection, detection, diagnosis,
    and reviewed repair cycle in isolated disposable repositories.
    """

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_controlled_regression_cycle_red_to_green(self):
        runner = CIPracticeRunner(work_dir=self.work_dir)
        # The copied fixture must win over the host package even when inherited.
        with patch.dict(os.environ, {'PYTHONPATH': str(REPO_ROOT)}):
            result = runner.run_regression_cycle()

        self.assertTrue(result["success"], f"Regression cycle failed: {result.get('error')}")
        self.assertEqual(result["stage"], "regression_exercise")
        self.assertTrue(result["baseline_green"], "Initial baseline tests must pass")
        self.assertTrue(result["test_failed_red"], "Injected regression must cause test failure")
        self.assertIn("AssertionError", result["failure_summary"])
        self.assertTrue(result["fix_applied"], "Reviewed fix must be applied")
        self.assertTrue(result["test_restored_green"], "Tests must pass green after reviewed fix")


class TestCIPracticeRunnerGitCollaboration(unittest.TestCase):
    """
    Validates disposable git collaboration and safe conflict resolution
    in temporary fixture repositories without risking user work.
    """

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_disposable_git_collaboration_and_conflict_resolution(self):
        runner = CIPracticeRunner(work_dir=self.work_dir)
        result = runner.run_conflict_resolution()

        self.assertTrue(result["success"], f"Conflict resolution failed: {result.get('error')}")
        self.assertEqual(result["stage"], "conflict_resolution")
        self.assertTrue(result["conflict_detected"], "Merge conflict must be triggered")
        self.assertTrue(result["conflict_resolved"], "Merge conflict must be cleanly resolved")
        self.assertTrue(result["unrelated_changes_preserved"], "Upstream collaborator changes must be preserved")
        self.assertTrue(result["simulation_labeled"], "Collaboration must be explicitly labeled as simulation")
        self.assertTrue(result["clean_history"], "Git working tree must be clean post-merge")


class TestCIPracticeRunnerDeploymentAndRollback(unittest.TestCase):
    """
    Validates controlled deployment to a disposable environment, observable
    health check failure on defect injection, and automated rollback with
    state restoration.
    """

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_deployment_health_failure_and_rollback_recovery(self):
        runner = CIPracticeRunner(work_dir=self.work_dir)
        result = runner.run_deployment_and_rollback()

        self.assertTrue(result["success"], f"Deployment and rollback failed: {result.get('error')}")
        self.assertEqual(result["stage"], "controlled_deployment_and_rollback")
        self.assertEqual(result["v1_health"], "HEALTHY")
        self.assertEqual(result["v2_health"], "UNHEALTHY")
        self.assertTrue(result["rollback_executed"], "Rollback must be triggered and completed")
        self.assertEqual(result["restored_health"], "HEALTHY")
        self.assertEqual(result["restored_version"], "1.0.0")

        # Verify observable evidence file exists and is well-formed
        evidence_file = Path(result["evidence_path"])
        self.assertTrue(evidence_file.exists())
        evidence_data = json.loads(evidence_file.read_text(encoding="utf-8"))
        self.assertEqual(evidence_data["current_release"], "1.0.0")
        self.assertEqual(evidence_data["history"][-1]["action"], "rollback_restored")


class TestCIPracticeRunnerCLI(unittest.TestCase):
    """
    Validates the end-to-end command line interface of scripts/ci_practice_runner.py.
    """

    def test_cli_runner_all_stages_with_json_evidence(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cmd = [
                sys.executable,
                str(REPO_ROOT / "scripts" / "ci_practice_runner.py"),
                "--stage", "all",
                "--work-dir", temp_dir,
                "--json",
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, f"CLI runner failed: {res.stderr}\nStdout: {res.stdout}")

            # Parse JSON evidence output
            evidence = json.loads(res.stdout)
            self.assertEqual(evidence["practice_id"], "ci_delivery_rollback")
            self.assertIn("clean_install", evidence["stages"])
            self.assertIn("regression_exercise", evidence["stages"])
            self.assertIn("conflict_resolution", evidence["stages"])
            self.assertIn("controlled_deployment_and_rollback", evidence["stages"])
            self.assertTrue(evidence["stages"]["clean_install"]["success"])
            self.assertTrue(evidence["stages"]["regression_exercise"]["success"])
            self.assertTrue(evidence["stages"]["conflict_resolution"]["success"])
            self.assertTrue(evidence["stages"]["controlled_deployment_and_rollback"]["success"])


if __name__ == "__main__":
    unittest.main()






