import sys
import unittest
from importlib import import_module
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

validate_evidence_package = import_module(
    "projects.pretrain.cloud_evidence"
).validate_evidence_package


BASE = {
    "schema_version": "cloud-pretraining-evidence-v1",
    "run_status": "blocked",
    "approval_gate": {
        "required_before_paid_execution": True,
        "approval_requested": False,
        "approved": False,
    },
    "assumptions": {"provider": "not selected", "model": "projects/pretrain GPT"},
    "cost_plan": {
        "spending_ceiling_usd": 25,
        "stop_behavior": "Stop/release compute at ceiling or on failure; do not delete storage.",
        "storage_charge_follow_up": "Record retained volume/object charges after compute release.",
    },
    "versioned_inputs": {"data_sha256": "a" * 64, "config_sha256": "b" * 64},
    "commands": {"start": "approval-gated", "resume": "documented"},
    "evidence": {
        "provider": None,
        "gpu_identity": None,
        "elapsed_seconds": None,
        "measured_cost_usd": None,
    },
    "limitations": ["No provider authorization; no cloud run claimed."],
}


class CloudEvidenceContractTests(unittest.TestCase):
    def test_prepared_package_with_null_measurements_is_valid(self):
        self.assertEqual(validate_evidence_package(BASE), [])

    def test_paid_execution_cannot_skip_approval_gate(self):
        package = {
            **BASE,
            "approval_gate": {
                **BASE["approval_gate"],
                "required_before_paid_execution": False,
            },
        }
        self.assertIn(
            "approval_gate.required_before_paid_execution must be true",
            validate_evidence_package(package),
        )

    def test_blocked_package_cannot_fabricate_spending(self):
        package = {**BASE, "evidence": {**BASE["evidence"], "measured_cost_usd": 1.23}}
        self.assertIn(
            "non-complete package cannot report measured cloud spending",
            validate_evidence_package(package),
        )

    def test_required_measurements_remain_explicit(self):
        package = {**BASE, "evidence": {"provider": None}}
        errors = validate_evidence_package(package)
        self.assertIn(
            "evidence.gpu_identity is required (use null when unavailable)", errors
        )
        self.assertIn(
            "evidence.measured_cost_usd is required (use null when unavailable)", errors
        )

    def test_complete_package_requires_recorded_approval(self):
        package = {
            **BASE,
            "run_status": "complete",
            "evidence": {
                "provider": "example-provider",
                "gpu_identity": "example-gpu",
                "elapsed_seconds": 120,
                "measured_cost_usd": 1.5,
            },
        }
        self.assertIn(
            "complete package requires approval_gate.approved",
            validate_evidence_package(package),
        )

    def test_approved_complete_package_requires_approval_record(self):
        package = {
            **BASE,
            "run_status": "complete",
            "approval_gate": {
                **BASE["approval_gate"],
                "approval_requested": True,
                "approved": True,
            },
            "evidence": {
                "provider": "example-provider",
                "gpu_identity": "example-gpu",
                "elapsed_seconds": 120,
                "measured_cost_usd": 1.5,
            },
        }
        errors = validate_evidence_package(package)
        for name in ("approval_scope", "approved_by", "approved_at"):
            self.assertIn(f"approval_gate.{name} is required when approval is true", errors)

    def test_complete_package_cannot_leave_measurements_null(self):
        package = {
            **BASE,
            "run_status": "complete",
            "approval_gate": {
                **BASE["approval_gate"],
                "approval_requested": True,
                "approved": True,
            },
        }
        errors = validate_evidence_package(package)
        for name in ("provider", "gpu_identity", "elapsed_seconds", "measured_cost_usd"):
            self.assertIn(f"complete package must record evidence.{name}", errors)

    def test_complete_measurements_require_non_negative_numbers(self):
        for field, value in (
            ("elapsed_seconds", -1), ("measured_cost_usd", "1.50 USD"),
            ("elapsed_seconds", float("nan")), ("measured_cost_usd", float("nan")),
            ("elapsed_seconds", float("inf")), ("measured_cost_usd", float("-inf")),
            ("elapsed_seconds", True), ("measured_cost_usd", False),
        ):
            package = {
                **BASE,
                "run_status": "complete",
                "approval_gate": {
                    **BASE["approval_gate"],
                    "approval_requested": True,
                    "approved": True,
                    "approval_scope": "test",
                    "approved_by": "owner",
                    "approved_at": "2026-10-31T00:00:00Z",
                },
                "evidence": {
                    "provider": "example-provider",
                    "gpu_identity": "example-gpu",
                    "elapsed_seconds": 120,
                    "measured_cost_usd": 1.5,
                    field: value,
                },
            }
            errors = validate_evidence_package(package)
            self.assertIn(
                f"complete package evidence.{field} must be a non-negative number", errors
            )

    def test_complete_package_with_recorded_approval_is_valid(self):
        # Synthetic metadata fixture only; this does not authorize any paid run.
        package = {
            **BASE, "run_status": "complete",
            "approval_gate": {
                **BASE["approval_gate"], "approval_requested": True, "approved": True,
                "approval_scope": "test-only metadata", "approved_by": "test owner",
                "approved_at": "2026-10-31T00:00:00Z",
            },
            "evidence": {
                "provider": "example-provider", "gpu_identity": "example-gpu",
                "elapsed_seconds": 120, "measured_cost_usd": 1.5,
            },
        }
        self.assertEqual(validate_evidence_package(package), [])
        package["approval_gate"]["approval_requested"] = False
        self.assertIn(
            "approval cannot be true without an approval request",
            validate_evidence_package(package),
        )

    def _complete_package(self, cost):
        return {
            **BASE, "run_status": "complete",
            "approval_gate": {
                **BASE["approval_gate"], "approval_requested": True, "approved": True,
                "approval_scope": "test-only metadata", "approved_by": "test owner",
                "approved_at": "2026-10-31T00:00:00Z",
            },
            "evidence": {
                "provider": "example-provider", "gpu_identity": "example-gpu",
                "elapsed_seconds": 120, "measured_cost_usd": cost,
            },
        }

    def test_measured_cost_cannot_exceed_spending_ceiling(self):
        package = self._complete_package(26.0)  # ceiling is 25
        errors = validate_evidence_package(package)
        self.assertTrue(
            any("measured_cost_usd" in e and "spending_ceiling_usd" in e for e in errors),
            errors,
        )
        self.assertEqual(validate_evidence_package(self._complete_package(25.0)), [])

    def test_spending_ceiling_must_be_finite_positive_number(self):
        for bad in ("25", "abc", 0, -5, float("nan"), float("inf"), True, None):
            package = {
                **BASE,
                "cost_plan": {**BASE["cost_plan"], "spending_ceiling_usd": bad},
            }
            errors = validate_evidence_package(package)
            self.assertTrue(
                any("spending_ceiling_usd" in e and "number" in e for e in errors),
                (bad, errors),
            )

    def test_non_object_package_is_reported_not_raised(self):
        self.assertEqual(
            validate_evidence_package([]), ["evidence package must be an object"]
        )


    def test_unhashable_run_status_is_reported_not_raised(self):
        for bad in ([], {}):
            self.assertIn(
                "run_status must be prepared, blocked, or complete",
                validate_evidence_package({**BASE, "run_status": bad}),
            )

    def test_shipped_blocked_package_stays_valid(self):
        import json

        path = (
            PROJECT_ROOT
            / "curriculum/projects/docs/pretrain-cloud-evidence/evidence-package.json"
        )
        package = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(validate_evidence_package(package), [])


if __name__ == "__main__":
    unittest.main()
