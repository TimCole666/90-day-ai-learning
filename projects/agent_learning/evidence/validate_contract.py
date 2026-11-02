#!/usr/bin/env python3
"""Deterministically validate the sanitized Ticket 23 live-eval contract.

This validator checks evidence shape and safety gates; it never calls a model
provider, downloads weights, or mutates anything outside the repository. A
blocked contract is valid evidence when it explicitly records why execution did
not happen. Use ``--require-authorized`` only in a separately approved
execution workflow.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

REQUIRED_TOP_LEVEL = {
    "contract_version", "status", "authorization", "model_selection",
    "deterministic_baseline", "task_set", "evaluation_configuration",
    "metrics", "limits", "live_results", "separation", "limitations",
}
LIVE_RUN_FIELDS = {
    "provider", "model_id", "model_revision", "adapter_version",
    "git_revision", "started_at_utc", "elapsed_seconds",
    "total_input_tokens", "total_output_tokens", "cost_usd",
}
LIVE_TASK_FIELDS = {
    "status", "steps", "retries", "termination", "report_matches_expected",
    "tool_error_sequence", "input_tokens", "output_tokens", "wall_seconds",
}
REQUIRED_TASK_CATEGORIES = {
    "success", "malformed_tool_request", "missing_resource_failure",
    "budget_exhaustion", "termination_behavior",
}
ALLOWED_TASK_CATEGORIES = REQUIRED_TASK_CATEGORIES | {"unknown_tool_request"}
REGISTERED_TOOLS = {"list_notes", "read_note", "write_report"}


def _validate_authorization(contract: dict[str, Any], require_authorized: bool, errors: list[str]) -> None:
    authorization = contract.get("authorization", {})
    if authorization.get("required_before_paid_execution") is not True:
        errors.append("authorization.required_before_paid_execution must be true")
    approved = authorization.get("approved") is True
    if require_authorized and not approved:
        errors.append("live execution is blocked until authorization.approved is true")
    if approved:
        for field in ("approver", "approval_reference", "approved_at_utc"):
            if not authorization.get(field):
                errors.append(f"approved contract requires authorization.{field}")
    if contract.get("status") == "blocked-awaiting-authorization" and approved:
        errors.append("blocked status cannot claim approval")


def _validate_baseline(contract: dict[str, Any], errors: list[str]) -> None:
    baseline = contract.get("deterministic_baseline", {})
    if baseline.get("model_adapter") != "deterministic-v1":
        errors.append("deterministic_baseline.model_adapter must be deterministic-v1")
    if baseline.get("fixture") != "summarize-notes":
        errors.append("deterministic_baseline.fixture must be summarize-notes")
    if baseline.get("is_live_model_evidence") is not False:
        errors.append("deterministic_baseline.is_live_model_evidence must be false")
    digest = baseline.get("expected_report_sha256")
    if not isinstance(digest, str) or len(digest) != 64:
        errors.append("deterministic_baseline.expected_report_sha256 must be a sha256 hex digest")
    for field in ("baseline_command", "baseline_test_command", "comparison_rule"):
        if not baseline.get(field):
            errors.append(f"deterministic_baseline.{field} is required")


def _validate_task_set(contract: dict[str, Any], errors: list[str]) -> set[str]:
    task_set = contract.get("task_set")
    if not isinstance(task_set, list) or not task_set:
        errors.append("task_set must be a non-empty list")
        return set()
    ids: set[str] = set()
    categories: set[str] = set()
    for index, task in enumerate(task_set):
        if not isinstance(task, dict):
            errors.append(f"task_set[{index}] must be an object")
            continue
        task_id = task.get("task_id")
        if not task_id:
            errors.append(f"task_set[{index}].task_id is required")
        elif task_id in ids:
            errors.append(f"task_set[{index}].task_id is duplicated: {task_id}")
        else:
            ids.add(task_id)
        category = task.get("category")
        if category not in ALLOWED_TASK_CATEGORIES:
            errors.append(f"task_set[{index}].category must be one of {sorted(ALLOWED_TASK_CATEGORIES)}")
        else:
            categories.add(category)
        if not isinstance(task.get("expectations"), dict) or not task["expectations"]:
            errors.append(f"task_set[{index}].expectations must be a non-empty object")
    missing = REQUIRED_TASK_CATEGORIES - categories
    if missing:
        errors.append(f"task_set is missing required categories: {sorted(missing)}")
    return ids


def _validate_configuration(contract: dict[str, Any], errors: list[str]) -> None:
    config = contract.get("evaluation_configuration", {})
    for field in ("max_steps", "max_retries"):
        value = config.get(field)
        if not isinstance(value, int) or value < 0 or (field == "max_steps" and value == 0):
            errors.append(f"evaluation_configuration.{field} must be a non-negative integer (positive for max_steps)")
    tools = config.get("allowed_tools")
    if not isinstance(tools, list) or not tools or set(tools) - REGISTERED_TOOLS:
        errors.append("evaluation_configuration.allowed_tools must be a non-empty subset of registered tools")
    if not config.get("harness") or not config.get("prompt_scaffold_version"):
        errors.append("evaluation_configuration requires harness and prompt_scaffold_version")


def _validate_limits(contract: dict[str, Any], errors: list[str]) -> None:
    limits = contract.get("limits", {})
    for field in ("cost_usd_ceiling", "runtime_seconds_ceiling", "steps_per_task_ceiling",
                  "retries_per_task_ceiling", "total_model_calls_ceiling"):
        value = limits.get(field)
        if not _finite_number(value) or value <= 0:
            errors.append(f"limits.{field} must be a finite positive number")
    if not limits.get("stop_conditions"):
        errors.append("limits.stop_conditions must not be empty")


def _validate_metrics_and_live(contract: dict[str, Any], task_ids: set[str], errors: list[str]) -> None:
    metrics = contract.get("metrics", {})
    if not isinstance(metrics, dict) or not metrics:
        errors.append("metrics must be a non-empty object")
    else:
        for name, metric in metrics.items():
            if not isinstance(metric, dict) or not metric.get("definition"):
                errors.append(f"metrics.{name} requires a definition")
            if isinstance(metric, dict) and "live_value" not in metric:
                errors.append(f"metrics.{name}.live_value is required (use null when unavailable)")
    live = contract.get("live_results", {})
    if live.get("evidence_kind") != "live-model-run":
        errors.append("live_results.evidence_kind must be live-model-run")
    approved = contract.get("authorization", {}).get("approved") is True
    if not approved:
        non_null = [key for key in LIVE_RUN_FIELDS if live.get(key) is not None]
        if non_null:
            errors.append(f"unavailable live_results fields must be null: {sorted(non_null)}")
        for name, metric in metrics.items() if isinstance(metrics, dict) else []:
            if isinstance(metric, dict) and metric.get("live_value") is not None:
                errors.append(f"metrics.{name}.live_value must be null before authorized execution")
    tasks = live.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        errors.append("live_results.tasks must be a non-empty list")
    else:
        seen: set[str] = set()
        for index, entry in enumerate(tasks):
            if not isinstance(entry, dict):
                errors.append(f"live_results.tasks[{index}] must be an object")
                continue
            task_id = entry.get("task_id")
            if task_id not in task_ids:
                errors.append(f"live_results.tasks[{index}].task_id must match a task_set task_id")
            else:
                seen.add(task_id)
            if not approved:
                non_null_task = [key for key in LIVE_TASK_FIELDS if entry.get(key) is not None]
                if non_null_task:
                    errors.append(
                        f"live_results.tasks[{index}] fields must be null before authorization: {sorted(non_null_task)}"
                    )
        missing_entries = task_ids - seen
        if missing_entries:
            errors.append(f"live_results.tasks is missing entries for: {sorted(missing_entries)}")


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _validate_measured_vs_limits(contract: dict[str, Any], errors: list[str]) -> None:
    limits = contract.get("limits", {})
    live = contract.get("live_results", {})

    def check(value: Any, ceiling: Any, label: str, limit_label: str) -> None:
        if value is None:
            return
        if not _finite_number(value):
            errors.append(f"{label} must be a finite number when recorded")
            return
        if _finite_number(ceiling) and value > ceiling:
            errors.append(f"{label} {value} exceeds limits.{limit_label} {ceiling}")

    check(live.get("cost_usd"), limits.get("cost_usd_ceiling"), "live_results.cost_usd", "cost_usd_ceiling")
    check(live.get("elapsed_seconds"), limits.get("runtime_seconds_ceiling"), "live_results.elapsed_seconds", "runtime_seconds_ceiling")
    tasks = live.get("tasks")
    if isinstance(tasks, list):
        for index, entry in enumerate(tasks):
            if not isinstance(entry, dict):
                continue
            check(entry.get("steps"), limits.get("steps_per_task_ceiling"),
                  f"live_results.tasks[{index}].steps", "steps_per_task_ceiling")
            check(entry.get("retries"), limits.get("retries_per_task_ceiling"),
                  f"live_results.tasks[{index}].retries", "retries_per_task_ceiling")


def _validate_separation(contract: dict[str, Any], errors: list[str]) -> None:
    separation = contract.get("separation", {})
    kinds = [separation.get("simulated_evidence_kind"), separation.get("live_evidence_kind")]
    if not all(isinstance(kind, str) and kind for kind in kinds) or kinds[0] == kinds[1]:
        errors.append("separation must declare distinct simulated_evidence_kind and live_evidence_kind")
    if separation.get("simulated_results_are_live_evidence") is not False:
        errors.append("separation.simulated_results_are_live_evidence must be false")
    if not separation.get("rule"):
        errors.append("separation.rule is required")


OBJECT_FIELDS = (
    "authorization", "deterministic_baseline", "evaluation_configuration",
    "limits", "live_results", "separation",
)


def validate_contract(contract: dict[str, Any], *, require_authorized: bool = False) -> list[str]:
    if not isinstance(contract, dict):
        return ["contract must be a JSON object"]
    errors: list[str] = []
    missing = REQUIRED_TOP_LEVEL - contract.keys()
    if missing:
        errors.append(f"missing top-level fields: {sorted(missing)}")
    shape_errors = [f"{field} must be a JSON object" for field in OBJECT_FIELDS
                    if not isinstance(contract.get(field, {}), dict)]
    if shape_errors:
        return errors + shape_errors
    _validate_authorization(contract, require_authorized, errors)
    _validate_baseline(contract, errors)
    task_ids = _validate_task_set(contract, errors)
    _validate_configuration(contract, errors)
    _validate_limits(contract, errors)
    _validate_metrics_and_live(contract, task_ids, errors)
    _validate_measured_vs_limits(contract, errors)
    _validate_separation(contract, errors)
    if not isinstance(contract.get("limitations"), list) or not contract["limitations"]:
        errors.append("limitations must be a non-empty list")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract", nargs="?", default=str(Path(__file__).with_name("live_eval_contract.json")))
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
    print(f"VALID CONTRACT: status={contract['status']}; no live model call launched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
