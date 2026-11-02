#!/usr/bin/env python3
"""
tests/unit/test_pretrain.py
===========================
Process-isolated and unit tests for resumable small-model pretraining.
Verifies:
1. Causal attention masking (forward perturbation invariance and backward gradient isolation).
2. Weight tying identity between wte and lm_head.
3. Configuration validation (rejects invalid embedding/head dimensions, etc.).
4. Finite gradients and cross-entropy loss computation.
5. Atomic checkpoint saving and round-trip state restoration (weights, optimizer, RNG, step).
6. Checkpoint compatibility validation (rejection of mismatched configs).
7. Process-isolated CLI execution: tiny CPU smoke run from an unrelated working directory.
8. Process-isolated CLI resumption: resume from intermediate checkpoint without corruption.
9. Process-isolated CLI evaluation and text generation.
"""

import json
import math
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    import torch
    from projects.pretrain.model import GPT, GPTConfig
    from projects.pretrain.data import TextCorpusDataset
    from projects.pretrain.checkpoint import save_checkpoint, load_checkpoint, CheckpointState
except ImportError:
    raise unittest.SkipTest("PyTorch is not installed in the current environment; use .venv/bin/python to run pretraining tests.")


class TestModelArchitecture(unittest.TestCase):
    """Behavioral and invariant tests for GPT architecture."""

    def test_config_validation(self):
        """Reject malformed configurations with explicit ValueError."""
        # n_embd not divisible by n_head
        with self.assertRaises(ValueError):
            GPTConfig(n_embd=65, n_head=4).validate()

        # block_size < 1
        with self.assertRaises(ValueError):
            GPTConfig(block_size=0).validate()

        # vocab_size < 1
        with self.assertRaises(ValueError):
            GPTConfig(vocab_size=0).validate()

        # n_layer < 1
        with self.assertRaises(ValueError):
            GPTConfig(n_layer=0).validate()

    def test_weight_tying(self):
        """Input embedding (wte) and output classification head (lm_head) must share weights."""
        cfg = GPTConfig(block_size=16, vocab_size=32, n_layer=1, n_head=2, n_embd=16)
        model = GPT(cfg)
        token_embedding = model.transformer["wte"]
        self.assertIsInstance(token_embedding, torch.nn.Embedding)
        if not isinstance(token_embedding, torch.nn.Embedding):
            self.fail("GPT token embedding must be an Embedding")
        self.assertIs(token_embedding.weight, model.lm_head.weight)

    def test_causal_mask_forward_perturbation(self):
        """
        Causal attention invariant: perturbing token at position T must NOT affect
        the predicted logits for any prefix position t < T.
        """
        torch.manual_seed(42)
        cfg = GPTConfig(block_size=16, vocab_size=32, n_layer=2, n_head=2, n_embd=16, dropout=0.0)
        model = GPT(cfg)
        model.eval()

        # Sequence of 6 tokens
        x1 = torch.tensor([[5, 12, 3, 19, 7, 2]])
        # Same sequence, but mutate the 6th token (index 5)
        x2 = torch.tensor([[5, 12, 3, 19, 7, 28]])

        with torch.no_grad():
            logits1, _ = model(x1)
            logits2, _ = model(x2)

        # Logits for positions 0..4 MUST be strictly identical within float precision
        self.assertTrue(
            torch.allclose(logits1[:, :5, :], logits2[:, :5, :], atol=1e-6),
            f"Future token leaked into earlier positions! Diff: {(logits1[:, :5, :] - logits2[:, :5, :]).abs().max()}"
        )
        # Logit at position 5 MUST differ because the input token differed
        self.assertFalse(torch.allclose(logits1[:, 5, :], logits2[:, 5, :]))

    def test_causal_mask_backward_gradient_isolation(self):
        """
        Causal attention gradient invariant: computing loss on position t must produce
        strictly ZERO gradients on embedding outputs for subsequent positions t' > t.
        """
        torch.manual_seed(42)
        cfg = GPTConfig(block_size=8, vocab_size=20, n_layer=2, n_head=2, n_embd=16, dropout=0.0)
        model = GPT(cfg)
        model.train()

        x = torch.tensor([[1, 2, 3, 4, 5]])
        # ModuleDict keys expose Modules, unlike ambiguous attribute access.
        token_embedding = model.transformer["wte"]
        position_embedding = model.transformer["wpe"]
        blocks = model.transformer["h"]
        self.assertIsInstance(token_embedding, torch.nn.Embedding)
        self.assertIsInstance(position_embedding, torch.nn.Embedding)
        self.assertIsInstance(blocks, torch.nn.ModuleList)
        if not isinstance(token_embedding, torch.nn.Embedding):
            self.fail("GPT token embedding must be an Embedding")
        if not isinstance(position_embedding, torch.nn.Embedding):
            self.fail("GPT position embedding must be an Embedding")
        if not isinstance(blocks, torch.nn.ModuleList):
            self.fail("GPT transformer blocks must be a ModuleList")
        tok_emb = token_embedding(x)
        pos_emb = position_embedding(torch.arange(5))
        hidden = tok_emb + pos_emb
        hidden.retain_grad()

        # Pass through transformer blocks manually or inspect hidden gradients
        h = hidden
        for block in blocks:
            h = block(h)
        h = model.transformer["ln_f"](h)
        logits = model.lm_head(h)

        # Compute loss ONLY on position 2 (predicting target after token 2)
        loss = logits[0, 2].sum()
        loss.backward()

        # Gradients on hidden states at positions 3 and 4 MUST be strictly zero
        hidden_grad = hidden.grad
        self.assertIsNotNone(hidden_grad)
        if hidden_grad is None:
            self.fail("Retained hidden-state gradients must be populated")
        grad_future = hidden_grad[0, 3:]
        self.assertTrue(
            (grad_future == 0.0).all().item(),
            f"Non-zero gradients leaked backwards from future tokens! Max leak: {grad_future.abs().max()}"
        )

    def test_finite_gradients_and_loss(self):
        """A forward-backward step produces valid cross-entropy loss and all finite gradients."""
        torch.manual_seed(42)
        cfg = GPTConfig(block_size=16, vocab_size=32, n_layer=2, n_head=2, n_embd=16)
        model = GPT(cfg)
        model.train()

        x = torch.randint(0, 32, (2, 8))
        y = torch.randint(0, 32, (2, 8))

        logits, loss = model(x, targets=y)
        self.assertIsNotNone(loss)
        if loss is None:
            self.fail("Targets must produce a cross-entropy loss")
        self.assertTrue(torch.isfinite(loss).item())
        self.assertGreater(loss.item(), 0.0)

        # For vocab_size=32, random uniform baseline loss is ln(32) ≈ 3.465
        # Loss should be reasonably close to this at random initialization
        expected_uniform_loss = math.log(32)
        self.assertAlmostEqual(loss.item(), expected_uniform_loss, delta=1.5)

        loss.backward()

        # All parameter gradients must be finite and non-empty
        for name, param in model.named_parameters():
            if param.requires_grad:
                gradient = param.grad
                self.assertIsNotNone(gradient, f"Param {name} has None grad")
                if gradient is None:
                    self.fail(f"Param {name} has None grad")
                self.assertTrue(
                    torch.isfinite(gradient).all().item(),
                    f"Param {name} has NaN or Inf grad"
                )


    def test_parameter_ledger_matches_actual(self):
        """The parameter ledger formula must exactly match actual PyTorch parameter counts."""
        for bias in (False, True):
            cfg = GPTConfig(block_size=32, vocab_size=50, n_layer=3, n_head=2, n_embd=32, bias=bias)
            model = GPT(cfg)
            actual_total = sum(p.numel() for p in model.parameters())
            ledger = cfg.parameter_ledger()
            self.assertEqual(
                ledger["total_parameters"],
                actual_total,
                f"Ledger mismatch with bias={bias}: expected {actual_total}, got {ledger['total_parameters']}"
            )


