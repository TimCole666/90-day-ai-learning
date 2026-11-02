#!/usr/bin/env python3
"""Deterministically validate the sanitized Ticket 21 comparison contract.

This validator checks evidence shape and safety gates; it never launches a
provider job. A blocked contract is valid evidence when it explicitly records
why execution did not happen. Use ``--require-authorized`` only in a separately
approved execution workflow.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

REQUIRED_TOP_LEVEL = {
    "contract_version", "status", "authorization", "rights", "planned_run",
    "reproducibility", "evaluation", "invariants", "recovery", "measured",
    "limitations",
}
MEASURED_FIELDS = {
    "provider", "gpu_name", "gpu_memory_gib", "runtime_seconds",
    "peak_gpu_memory_gib", "persistent_storage_gib", "cost_usd", "cloud_execution",
}


def validate_contract(contract: dict[str, Any], *, require_authorized: bool = False) -> list[str]:
    errors: list[str] = []
    if not isinstance(contract, dict):
        return ["contract must be a JSON object"]
    missing = REQUIRED_TOP_LEVEL - contract.keys()
    if missing:
        errors.append(f"missing top-level fields: {sorted(missing)}")

    shape_errors = []
    for field in ("authorization", "planned_run", "reproducibility", "measured"):
        if not isinstance(contract.get(field, {}), dict):
            shape_errors.append(f"{field} must be a JSON object")
    repro = contract.get("reproducibility", {})
    if isinstance(repro, dict) and not isinstance(repro.get("split", {}), dict):
        shape_errors.append("reproducibility.split must be a JSON object")
    if shape_errors:
        return errors + shape_errors

    authorization = contract.get("authorization", {})
    if authorization.get("required_before_paid_execution") is not True:
        errors.append("authorization.required_before_paid_execution must be true")
    approved = authorization.get("approved") is True
    if require_authorized and not approved:
        errors.append("paid execution is blocked until authorization.approved is true")
    if approved and not authorization.get("approver"):
        errors.append("approved contract requires authorization.approver")
    if approved and not authorization.get("approval_reference"):
        errors.append("approved contract requires authorization.approval_reference")

    planned = contract.get("planned_run", {})
    for field in ("runtime_minutes_ceiling", "storage_gib_ceiling", "cost_usd_ceiling"):
        value = planned.get(field)
        if (
            not isinstance(value, (int, float))
            or isinstance(value, bool)
            or not math.isfinite(value)
            or value <= 0
        ):
            errors.append(f"planned_run.{field} must be a finite positive number")
    if not planned.get("stop_conditions"):
        errors.append("planned_run.stop_conditions must not be empty")

    repro = contract.get("reproducibility", {})
    split = repro.get("split", {})
    if repro.get("seed") != 42 or split.get("seed") != 42:
        errors.append("reproducibility and split seeds must both be 42")
    if not split.get("test_must_be_disjoint"):
        errors.append("the held-out test split must be declared disjoint")
    for key in ("model_revision", "data_hash"):
        if key not in repro:
            errors.append(f"reproducibility.{key} is required")

    measured = contract.get("measured", {})
    unknown = set(measured) - MEASURED_FIELDS
    if unknown:
        errors.append(f"unknown measured fields: {sorted(unknown)}")
    if measured.get("cloud_execution") is not True:
        non_null = [key for key in MEASURED_FIELDS if key != "cloud_execution" and measured.get(key) is not None]
        if non_null:
            errors.append(f"unavailable measured fields must be null: {sorted(non_null)}")
    # Recorded measurements must stay inside the declared planned_run ceilings;
    # the runtime ceiling is declared in minutes while measured.runtime_seconds
    # is in seconds. Ceiling-less measured fields are not compared.
    for measured_field, ceiling_field, factor in (
        ("cost_usd", "cost_usd_ceiling", 1.0),
        ("runtime_seconds", "runtime_minutes_ceiling", 60.0),
        ("persistent_storage_gib", "storage_gib_ceiling", 1.0),
    ):
        value = measured.get(measured_field)
        if value is None:
            continue
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            errors.append(f"measured.{measured_field} must be a finite number when recorded")
            continue
        ceiling = planned.get(ceiling_field)
        if isinstance(ceiling, (int, float)) and not isinstance(ceiling, bool) and value > ceiling * factor:
            errors.append(f"measured.{measured_field} {value} exceeds planned_run.{ceiling_field} {ceiling}")

    if contract.get("status") == "blocked-awaiting-authorization" and approved:
        errors.append("blocked status cannot claim approval")
    if not isinstance(contract.get("limitations"), list) or not contract["limitations"]:
        errors.append("limitations must be a non-empty list")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract", nargs="?", default=str(Path(__file__).with_name("comparison_contract.json")))
    parser.add_argument("--require-authorized", action="store_true")
    args = parser.parse_args(argv)
    try:
        contract = json.loads(Path(args.contract).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"INVALID: {exc}")
        return 2
    errors = validate_contract(contract, require_authorized=args.require_authorized)
    if errors:
        print("INVALID CONTRACT")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"VALID CONTRACT: status={contract['status']}; no cloud job launched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
