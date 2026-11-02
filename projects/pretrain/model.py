#!/usr/bin/env python3
"""
projects/pretrain/model.py
==========================
Resumable small-model GPT architecture with weight tying and causal masking.
Based on Karpathy's nanoGPT design, refined with explicit configuration validation,
tensor shape ledgers, and serialization helpers.
"""

import math
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class GPTConfig:
    """Hyperparameter configuration for small GPT language model."""
    block_size: int = 128     # Maximum context window length (T)
    vocab_size: int = 65      # Vocabulary size (V)
    n_layer: int = 4          # Number of Transformer blocks (L)
    n_head: int = 4           # Number of attention heads (nh)
    n_embd: int = 64          # Embedding dimension (C, where hs = C // nh)
    dropout: float = 0.1      # Dropout probability
    bias: bool = False        # Bias in Linear and LayerNorm layers

    def validate(self) -> None:
        """Validate configuration constraints and bounds."""
        if self.block_size < 1:
            raise ValueError(f"block_size must be >= 1, got {self.block_size}")
        if self.vocab_size < 1:
            raise ValueError(f"vocab_size must be >= 1, got {self.vocab_size}")
        if self.n_layer < 1:
            raise ValueError(f"n_layer must be >= 1, got {self.n_layer}")
        if self.n_head < 1:
            raise ValueError(f"n_head must be >= 1, got {self.n_head}")
        if self.n_embd < 1:
            raise ValueError(f"n_embd must be >= 1, got {self.n_embd}")
        if self.n_embd % self.n_head != 0:
            raise ValueError(
                f"n_embd ({self.n_embd}) must be divisible by n_head ({self.n_head})"
            )
        if not (0.0 <= self.dropout < 1.0):
            raise ValueError(f"dropout must be in [0.0, 1.0), got {self.dropout}")

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GPTConfig":
        valid_keys = {
            "block_size", "vocab_size", "n_layer", "n_head",
            "n_embd", "dropout", "bias"
        }
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        cfg = cls(**filtered)
        cfg.validate()
        return cfg

    def parameter_ledger(self) -> Dict[str, Any]:
        """
        Derive exact theoretical parameter counts with formulas:
        - Token Embedding (wte): V * C
        - Position Embedding (wpe): T * C
        - Per Layer:
          - Attention:
            - QKV projection: C * (3 * C) [+ 3*C bias if bias]
            - Out projection: C * C [+ C bias if bias]
            - LN1: C [+ C bias if bias]
          - MLP:
            - c_fc: C * (4 * C) [+ 4*C bias if bias]
            - c_proj: (4 * C) * C [+ C bias if bias]
            - LN2: C [+ C bias if bias]
        - Final LN (ln_f): C [+ C bias if bias]
        - LM Head: weight tied to wte (0 additional parameters)
        """
        v, t, c, l = self.vocab_size, self.block_size, self.n_embd, self.n_layer
        b = 1 if self.bias else 0

        wte_params = v * c
        wpe_params = t * c
        # LayerNorm has 2*c (weight + bias) when bias=True (elementwise_affine=True), else 0
        ln_params = (2 * c) if self.bias else 0
        attn_params_per_layer = (c * 3 * c + 3 * c * b) + (c * c + c * b) + ln_params
        mlp_params_per_layer = (c * 4 * c + 4 * c * b) + (4 * c * c + c * b) + ln_params
        layer_params = (attn_params_per_layer + mlp_params_per_layer) * l
        ln_f_params = ln_params
        total = wte_params + wpe_params + layer_params + ln_f_params

        return {
            "token_embedding": wte_params,
            "position_embedding": wpe_params,
            "attention_per_layer": attn_params_per_layer,
            "mlp_per_layer": mlp_params_per_layer,
            "all_layers": layer_params,
            "final_layernorm": ln_f_params,
            "lm_head_tied": 0,
            "total_parameters": total,
        }


