"""
projects/lora/data.py
=====================
Instruction dataset loading, deterministic splitting, and loss masking.
Provides prompt template formatting with prompt token target masking (-100)
to ensure training loss and gradients are computed strictly on generated responses.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import Dataset

from projects.text_tools.core import compute_sha256, compute_splits


class CharTokenizer:
    """Deterministic character-level tokenizer for small language models."""

    def __init__(self, chars: str | None = None):
        if chars is None:
            # Standard ASCII printable + whitespace default vocabulary
            chars = "\n !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"
        # Deduplicate and sort
        self.chars = sorted(set(chars))
        self.char_to_id = {ch: i for i, ch in enumerate(self.chars)}
        self.id_to_char = dict(enumerate(self.chars))
        self.vocab_size = len(self.chars)

    def encode(self, text: str) -> list[int]:
        # Fallback to space if character unknown
        default_id = self.char_to_id.get(" ", 0)
        return [self.char_to_id.get(ch, default_id) for ch in text]

    def decode(self, token_ids: list[int]) -> str:
        return "".join(self.id_to_char.get(i, "") for i in token_ids)

    def to_dict(self) -> dict[str, Any]:
        return {"chars": "".join(self.chars), "vocab_size": self.vocab_size}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CharTokenizer:
        return cls(data["chars"])


def _read_instruction_lines(file_path: Path, display_path: Path | str) -> list[str]:
    """Read instruction data at the file-system boundary with a stable error."""
    try:
        with open(file_path, encoding="utf-8") as file_handle:
            return file_handle.readlines()
    except OSError as exc:
        raise ValueError(
            f"Unable to read instruction data file {display_path}: {exc}"
        ) from exc


def load_instruction_records(path: Path | str) -> list[dict[str, str]]:
    """
    Load instruction records from a JSONL file.
    Normalizes keys: supports ("instruction", "response"), ("prompt", "response"),
    or ("instruction", "output").
    Raises ValueError on malformed JSON or missing fields.
    """
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Instruction data file not found: {path}")

    records = []
    for line_num, line in enumerate(_read_instruction_lines(file_path, path), 1):
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as e:
            raise ValueError(f"Malformed JSON on line {line_num} in {path}: {e}") from e

        if not isinstance(item, dict):
            raise TypeError(f"Line {line_num} in {path} is not a JSON object")

        # Extract instruction/prompt
        instruction = item.get("instruction") or item.get("prompt")
        # Extract response/output
        response = item.get("response") or item.get("output")

        if instruction is None or response is None:
            raise ValueError(
                f"Line {line_num} in {path} must contain 'instruction' and 'response' fields"
            )

        records.append(
            {
                "instruction": str(instruction),
                "response": str(response),
            }
        )

    if not records:
        raise ValueError(f"Instruction file {path} contains no valid records")

    return records


def build_instruction_tokens(
    instruction: str,
    response: str,
    tokenizer: CharTokenizer,
    max_length: int = 128,
) -> tuple[list[int], list[int]]:
    """
    Build input token IDs and target token IDs with prompt loss masking.
    Prompt tokens in target_ids are assigned -100 (PyTorch ignore_index),
    ensuring cross-entropy loss is computed exclusively on the response tokens.
    """
    prompt_text = f"Instruction: {instruction}\nResponse:"
    full_text = prompt_text + response

    prompt_ids = tokenizer.encode(prompt_text)
    full_ids = tokenizer.encode(full_text)

    # Truncate to max_length if needed
    if len(full_ids) > max_length:
        full_ids = full_ids[:max_length]

    prompt_len = min(len(prompt_ids), len(full_ids))

    # Mask prompt tokens with -100
    target_ids = [-100] * prompt_len + full_ids[prompt_len:]

    return full_ids, target_ids


class InstructionDataset(Dataset):
    """PyTorch Dataset for instruction fine-tuning with prompt loss masking."""

    def __init__(
        self,
        records: list[dict[str, str]],
        tokenizer: CharTokenizer,
        max_length: int = 128,
    ):
        self.records = records
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        rec = self.records[idx]
        input_ids, target_ids = build_instruction_tokens(
            rec["instruction"], rec["response"], self.tokenizer, self.max_length
        )
        return torch.tensor(input_ids, dtype=torch.long), torch.tensor(
            target_ids, dtype=torch.long
        )


def collate_instruction_batch(
    batch: list[tuple[torch.Tensor, torch.Tensor]],
    pad_id: int = 0,
    ignore_index: int = -100,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Pad batch sequences to equal length and return ``(inputs, targets)``."""
    if not batch:
        raise ValueError("cannot collate an empty instruction batch")
    max_len = max(len(x[0]) for x in batch)

    padded_inputs = []
    padded_targets = []

    for inp, tgt in batch:
        pad_len = max_len - len(inp)
        if pad_len > 0:
            padded_inputs.append(
                torch.cat([inp, torch.full((pad_len,), pad_id, dtype=torch.long)])
            )
            padded_targets.append(
                torch.cat([tgt, torch.full((pad_len,), ignore_index, dtype=torch.long)])
            )
        else:
            padded_inputs.append(inp)
            padded_targets.append(tgt)

    return torch.stack(padded_inputs), torch.stack(padded_targets)


