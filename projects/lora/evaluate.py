#!/usr/bin/env python3
"""Evaluate a saved LoRA adapter on the independent held-out split."""

from __future__ import annotations

import argparse
import importlib
import json
import math
import sys
from pathlib import Path
from typing import Any, cast

import torch
from torch.utils.data import DataLoader

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if __package__ in {None, ""}:
    sys.path.insert(0, str(PROJECT_ROOT))
    from projects.lora.data import (
        CharTokenizer,
        InstructionDataset,
        causal_lm_loss,
        collate_instruction_batch,
        load_instruction_records,
        normalize_lm_batch,
        split_instruction_dataset,
    )
    from projects.lora.model import LoRALinear, load_adapter
    from projects.lora.real import (
        TokenizedInstructionDataset,
        collate_real_batch,
        format_instruction,
        load_real_model,
        tokenize_instruction_records,
    )
    from projects.pretrain.model import GPT, GPTConfig
else:
    from ..pretrain.model import GPT, GPTConfig
    from .data import (
        CharTokenizer,
        InstructionDataset,
        causal_lm_loss,
        collate_instruction_batch,
        load_instruction_records,
        normalize_lm_batch,
        split_instruction_dataset,
    )
    from .model import LoRALinear, load_adapter
    from .real import (
        TokenizedInstructionDataset,
        collate_real_batch,
        format_instruction,
        load_real_model,
        tokenize_instruction_records,
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter-dir", required=True)
    parser.add_argument("--data-path", required=True)
    parser.add_argument("--model", default=None, help="Real model id/path; defaults to run_artifact.json model_id")
    parser.add_argument("--base-model", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--revision", default=None)
    parser.add_argument("--local-files-only", action="store_true")
    parser.add_argument("--prompt", default="What is 2+2?")
    parser.add_argument("--max-new-tokens", type=int, default=32)
    parser.add_argument("--max-length", type=int, default=None)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output-json", default=None)
    return parser.parse_args(argv)


def evaluate_model(model: Any, loader: DataLoader, device: torch.device) -> float:
    model.eval()
    total, tokens = 0.0, 0
    with torch.no_grad():
        for raw_batch in loader:
            batch = {key: value.to(device) for key, value in normalize_lm_batch(raw_batch).items()}
            labels = batch["labels"]
            # Causal-LM labels are scored from the previous position, so the
            # first label never counts (matches Hugging Face's internal shift).
            valid = int((labels[:, 1:] != -100).sum().item())
            if not valid:
                continue
            outputs = model(**batch) if "attention_mask" in batch else model(batch["input_ids"])
            loss = outputs.loss if hasattr(outputs, "loss") else outputs[1]
            if loss is None:
                logits = outputs.logits if hasattr(outputs, "logits") else outputs[0]
                loss, _ = causal_lm_loss(logits, labels)
            total += float(loss.item()) * valid
            tokens += valid
    return total / tokens if tokens else 0.0


def smoke_evaluate(args: argparse.Namespace, artifact: dict[str, Any], records: list[dict[str, str]], split: dict[str, Any]) -> dict[str, Any]:
    adapter_dir = Path(args.adapter_dir)
    try:
        tokenizer = CharTokenizer.from_dict(
            json.loads((adapter_dir / "tokenizer.json").read_text(encoding="utf-8"))
        )
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
        raise ValueError(f"invalid smoke tokenizer artifact in {adapter_dir}: {exc}") from exc
    cfg = GPTConfig.from_dict(artifact["base_config"])
    base_path = adapter_dir / "base_model.pt"
    base = GPT(cfg)
    base.load_state_dict(torch.load(base_path, map_location="cpu", weights_only=True))
    test_records = split["test"]
    if not test_records:
        raise ValueError("evaluation requires a non-empty independent test split; provide at least 10 records")
    loader = DataLoader(InstructionDataset(test_records, tokenizer, max_length=cfg.block_size), batch_size=2, shuffle=False, collate_fn=collate_instruction_batch)
    device = torch.device(args.device)
    base.to(device)
    before = evaluate_model(base, loader, device)
    adapted, _ = load_adapter(base, adapter_dir)
    adapted.to(device)
    after = evaluate_model(adapted, loader, device)
    adapted.eval()
    torch.manual_seed(args.seed)
    prompt_ids = tokenizer.encode(f"Instruction: {args.prompt}\nResponse:")
    input_ids = torch.tensor([prompt_ids], dtype=torch.long, device=device)
    with torch.no_grad():
        generated = cast(Any, adapted).generate(
            input_ids, max_new_tokens=args.max_new_tokens, temperature=1.0, top_k=1
        )
    completion = tokenizer.decode(generated[0].tolist())
    merge_ok = True
    probe = torch.randint(0, cfg.vocab_size, (1, min(8, cfg.block_size)), device=device)
    adapted.eval()
    with torch.no_grad():
        unmerged, _ = adapted(probe)
        for module in adapted.modules():
            if isinstance(module, LoRALinear):
                module.merge()
        merged, _ = adapted(probe)
        for module in adapted.modules():
            if isinstance(module, LoRALinear):
                module.unmerge()
    merge_ok = bool(torch.allclose(unmerged, merged, atol=1e-5))
    return {
        "format": "learning-project-lora-eval-v2",
        "smoke": True,
        "downloads_performed": False,
        "held_out_samples": len(test_records),
        "loss_before": before,
        "loss_after": after,
        "perplexity_before": math.exp(min(before, 100.0)),
        "perplexity_after": math.exp(min(after, 100.0)),
        "loss_delta": before - after,
        "merge_verified": merge_ok,
        "sample_generations": [{"prompt": args.prompt, "completion": completion}],
    }


def real_evaluate(args: argparse.Namespace, artifact: dict[str, Any], records: list[dict[str, str]], split: dict[str, Any]) -> dict[str, Any]:
    model_id = args.model or artifact.get("model_id")
    if not model_id:
        raise ValueError("real evaluation requires --model or model_id in run_artifact.json")
    bundle = load_real_model(model_id, revision=args.revision or artifact.get("revision"), local_files_only=args.local_files_only)
    try:
        peft = importlib.import_module("peft")
        PeftModel = peft.PeftModel
    except ImportError as exc:
        raise RuntimeError(
            "Real-model evaluation requires peft; install projects/lora/requirements.txt"
        ) from exc
    device = torch.device(args.device)
    base = bundle.model.to(device)
    max_length = args.max_length or int(artifact.get("max_length", 256))
    test_records = split["test"]
    if not test_records:
        raise ValueError("evaluation requires a non-empty independent test split; provide at least 10 records")
    test_rows = tokenize_instruction_records(test_records, bundle.tokenizer, max_length=max_length)
    pad_id = bundle.tokenizer.pad_token_id
    loader = DataLoader(
        TokenizedInstructionDataset(test_rows),
        batch_size=2,
        shuffle=False,
        collate_fn=lambda rows: collate_real_batch(rows, pad_id),
    )
    before = evaluate_model(base, loader, device)
    adapted: Any = PeftModel.from_pretrained(bundle.model, args.adapter_dir, is_trainable=False)
    adapted = adapted.to(device)
    after = evaluate_model(adapted, loader, device)
    prompt, _ = format_instruction(args.prompt)
    encoded = bundle.tokenizer(prompt, return_tensors="pt").to(device)
    with torch.no_grad():
        output = adapted.generate(**encoded, max_new_tokens=args.max_new_tokens, do_sample=False, pad_token_id=pad_id)
    completion = bundle.tokenizer.decode(output[0], skip_special_tokens=True)
    return {
        "format": "learning-project-lora-eval-v2",
        "smoke": False,
        "model_id": model_id,
        "held_out_samples": len(test_records),
        "loss_before": before,
        "loss_after": after,
        "perplexity_before": math.exp(min(before, 100.0)),
        "perplexity_after": math.exp(min(after, 100.0)),
        "loss_delta": before - after,
        "merge_verified": False,
        "sample_generations": [{"prompt": args.prompt, "completion": completion}],
        "merge_note": "PEFT merge is intentionally not performed during evaluation; use the adapter's documented PEFT merge flow after preserving the unmerged checkpoint.",
    }


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        if args.max_new_tokens < 1:
            raise ValueError("--max-new-tokens must be positive")
        if args.device == "cuda" and not torch.cuda.is_available():
            raise ValueError("--device cuda requested but CUDA is unavailable")
        adapter_dir = Path(args.adapter_dir)
        artifact = json.loads((adapter_dir / "run_artifact.json").read_text(encoding="utf-8"))
        records = load_instruction_records(args.data_path)
        split = split_instruction_dataset(records, seed=args.seed)
        result = smoke_evaluate(args, artifact, records, split) if artifact.get("smoke") else real_evaluate(args, artifact, records, split)
        if args.output_json:
            output = Path(args.output_json)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, RuntimeError, ValueError, ImportError, AssertionError) as exc:
        print(f"lora evaluate error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
