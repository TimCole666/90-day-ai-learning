"""Command-line seam for the bounded agent learning project."""
from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

from .agent import DeterministicModelAdapter, evaluate, json_report, run_task
from .fixtures import create_fixture


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the offline bounded agent fixture")
    parser.add_argument("command", choices=("run", "evaluate"))
    parser.add_argument(
        "--fixture",
        choices=("summarize-notes",),
        default="summarize-notes",
        help="Offline fixture task to run.",
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    with tempfile.TemporaryDirectory(prefix="agent-learning-") as directory:
        workspace = Path(directory)
        create_fixture(workspace)
        result = run_task(args.fixture, workspace, DeterministicModelAdapter())
        payload = json_report(result, evaluate([result], workspace))
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(payload + "\n", encoding="utf-8")
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