def causal_lm_loss(
    logits: torch.Tensor, labels: torch.Tensor, reduction: str = "mean"
) -> tuple[torch.Tensor, int]:
    """Next-token cross-entropy for unshifted causal-LM labels.

    Labels use the Hugging Face convention (aligned with ``input_ids``), so the
    logits at position t are scored against the label at position t + 1.
    Returns ``(loss, number_of_scored_tokens)``.
    """
    shift_logits = logits[:, :-1, :]
    shift_labels = labels[:, 1:]
    valid = int((shift_labels != -100).sum().item())
    loss = torch.nn.functional.cross_entropy(
        shift_logits.reshape(-1, shift_logits.size(-1)),
        shift_labels.reshape(-1),
        ignore_index=-100,
        reduction=reduction,
    )
    return loss, valid


def normalize_lm_batch(batch: Any) -> dict[str, torch.Tensor]:
    """Normalize mapping or legacy tuple batches to the model-input contract.

    Smoke data historically yielded ``(input_ids, labels)`` tuples while real
    Transformers data yields mappings. Keeping this boundary explicit prevents
    callers from accidentally treating a tuple as a mapping.
    """
    if isinstance(batch, Mapping):
        required = {"input_ids", "labels"}
        missing = required - set(batch)
        if missing:
            raise ValueError(f"batch is missing required keys: {sorted(missing)}")
        normalized = {
            key: value
            for key, value in batch.items()
            if isinstance(value, torch.Tensor)
        }
        return normalized
    if (
        isinstance(batch, Sequence)
        and not isinstance(batch, (str, bytes))
        and len(batch) == 2
    ):
        input_ids, labels = batch
        if not isinstance(input_ids, torch.Tensor) or not isinstance(
            labels, torch.Tensor
        ):
            raise TypeError("tuple batches must contain input_ids and labels tensors")
        return {"input_ids": input_ids, "labels": labels}
    raise TypeError("expected a mapping batch or an (input_ids, labels) tuple")


def split_instruction_dataset(
    records: list[dict[str, str]],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    test_ratio: float = 0.1,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Split instruction records deterministically using text_tools.core.compute_splits.
    Returns partitioned record lists, split identities, and provenance SHA256.
    """
    # Serialize records as lines for deterministic hash and splitting
    lines = [json.dumps(r, sort_keys=True) for r in records]
    splits = compute_splits(
        lines=lines,
        train_ratio=train_ratio,
        val_ratio=val_ratio,
        test_ratio=test_ratio,
        seed=seed,
    )

    data_hash = compute_sha256("\n".join(lines))

    try:
        train_records = [json.loads(line) for line in splits["train_lines"]]
        val_records = [json.loads(line) for line in splits["val_lines"]]
        test_records = [json.loads(line) for line in splits["test_lines"]]
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Internal split serialization produced invalid JSON: {exc}"
        ) from exc

    return {
        "train": train_records,
        "val": val_records,
        "test": test_records,
        "data_hash": data_hash,
        "split_summary": splits["counts"],
        "seed": seed,
    }
