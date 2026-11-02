"""Per-step LoRA telemetry (Day 68): <work-dir>/telemetry.jsonl.

A detached training run must leave a log a learner can follow with
``tail -f``: one JSON line per optimizer step with step, train_loss and lr.
"""

import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

DATA = ROOT / "data" / "instruction_sample.jsonl"


def read_lines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


class TelemetryLogTests(unittest.TestCase):
    def test_each_step_is_visible_before_close(self):
        from projects.lora.telemetry import TelemetryLog

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "telemetry.jsonl"
            log = TelemetryLog(Path(tmp), mode="smoke", append=False)
            try:
                log.log_step(step=1, train_loss=2.5, lr=0.001)
                # Flushed per line, so `tail -f` sees it while training runs.
                rows = read_lines(path)
                self.assertEqual(len(rows), 1)
                self.assertEqual(rows[0]["step"], 1)
                self.assertEqual(rows[0]["train_loss"], 2.5)
                self.assertEqual(rows[0]["lr"], 0.001)
                self.assertEqual(rows[0]["mode"], "smoke")
                self.assertGreaterEqual(rows[0]["elapsed_seconds"], 0)
            finally:
                log.close()

    def test_new_run_truncates_and_resume_appends(self):
        from projects.lora.telemetry import TelemetryLog

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "telemetry.jsonl"
            path.write_text('{"step": 99}\n', encoding="utf-8")
            with TelemetryLog(Path(tmp), mode="smoke", append=False) as log:
                log.log_step(step=1, train_loss=1.0, lr=0.1)
            self.assertEqual([r["step"] for r in read_lines(path)], [1])
            with TelemetryLog(Path(tmp), mode="smoke", append=True) as log:
                log.log_step(step=2, train_loss=0.9, lr=0.1)
            self.assertEqual([r["step"] for r in read_lines(path)], [1, 2])

    def test_non_finite_loss_is_rejected(self):
        from projects.lora.telemetry import TelemetryLog

        with tempfile.TemporaryDirectory() as tmp, TelemetryLog(Path(tmp), mode="smoke", append=False) as log:
            with self.assertRaises(ValueError):
                log.log_step(step=1, train_loss=float("nan"), lr=0.1)


class SmokeTelemetryTests(unittest.TestCase):
    def _train(self, work_dir: Path, *extra: str) -> int:
        from projects.lora.train import main

        return main([
            "--smoke", "--data-path", str(DATA), "--work-dir", str(work_dir),
            "--max-iters", "3", "--batch-size", "2",
            "--learning-rate", "0.001", *extra,
        ])

    def test_smoke_run_logs_every_step_and_resume_continues_numbering(self):
        with tempfile.TemporaryDirectory() as tmp:
            work_dir = Path(tmp) / "run"
            self.assertEqual(self._train(work_dir), 0)
            telemetry = work_dir / "telemetry.jsonl"
            rows = read_lines(telemetry)
            artifact = json.loads((work_dir / "run_artifact.json").read_text(encoding="utf-8"))
            self.assertEqual([r["step"] for r in rows], [1, 2, 3])
            self.assertEqual([r["train_loss"] for r in rows], artifact["step_losses"])
            for row in rows:
                self.assertEqual(set(row), {"step", "train_loss", "lr", "elapsed_seconds", "mode"})
                self.assertTrue(math.isfinite(row["train_loss"]))
                self.assertEqual(row["lr"], 0.001)
                self.assertEqual(row["mode"], "smoke")

            self.assertEqual(self._train(work_dir, "--resume"), 0)
            self.assertEqual([r["step"] for r in read_lines(telemetry)], [1, 2, 3, 4, 5, 6])

    def test_rejected_resume_leaves_telemetry_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            work_dir = Path(tmp) / "run"
            self.assertEqual(self._train(work_dir), 0)
            telemetry = work_dir / "telemetry.jsonl"
            before = telemetry.read_bytes()
            self.assertEqual(self._train(work_dir, "--resume", "--seed", "7"), 2)
            self.assertEqual(telemetry.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
