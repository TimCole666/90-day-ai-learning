#!/usr/bin/env python3
"""Train a real open causal language model with LoRA, or run local smoke mode.

Real mode uses Hugging Face Transformers plus PEFT and requires an explicit
``--model`` identifier or local path.  ``--smoke`` is deliberately separate:
it uses random local weights, downloads nothing, and verifies mechanics only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import DataLoader

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if __package__ in {None, ""}:
    sys.path.insert(0, str(PROJECT_ROOT))
    from projects.lora.data import load_instruction_records, split_instruction_dataset
    from projects.lora.real import (
        TokenizedInstructionDataset,
        apply_real_lora,
        assert_frozen_unchanged,
        collate_real_batch,
        load_real_model,
        real_parameter_snapshot,
        tokenize_instruction_records,
    )
    from projects.lora.smoke import run_smoke
    from projects.lora.telemetry import TelemetryLog
else:
    from .data import load_instruction_records, split_instruction_dataset
    from .real import (
        TokenizedInstructionDataset,
        apply_real_lora,
        assert_frozen_unchanged,
        collate_real_batch,
        load_real_model,
        real_parameter_snapshot,
        tokenize_instruction_records,
    )
    from .smoke import run_smoke
    from .telemetry import TelemetryLog


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-path", required=True, help="JSONL instruction/response data")
    parser.add_argument("--work-dir", required=True, help="Output adapter directory")
    parser.add_argument("--model", default=None, help="Hugging Face model id or local model directory for real mode")
    parser.add_argument("--base-model", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--revision", default=None, help="Optional immutable Hugging Face revision")
    parser.add_argument("--local-files-only", action="store_true", help="Forbid provider downloads in real mode")
    parser.add_argument("--r", type=int, default=8, help="LoRA rank (default: 8)")
    parser.add_argument("--lora-alpha", type=float, default=16.0, help="LoRA alpha (default: 16)")
    parser.add_argument("--lora-dropout", type=float, default=0.05, help="LoRA dropout (default: 0.05)")
    parser.add_argument("--target-modules", default=None, help="Comma-separated target modules (real default: q_proj,v_proj; smoke default: c_attn,c_proj)")
    parser.add_argument("--max-iters", type=int, default=10, help="Maximum optimizer steps")
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--smoke", action="store_true", help="Use random weights and no downloads")
    parser.add_argument("--resume", action="store_true", help="Continue a compatible prior run")
    return parser.parse_args(argv)


def validate_args(args: argparse.Namespace) -> None:
    if args.r <= 0:
        raise ValueError("--r must be positive")
    if args.lora_alpha <= 0:
        raise ValueError("--lora-alpha must be positive")
    if not 0 <= args.lora_dropout < 1:
        raise ValueError("--lora-dropout must be in [0, 1)")
    if args.max_iters <= 0 or args.batch_size <= 0 or args.max_length <= 0:
        raise ValueError("--max-iters, --batch-size, and --max-length must be positive")
    if args.resume and not args.smoke:
        raise ValueError("real-model resume is not supported yet; start a new --work-dir")
    if args.device == "cuda" and not torch.cuda.is_available():
        raise ValueError("--device cuda requested but CUDA is unavailable")
    if not args.smoke and not args.model:
        raise ValueError("real mode requires --model; use --smoke for the no-download verification")
    args.target_module_list = [m.strip() for m in (args.target_modules or ("c_attn,c_proj" if args.smoke else "q_proj,v_proj")).split(",") if m.strip()]


def set_seed(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)


def sha256_json(records: list[dict[str, str]]) -> str:
    payload = "\n".join(json.dumps(record, sort_keys=True, ensure_ascii=False) for record in records)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def evaluate_real(model: Any, loader: DataLoader, device: torch.device) -> float:
    model.eval()
    total, tokens = 0.0, 0
    with torch.no_grad():
        for batch in loader:
            batch = {key: value.to(device) for key, value in batch.items()}
            outputs = model(**batch)
            labels = batch["labels"]
            valid = int((labels != -100).sum().item())
            if valid:
                total += float(outputs.loss.item()) * valid
                tokens += valid
    model.train()
    return total / tokens if tokens else 0.0


def train_real(args: argparse.Namespace, records: list[dict[str, str]], split: dict[str, Any]) -> dict[str, Any]:
    set_seed(args.seed)
    bundle = load_real_model(args.model, revision=args.revision, local_files_only=args.local_files_only)
    model, ledger = apply_real_lora(
        bundle.model,
        rank=args.r,
        alpha=args.lora_alpha,
        dropout=args.lora_dropout,
        target_modules=args.target_module_list,
    )
    model.to(args.device)
    snapshot = real_parameter_snapshot(model)
    work_dir = Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    bundle.tokenizer.save_pretrained(work_dir)

    train_rows = tokenize_instruction_records(split["train"], bundle.tokenizer, max_length=args.max_length)
    val_rows = tokenize_instruction_records(split["val"] or split["train"], bundle.tokenizer, max_length=args.max_length)
    pad_id = bundle.tokenizer.pad_token_id
    if pad_id is None:
        raise ValueError("tokenizer has no pad token after loading")
    train_dataset = TokenizedInstructionDataset(train_rows)
    val_dataset = TokenizedInstructionDataset(val_rows)
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=False, collate_fn=lambda rows: collate_real_batch(rows, pad_id))
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, collate_fn=lambda rows: collate_real_batch(rows, pad_id))
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=args.learning_rate)
    before_train = evaluate_real(model, train_loader, torch.device(args.device))
    before_val = evaluate_real(model, val_loader, torch.device(args.device))

    model.train()
    losses: list[float] = []
    iterator = iter(train_loader)
    # Real mode has no resume, so every run starts a fresh telemetry log.
    with TelemetryLog(work_dir, mode="real", append=False) as telemetry:
        for step in range(1, args.max_iters + 1):
            try:
                batch = next(iterator)
            except StopIteration:
                iterator = iter(train_loader)
                batch = next(iterator)
            batch = {key: value.to(args.device) for key, value in batch.items()}
            optimizer.zero_grad(set_to_none=True)
            outputs = model(**batch)
            if outputs.loss is None or not torch.isfinite(outputs.loss):
                raise ValueError("real-model loss was non-finite")
            outputs.loss.backward()
            for name, parameter in model.named_parameters():
                if parameter.requires_grad and parameter.grad is None:
                    raise AssertionError(f"trainable adapter {name} has no gradient")
                if not parameter.requires_grad and parameter.grad is not None:
                    raise AssertionError(f"frozen base parameter {name} received a gradient")
            optimizer.step()
            losses.append(float(outputs.loss.item()))
            telemetry.log_step(step=step, train_loss=losses[-1], lr=optimizer.param_groups[0]["lr"])
    assert_frozen_unchanged(model, snapshot)
    after_train = evaluate_real(model, train_loader, torch.device(args.device))
    after_val = evaluate_real(model, val_loader, torch.device(args.device))
    model.save_pretrained(work_dir)

    artifact = {
        "format": "learning-project-lora-real-v1",
        "smoke": False,
        "model_id": args.model,
        "revision": args.revision,
        "provider_downloads_allowed": not args.local_files_only,
        "data_hash": split["data_hash"],
        "split_summary": split["split_summary"],
        "seed": args.seed,
        "max_length": args.max_length,
        "completed_iters": args.max_iters,
        "parameter_ledger": ledger,
        "train_loss_before": before_train,
        "train_loss_after": after_train,
        "val_loss_before": before_val,
        "val_loss_after": after_val,
        "step_losses": losses,
        "truthful_scope_disclaimer": "This artifact records an actual Transformers + PEFT adapter run. Quality claims require independent held-out evaluation and model/data rights review.",
    }
    (work_dir / "run_artifact.json").write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    return artifact


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        validate_args(args)
        records = load_instruction_records(args.data_path)
        split = split_instruction_dataset(records, seed=args.seed)
        if args.smoke:
            artifact = run_smoke(
                records=records, split=split, work_dir=Path(args.work_dir), seed=args.seed,
                rank=args.r, alpha=args.lora_alpha, dropout=args.lora_dropout,
                target_modules=args.target_module_list,
                max_iters=args.max_iters, batch_size=args.batch_size, learning_rate=args.learning_rate,
                resume=args.resume, max_length=args.max_length,
            )
        else:
            artifact = train_real(args, records, split)
        print(json.dumps({"status": "ok", "smoke": artifact["smoke"], "work_dir": args.work_dir}))
        return 0
    except (OSError, RuntimeError, ValueError, ImportError, AssertionError) as exc:
        print(f"lora train error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
