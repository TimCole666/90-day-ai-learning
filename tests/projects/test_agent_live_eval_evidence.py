import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = PROJECT_ROOT / "projects" / "agent_learning" / "evidence"
sys.path.insert(0, str(PROJECT_ROOT))

from projects.agent_learning.agent import ALLOWED_TOOLS, MODEL_ADAPTER_VERSION
from projects.agent_learning.fixtures import expected_report
from projects.agent_learning.evidence.validate_contract import (
    LIVE_RUN_FIELDS,
    LIVE_TASK_FIELDS,
    REQUIRED_TASK_CATEGORIES,
    validate_contract,
)


class TestAgentLiveEvalEvidence(unittest.TestCase):
    def setUp(self):
        self.contract = json.loads(
            (EVIDENCE / "live_eval_contract.json").read_text(encoding="utf-8")
        )

    def test_blocked_contract_is_complete_and_has_no_fabricated_measurements(self):
        self.assertEqual(validate_contract(self.contract), [])
        self.assertEqual(self.contract["status"], "blocked-awaiting-authorization")
        self.assertFalse(self.contract["authorization"]["approved"])
        live = self.contract["live_results"]
        for field in LIVE_RUN_FIELDS:
            self.assertIsNone(live[field], field)
        self.assertTrue(all(task[field] is None for task in live["tasks"] for field in LIVE_TASK_FIELDS))
        for metric in self.contract["metrics"].values():
            self.assertIsNone(metric["live_value"])

    def test_live_execution_requires_specific_authorization(self):
        errors = validate_contract(self.contract, require_authorized=True)
        self.assertTrue(any("authorization.approved" in error for error in errors))

    def test_blocked_contract_rejects_fabricated_live_values(self):
        fabricated = json.loads(json.dumps(self.contract))
        fabricated["live_results"]["provider"] = "some-provider"
        fabricated["live_results"]["tasks"][0]["status"] = "completed"
        fabricated["metrics"]["outcome_passed"]["live_value"] = 1
        errors = validate_contract(fabricated)
        self.assertTrue(any("live_results fields must be null" in error for error in errors))
        self.assertTrue(any("fields must be null before authorization" in error for error in errors))
        self.assertTrue(any("live_value must be null" in error for error in errors))

    def _approved_contract(self):
        contract = json.loads(json.dumps(self.contract))
        contract["status"] = "executed"
        contract["authorization"].update({
            "approved": True,
            "approver": "course-owner",
            "approval_reference": "ticket-23-approval",
            "approved_at_utc": "2026-11-01T00:00:00Z",
        })
        return contract

    def test_live_results_must_not_exceed_limits(self):
        contract = self._approved_contract()
        contract["live_results"]["cost_usd"] = 6.0           # ceiling 5.0
        contract["live_results"]["elapsed_seconds"] = 2000   # ceiling 1800
        contract["live_results"]["tasks"][0]["steps"] = 7    # ceiling 6
        contract["live_results"]["tasks"][0]["retries"] = 3  # ceiling 2
        errors = validate_contract(contract)
        self.assertTrue(any("live_results.cost_usd" in e and "cost_usd_ceiling" in e for e in errors), errors)
        self.assertTrue(any("live_results.elapsed_seconds" in e and "runtime_seconds_ceiling" in e for e in errors), errors)
        self.assertTrue(any("steps" in e and "steps_per_task_ceiling" in e for e in errors), errors)
        self.assertTrue(any("retries" in e and "retries_per_task_ceiling" in e for e in errors), errors)

    def test_non_finite_or_bool_limits_are_rejected(self):
        fields = ("cost_usd_ceiling", "runtime_seconds_ceiling", "steps_per_task_ceiling",
                  "retries_per_task_ceiling", "total_model_calls_ceiling")
        for bad in (float("nan"), float("inf"), True):
            for field in fields:
                with self.subTest(field=field, ceiling=bad):
                    contract = self._approved_contract()
                    contract["limits"][field] = bad
                    contract["live_results"]["cost_usd"] = 999.0
                    errors = validate_contract(contract)
                    self.assertTrue(any(f"limits.{field}" in e and "finite positive" in e for e in errors), errors)

    def test_shipped_contract_limits_stay_valid(self):
        errors = validate_contract(json.loads(json.dumps(self.contract)))
        self.assertFalse(any(e.startswith("limits.") for e in errors), errors)

    def test_live_results_at_or_below_limits_pass(self):
        contract = self._approved_contract()
        contract["live_results"]["cost_usd"] = 5.0
        contract["live_results"]["elapsed_seconds"] = 1800
        for task in contract["live_results"]["tasks"]:
            task["steps"] = 6
            task["retries"] = 2
        errors = validate_contract(contract)
        self.assertFalse(any("exceeds" in e for e in errors), errors)

    def test_validator_cli_is_deterministic_and_never_calls_a_model(self):
        command = [sys.executable, str(EVIDENCE / "validate_contract.py"), str(EVIDENCE / "live_eval_contract.json")]
        first = subprocess.run(command, capture_output=True, text=True, check=False)
        second = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(first.returncode, 0)
        self.assertEqual(first.stdout, second.stdout)
        self.assertIn("no live model call launched", first.stdout)

    def test_malformed_shapes_are_reported_without_traceback(self):
        import copy
        import tempfile

        cases = [[], "x", None]
        for field in ("authorization", "deterministic_baseline", "evaluation_configuration",
                      "limits", "live_results", "separation"):
            for bad in ([], "x", 5, None):
                contract = copy.deepcopy(self.contract)
                contract[field] = bad
                cases.append(contract)
        for kind_field in ("simulated_evidence_kind", "live_evidence_kind"):
            for bad in ([], {}):
                contract = copy.deepcopy(self.contract)
                contract["separation"][kind_field] = bad
                cases.append(contract)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "contract.json"
            for case in cases:
                path.write_text(json.dumps(case), encoding="utf-8")
                result = subprocess.run(
                    [sys.executable, str(EVIDENCE / "validate_contract.py"), str(path)],
                    capture_output=True, text=True, check=False, timeout=30,
                )
                label = json.dumps(case)[:80]
                self.assertEqual(result.returncode, 1, label)
                self.assertIn("INVALID CONTRACT", result.stdout, label)
                self.assertNotIn("Traceback", result.stderr, label)

    def test_fixed_task_set_covers_required_failure_categories(self):
        categories = {task["category"] for task in self.contract["task_set"]}
        self.assertTrue(REQUIRED_TASK_CATEGORIES <= categories)
        live_ids = {entry["task_id"] for entry in self.contract["live_results"]["tasks"]}
        self.assertEqual(live_ids, {task["task_id"] for task in self.contract["task_set"]})

    def test_contract_binds_to_the_deterministic_ticket22_baseline(self):
        baseline = self.contract["deterministic_baseline"]
        self.assertEqual(baseline["model_adapter"], MODEL_ADAPTER_VERSION)
        self.assertIs(baseline["is_live_model_evidence"], False)
        digest = hashlib.sha256(expected_report().encode("utf-8")).hexdigest()
        self.assertEqual(baseline["expected_report_sha256"], digest)
        self.assertEqual(sorted(self.contract["evaluation_configuration"]["allowed_tools"]),
                         sorted(ALLOWED_TOOLS))
        separation = self.contract["separation"]
        self.assertIs(separation["simulated_results_are_live_evidence"], False)
        self.assertNotEqual(separation["simulated_evidence_kind"], separation["live_evidence_kind"])

    def test_four_language_reports_mark_live_evidence_blocked(self):
        for language in ("en", "ja", "zh-Hans", "zh-Hant"):
            report = EVIDENCE / f"report.{language}.md"
            self.assertTrue(report.exists(), language)
            text = report.read_text(encoding="utf-8")
            self.assertIn("blocked-awaiting-authorization", text)
            self.assertIn("null", text)

    def test_gate_and_selection_documents_exist_without_executed_claims(self):
        for name in ("authorization_gate.md", "model_selection_plan.md"):
            self.assertTrue((EVIDENCE / name).exists(), name)
        selection = self.contract["model_selection"]
        for field in ("selected_provider", "selected_model_id", "selected_model_revision"):
            self.assertIsNone(selection[field])
        changed_lessons = subprocess.run(
            ["git", "diff", "--name-only", "HEAD", "--", "lessons/"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(changed_lessons.stdout, "")


if __name__ == "__main__":
    unittest.main()