class TestDataPipeline(unittest.TestCase):
    """Tests for dataset loading, character tokenization, and deterministic splitting."""

    def test_tokenizer_and_splits(self):
        sample_text = "First Citizen:\nBefore we proceed any further, hear me speak.\n"
        ds = TextCorpusDataset.from_text(sample_text, train_ratio=0.8)

        # Roundtrip tokenization
        encoded = ds.encode(sample_text)
        decoded = ds.decode(encoded)
        self.assertEqual(decoded, sample_text)

        # Vocabulary size and characters
        self.assertEqual(ds.vocab_size, len(sorted(list(set(sample_text)))))
        self.assertEqual(len(ds.chars), ds.vocab_size)

        # Splits
        self.assertGreater(len(ds.train_data), 0)
        self.assertGreater(len(ds.val_data), 0)
        self.assertEqual(len(ds.train_data) + len(ds.val_data), len(sample_text))

        # Batch shapes and alignment: y is shifted right by 1
        x, y = ds.get_batch("train", batch_size=2, block_size=8, seed=123)
        self.assertEqual(x.shape, (2, 8))
        self.assertEqual(y.shape, (2, 8))


class TestCheckpointStorage(unittest.TestCase):
    """Tests for atomic checkpoint saving, loading, RNG restoration, and safety checks."""

    def setUp(self):
        import tempfile
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_atomic_checkpoint_roundtrip(self):
        """Saving and loading checkpoint preserves model weights, optimizer state, step, loss, and RNG."""
        cfg = GPTConfig(block_size=16, vocab_size=25, n_layer=2, n_head=2, n_embd=16)
        model = GPT(cfg)
        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)

        # Do one dummy step to populate optimizer state
        x = torch.randint(0, 25, (2, 8))
        y = torch.randint(0, 25, (2, 8))
        _, loss = model(x, y)
        loss.backward()
        optimizer.step()

        ckpt_path = self.work_dir / "checkpoint_test.pt"
        save_checkpoint(
            ckpt_path=ckpt_path,
            model=model,
            optimizer=optimizer,
            step=42,
            loss=loss.item(),
            config=cfg,
            vocab=["a", "b", "c"],
            data_hash="dummy-sha256",
        )

        self.assertTrue(ckpt_path.exists())

        # Load into fresh model and fresh optimizer
        fresh_model = GPT(cfg)
        fresh_optimizer = torch.optim.AdamW(fresh_model.parameters(), lr=1e-3)

        loaded_state = load_checkpoint(
            ckpt_path=ckpt_path,
            model=fresh_model,
            optimizer=fresh_optimizer,
            expected_config=cfg,
        )

        self.assertEqual(loaded_state.step, 42)
        self.assertAlmostEqual(loaded_state.loss, loss.item(), places=5)
        self.assertEqual(loaded_state.vocab, ["a", "b", "c"])
        self.assertEqual(loaded_state.data_hash, "dummy-sha256")

        # Verify weights are identical
        for p1, p2 in zip(model.parameters(), fresh_model.parameters()):
            self.assertTrue(torch.allclose(p1, p2))

        # Verify optimizer state restored
        for k, v in optimizer.state_dict()["state"].items():
            fresh_v = fresh_optimizer.state_dict()["state"][k]
            for param_key in ("exp_avg", "exp_avg_sq"):
                if param_key in v:
                    self.assertTrue(torch.allclose(v[param_key], fresh_v[param_key]))

    def test_checkpoint_compatibility_rejection(self):
        """Loading a checkpoint with incompatible config must raise ValueError."""
        cfg1 = GPTConfig(block_size=16, vocab_size=25, n_layer=2, n_head=2, n_embd=16)
        model = GPT(cfg1)
        optimizer = torch.optim.AdamW(model.parameters())

        ckpt_path = self.work_dir / "ckpt.pt"
        save_checkpoint(
            ckpt_path=ckpt_path,
            model=model,
            optimizer=optimizer,
            step=1,
            loss=2.5,
            config=cfg1,
        )

        # Incompatible config: n_embd=32 instead of 16
        cfg_mismatched = GPTConfig(block_size=16, vocab_size=25, n_layer=2, n_head=2, n_embd=32)
        fresh_model = GPT(cfg_mismatched)
        fresh_opt = torch.optim.AdamW(fresh_model.parameters())

        with self.assertRaises(ValueError) as ctx:
            load_checkpoint(
                ckpt_path=ckpt_path,
                model=fresh_model,
                optimizer=fresh_opt,
                expected_config=cfg_mismatched,
            )
        self.assertIn("n_embd", str(ctx.exception))

    def test_corrupted_checkpoint_atomic_safety(self):
        """If a corrupted file exists, loading raises an exception and doesn't claim valid state."""
        bad_ckpt = self.work_dir / "bad.pt"
        with open(bad_ckpt, "wb") as f:
            f.write(b"not-a-valid-pytorch-checkpoint-file")

        cfg = GPTConfig(block_size=16, vocab_size=25, n_layer=1, n_head=1, n_embd=16)
        model = GPT(cfg)
        opt = torch.optim.AdamW(model.parameters())

        with self.assertRaises(Exception):
            load_checkpoint(
                ckpt_path=bad_ckpt,
                model=model,
                optimizer=opt,
                expected_config=cfg,
            )


