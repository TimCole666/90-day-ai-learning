"""Validation for the sanitized cloud-pretraining evidence contract.

This module validates metadata only. It never starts a provider, contacts a billing
API, or turns a local smoke run into cloud evidence.
"""

from __future__ import annotations

import math
from typing import Any

REQUIRED_TOP_LEVEL = {
    "schema_version",
    "run_status",
    "approval_gate",
    "assumptions",
    "cost_plan",
    "versioned_inputs",
    "commands",
    "evidence",
    "limitations",
}


def validate_evidence_package(package: dict[str, Any]) -> list[str]:
    """Return contract violations; an empty list means the package is well formed."""
    if not isinstance(package, dict):
        return ["evidence package must be an object"]
    errors: list[str] = []
    missing = REQUIRED_TOP_LEVEL - package.keys()
    errors.extend(f"missing top-level field: {name}" for name in sorted(missing))

    gate = package.get("approval_gate")
    if not isinstance(gate, dict):
        errors.append("approval_gate must be an object")
    else:
        for name in (
            "required_before_paid_execution",
            "approval_requested",
            "approved",
        ):
            if not isinstance(gate.get(name), bool):
                errors.append(f"approval_gate.{name} must be boolean")
        if gate.get("required_before_paid_execution") is not True:
            errors.append("approval_gate.required_before_paid_execution must be true")
        if gate.get("approved") is True and gate.get("approval_requested") is not True:
            errors.append("approval cannot be true without an approval request")
        if gate.get("approved") is True:
            for name in ("approval_scope", "approved_by", "approved_at"):
                if not isinstance(gate.get(name), str) or not gate[name].strip():
                    errors.append(f"approval_gate.{name} is required when approval is true")

    status = package.get("run_status")
    if not isinstance(status, str) or status not in {"prepared", "blocked", "complete"}:
        errors.append("run_status must be prepared, blocked, or complete")
    # A complete package records a paid run, which the gate says needs approval.
    if status == "complete" and (
        not isinstance(gate, dict) or gate.get("approved") is not True
    ):
        errors.append("complete package requires approval_gate.approved")

    evidence = package.get("evidence")
    if not isinstance(evidence, dict):
        errors.append("evidence must be an object")
    else:
        for name in (
            "provider",
            "gpu_identity",
            "elapsed_seconds",
            "measured_cost_usd",
        ):
            if name not in evidence:
                errors.append(
                    f"evidence.{name} is required (use null when unavailable)"
                )
        if status != "complete" and evidence.get("measured_cost_usd") is not None:
            errors.append("non-complete package cannot report measured cloud spending")
        if status == "complete":
            for name in (
                "provider",
                "gpu_identity",
                "elapsed_seconds",
                "measured_cost_usd",
            ):
                if name in evidence and evidence[name] is None:
                    errors.append(f"complete package must record evidence.{name}")
            for name in ("elapsed_seconds", "measured_cost_usd"):
                value = evidence.get(name)
                if (
                    value is not None
                    and (
                        isinstance(value, bool)
                        or not isinstance(value, (int, float))
                        or (isinstance(value, float) and not math.isfinite(value))
                        or value < 0
                    )
                ):
                    errors.append(f"complete package evidence.{name} must be a non-negative number")

    cost = package.get("cost_plan")
    if not isinstance(cost, dict):
        errors.append("cost_plan must be an object")
    else:
        ceiling = cost.get("spending_ceiling_usd")
        if (
            not isinstance(ceiling, (int, float))
            or isinstance(ceiling, bool)
            or not math.isfinite(ceiling)
            or ceiling <= 0
        ):
            errors.append("cost_plan.spending_ceiling_usd must be a finite positive number")
        for name in (
            "stop_behavior",
            "storage_charge_follow_up",
        ):
            if not cost.get(name):
                errors.append(f"cost_plan.{name} is required")
        measured_cost = evidence.get("measured_cost_usd") if isinstance(evidence, dict) else None
        if (
            isinstance(measured_cost, (int, float))
            and not isinstance(measured_cost, bool)
            and isinstance(ceiling, (int, float))
            and not isinstance(ceiling, bool)
            and math.isfinite(ceiling)
            and measured_cost > ceiling
        ):
            errors.append(
                f"evidence.measured_cost_usd {measured_cost} exceeds "
                f"cost_plan.spending_ceiling_usd {ceiling}"
            )

    inputs = package.get("versioned_inputs")
    if (
        not isinstance(inputs, dict)
        or not inputs.get("data_sha256")
        or not inputs.get("config_sha256")
    ):
        errors.append("versioned_inputs must include data_sha256 and config_sha256")

    return errors


def assert_valid_evidence_package(package: dict[str, Any]) -> None:
    errors = validate_evidence_package(package)
    if errors:
        raise ValueError("invalid cloud evidence package: " + "; ".join(errors))
