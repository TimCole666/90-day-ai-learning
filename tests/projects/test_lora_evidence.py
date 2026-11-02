import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = PROJECT_ROOT / "projects" / "lora" / "evidence"
sys.path.insert(0, str(PROJECT_ROOT))


class TestLoRAComparisonEvidence(unittest.TestCase):
    def setUp(self):
        from projects.lora.evidence.validate_contract import validate_contract

        self.validate_contract = validate_contract
        self.contract = json.loads((EVIDENCE / "comparison_contract.json").read_text(encoding="utf-8"))

    def test_blocked_contract_is_complete_and_has_no_fabricated_measurements(self):
        self.assertEqual(self.validate_contract(self.contract), [])
        self.assertEqual(self.contract["status"], "blocked-awaiting-authorization")
        self.assertFalse(self.contract["authorization"]["approved"])
        measured = self.contract["measured"]
        self.assertTrue(all(value is None for key, value in measured.items() if key != "cloud_execution"))
        self.assertIsNone(measured["cloud_execution"])

    def test_evidence_import_does_not_require_torch(self):
        script = '''
import sys

class WithoutTorch:
    def find_spec(self, fullname, path=None, target=None):
        if fullname == "torch" or fullname.startswith("torch."):
            raise ModuleNotFoundError("torch deliberately unavailable")

sys.meta_path.insert(0, WithoutTorch())
from projects.lora.evidence.validate_contract import validate_contract
assert callable(validate_contract)
assert "torch" not in sys.modules
assert "projects.lora.model" not in sys.modules
print("evidence import requires no training dependency")
'''
        result = subprocess.run(
            [sys.executable, "-B", "-c", script],
            cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("requires no training dependency", result.stdout)

    def test_validator_cli_rejects_invalid_object_shapes_cleanly(self):
        cases = [("null", None), ("array", []), ("string", "contract"),
                 ("number", 0), ("boolean", True)]
        for field in ("authorization", "planned_run", "reproducibility", "measured"):
            payload = json.loads(json.dumps(self.contract))
            payload[field] = None
            cases.append((field, payload))
        payload = json.loads(json.dumps(self.contract))
        payload["reproducibility"]["split"] = []
        cases.append(("reproducibility.split", payload))

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "contract.json"
            for label, payload in cases:
                with self.subTest(shape=label):
                    original = json.dumps(payload)
                    path.write_text(original, encoding="utf-8")
                    result = subprocess.run(
                        [sys.executable, "-B", str(EVIDENCE / "validate_contract.py"), str(path)],
                        cwd=directory, capture_output=True, text=True, timeout=10,
                    )
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("INVALID CONTRACT", result.stdout)
                    self.assertIn("object", result.stdout)
                    self.assertNotIn("Traceback", result.stderr)
                    self.assertEqual(path.read_text(encoding="utf-8"), original)

    def test_paid_execution_requires_specific_authorization(self):
        errors = self.validate_contract(self.contract, require_authorized=True)
        self.assertTrue(any("authorization.approved" in error for error in errors))

    def _executed_contract(self):
        contract = json.loads(json.dumps(self.contract))
        contract["status"] = "executed"
        contract["authorization"].update(
            {"approved": True, "approver": "course-owner", "approval_reference": "ticket-21-approval"}
        )
        contract["measured"]["cloud_execution"] = True
        return contract

    def test_measured_values_must_not_exceed_planned_ceilings(self):
        contract = self._executed_contract()
        contract["measured"].update({
            "provider": "fake-provider",
            "cost_usd": 99.0,
            "runtime_seconds": 4000,
            "persistent_storage_gib": 9,
        })
        errors = self.validate_contract(contract)
        self.assertTrue(any("measured.cost_usd" in e and "cost_usd_ceiling" in e for e in errors), errors)
        self.assertTrue(any("measured.runtime_seconds" in e and "runtime_minutes_ceiling" in e for e in errors), errors)
        self.assertTrue(any("measured.persistent_storage_gib" in e and "storage_gib_ceiling" in e for e in errors), errors)

    def test_non_finite_or_bool_ceilings_are_rejected(self):
        for bad in (float("nan"), float("inf"), True):
            for field in ("runtime_minutes_ceiling", "storage_gib_ceiling", "cost_usd_ceiling"):
                with self.subTest(field=field, ceiling=bad):
                    contract = self._executed_contract()
                    contract["planned_run"][field] = bad
                    contract["measured"].update({"provider": "fake-provider", "cost_usd": 999.0})
                    errors = self.validate_contract(contract)
                    self.assertTrue(any(f"planned_run.{field}" in e and "finite positive" in e for e in errors), errors)

    def test_shipped_contract_ceilings_stay_valid(self):
        errors = self.validate_contract(json.loads(json.dumps(self.contract)), require_authorized=False)
        self.assertFalse(any("ceiling" in e for e in errors), errors)

    def test_measured_values_at_or_below_ceiling_pass(self):
        contract = self._executed_contract()
        contract["measured"].update({
            "provider": "fake-provider",
            "cost_usd": 5.0,
            "runtime_seconds": 1800,
            "persistent_storage_gib": 8,
        })
        errors = self.validate_contract(contract)
        self.assertFalse(any("exceeds" in e for e in errors), errors)

    def test_validator_cli_is_deterministic_and_never_claims_cloud_run(self):
        command = [sys.executable, str(EVIDENCE / "validate_contract.py"), str(EVIDENCE / "comparison_contract.json")]
        first = subprocess.run(command, capture_output=True, text=True, check=False)
        second = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(first.returncode, 0)
        self.assertEqual(first.stdout, second.stdout)
        self.assertIn("no cloud job launched", first.stdout)

    def test_four_language_reports_and_no_lesson_changes(self):
        for language in ("en", "ja", "zh-Hans", "zh-Hant"):
            report = EVIDENCE / f"report.{language}.md"
            self.assertTrue(report.exists())
            text = report.read_text(encoding="utf-8")
            self.assertIn("null", text)
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
