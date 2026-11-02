#!/usr/bin/env python3
"""
projects/pretrain/data.py
=========================
Dataset loader, character-level tokenizer, and deterministic batch miner.
Guarantees clean train/validation split policy and data provenance tracking.
"""

import hashlib
from pathlib import Path
from typing import List, Optional, Tuple, Union

import torch


class TextCorpusDataset:
    """Character-level corpus dataset with deterministic train/validation splits."""

    def __init__(
        self,
        text: str,
        train_ratio: float = 0.9,
        data_path: Optional[str] = None,
        data_hash: Optional[str] = None,
    ):
        if not text:
            raise ValueError("Corpus text cannot be empty")
        if not (0.0 < train_ratio < 1.0):
            raise ValueError(f"train_ratio must be in (0.0, 1.0), got {train_ratio}")

        self.text = text
        self.data_path = data_path
        self.train_ratio = train_ratio
        self.data_hash = data_hash or hashlib.sha256(text.encode("utf-8")).hexdigest()

        # Vocabulary definition: sorted unique characters
        self.chars = sorted(list(set(text)))
        self.vocab_size = len(self.chars)
        self.stoi = {ch: i for i, ch in enumerate(self.chars)}
        self.itos = {i: ch for i, ch in enumerate(self.chars)}

        # Encode full corpus to tensor
        self.data = torch.tensor([self.stoi[c] for c in text], dtype=torch.long)

        # Deterministic boundary split
        split_idx = int(train_ratio * len(self.data))
        self.train_data = self.data[:split_idx]
        self.val_data = self.data[split_idx:]

        if len(self.train_data) == 0 or len(self.val_data) == 0:
            raise ValueError("Corpus too small to create both non-empty train and val splits")

    @classmethod
    def from_file(
        cls, path: Union[str, Path], train_ratio: float = 0.9
    ) -> "TextCorpusDataset":
        p = Path(path).resolve()
        if not p.exists():
            raise FileNotFoundError(f"Dataset corpus file not found: {p}")
        with open(p, "r", encoding="utf-8") as f:
            text = f.read()
        data_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return cls(
            text=text,
            train_ratio=train_ratio,
            data_path=str(p),
            data_hash=data_hash,
        )

    @classmethod
    def from_text(cls, text: str, train_ratio: float = 0.9) -> "TextCorpusDataset":
        return cls(text=text, train_ratio=train_ratio)

    def encode(self, s: str) -> List[int]:
        """Convert string to token indices."""
        return [self.stoi[c] for c in s if c in self.stoi]

    def decode(self, indices: Union[List[int], torch.Tensor]) -> str:
        """Convert token indices back to string."""
        if isinstance(indices, torch.Tensor):
            indices = indices.tolist()
        return "".join([self.itos.get(i, "") for i in indices])

    def get_batch(
        self,
        split: str,
        batch_size: int,
        block_size: int,
        device: str = "cpu",
        seed: Optional[int] = None,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Sample a batch of (x, y) sequences where y is x shifted by 1 token.
        """
        data = self.train_data if split == "train" else self.val_data
        if len(data) <= block_size:
            raise ValueError(
                f"Split '{split}' size ({len(data)}) must be greater than block_size ({block_size})"
            )

        gen = None
        if seed is not None:
            gen = torch.Generator(device="cpu")
            gen.manual_seed(seed)

        ix = torch.randint(
            len(data) - block_size,
            (batch_size,),
            generator=gen,
        )
        x = torch.stack([data[i : i + block_size] for i in ix])
        y = torch.stack([data[i + 1 : i + block_size + 1] for i in ix])
        return x.to(device), y.to(device)
