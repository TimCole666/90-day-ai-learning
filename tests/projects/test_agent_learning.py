import json
import subprocess
import sys
import tempfile
import unittest
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from projects.agent_learning.agent import (
    AgentConfig,
    DeterministicModelAdapter,
    evaluate,
    run_task,
)
from projects.agent_learning.fixtures import create_fixture


class AgentLearningProjectTests(unittest.TestCase):
    def test_symlinked_note_cannot_escape_workspace(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory) / "workspace"
            outside = Path(directory) / "outside.txt"
            create_fixture(workspace)
            outside.write_text("secret\n", encoding="utf-8")
            (workspace / "notes" / "leak.txt").symlink_to(outside)

            class ReadSymlinkAdapter(DeterministicModelAdapter):
                def next_action(self, history: list[Mapping[str, Any]]) -> dict[str, Any]:
                    return {"name": "read_note", "arguments": {"filename": "leak.txt"}}

            result = run_task("summarize-notes", workspace, ReadSymlinkAdapter(),
                              AgentConfig(max_steps=1, max_retries=0))
            self.assertEqual(result.status, "failed")
            self.assertEqual(result.trace[-1]["observation"]["error"], "not_found")
            self.assertFalse(any(
                event["observation"].get("content") == "secret\n"
                for event in result.trace
            ))

    def test_symlinked_notes_directory_cannot_escape_workspace(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory) / "workspace"
            outside = Path(directory) / "outside-notes"
            workspace.mkdir()
            outside.mkdir()
            (outside / "private-name.txt").write_text("fixture only\n", encoding="utf-8")
            (workspace / "notes").symlink_to(outside, target_is_directory=True)

            result = run_task(
                "summarize-notes", workspace, DeterministicModelAdapter(),
                AgentConfig(max_steps=1, max_retries=0),
            )

            self.assertEqual(result.status, "failed")
            self.assertEqual(result.trace[-1]["observation"]["error"], "not_found")
            self.assertNotIn("private-name.txt", json.dumps(result.to_dict()))

    def test_symlinked_report_cannot_overwrite_outside_workspace(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory) / "workspace"
            outside = Path(directory) / "outside.txt"
            create_fixture(workspace)
            original = "preserve this outside fixture\n"
            outside.write_text(original, encoding="utf-8")
            (workspace / "report.txt").symlink_to(outside)

            result = run_task(
                "summarize-notes", workspace, DeterministicModelAdapter(),
                AgentConfig(max_steps=4, max_retries=0),
            )

            self.assertEqual(outside.read_text(encoding="utf-8"), original)
            self.assertEqual(result.status, "failed")
            self.assertEqual(result.trace[-1]["observation"]["error"], "invalid_arguments")

    def test_successful_run_exposes_actions_observations_and_independent_scores(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            create_fixture(workspace)
            result = run_task("summarize-notes", workspace, DeterministicModelAdapter())
            self.assertEqual(result.status, "completed")
            self.assertEqual(result.answer, "Report written: report.txt")
            self.assertTrue(all(set(event) == {"action", "observation"} for event in result.trace))
            report = evaluate([result], workspace)
            self.assertEqual(report["metrics"], {
                "outcome_passed": 1,
                "tool_behavior_passed": 1,
                "budget_passed": 1,
                "failure_handling_passed": 1,
                "tasks": 1,
            })

    def test_invalid_arguments_are_observed_then_corrected_within_retry_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            create_fixture(workspace)
            result = run_task(
                "summarize-notes", workspace,
                DeterministicModelAdapter(fault="invalid_arguments"),
                AgentConfig(max_steps=6, max_retries=2),
            )
            self.assertEqual(result.status, "completed")
            self.assertEqual(result.trace[0]["observation"]["error"], "invalid_arguments")
            self.assertTrue(result.trace[1]["observation"]["ok"])
            self.assertTrue(any(event["action"]["name"] == "write_report" for event in result.trace))
            self.assertEqual(result.retries, 1)

    def test_invalid_filename_nul_is_observed_without_crashing(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            create_fixture(workspace)

            class NulFilenameAdapter(DeterministicModelAdapter):
                def next_action(self, history: list[Mapping[str, Any]]) -> dict[str, Any]:
                    return {"name": "read_note", "arguments": {"filename": "a\x00.txt"}}

            result = run_task(
                "summarize-notes", workspace, NulFilenameAdapter(),
                AgentConfig(max_steps=1, max_retries=0),
            )
            self.assertEqual(result.status, "failed")
            self.assertEqual(result.trace[-1]["observation"]["error"], "invalid_arguments")

    def test_non_utf8_note_is_structured_tool_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            create_fixture(workspace)
            (workspace / "notes" / "beta.txt").write_bytes(b"Beta caf\xe9\n")

            class NonUtf8Adapter(DeterministicModelAdapter):
                def next_action(self, history: list[Mapping[str, Any]]) -> dict[str, Any]:
                    return {"name": "read_note", "arguments": {"filename": "beta.txt"}}

            result = run_task(
                "summarize-notes", workspace, NonUtf8Adapter(),
                AgentConfig(max_steps=1, max_retries=0),
            )
            self.assertEqual(result.status, "failed")
            self.assertEqual(result.trace[-1]["observation"]["error"], "read_error")

    def test_cli_rejects_unknown_fixture_without_traceback(self):
        result = subprocess.run(
            [sys.executable, "-m", "projects.agent_learning.cli", "run", "--fixture", "other-task"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("invalid choice", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_tool_failure_feedback_terminates_safely(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            create_fixture(workspace)
            result = run_task(
                "summarize-notes", workspace,
                DeterministicModelAdapter(fault="missing_note"),
                AgentConfig(max_steps=4, max_retries=1),
            )
            self.assertEqual(result.status, "failed")
            self.assertEqual(result.termination, "tool_failure")
            self.assertTrue(result.trace[-1]["observation"]["error"] == "not_found")
            self.assertFalse((workspace / "report.txt").exists())

    def test_step_budget_ends_without_unbounded_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            create_fixture(workspace)
            result = run_task(
                "summarize-notes", workspace,
                DeterministicModelAdapter(fault="loop"),
                AgentConfig(max_steps=2, max_retries=1),
            )
            self.assertEqual(result.status, "budget_exhausted")
            self.assertEqual(result.steps, 2)
            self.assertEqual(result.termination, "step_budget")

    def test_cli_writes_reproducible_evaluation_artifact_without_real_model(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "run.json"
            command = [sys.executable, "-m", "projects.agent_learning.cli", "evaluate",
                       "--fixture", "summarize-notes", "--output", str(output)]
            first = subprocess.run(command, check=False, capture_output=True, text=True)
            second = subprocess.run(command, check=False, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(second.returncode, 0, second.stderr)
            payload = json.loads(output.read_text())
            self.assertEqual(payload["report"]["metrics"]["outcome_passed"], 1)
            self.assertEqual(payload["evidence"]["model_adapter"], "deterministic-v1")
            self.assertEqual(payload, json.loads(second.stdout))
            self.assertNotIn("thought", json.dumps(payload))

    def test_config_rejects_non_positive_budgets(self):
        with self.assertRaises(ValueError):
            AgentConfig(max_steps=0)
        with self.assertRaises(ValueError):
            AgentConfig(max_retries=-1)


if __name__ == "__main__":
    unittest.main()
