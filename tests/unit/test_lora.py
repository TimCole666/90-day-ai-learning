"""
tests/unit/test_lora.py
=======================
Unit and behavioral tests for LoRA (Low-Rank Adaptation) fine-tuning.
Verifies:
1. Base weight freezing: base weights have requires_grad=False; only adapter weights lora_A, lora_B are trainable.
2. Gradient isolation: backward pass produces gradients only on lora_A and lora_B; base weight grad is None.
3. LoRA linear math: forward pass matches W0 @ x + (alpha / r) * (B @ A @ x).
4. Zero-init identity: with lora_B initialized to zero, output is strictly identical to base model at step 0.
5. In-place merge and unmerge: merged weights produce identical outputs without adapter overhead; unmerge restores base weight.
6. Target module injection: apply_lora_to_model correctly adapts specified transformer modules (e.g., c_attn, c_proj) and reports parameter ledger.
7. Instruction dataset formatting and loss masking: prompt tokens are masked with -100 so loss is computed exclusively on response tokens.
8. Serialization round trip: save_adapter saves only adapter weights and config; load_adapter restores state and reproduces logits.
9. Resilient input validation: malformed JSONL or mismatched configs raise explicit ValueErrors.
"""

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def setUpModule():
    if importlib.util.find_spec("torch") is None:
        raise unittest.SkipTest(
            "PyTorch is not installed in the current environment; use .venv/bin/python."
        )


class TestLoRALayer(unittest.TestCase):
    """Test the low-level LoRALinear layer invariants."""

    def setUp(self):
        import torch

        from projects.lora.model import LoRALinear

        torch.manual_seed(42)
        self.in_features = 8
        self.out_features = 16
        self.r = 4
        self.alpha = 8.0
        self.layer = LoRALinear(
            in_features=self.in_features,
            out_features=self.out_features,
            r=self.r,
            lora_alpha=self.alpha,
            bias=True,
        )

    def test_parameter_freezing(self):
        """Base weight and bias must have requires_grad=False; lora_A and lora_B must be trainable."""
        self.assertFalse(self.layer.weight.requires_grad)
        bias = self.layer.bias
        self.assertIsNotNone(bias)
        if bias is None:
            self.fail("LoRA layer should have a bias when bias=True")
        self.assertFalse(bias.requires_grad)
        self.assertTrue(self.layer.lora_A.requires_grad)
        self.assertTrue(self.layer.lora_B.requires_grad)

    def test_initialization_zero_output(self):
        """lora_B should be initialized to zero, making adapter output exactly zero at initialization."""
        import torch

        x = torch.randn(2, self.in_features)
        base_out = torch.nn.functional.linear(x, self.layer.weight, self.layer.bias)
        adapter_out = self.layer(x)
        torch.testing.assert_close(adapter_out, base_out)

    def test_forward_matches_formula(self):
        """When lora_B is non-zero, forward output must equal base_out + (alpha / r) * (x @ A.T @ B.T)."""
        import torch

        # Manually assign non-zero weights to B to test mathematical correctness
        torch.nn.init.normal_(self.layer.lora_B, mean=0.0, std=0.1)
        x = torch.randn(3, self.in_features)

        actual = self.layer(x)
        expected_base = torch.nn.functional.linear(
            x, self.layer.weight, self.layer.bias
        )
        scaling = self.alpha / self.r
        expected_lora = (x @ self.layer.lora_A.t()) @ self.layer.lora_B.t() * scaling
        expected = expected_base + expected_lora

        torch.testing.assert_close(actual, expected)

    def test_gradient_isolation(self):
        """Backward pass must produce gradients ONLY on lora_A and lora_B, never on base weight or bias."""
        import torch

        torch.nn.init.normal_(self.layer.lora_B, mean=0.0, std=0.1)
        x = torch.randn(2, self.in_features)
        out = self.layer(x)
        loss = out.sum()
        loss.backward()

        self.assertIsNone(
            self.layer.weight.grad, "Base weight unexpectedly received gradient!"
        )
        bias = self.layer.bias
        self.assertIsNotNone(bias, "LoRA layer should have a bias when bias=True")
        if bias is None:
            self.fail("LoRA layer should have a bias when bias=True")
        bias_grad = bias.grad
        self.assertIsNone(bias_grad, "Base bias unexpectedly received gradient!")
        adapter_a_grad = self.layer.lora_A.grad
        adapter_b_grad = self.layer.lora_B.grad
        self.assertIsNotNone(adapter_a_grad, "lora_A missing gradient!")
        self.assertIsNotNone(adapter_b_grad, "lora_B missing gradient!")
        if adapter_a_grad is None or adapter_b_grad is None:
            self.fail("LoRA adapter gradients should be populated after backward")
        self.assertGreater(adapter_a_grad.abs().sum().item(), 0.0)
        self.assertGreater(adapter_b_grad.abs().sum().item(), 0.0)

    def test_merge_and_unmerge(self):
        """Merge folds adapter weights into base weight; unmerge restores original base weight."""
        import torch

        torch.nn.init.normal_(self.layer.lora_B, mean=0.0, std=0.1)
        x = torch.randn(2, self.in_features)

        unmerged_out = self.layer(x).detach().clone()
        base_before = self.layer.weight.detach().clone()

        # Merge
        self.layer.merge()
        self.assertTrue(self.layer.merged)
        merged_out = self.layer(x).detach().clone()
        torch.testing.assert_close(merged_out, unmerged_out)

        # Merge is idempotent
        self.layer.merge()
        torch.testing.assert_close(self.layer(x), unmerged_out)

        # Unmerge
        self.layer.unmerge()
        self.assertFalse(self.layer.merged)
        torch.testing.assert_close(self.layer.weight, base_before)
        torch.testing.assert_close(self.layer(x), unmerged_out)


