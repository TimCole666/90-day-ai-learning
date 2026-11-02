"""Real open-model LoRA helpers.

This module deliberately imports Transformers and PEFT lazily.  The local
``--smoke`` path is dependency-light and never reaches this module's model
loader; a real run must make its model/provider choice explicit.
"""

from __future__ import annotations

import importlib
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import torch


@dataclass
class RealModelBundle:
    model: Any
    tokenizer: Any
    model_id: str
    revision: str | None


def load_real_model(
    model_id: str,
    *,
    revision: str | None = None,
    local_files_only: bool = False,
    torch_dtype: str = "auto",
) -> RealModelBundle:
    """Load a Hugging Face causal LM and tokenizer.

    No implicit default model is used.  ``local_files_only`` is exposed so a
    learner can prove that a run used an already-authorized local cache.
    """
    try:
        transformers = importlib.import_module("transformers")
        AutoModelForCausalLM = transformers.AutoModelForCausalLM
        AutoTokenizer = transformers.AutoTokenizer
    except ImportError as exc:
        raise RuntimeError(
            "Real-model mode requires transformers; install projects/lora/requirements.txt"
        ) from exc

    kwargs: dict[str, Any] = {"local_files_only": local_files_only}
    if revision:
        kwargs["revision"] = revision
    if torch_dtype != "auto":
        dtype = getattr(torch, torch_dtype, None)
        if dtype is None:
            raise ValueError(f"Unsupported torch dtype: {torch_dtype}")
        kwargs["torch_dtype"] = dtype

    tokenizer = AutoTokenizer.from_pretrained(model_id, **kwargs)
    if tokenizer.pad_token_id is None:
        if tokenizer.eos_token_id is None:
            tokenizer.add_special_tokens({"pad_token": "<|pad|>"})
        else:
            tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(model_id, **kwargs)
    if len(tokenizer) > model.get_input_embeddings().num_embeddings:
        model.resize_token_embeddings(len(tokenizer))
    return RealModelBundle(
        model=model, tokenizer=tokenizer, model_id=model_id, revision=revision
    )


def apply_real_lora(
    model: Any,
    *,
    rank: int,
    alpha: float,
    dropout: float,
    target_modules: Sequence[str],
) -> tuple[Any, dict[str, Any]]:
    """Attach PEFT's LoRA adapter to a real Transformers causal LM."""
    try:
        peft = importlib.import_module("peft")
        LoraConfig = peft.LoraConfig
        TaskType = peft.TaskType
        get_peft_model = peft.get_peft_model
    except ImportError as exc:
        raise RuntimeError(
            "Real-model mode requires peft; install projects/lora/requirements.txt"
        ) from exc

    if not target_modules:
        raise ValueError("At least one real model target module is required")
    config = LoraConfig(
        r=rank,
        lora_alpha=alpha,
        lora_dropout=dropout,
        target_modules=list(target_modules),
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )
    adapted = get_peft_model(model, config)
    trainable = sum(p.numel() for p in adapted.parameters() if p.requires_grad)
    total = sum(p.numel() for p in adapted.parameters())
    ledger = {
        "base_parameters": total - trainable,
        "adapter_parameters": trainable,
        "total_parameters": total,
        "trainable_percentage": round(100.0 * trainable / total, 6) if total else 0.0,
        "target_modules": list(target_modules),
        "r": rank,
        "lora_alpha": alpha,
        "scaling": alpha / rank,
        "implementation": "peft",
    }
    return adapted, ledger


def format_instruction(
    instruction: str, response: str | None = None
) -> tuple[str, str]:
    """Return the stable prompt and optionally completed example text."""
    prompt = f"### Instruction:\n{instruction}\n### Response:\n"
    return prompt, prompt + response if response is not None else prompt


def tokenize_instruction_records(
    records: Sequence[dict[str, str]],
    tokenizer: Any,
    *,
    max_length: int,
) -> list[dict[str, list[int]]]:
    """Tokenize records and mask prompt positions in labels with -100."""
    rows: list[dict[str, list[int]]] = []
    for number, record in enumerate(records, 1):
        prompt, completed = format_instruction(
            record["instruction"], record["response"]
        )
        encoded = tokenizer(
            completed,
            add_special_tokens=True,
            truncation=True,
            max_length=max_length,
            return_attention_mask=True,
        )
        # Encode the prompt the same way as the full text so a tokenizer-added
        # BOS is counted, then mask only the leading tokens both encodings
        # share (a trailing EOS on the prompt alone is not shared).
        prompt_ids = tokenizer(prompt, add_special_tokens=True)["input_ids"]
        input_ids = list(encoded["input_ids"])
        shared = 0
        for prompt_id, input_id in zip(prompt_ids, input_ids):
            if prompt_id != input_id:
                break
            shared += 1
        labels = [-100] * shared
        labels.extend(input_ids[len(labels) :])
        if not any(label != -100 for label in labels):
            raise ValueError(
                f"Record {number} has no response tokens after max_length={max_length}; "
                "increase --max-length"
            )
        rows.append(
            {
                "input_ids": input_ids,
                "attention_mask": list(encoded["attention_mask"]),
                "labels": labels,
            }
        )
    return rows


class TokenizedInstructionDataset(torch.utils.data.Dataset[dict[str, list[int]]]):
    """Expose pre-tokenized records through PyTorch's Dataset contract."""

    def __init__(self, rows: Sequence[dict[str, list[int]]]) -> None:
        self.rows = list(rows)

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> dict[str, list[int]]:
        return self.rows[index]


def collate_real_batch(
    rows: Sequence[dict[str, list[int]]], pad_id: int
) -> dict[str, torch.Tensor]:
    """Pad a batch without changing the response-loss mask."""
    width = max(len(row["input_ids"]) for row in rows)
    result: dict[str, torch.Tensor] = {}
    for key, fill in (("input_ids", pad_id), ("attention_mask", 0), ("labels", -100)):
        result[key] = torch.tensor(
            [row[key] + [fill] * (width - len(row[key])) for row in rows],
            dtype=torch.long,
        )
    return result


def real_parameter_snapshot(model: Any) -> dict[str, torch.Tensor]:
    """Capture frozen tensors for a post-training immutability assertion."""
    return {
        name: parameter.detach().cpu().clone()
        for name, parameter in model.named_parameters()
        if not parameter.requires_grad
    }


def assert_frozen_unchanged(model: Any, snapshot: dict[str, torch.Tensor]) -> None:
    changed = [
        name
        for name, parameter in model.named_parameters()
        if not parameter.requires_grad
        and not torch.equal(parameter.detach().cpu(), snapshot[name])
    ]
    if changed:
        raise AssertionError(f"Frozen base parameters changed: {changed[:5]}")
