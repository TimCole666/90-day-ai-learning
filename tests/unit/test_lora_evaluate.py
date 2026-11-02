"""Offline evaluation regression: adapter loading may mutate the base in place."""

import contextlib
import io
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import torch

from projects.lora import evaluate


class FixtureEncoding(dict):
    def to(self, device):
        return FixtureEncoding({key: value.to(device) for key, value in self.items()})


class FixtureTokenizer:
    pad_token_id = 0

    def __call__(self, text, *, max_length=None, return_tensors=None, **kwargs):
        ids = [ord(character) % 128 + 1 for character in text]
        if max_length is not None:
            ids = ids[:max_length]
        result = {"input_ids": ids, "attention_mask": [1] * len(ids)}
        if return_tensors == "pt":
            return FixtureEncoding({key: torch.tensor([value]) for key, value in result.items()})
        return result

    def decode(self, ids, **kwargs):
        return "fixture completion"


class FixtureModel(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.adapter_loaded = False

    def forward(self, **batch):
        return types.SimpleNamespace(loss=torch.tensor(1.0 if self.adapter_loaded else 4.0))

    def generate(self, *, input_ids, **kwargs):
        return input_ids


class TestRealEvaluationBaseline(unittest.TestCase):
    def test_before_loss_precedes_in_place_adapter_injection(self):
        model = FixtureModel()
        bundle = types.SimpleNamespace(model=model, tokenizer=FixtureTokenizer())
        peft = types.ModuleType("peft")

        class PeftModel:
            @staticmethod
            def from_pretrained(base, adapter_dir, **kwargs):
                base.adapter_loaded = True
                return base

        peft.__dict__["PeftModel"] = PeftModel
        with tempfile.TemporaryDirectory() as temporary:
            adapter_dir = Path(temporary)
            (adapter_dir / "run_artifact.json").write_text(
                json.dumps({"smoke": False, "model_id": "offline-fixture"}), encoding="utf-8"
            )
            data_path = adapter_dir / "data.jsonl"
            data_path.write_text("\n".join(
                json.dumps({"instruction": f"question {index}", "response": "answer"})
                for index in range(10)
            ), encoding="utf-8")
            output, errors = io.StringIO(), io.StringIO()
            with (
                patch.object(evaluate, "load_real_model", return_value=bundle),
                patch.dict("sys.modules", {"peft": peft}),
                contextlib.redirect_stdout(output),
                contextlib.redirect_stderr(errors),
            ):
                status = evaluate.main([
                    "--adapter-dir", str(adapter_dir), "--data-path", str(data_path),
                    "--local-files-only", "--max-new-tokens", "1",
                ])
            self.assertEqual(status, 0, errors.getvalue())
            result = json.loads(output.getvalue())
            self.assertEqual(result["held_out_samples"], 1)
            self.assertEqual(result["loss_before"], 4.0)
            self.assertEqual(result["loss_after"], 1.0)
            self.assertEqual(result["loss_delta"], 3.0)
            self.assertTrue(model.adapter_loaded)


if __name__ == "__main__":
    unittest.main()
