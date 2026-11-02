#!/usr/bin/env python3
"""
projects/pretrain/checkpoint.py
===============================
Atomic checkpoint saving, loading, RNG restoration, and compatibility verification.
Prevents checkpoint corruption across interruptions and catches architecture mismatches.
"""

import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import torch
import torch.nn as nn

from projects.pretrain.model import GPT, GPTConfig


@dataclass
class CheckpointState:
    """Metadata and restored state from a saved checkpoint."""
    step: int
    loss: float
    config: GPTConfig
    vocab: Optional[List[str]] = None
    data_hash: Optional[str] = None
    rng_state: Optional[Dict[str, Any]] = None


def save_checkpoint(
    ckpt_path: Union[str, Path],
    model: nn.Module,
    optimizer: Optional[torch.optim.Optimizer],
    step: int,
    loss: float,
    config: GPTConfig,
    vocab: Optional[List[str]] = None,
    data_hash: Optional[str] = None,
) -> Path:
    """
    Save training checkpoint atomically using a temporary file and atomic rename.
    Guarantees existing checkpoints are not corrupted if saving is interrupted.
    """
    path = Path(ckpt_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)

    rng_state = {
        "torch_cpu": torch.get_rng_state(),
        "python_random": random.getstate(),
    }
    if torch.cuda.is_available():
        rng_state["torch_cuda"] = torch.cuda.get_rng_state_all()

    payload = {
        "step": step,
        "loss": float(loss),
        "config_dict": config.to_dict(),
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict() if optimizer is not None else None,
        "vocab": vocab,
        "data_hash": data_hash,
        "rng_state": rng_state,
    }

    # Write to PID-specific temp file in the same directory, then atomic replace
    tmp_path = path.with_name(f"{path.name}.tmp.{os.getpid()}")
    try:
        torch.save(payload, tmp_path)
        os.replace(tmp_path, path)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass

    return path


def load_checkpoint(
    ckpt_path: Union[str, Path],
    model: Optional[GPT] = None,
    optimizer: Optional[torch.optim.Optimizer] = None,
    expected_config: Optional[GPTConfig] = None,
    device: str = "cpu",
    restore_rng: bool = True,
    expected_vocab: Optional[List[str]] = None,
) -> CheckpointState:
    """
    Load checkpoint, verify architectural compatibility, and restore weights/state.
    Raises ValueError on architectural or vocabulary incompatibilities.
    """
    path = Path(ckpt_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Checkpoint file not found: {path}")

    payload = torch.load(path, map_location=device)

    required_keys = {"step", "loss", "config_dict", "model_state_dict"}
    missing = required_keys - set(payload.keys())
    if missing:
        raise ValueError(f"Checkpoint is missing required keys: {missing}")

    saved_config = GPTConfig.from_dict(payload["config_dict"])

    # Architectural compatibility check
    if expected_config is not None:
        check_fields = ["block_size", "vocab_size", "n_layer", "n_head", "n_embd", "bias"]
        mismatches = []
        for field in check_fields:
            exp_val = getattr(expected_config, field)
            sav_val = getattr(saved_config, field)
            if exp_val != sav_val:
                mismatches.append(f"field '{field}': expected {exp_val}, got {sav_val}")
        if mismatches:
            raise ValueError(
                f"Checkpoint architecture incompatible with current configuration:\n  "
                + "\n  ".join(mismatches)
            )

    # Vocabulary check: same size but different characters would remap every token
    saved_vocab = payload.get("vocab")
    if expected_vocab is not None and saved_vocab is not None:
        if list(saved_vocab) != list(expected_vocab):
            raise ValueError(
                "Checkpoint vocabulary incompatible with current corpus: "
                f"checkpoint has {len(saved_vocab)} characters, corpus has "
                f"{len(expected_vocab)}, and the character lists differ"
            )

    # Restore model weights
    if model is not None:
        model.load_state_dict(payload["model_state_dict"])

    # Restore optimizer state
    if optimizer is not None and payload.get("optimizer_state_dict") is not None:
        optimizer.load_state_dict(payload["optimizer_state_dict"])

    # Restore RNG state
    rng_state = payload.get("rng_state")
    if restore_rng and rng_state is not None:
        if "torch_cpu" in rng_state:
            torch.set_rng_state(rng_state["torch_cpu"])
        if "python_random" in rng_state:
            random.setstate(rng_state["python_random"])
        if torch.cuda.is_available() and "torch_cuda" in rng_state:
            torch.cuda.set_rng_state_all(rng_state["torch_cuda"])

    return CheckpointState(
        step=payload["step"],
        loss=payload["loss"],
        config=saved_config,
        vocab=payload.get("vocab"),
        data_hash=payload.get("data_hash"),
        rng_state=rng_state,
    )
