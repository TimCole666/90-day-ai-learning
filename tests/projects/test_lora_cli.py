#!/usr/bin/env python3
"""
tests/projects/test_lora_cli.py
===============================
Process-isolated CLI tests for the LoRA fine-tuning and evaluation suite.
Executes projects/lora/train.py and projects/lora/evaluate.py from an unrelated
working directory in isolated subprocesses using temporary input files.
"""

import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def setUpModule():
    try:
        import torch
    except ImportError:
        raise unittest.SkipTest("PyTorch is not installed in the current environment; use .venv/bin/python.")


class TestLoRAPublicCLI(unittest.TestCase):
    """Process-isolated CLI test suite executing from an unrelated directory."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.unrelated_cwd = Path(self.temp_dir.name) / "unrelated_dir"
        self.unrelated_cwd.mkdir(parents=True)
        self.work_dir = Path(self.temp_dir.name) / "lora_run"
        self.work_dir.mkdir(parents=True)

        # Sample instruction corpus
        self.data_file = Path(self.temp_dir.name) / "instructions.jsonl"
        samples = [
            {"instruction": "What is 2+2?", "response": " 4"},
            {"instruction": "What is the capital of France?", "response": " Paris"},
            {"instruction": "Repeat after me: hello", "response": " hello"},
            {"instruction": "Complete the sequence: 1, 2, 3", "response": " 4"},
            {"instruction": "Echo: alpha", "response": " alpha"},
            {"instruction": "Echo: beta", "response": " beta"},
            {"instruction": "What comes after Monday?", "response": " Tuesday"},
            {"instruction": "Echo: gamma", "response": " gamma"},
            {"instruction": "Echo: delta", "response": " delta"},
            {"instruction": "What is 3+3?", "response": " 6"},
        ]
        with open(self.data_file, "w", encoding="utf-8") as f:
            for s in samples:
                f.write(json.dumps(s) + "\n")

        self.train_script = PROJECT_ROOT / "projects" / "lora" / "train.py"
        self.eval_script = PROJECT_ROOT / "projects" / "lora" / "evaluate.py"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_train_cli_smoke_from_unrelated_directory(self):
        """Invoke train.py from unrelated directory and assert produced artifacts and parameter ledger."""
        cmd = [
            sys.executable,
            str(self.train_script),
            "--smoke",
            "--data-path",
            str(self.data_file),
            "--work-dir",
            str(self.work_dir),
            "--r",
            "4",
            "--lora-alpha",
            "8.0",
            "--max-iters",
            "4",
            "--device",
            "cpu",
        ]
        res = subprocess.run(
            cmd,
            cwd=str(self.unrelated_cwd),
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            res.returncode,
            0,
            f"train.py failed with stderr:\n{res.stderr}\nstdout:\n{res.stdout}",
        )

        # Check adapter files
        adapter_cfg_file = self.work_dir / "adapter_config.json"
        adapter_weights_file = self.work_dir / "adapter_model.pt"
        artifact_file = self.work_dir / "run_artifact.json"

        self.assertTrue(adapter_cfg_file.exists(), "adapter_config.json not found")
        self.assertTrue(adapter_weights_file.exists(), "adapter_model.pt not found")
        self.assertTrue(artifact_file.exists(), "run_artifact.json not found")

        with open(artifact_file, "r", encoding="utf-8") as f:
            meta = json.load(f)

        self.assertEqual(meta["r"], 4)
        self.assertEqual(meta["lora_alpha"], 8.0)
        self.assertIn("parameter_ledger", meta)
        self.assertIn("train_loss_before", meta)
        self.assertIn("train_loss_after", meta)
        self.assertIn("truthful_scope_disclaimer", meta)
        self.assertTrue(meta["parameter_ledger"]["trainable_percentage"] < 50.0)

    def test_evaluate_cli_held_out_from_unrelated_directory(self):
        """Invoke evaluate.py on trained adapter and verify before/after metrics and text generation."""
        # Train first
        train_cmd = [
            sys.executable,
            str(self.train_script),
            "--smoke",
            "--data-path",
            str(self.data_file),
            "--work-dir",
            str(self.work_dir),
            "--max-iters",
            "3",
            "--device",
            "cpu",
        ]
        train_res = subprocess.run(train_cmd, cwd=str(self.unrelated_cwd), capture_output=True, text=True)
        self.assertEqual(train_res.returncode, 0, f"Setup training failed: {train_res.stderr}")

        eval_out = self.work_dir / "eval_results.json"
        eval_cmd = [
            sys.executable,
            str(self.eval_script),
            "--adapter-dir",
            str(self.work_dir),
            "--data-path",
            str(self.data_file),
            "--prompt",
            "What is 2+2?",
            "--max-new-tokens",
            "10",
            "--device",
            "cpu",
            "--output-json",
            str(eval_out),
        ]
        eval_res = subprocess.run(eval_cmd, cwd=str(self.unrelated_cwd), capture_output=True, text=True)
        self.assertEqual(
            eval_res.returncode,
            0,
            f"evaluate.py failed with stderr:\n{eval_res.stderr}\nstdout:\n{eval_res.stdout}",
        )

        self.assertTrue(eval_out.exists(), "eval_results.json not produced")
        with open(eval_out, "r", encoding="utf-8") as f:
            eval_data = json.load(f)

        self.assertIn("loss_before", eval_data)
        self.assertIn("loss_after", eval_data)
        self.assertIn("perplexity_before", eval_data)
        self.assertIn("perplexity_after", eval_data)
        self.assertIn("sample_generations", eval_data)
        self.assertTrue(eval_data.get("merge_verified", False))

    def test_smoke_cli_rejects_fully_masked_record_before_writes(self):
        result = subprocess.run(
            [sys.executable, str(self.train_script), "--smoke",
             "--data-path", str(self.data_file), "--work-dir", str(self.work_dir),
             "--max-length", "32", "--max-iters", "1"],
            cwd=str(self.unrelated_cwd), capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("no response tokens after max_length=32; increase --max-length", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(list(self.work_dir.iterdir()), [])

    def test_smoke_resume_rejection_preserves_existing_artifacts(self):
        """A rejected resume must not replace the completed run's base inputs or adapter files."""
        train_cmd = [
            sys.executable,
            str(self.train_script),
            "--smoke",
            "--data-path",
            str(self.data_file),
            "--work-dir",
            str(self.work_dir),
            "--max-iters",
            "1",
            "--device",
            "cpu",
        ]
        first = subprocess.run(train_cmd, cwd=str(self.unrelated_cwd), capture_output=True, text=True)
        self.assertEqual(first.returncode, 0, first.stderr)
        tracked = {
            name: (self.work_dir / name).read_bytes()
            for name in ("tokenizer.json", "base_model.pt", "adapter_config.json", "adapter_model.pt", "run_artifact.json")
        }

        with self.data_file.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"instruction": "new", "response": " record"}) + "\n")
        resume = subprocess.run(
            train_cmd + ["--resume"], cwd=str(self.unrelated_cwd), capture_output=True, text=True
        )
        self.assertEqual(resume.returncode, 2)
        self.assertIn("resume configuration does not match", resume.stderr)
        for name, content in tracked.items():
            self.assertEqual((self.work_dir / name).read_bytes(), content, name)

    def test_smoke_resume_adapter_mismatches_preserve_completed_run(self):
        command = [
            sys.executable, str(self.train_script), "--smoke",
            "--data-path", str(self.data_file),
            "--max-iters", "1", "--max-length", "64",
            "--device", "cpu", "--r", "2", "--lora-alpha", "4",
            "--lora-dropout", "0", "--target-modules", "c_attn,c_proj",
        ]
        first = subprocess.run(
            command + ["--work-dir", str(self.work_dir)],
            cwd=str(self.unrelated_cwd), capture_output=True, text=True,
        )
        self.assertEqual(first.returncode, 0, first.stderr)
        for flag, value in (
            ("--r", "4"), ("--lora-alpha", "16"),
            ("--lora-dropout", "0.25"), ("--target-modules", "c_attn"),
        ):
            with self.subTest(flag=flag):
                candidate = Path(self.temp_dir.name) / flag.removeprefix("--")
                shutil.copytree(self.work_dir, candidate)
                before = {
                    path.name: (path.read_bytes(), path.stat().st_mtime_ns)
                    for path in candidate.iterdir() if path.is_file()
                }
                resumed = subprocess.run(
                    command + ["--work-dir", str(candidate), "--resume", flag, value],
                    cwd=str(self.unrelated_cwd), capture_output=True, text=True,
                )
                after = {
                    path.name: (path.read_bytes(), path.stat().st_mtime_ns)
                    for path in candidate.iterdir() if path.is_file()
                }
                self.assertEqual(before.keys(), after.keys())
                for name in before:
                    self.assertTrue(before[name][0] == after[name][0], f"{name} bytes changed")
                    self.assertEqual(before[name][1], after[name][1], f"{name} mtime changed")
                self.assertEqual(resumed.returncode, 2, resumed.stderr)
                self.assertIn("resume adapter configuration does not match", resumed.stderr)
                self.assertNotIn("Traceback", resumed.stderr)

        resumed = subprocess.run(
            command + ["--work-dir", str(self.work_dir), "--resume"],
            cwd=str(self.unrelated_cwd), capture_output=True, text=True,
        )
        self.assertEqual(resumed.returncode, 0, resumed.stderr)
        artifact = json.loads((self.work_dir / "run_artifact.json").read_text())
        self.assertEqual(artifact["completed_iters"], 2)
        self.assertTrue(artifact["adapter_round_trip_verified"])
        self.assertEqual(artifact["parameter_ledger"]["r"], 2)
        self.assertEqual(artifact["r"], 2)

    def test_smoke_resume_rejects_non_object_artifact_without_traceback(self):
        artifact = self.work_dir / "run_artifact.json"
        artifact.write_text("[]\n", encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(self.train_script), "--smoke",
             "--data-path", str(self.data_file), "--work-dir", str(self.work_dir),
             "--resume", "--max-iters", "1"],
            cwd=str(self.unrelated_cwd), capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("resume artifact must be an object", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(artifact.read_text(encoding="utf-8"), "[]\n")
        self.assertEqual([p.name for p in self.work_dir.iterdir()], ["run_artifact.json"])

    def test_train_cli_invalid_args_rejection(self):
        """train.py must cleanly reject non-positive rank r or missing data file."""
        cmd = [
            sys.executable,
            str(self.train_script),
            "--data-path",
            "non_existent_file.jsonl",
            "--work-dir",
            str(self.work_dir),
            "--r",
            "0",
        ]
        res = subprocess.run(cmd, cwd=str(self.unrelated_cwd), capture_output=True, text=True)
        self.assertNotEqual(res.returncode, 0)


if __name__ == "__main__":
    unittest.main()