class TestTransformerLoRAInjection(unittest.TestCase):
    """Test injecting LoRA into the full open Transformer architecture."""

    def test_apply_lora_to_gpt(self):
        """apply_lora replaces target modules in GPT with LoRALinear and freezes all base parameters."""
        import torch

        from projects.lora.model import LoRALinear, apply_lora
        from projects.pretrain.model import GPT, Block, GPTConfig

        cfg = GPTConfig(block_size=32, vocab_size=64, n_layer=2, n_head=2, n_embd=32)
        model = GPT(cfg)

        model, ledger = apply_lora(
            model=model,
            target_modules=["c_attn", "c_proj"],
            r=4,
            lora_alpha=8.0,
        )

        # Verify target modules are LoRALinear. ModuleDict exposes values as
        # generic Modules to Pyright, so assert the public structure before use.
        blocks = getattr(model.transformer, "h", None)
        self.assertIsInstance(blocks, torch.nn.ModuleList)
        if not isinstance(blocks, torch.nn.ModuleList):
            self.fail("GPT transformer block collection should be a ModuleList")
        adapted_count = 0
        for block in blocks:
            self.assertIsInstance(block, Block)
            if not isinstance(block, Block):
                self.fail("GPT transformer block should be a Block")
            self.assertIsInstance(block.attn.c_attn, LoRALinear)
            self.assertIsInstance(block.attn.c_proj, LoRALinear)
            adapted_count += 2

        self.assertEqual(adapted_count, 4)  # 2 blocks * 2 modules

        # Verify all base parameters have requires_grad = False
        for name, param in model.named_parameters():
            if "lora_A" in name or "lora_B" in name:
                self.assertTrue(
                    param.requires_grad, f"Adapter param {name} not trainable"
                )
            else:
                self.assertFalse(param.requires_grad, f"Base param {name} not frozen")

        # Verify parameter accounting ledger
        self.assertIn("base_parameters", ledger)
        self.assertIn("adapter_parameters", ledger)
        self.assertIn("trainable_percentage", ledger)
        self.assertLess(ledger["trainable_percentage"], 25.0)