class CausalSelfAttention(nn.Module):
    """Multi-head causal self-attention with fused QKV projection."""

    def __init__(self, config: GPTConfig):
        super().__init__()
        assert config.n_embd % config.n_head == 0
        self.n_head = config.n_head
        self.n_embd = config.n_embd
        self.head_dim = config.n_embd // config.n_head

        # Fused Q, K, V projection
        self.c_attn = nn.Linear(config.n_embd, 3 * config.n_embd, bias=config.bias)
        # Output projection
        self.c_proj = nn.Linear(config.n_embd, config.n_embd, bias=config.bias)
        self.attn_dropout = nn.Dropout(config.dropout)
        self.resid_dropout = nn.Dropout(config.dropout)

        # Causal lower-triangular mask
        self.register_buffer(
            "bias",
            torch.tril(torch.ones(config.block_size, config.block_size))
            .view(1, 1, config.block_size, config.block_size),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b, t, c = x.size()

        # 1. Project and split into heads: (B, T, 3*C) -> 3 x (B, nh, T, hs)
        q, k, v = self.c_attn(x).split(self.n_embd, dim=2)
        k = k.view(b, t, self.n_head, self.head_dim).transpose(1, 2)
        q = q.view(b, t, self.n_head, self.head_dim).transpose(1, 2)
        v = v.view(b, t, self.n_head, self.head_dim).transpose(1, 2)

        # 2. Scaled dot-product attention: (B, nh, T, hs) @ (B, nh, hs, T) -> (B, nh, T, T)
        att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(self.head_dim))
        # 3. Apply causal mask (future positions are masked out with -inf)
        att = att.masked_fill(self.bias[:, :, :t, :t] == 0, float("-inf"))
        att = F.softmax(att, dim=-1)
        att = self.attn_dropout(att)

        # 4. Aggregate value vectors: (B, nh, T, T) @ (B, nh, T, hs) -> (B, nh, T, hs)
        y = att @ v
        y = y.transpose(1, 2).contiguous().view(b, t, c)

        # 5. Output projection and residual dropout
        return self.resid_dropout(self.c_proj(y))


class MLP(nn.Module):
    """Feed-forward network with 4x expansion and GELU activation."""

    def __init__(self, config: GPTConfig):
        super().__init__()
        self.c_fc = nn.Linear(config.n_embd, 4 * config.n_embd, bias=config.bias)
        self.gelu = nn.GELU()
        self.c_proj = nn.Linear(4 * config.n_embd, config.n_embd, bias=config.bias)
        self.dropout = nn.Dropout(config.dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.dropout(self.c_proj(self.gelu(self.c_fc(x))))


class Block(nn.Module):
    """Pre-LayerNorm Transformer Block."""

    def __init__(self, config: GPTConfig):
        super().__init__()
        self.ln_1 = nn.LayerNorm(config.n_embd, elementwise_affine=config.bias)
        self.attn = CausalSelfAttention(config)
        self.ln_2 = nn.LayerNorm(config.n_embd, elementwise_affine=config.bias)
        self.mlp = MLP(config)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.attn(self.ln_1(x))
        x = x + self.mlp(self.ln_2(x))
        return x


class GPT(nn.Module):
    """Resumable small generative language model."""

    def __init__(self, config: GPTConfig):
        super().__init__()
        config.validate()
        self.config = config

        self.transformer = nn.ModuleDict(
            dict(
                wte=nn.Embedding(config.vocab_size, config.n_embd),
                wpe=nn.Embedding(config.block_size, config.n_embd),
                drop=nn.Dropout(config.dropout),
                h=nn.ModuleList([Block(config) for _ in range(config.n_layer)]),
                ln_f=nn.LayerNorm(config.n_embd, elementwise_affine=config.bias),
            )
        )
        self.lm_head = nn.Linear(config.n_embd, config.vocab_size, bias=False)

        # Weight tying: token embedding weights are shared with the lm_head
        self.transformer.wte.weight = self.lm_head.weight

        # Weight initialization
        self.apply(self._init_weights)

    def _init_weights(self, module: nn.Module) -> None:
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(
        self, idx: torch.Tensor, targets: Optional[torch.Tensor] = None
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        b, t = idx.size()
        if t > self.config.block_size:
            raise ValueError(
                f"Sequence length {t} exceeds maximum block_size {self.config.block_size}"
            )

        device = idx.device
        pos = torch.arange(0, t, dtype=torch.long, device=device)

        tok_emb = self.transformer.wte(idx)
        pos_emb = self.transformer.wpe(pos)
        x = self.transformer.drop(tok_emb + pos_emb)

        for block in self.transformer.h:
            x = block(x)
        x = self.transformer.ln_f(x)

        logits = self.lm_head(x)  # (B, T, vocab_size)

        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1
            )

        return logits, loss

    @torch.no_grad()
    def generate(
        self,
        idx: torch.Tensor,
        max_new_tokens: int,
        temperature: float = 1.0,
        top_k: Optional[int] = None,
    ) -> torch.Tensor:
        """Autoregressive generation given starting prompt token ids."""
        self.eval()
        for _ in range(max_new_tokens):
            idx_cond = (
                idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size :]
            )
            logits, _ = self(idx_cond)
            logits = logits[:, -1, :] / max(temperature, 1e-5)
            if top_k is not None:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = -float("Inf")
            probs = F.softmax(logits, dim=-1)
            idx_next = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, idx_next), dim=1)
        return idx
