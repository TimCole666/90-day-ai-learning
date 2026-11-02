"""Per-step training telemetry for LoRA runs.

Writes ``<work-dir>/telemetry.jsonl``: one JSON object per optimizer step with
``step``, ``train_loss``, ``lr``, ``elapsed_seconds`` and ``mode``. Each line is
flushed as it is written, so a detached run can be followed with
``tail -f <work-dir>/telemetry.jsonl``.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

TELEMETRY_FILENAME = "telemetry.jsonl"


class TelemetryLog:
    def __init__(self, work_dir: Path, *, mode: str, append: bool) -> None:
        self.path = Path(work_dir) / TELEMETRY_FILENAME
        self.mode = mode
        self._start = time.monotonic()
        # A new run starts a fresh log; a resumed run continues the old one.
        self._handle = self.path.open("a" if append else "w", encoding="utf-8")

    def log_step(self, *, step: int, train_loss: float, lr: float) -> None:
        if not math.isfinite(train_loss):
            raise ValueError(f"telemetry train_loss must be finite at step {step}")
        row = {
            "step": step,
            "train_loss": train_loss,
            "lr": lr,
            "elapsed_seconds": round(time.monotonic() - self._start, 3),
            "mode": self.mode,
        }
        self._handle.write(json.dumps(row) + "\n")
        self._handle.flush()

    def close(self) -> None:
        self._handle.close()

    def __enter__(self) -> "TelemetryLog":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
