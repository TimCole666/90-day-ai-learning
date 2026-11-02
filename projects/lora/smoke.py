"""Deterministic, no-download LoRA verification model.

This is intentionally a smoke fixture, not a claim that the fixture is an
open pretrained model.  Real training is implemented in ``real.py`` with
Transformers + PEFT; this path exists to verify the project contract on CPU.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import DataLoader

from projects.lora.data import (
    CharTokenizer,
    InstructionDataset,
    build_instruction_tokens,
    causal_lm_loss,
    collate_instruction_batch,
    normalize_lm_batch,
)
from projects.lora.model import apply_lora, load_adapter, save_adapter
from projects.lora.telemetry import TelemetryLog
from projects.pretrain.model import GPT, GPTConfig


def seed_everything(seed: int) -> None:
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)


def evaluate(model: torch.nn.Module, loader: DataLoader, device: torch.device) -> float:
    model.eval()
    total, count = 0.0, 0
    with torch.no_grad():
        for raw_batch in loader:
            batch = normalize_lm_batch(raw_batch)
            inputs = batch["input_ids"].to(device)
            targets = batch["labels"].to(device)
            logits, _ = model(inputs)
            loss_sum, valid = causal_lm_loss(logits, targets, reduction="sum")
            if valid == 0:
                continue
            total += float(loss_sum.item())
            count += valid
    model.train()
    return total / count if count else 0.0


def _make_loader(records: list[dict[str, str]], tokenizer: CharTokenizer, max_length: int, batch_size: int, *, shuffle: bool, seed: int) -> DataLoader:
    generator = torch.Generator()
    generator.manual_seed(seed)
    return DataLoader(
        InstructionDataset(records, tokenizer, max_length=max_length),
        batch_size=batch_size,
        shuffle=shuffle,
        generator=generator,
        collate_fn=collate_instruction_batch,
    )


def run_smoke(
    *,
    records: list[dict[str, str]],
    split: dict[str, Any],
    work_dir: Path,
    seed: int,
    rank: int,
    alpha: float,
    dropout: float,
    target_modules: list[str],
    max_iters: int,
    batch_size: int,
    learning_rate: float,
    resume: bool,
    max_length: int = 96,
) -> dict[str, Any]:
    """Run a deterministic random-weight verification without any downloads."""
    if max_iters < 1:
        raise ValueError("--max-iters must be positive")
    if not split["train"]:
        raise ValueError("training split is empty; provide at least two records")

    seed_everything(seed)
    tokenizer = CharTokenizer("".join(r["instruction"] + r["response"] for r in records))
    for index, record in enumerate(records, 1):
        _, labels = build_instruction_tokens(
            record["instruction"], record["response"], tokenizer, max_length
        )
        if not any(label != -100 for label in labels):
            raise ValueError(
                f"Record {index} has no response tokens after max_length={max_length}; "
                "increase --max-length"
            )

    work_dir.mkdir(parents=True, exist_ok=True)
    train_loader = _make_loader(split["train"], tokenizer, max_length, batch_size, shuffle=True, seed=seed)
    val_loader = _make_loader(split["val"] or split["train"], tokenizer, max_length, batch_size, shuffle=False, seed=seed)
    config = GPTConfig(
        block_size=max_length,
        vocab_size=tokenizer.vocab_size,
        n_layer=2,
        n_head=2,
        n_embd=32,
        dropout=0.0,
        bias=False,
    )
    base = GPT(config)
    # Keep an immutable copy so resume validation can happen before any existing
    # run artifacts are replaced.
    base_state = {name: tensor.detach().clone() for name, tensor in base.state_dict().items()}
    base_checkpoint = work_dir / "base_model.pt"
    model, ledger = apply_lora(base, target_modules=target_modules, r=rank, lora_alpha=alpha, lora_dropout=dropout)

    completed_before = 0
    if resume:
        artifact_path = work_dir / "run_artifact.json"
        if not artifact_path.exists():
            raise ValueError("--resume requires a completed run_artifact.json in --work-dir")
        try:
            metadata = json.loads(artifact_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"cannot read resume artifact: {exc}") from exc
        if not isinstance(metadata, dict):
            raise ValueError("resume artifact must be an object")
        if metadata.get("seed") != seed or metadata.get("data_hash") != split["data_hash"]:
            raise ValueError("resume configuration does not match seed or data hash")
        resume_base = GPT(config)
        resume_base.load_state_dict(base_state)
        model, loaded = load_adapter(resume_base, work_dir)
        if loaded.get("base_config") != config.to_dict():
            raise ValueError("resume base model configuration does not match")
        requested_adapter = {
            "r": rank, "lora_alpha": alpha, "lora_dropout": dropout,
            "target_modules": target_modules,
        }
        mismatched = [
            name for name, value in requested_adapter.items()
            if loaded.get(name, 0.0 if name == "lora_dropout" else None) != value
        ]
        if mismatched:
            raise ValueError(
                "resume adapter configuration does not match: " + ", ".join(mismatched)
            )
        completed_before = int(metadata.get("completed_iters", 0))

    # Only write or replace run inputs after all resume checks have succeeded.
    with (work_dir / "tokenizer.json").open("w", encoding="utf-8") as handle:
        json.dump(tokenizer.to_dict(), handle, indent=2, ensure_ascii=False)
    torch.save(base_state, base_checkpoint)

    device = torch.device("cpu")
    model.to(device)
    frozen_before = {name: p.detach().clone() for name, p in model.named_parameters() if not p.requires_grad}
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=learning_rate)
    initial_loss = evaluate(model, train_loader, device)
    initial_val = evaluate(model, val_loader, device)
    losses: list[float] = []
    iterator = iter(train_loader)
    model.train()
    with TelemetryLog(work_dir, mode="smoke", append=resume) as telemetry:
        for step in range(completed_before + 1, completed_before + max_iters + 1):
            try:
                raw_batch = next(iterator)
            except StopIteration:
                iterator = iter(train_loader)
                raw_batch = next(iterator)
            batch = normalize_lm_batch(raw_batch)
            inputs = batch["input_ids"].to(device)
            targets = batch["labels"].to(device)
            optimizer.zero_grad(set_to_none=True)
            logits, _ = model(inputs)
            loss, _ = causal_lm_loss(logits, targets)
            if not torch.isfinite(loss):
                raise ValueError("non-finite smoke loss")
            loss.backward()
            for name, parameter in model.named_parameters():
                if parameter.requires_grad and parameter.grad is None:
                    raise AssertionError(f"adapter parameter {name} did not receive a gradient")
                if not parameter.requires_grad and parameter.grad is not None:
                    raise AssertionError(f"frozen parameter {name} received a gradient")
            optimizer.step()
            losses.append(float(loss.item()))
            telemetry.log_step(step=step, train_loss=losses[-1], lr=optimizer.param_groups[0]["lr"])

    for name, parameter in model.named_parameters():
        if not parameter.requires_grad and not torch.equal(parameter.detach(), frozen_before[name]):
            raise AssertionError(f"frozen parameter {name} changed")

    final_loss = evaluate(model, train_loader, device)
    final_val = evaluate(model, val_loader, device)
    save_adapter(model, work_dir, config.to_dict(), {
        "r": rank, "lora_alpha": alpha, "lora_dropout": dropout,
        "target_modules": target_modules, "parameter_ledger": ledger,
    })
    reload_base = GPT(config)
    reload_base.load_state_dict(torch.load(base_checkpoint, map_location="cpu", weights_only=True))
    restored, _ = load_adapter(reload_base, work_dir)
    model.eval()
    restored.eval()
    probe = torch.randint(0, config.vocab_size, (1, min(8, config.block_size)))
    with torch.no_grad():
        expected_logits, _ = model(probe)
        restored_logits, _ = restored(probe)
    adapter_round_trip_verified = bool(torch.allclose(expected_logits, restored_logits, atol=1e-6, rtol=1e-5))
    if not adapter_round_trip_verified:
        raise AssertionError("reloaded smoke adapter predictions do not match the trained adapter")
    model.train()
    artifact = {
        "format": "learning-project-lora-smoke-v2",
        "smoke": True,
        "downloads_performed": False,
        "base_model_kind": "random-weight-local-verification-transformer",
        "data_hash": split["data_hash"],
        "split_summary": split["split_summary"],
        "seed": seed,
        "r": rank,
        "lora_alpha": alpha,
        "target_modules": target_modules,
        "parameter_ledger": ledger,
        "completed_iters": completed_before + max_iters,
        "adapter_round_trip_verified": adapter_round_trip_verified,
        "train_loss_before": initial_loss,
        "train_loss_after": final_loss,
        "val_loss_before": initial_val,
        "val_loss_after": final_val,
        "step_losses": losses,
        "base_config": config.to_dict(),
        "base_model_path": str(base_checkpoint),
        "truthful_scope_disclaimer": (
            "Smoke mode uses random local weights and proves the adapter contract only. "
            "It is not evidence of quality or a pretrained open-model result."
        ),
    }
    (work_dir / "run_artifact.json").write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    return artifact
