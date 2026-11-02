"""Public execution and scoring seam for the bounded agent project.

The adapter is a deterministic stand-in for a model. It emits no hidden reasoning;
only the requested action and the tool's structured observation are retained.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .fixtures import expected_report

MODEL_ADAPTER_VERSION = "deterministic-v1"
ALLOWED_TOOLS = frozenset({"list_notes", "read_note", "write_report"})


@dataclass(frozen=True)
class AgentConfig:
    max_steps: int = 6
    max_retries: int = 2

    def __post_init__(self) -> None:
        if type(self.max_steps) is not int or self.max_steps <= 0:
            raise ValueError("max_steps must be a positive integer")
        if type(self.max_retries) is not int or self.max_retries < 0:
            raise ValueError("max_retries must be a non-negative integer")


@dataclass(frozen=True)
class RunResult:
    task_id: str
    status: str
    answer: str | None
    trace: tuple[Mapping[str, Any], ...]
    steps: int
    retries: int
    termination: str

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["trace"] = list(self.trace)
        return value


class DeterministicModelAdapter:
    """A fixed policy with injectable, documented failure modes for teaching."""

    def __init__(self, fault: str | None = None) -> None:
        allowed = {None, "invalid_arguments", "missing_note", "loop"}
        if fault not in allowed:
            raise ValueError(f"fault must be one of {sorted(str(item) for item in allowed)}")
        self.fault = fault
        self._invalid_emitted = False

    def next_action(self, history: list[Mapping[str, Any]]) -> dict[str, Any]:
        if self.fault == "loop":
            return {"name": "list_notes", "arguments": {}}
        if self.fault == "invalid_arguments" and not self._invalid_emitted:
            self._invalid_emitted = True
            return {"name": "read_note", "arguments": {"filename": "../outside.txt"}}
        if self.fault == "missing_note":
            return {"name": "read_note", "arguments": {"filename": "missing.txt"}}
        names = [event["observation"].get("files", []) for event in history
                 if event["observation"].get("ok") and event["action"].get("name") == "list_notes"]
        if not names:
            return {"name": "list_notes", "arguments": {}}
        read_names = {event["action"].get("arguments", {}).get("filename") for event in history
                      if event["action"].get("name") == "read_note"
                      and event["observation"].get("ok")}
        for filename in ("alpha.txt", "beta.txt"):
            if filename not in read_names:
                return {"name": "read_note", "arguments": {"filename": filename}}
        return {"name": "write_report", "arguments": {"content": expected_report()}}


def _tool_call(action: Mapping[str, Any], workspace: Path) -> dict[str, Any]:
    name = action.get("name")
    args = action.get("arguments")
    if name not in ALLOWED_TOOLS:
        return {"ok": False, "error": "unknown_tool"}
    if not isinstance(args, Mapping):
        return {"ok": False, "error": "invalid_arguments"}
    if name == "list_notes":
        if args:
            return {"ok": False, "error": "invalid_arguments"}
        notes = workspace / "notes"
        if not notes.resolve().is_relative_to(workspace):
            return {"ok": False, "error": "not_found"}
        return {"ok": True, "files": sorted(path.name for path in notes.glob("*.txt"))}
    if name == "read_note":
        filename = args.get("filename")
        if not isinstance(filename, str) or not filename or "\x00" in filename or Path(filename).name != filename:
            return {"ok": False, "error": "invalid_arguments"}
        note = workspace / "notes" / filename
        if not note.resolve().is_relative_to(workspace) or not note.is_file():
            return {"ok": False, "error": "not_found"}
        try:
            content = note.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            return {"ok": False, "error": "read_error"}
        return {"ok": True, "filename": filename, "content": content}
    if set(args) != {"content"} or not isinstance(args.get("content"), str):
        return {"ok": False, "error": "invalid_arguments"}
    content = args["content"]
    if len(content) > 4096:
        return {"ok": False, "error": "size_limit"}
    report = workspace / "report.txt"
    if not report.resolve().is_relative_to(workspace):
        return {"ok": False, "error": "invalid_arguments"}
    report.write_text(content, encoding="utf-8")
    return {"ok": True, "path": "report.txt"}


def run_task(task_id: str, workspace: Path, adapter: DeterministicModelAdapter,
             config: AgentConfig | None = None) -> RunResult:
    if task_id != "summarize-notes":
        raise ValueError("unknown task")
    config = config or AgentConfig()
    workspace = workspace.resolve()
    trace: list[Mapping[str, Any]] = []
    retries = 0
    for _ in range(config.max_steps):
        action = adapter.next_action(trace)
        observation = _tool_call(action, workspace)
        trace.append({"action": action, "observation": observation})
        if observation.get("ok") and action.get("name") == "write_report":
            return RunResult(task_id, "completed", "Report written: report.txt", tuple(trace),
                             len(trace), retries, "goal_reached")
        if not observation.get("ok"):
            retries += 1
            if retries > config.max_retries:
                return RunResult(task_id, "failed", None, tuple(trace), len(trace), retries,
                                 "tool_failure")
    return RunResult(task_id, "budget_exhausted", None, tuple(trace), len(trace), retries,
                     "step_budget")


def evaluate(results: list[RunResult], workspace: Path) -> dict[str, Any]:
    """Score observable artifacts independently of the adapter's self-report."""
    scores = []
    for result in results:
        report_ok = (result.status == "completed" and result.answer == "Report written: report.txt"
                     and (workspace / "report.txt").is_file()
                     and (workspace / "report.txt").read_text(encoding="utf-8") == expected_report())
        names = [event.get("action", {}).get("name") for event in result.trace]
        tools_ok = bool(names) and all(name in ALLOWED_TOOLS for name in names)
        budget_ok = result.steps <= 6 and result.status != "budget_exhausted"
        errors = [event.get("observation", {}).get("error") for event in result.trace
                  if not event.get("observation", {}).get("ok")]
        failure_ok = all(error in {"invalid_arguments", "not_found", "unknown_tool", "size_limit"}
                         for error in errors) and (not errors or result.termination in {"goal_reached", "tool_failure"})
        scores.append({"task_id": result.task_id, "outcome_passed": report_ok,
                       "tool_behavior_passed": tools_ok, "budget_passed": budget_ok,
                       "failure_handling_passed": failure_ok})
    metrics = {key: sum(score[key] for score in scores) for key in
               ("outcome_passed", "tool_behavior_passed", "budget_passed", "failure_handling_passed")}
    metrics["tasks"] = len(scores)
    return {"scores": scores, "metrics": metrics}


def json_report(result: RunResult, report: dict[str, Any]) -> str:
    return json.dumps({"result": result.to_dict(), "report": report,
                       "evidence": {"model_adapter": MODEL_ADAPTER_VERSION,
                                     "network": "disabled", "trace_policy": "actions and observations only"}},
                      ensure_ascii=False, sort_keys=True, indent=2)