class TestInstructionDataFormattingAndLossMasking(unittest.TestCase):
    """Test instruction prompt template and target loss masking."""

    def test_loss_masking_ignores_prompt_tokens(self):
        """CrossEntropyLoss with target masking (-100) on prompt tokens produces loss only on completion."""
        from projects.lora.data import CharTokenizer, build_instruction_tokens

        corpus = "abcdefghijklmnopqrstuvwxyz \n:1234567890"
        tokenizer = CharTokenizer(corpus)

        instruction = "Add numbers:"
        response = " 42"

        _, target_ids = build_instruction_tokens(
            instruction=instruction,
            response=response,
            tokenizer=tokenizer,
            max_length=64,
        )

        # Targets corresponding to instruction prefix must be -100
        prompt_len = len(tokenizer.encode(f"Instruction: {instruction}\nResponse:"))
        self.assertTrue(all(t == -100 for t in target_ids[:prompt_len]))

        # Response targets must be valid token ids
        response_token_ids = tokenizer.encode(response)
        self.assertEqual(
            target_ids[prompt_len : prompt_len + len(response_token_ids)],
            response_token_ids,
        )

    def test_local_loss_is_next_token_not_copy(self):
        """Labels follow the causal-LM convention: position t is scored on token t+1.

        A model that echoes its input must not beat a model that predicts the next token.
        """
        import torch
        import torch.nn.functional as F
        from torch.utils.data import DataLoader

        from projects.lora import evaluate as lora_evaluate
        from projects.lora import smoke
        from projects.lora.data import (
            CharTokenizer,
            InstructionDataset,
            collate_instruction_batch,
        )

        tokenizer = CharTokenizer()
        records = [
            {"instruction": f"Say {w}", "response": f" {w}!"}
            for w in ("apple", "berry", "cherry", "date")
        ]
        loader = DataLoader(
            InstructionDataset(records, tokenizer, max_length=64),
            batch_size=2,
            collate_fn=collate_instruction_batch,
        )

        class Echo(torch.nn.Module):
            def forward(self, x):
                return F.one_hot(x, tokenizer.vocab_size).float() * 50, None

        class NextToken(torch.nn.Module):
            def forward(self, x):
                nxt = torch.cat([x[:, 1:], x[:, -1:]], dim=1)
                return F.one_hot(nxt, tokenizer.vocab_size).float() * 50, None

        device = torch.device("cpu")
        for score in (smoke.evaluate, lora_evaluate.evaluate_model):
            echo_loss = score(Echo(), loader, device)
            next_loss = score(NextToken(), loader, device)
            self.assertLess(next_loss, 1e-3, score.__module__)
            self.assertGreater(echo_loss, 1.0, score.__module__)

    def test_batch_contract_accepts_tuple_and_mapping(self):
        import torch

        from projects.lora.data import normalize_lm_batch

        inputs = torch.ones((2, 3), dtype=torch.long)
        labels = torch.zeros((2, 3), dtype=torch.long)
        for batch in ((inputs, labels), {"input_ids": inputs, "labels": labels}):
            normalized = normalize_lm_batch(batch)
            self.assertEqual(set(normalized), {"input_ids", "labels"})
            torch.testing.assert_close(normalized["input_ids"], inputs)
            torch.testing.assert_close(normalized["labels"], labels)

    def test_malformed_jsonl_rejection(self):
        """Malformed JSONL records must raise explicit ValueError."""
        from projects.lora.data import load_instruction_records

        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            f.write('{"instruction": "ok", "response": "fine"}\n')
            f.write('{"missing_response": "bad"}\n')
            bad_path = f.name

        try:
            with self.assertRaises(ValueError):
                load_instruction_records(bad_path)
        finally:
            if os.path.exists(bad_path):
                os.remove(bad_path)