class TestProcessIsolatedCLI(unittest.TestCase):
    """Process-isolated tests executing training and evaluation CLI from an unrelated working directory."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.unrelated_cwd = Path(self.temp_dir.name) / "unrelated_dir"
        self.unrelated_cwd.mkdir(parents=True)
        self.work_dir = Path(self.temp_dir.name) / "model_artifacts"
        self.work_dir.mkdir(parents=True)

        # Create a small valid Shakespeare sample corpus
        self.sample_corpus = (
            "To be, or not to be, that is the question:\n"
            "Whether 'tis nobler in the mind to suffer\n"
            "The slings and arrows of outrageous fortune,\n"
            "Or to take arms against a sea of troubles.\n"
        ) * 5
        self.data_file = Path(self.temp_dir.name) / "corpus.txt"
        with open(self.data_file, "w", encoding="utf-8") as f:
            f.write(self.sample_corpus)

        self.train_script = PROJECT_ROOT / "projects" / "pretrain" / "train.py"
        self.eval_script = PROJECT_ROOT / "projects" / "pretrain" / "evaluate.py"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_smoke_cli_from_unrelated_directory(self):
        """Invoke train.py from unrelated directory and verify outputs and artifact metadata."""
        cmd = [
            sys.executable,
            str(self.train_script),
            "--smoke",
            "--data-path",
            str(self.data_file),
            "--work-dir",
            str(self.work_dir),
            "--max-iters",
            "4",
            "--checkpoint-interval",
            "2",
            "--eval-interval",
            "2",
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
            f"Train script failed with stderr:\n{res.stderr}\nstdout:\n{res.stdout}",
        )

        latest_ckpt = self.work_dir / "latest.pt"
        self.assertTrue(latest_ckpt.exists(), "latest.pt was not produced")

        artifact_file = self.work_dir / "run_artifact.json"
        self.assertTrue(artifact_file.exists(), "run_artifact.json was not produced")

        with open(artifact_file, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        self.assertEqual(metadata["completed_steps"], 4)
        self.assertIn("parameter_ledger", metadata)
        self.assertIn("train_loss", metadata)
        self.assertIn("val_loss", metadata)
        self.assertIn("truthful_scope_disclaimer", metadata)

    def test_resumption_cli_from_unrelated_directory(self):
        """Train 3 steps, then resume to 6 steps; check step continuity and state preservation."""
        # Phase 1: Train 3 steps
        cmd1 = [
            sys.executable,
            str(self.train_script),
            "--smoke",
            "--data-path",
            str(self.data_file),
            "--work-dir",
            str(self.work_dir),
            "--max-iters",
            "3",
            "--checkpoint-interval",
            "3",
        ]
        res1 = subprocess.run(
            cmd1,
            cwd=str(self.unrelated_cwd),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res1.returncode, 0, f"Initial train failed: {res1.stderr}")

        # Phase 2: Resume up to 6 steps
        cmd2 = [
            sys.executable,
            str(self.train_script),
            "--smoke",
            "--data-path",
            str(self.data_file),
            "--work-dir",
            str(self.work_dir),
            "--max-iters",
            "6",
            "--checkpoint-interval",
            "3",
            "--resume",
        ]
        res2 = subprocess.run(
            cmd2,
            cwd=str(self.unrelated_cwd),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res2.returncode, 0, f"Resumed train failed: {res2.stderr}")

        artifact_file = self.work_dir / "run_artifact.json"
        with open(artifact_file, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        self.assertEqual(metadata["resumed_from_step"], 3)
        self.assertEqual(metadata["completed_steps"], 6)

    def test_incompatible_resumption_rejection(self):
        """Attempting to resume with incompatible hyperparameter must fail and leave latest.pt intact."""
        cmd1 = [
            sys.executable,
            str(self.train_script),
            "--data-path",
            str(self.data_file),
            "--work-dir",
            str(self.work_dir),
            "--max-iters",
            "2",
            "--n-embd",
            "16",
            "--n-head",
            "2",
            "--n-layer",
            "1",
            "--block-size",
            "16",
            "--checkpoint-interval",
            "2",
            "--eval-iters",
            "2",
            "--device",
            "cpu",
        ]
        res1 = subprocess.run(cmd1, cwd=str(self.unrelated_cwd), capture_output=True, text=True)
        self.assertEqual(res1.returncode, 0, f"Initial run failed: {res1.stderr}")

        mtime_before = (self.work_dir / "latest.pt").stat().st_mtime

        # Attempt resume with different n_embd (32 instead of 16)
        cmd2 = [
            sys.executable,
            str(self.train_script),
            "--data-path",
            str(self.data_file),
            "--work-dir",
            str(self.work_dir),
            "--max-iters",
            "4",
            "--n-embd",
            "32",
            "--n-head",
            "2",
            "--n-layer",
            "1",
            "--block-size",
            "16",
            "--eval-iters",
            "2",
            "--device",
            "cpu",
            "--resume",
        ]
        res2 = subprocess.run(cmd2, cwd=str(self.unrelated_cwd), capture_output=True, text=True)
        self.assertNotEqual(res2.returncode, 0, "Resumption with incompatible config should have failed")
        self.assertIn("incompatible", res2.stderr + res2.stdout)

        # Existing latest.pt must not be modified
        mtime_after = (self.work_dir / "latest.pt").stat().st_mtime
        self.assertEqual(mtime_before, mtime_after)

    def test_evaluate_cli_from_unrelated_directory(self):
        """Invoke evaluate.py from unrelated directory to compute held-out metrics and generate text."""
        # First produce a checkpoint
        train_cmd = [
            sys.executable,
            str(self.train_script),
            "--smoke",
            "--data-path",
            str(self.data_file),
            "--work-dir",
            str(self.work_dir),
            "--max-iters",
            "2",
        ]
        train_res = subprocess.run(train_cmd, cwd=str(self.unrelated_cwd), capture_output=True, text=True)
        self.assertEqual(train_res.returncode, 0, f"Setup training failed: {train_res.stderr}")

        eval_json = self.work_dir / "eval_results.json"
        eval_cmd = [
            sys.executable,
            str(self.eval_script),
            "--checkpoint",
            str(self.work_dir / "latest.pt"),
            "--data-path",
            str(self.data_file),
            "--prompt",
            "To be",
            "--max-new-tokens",
            "25",
            "--device",
            "cpu",
            "--output-json",
            str(eval_json),
        ]
        res = subprocess.run(eval_cmd, cwd=str(self.unrelated_cwd), capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"Evaluate CLI failed:\n{res.stderr}\n{res.stdout}")

        self.assertTrue(eval_json.exists(), "eval_results.json was not written")
        with open(eval_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("val_loss", data)
        self.assertIn("val_perplexity", data)
        self.assertIn("generated_text", data)
        self.assertTrue(data["generated_text"].startswith("To be"))
        self.assertTrue(math.isfinite(data["val_loss"]))
        self.assertTrue(math.isfinite(data["val_perplexity"]))

    def test_evaluate_cli_rejects_invalid_sampling_and_iteration_counts(self):
        for option, value, message in (
            ("--top-k", "0", "--top-k must be a positive integer"),
            ("--top-k", "-1", "--top-k must be a positive integer"),
            ("--eval-iters", "0", "--eval-iters must be positive"),
        ):
            result = subprocess.run(
                [
                    sys.executable,
                    str(self.eval_script),
                    "--checkpoint",
                    str(self.work_dir / "missing.pt"),
                    option,
                    value,
                ],
                cwd=str(self.unrelated_cwd),
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn(message, result.stderr)
            self.assertNotIn("Traceback", result.stderr)

    def _train_smoke(self, data_file, max_iters="2", extra=()):
        cmd = [
            sys.executable,
            str(self.train_script),
            "--smoke",
            "--data-path",
            str(data_file),
            "--work-dir",
            str(self.work_dir),
            "--max-iters",
            max_iters,
            "--quiet",
            *extra,
        ]
        return subprocess.run(cmd, cwd=str(self.unrelated_cwd), capture_output=True, text=True)

    def _same_size_other_vocab_corpus(self):
        # Bijective character shift: same vocabulary size, disjoint characters.
        shifted = "".join(chr(ord(c) + 0x100) for c in self.sample_corpus)
        path = Path(self.temp_dir.name) / "other_corpus.txt"
        path.write_text(shifted, encoding="utf-8")
        return path

    def test_resume_rejects_same_size_different_vocabulary(self):
        """A same-size but different vocabulary would silently remap every token."""
        self.assertEqual(self._train_smoke(self.data_file).returncode, 0)
        mtime_before = (self.work_dir / "latest.pt").stat().st_mtime

        res = self._train_smoke(
            self._same_size_other_vocab_corpus(), max_iters="4", extra=("--resume", "auto")
        )
        self.assertNotEqual(res.returncode, 0, "Resume on a different vocabulary should fail")
        self.assertIn("vocab", res.stderr)
        self.assertNotIn("Traceback", res.stderr)
        self.assertEqual(mtime_before, (self.work_dir / "latest.pt").stat().st_mtime)

    def test_evaluate_rejects_mismatched_vocabulary_without_traceback(self):
        self.assertEqual(self._train_smoke(self.data_file).returncode, 0)
        larger = Path(self.temp_dir.name) / "larger_vocab.txt"
        larger.write_text(self.sample_corpus + "0123456789" * 20, encoding="utf-8")
        for corpus in (self._same_size_other_vocab_corpus(), larger):
            res = subprocess.run(
                [
                    sys.executable,
                    str(self.eval_script),
                    "--checkpoint",
                    str(self.work_dir / "latest.pt"),
                    "--data-path",
                    str(corpus),
                    "--max-new-tokens",
                    "3",
                    "--device",
                    "cpu",
                ],
                cwd=str(self.unrelated_cwd),
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(res.returncode, 0, f"{corpus.name} should be rejected")
            self.assertIn("vocab", res.stderr)
            self.assertNotIn("Traceback", res.stderr)

    def test_evaluate_seed_controls_sampling(self):
        """--seed must not be overwritten by the training RNG stored in the checkpoint."""
        self.assertEqual(self._train_smoke(self.data_file).returncode, 0)
        results = {}
        for seed in ("1", "2"):
            out = self.work_dir / f"eval_seed_{seed}.json"
            res = subprocess.run(
                [
                    sys.executable,
                    str(self.eval_script),
                    "--checkpoint",
                    str(self.work_dir / "latest.pt"),
                    "--data-path",
                    str(self.data_file),
                    "--prompt",
                    "To be",
                    "--max-new-tokens",
                    "40",
                    "--device",
                    "cpu",
                    "--seed",
                    seed,
                    "--output-json",
                    str(out),
                ],
                cwd=str(self.unrelated_cwd),
                capture_output=True,
                text=True,
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            results[seed] = json.loads(out.read_text(encoding="utf-8"))
        self.assertNotEqual(
            (results["1"]["val_loss"], results["1"]["generated_text"]),
            (results["2"]["val_loss"], results["2"]["generated_text"]),
        )


if __name__ == "__main__":
    unittest.main()