class TestAdapterSerialization(unittest.TestCase):
    """Test saving and loading adapter checkpoints independently of base model."""

    def test_save_and_load_round_trip(self):
        """Saved adapter must reload onto clean base model and reproduce identical logits."""
        import torch

        from projects.lora.model import apply_lora, load_adapter, save_adapter
        from projects.pretrain.model import GPT, GPTConfig

        torch.manual_seed(101)
        cfg = GPTConfig(block_size=16, vocab_size=32, n_layer=1, n_head=2, n_embd=16)
        base_model = GPT(cfg)

        model, _ledger = apply_lora(
            base_model, target_modules=["c_attn"], r=2, lora_alpha=4.0
        )

        # Mutate adapter weights
        for n, p in model.named_parameters():
            if "lora_B" in n:
                torch.nn.init.normal_(p, std=0.05)

        x = torch.randint(0, 32, (1, 8))
        model.eval()
        with torch.no_grad():
            expected_logits, _ = model(x)

        with tempfile.TemporaryDirectory() as tmp_dir:
            save_adapter(
                model=model,
                save_dir=tmp_dir,
                base_config=cfg.to_dict(),
                lora_config={"r": 2, "lora_alpha": 4.0, "target_modules": ["c_attn"]},
            )

            # Re-create fresh base model with same base weights and load adapter
            torch.manual_seed(101)
            fresh_base = GPT(cfg)
            adapted_fresh, loaded_cfg = load_adapter(fresh_base, tmp_dir)
            adapted_fresh.eval()
            with torch.no_grad():
                restored_logits, _ = adapted_fresh(x)

            torch.testing.assert_close(restored_logits, expected_logits)
            self.assertEqual(loaded_cfg["r"], 2)

    def test_load_rejects_adapter_weights_without_matching_layer(self):
        """Adapter tensors the base model cannot hold must not be dropped silently."""
        import json

        from projects.lora.model import apply_lora, load_adapter, save_adapter
        from projects.pretrain.model import GPT, GPTConfig

        def gpt(n_layer):
            return GPT(GPTConfig(block_size=8, vocab_size=5, n_layer=n_layer, n_head=1, n_embd=8))

        model, _ = apply_lora(gpt(2), target_modules=["c_attn"], r=2, lora_alpha=4.0)
        with tempfile.TemporaryDirectory() as tmp_dir:
            save_adapter(
                model=model,
                save_dir=tmp_dir,
                base_config={"n_layer": 2},
                lora_config={"r": 2, "lora_alpha": 4.0, "target_modules": ["c_attn"]},
            )
            # Smaller base: layer-1 adapter tensors have no destination.
            with self.assertRaisesRegex(ValueError, "unexpected"):
                load_adapter(gpt(1), tmp_dir)

            # Config naming no existing module: every tensor would be dropped.
            config_path = Path(tmp_dir) / "adapter_config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["target_modules"] = ["no_such_module"]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unexpected"):
                load_adapter(gpt(2), tmp_dir)


class TestSmokeResponseValidation(unittest.TestCase):
    """Smoke runs enforce the documented response-token requirement before writes."""

    def test_masked_records_reject_every_partition_before_writes(self):
        from projects.lora.smoke import run_smoke

        valid = {"instruction": "a", "response": " ok"}
        masked = {"instruction": "x" * 64, "response": " ok"}
        for partition in ("all", "train", "val", "test"):
            for existing in (False, True):
                with self.subTest(partition=partition, existing=existing), tempfile.TemporaryDirectory() as temporary:
                    work_dir = Path(temporary) / "run"
                    work_dir.mkdir()
                    if existing:
                        for name in (
                            "tokenizer.json", "base_model.pt", "adapter_config.json",
                            "adapter_model.pt", "run_artifact.json",
                        ):
                            (work_dir / name).write_bytes(b"completed-run-sentinel")
                    before = {
                        p.name: (p.read_bytes(), p.stat().st_mtime_ns)
                        for p in work_dir.iterdir()
                    }
                    split = {"train": [valid], "val": [valid], "test": [valid]}
                    if partition == "all":
                        split = {name: [masked] for name in split}
                    else:
                        split[partition] = [valid, masked]
                    records = [row for name in ("train", "val", "test") for row in split[name]]
                    masked_index = records.index(masked) + 1
                    with self.assertRaisesRegex(
                        ValueError,
                        f"Record {masked_index} has no response tokens after max_length=32; increase --max-length",
                    ):
                        run_smoke(
                            records=records,
                            split={**split, "data_hash": "test-hash", "split_summary": {}},
                            work_dir=work_dir, seed=42, rank=2, alpha=4.0, dropout=0.0,
                            target_modules=["c_attn"], max_iters=1, batch_size=2,
                            learning_rate=0.001, resume=existing, max_length=32,
                        )
                    after = {
                        p.name: (p.read_bytes(), p.stat().st_mtime_ns)
                        for p in work_dir.iterdir()
                    }
                    self.assertEqual(before, after)

    def test_masked_record_does_not_create_missing_work_directory(self):
        from projects.lora.smoke import run_smoke

        records = [{"instruction": "x" * 64, "response": " ok"}]
        with tempfile.TemporaryDirectory() as temporary:
            work_dir = Path(temporary) / "missing" / "run"
            with self.assertRaisesRegex(ValueError, "no response tokens"):
                run_smoke(
                    records=records, split={"train": records}, work_dir=work_dir,
                    seed=42, rank=2, alpha=4.0, dropout=0.0, target_modules=["c_attn"],
                    max_iters=1, batch_size=1, learning_rate=0.001, resume=False, max_length=32,
                )
            self.assertFalse(work_dir.parent.exists())


if __name__ == "__main__":
    unittest.main()
