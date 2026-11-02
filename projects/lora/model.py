#!/usr/bin/env python3
"""
projects/lora/model.py
======================
LoRA (Low-Rank Adaptation) linear layer and adapter injection for PyTorch models.
Implements the forward equation:
    h = W_0 x + (alpha / r) * B A x
where W_0 is the frozen base weight, A is initialized with Kaiming uniform,
and B is initialized to 0, ensuring identity output at step 0.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


class LoRALinear(nn.Module):
    """Linear layer with frozen base weight and trainable low-rank adapter matrices."""

    def __init__(
        self,
        in_features: int,
        out_features: int,
        r: int = 4,
        lora_alpha: float = 8.0,
        lora_dropout: float = 0.0,
        bias: bool = True,
    ) -> None:
        super().__init__()
        if in_features <= 0 or out_features <= 0:
            raise ValueError(f"Features must be positive, got in={in_features}, out={out_features}")
        if r <= 0:
            raise ValueError(f"LoRA rank r must be positive, got {r}")
        if lora_alpha <= 0:
            raise ValueError(f"LoRA alpha must be positive, got {lora_alpha}")

        self.in_features = in_features
        self.out_features = out_features
        self.r = r
        self.lora_alpha = float(lora_alpha)
        self.scaling = self.lora_alpha / float(self.r)

        # Frozen base weights
        self.weight = nn.Parameter(
            torch.empty(out_features, in_features), requires_grad=False
        )
        self.bias = (
            nn.Parameter(torch.empty(out_features), requires_grad=False)
            if bias
            else None
        )

        # Trainable low-rank adapter matrices:
        # A maps from in_features -> r
        # B maps from r -> out_features
        self.lora_A = nn.Parameter(torch.empty(r, in_features), requires_grad=True)
        self.lora_B = nn.Parameter(torch.empty(out_features, r), requires_grad=True)

        self.lora_dropout = nn.Dropout(p=lora_dropout) if lora_dropout > 0.0 else nn.Identity()
        self.merged = False
        self.reset_parameters()

    def reset_parameters(self) -> None:
        """Initialize base weights and LoRA matrices."""
        nn.init.kaiming_uniform_(self.weight, a=math.sqrt(5))
        if self.bias is not None:
            bound = 1 / math.sqrt(self.in_features) if self.in_features > 0 else 0
            nn.init.uniform_(self.bias, -bound, bound)

        # LoRA initialization: A is Kaiming uniform, B is zero
        # This guarantees delta_W = (alpha/r) * B @ A = 0 at start of fine-tuning!
        nn.init.kaiming_uniform_(self.lora_A, a=math.sqrt(5))
        nn.init.zeros_(self.lora_B)

    def get_extra_state(self) -> Dict[str, Any]:
        return {"merged": self.merged}

    def set_extra_state(self, state: Dict[str, Any]) -> None:
        if not isinstance(state, dict) or "merged" not in state:
            raise ValueError("Extra state must be a dict containing 'merged'")
        self.merged = bool(state["merged"])

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        base_out = F.linear(x, self.weight, self.bias)
        if self.merged:
            return base_out
        # Adapter output: (x @ A.T) @ B.T * scaling
        adapter_out = (self.lora_dropout(x) @ self.lora_A.t()) @ self.lora_B.t() * self.scaling
        return base_out + adapter_out

    @torch.no_grad()
    def merge(self) -> None:
        """Fold adapter update into base weight: W = W + (alpha / r) * (B @ A)."""
        if not self.merged:
            delta_w = (self.lora_B @ self.lora_A) * self.scaling
            self.weight.data.add_(delta_w)
            self.merged = True

    @torch.no_grad()
    def unmerge(self) -> None:
        """Subtract adapter update from base weight: W = W - (alpha / r) * (B @ A)."""
        if self.merged:
            delta_w = (self.lora_B @ self.lora_A) * self.scaling
            self.weight.data.sub_(delta_w)
            self.merged = False


def _replace_module_with_lora(
    parent: nn.Module,
    child_name: str,
    target_modules: List[str],
    r: int,
    lora_alpha: float,
    lora_dropout: float,
    adapted_count: List[int],
) -> None:
    child = getattr(parent, child_name)
    if isinstance(child, nn.Linear) and any(t == child_name or child_name.endswith(f".{t}") for t in target_modules):
        # Create LoRALinear with identical shape and copy frozen weights
        lora_layer = LoRALinear(
            in_features=child.in_features,
            out_features=child.out_features,
            r=r,
            lora_alpha=lora_alpha,
            lora_dropout=lora_dropout,
            bias=(child.bias is not None),
        )
        lora_layer.weight.data.copy_(child.weight.data)
        if child.bias is not None and lora_layer.bias is not None:
            lora_layer.bias.data.copy_(child.bias.data)

        setattr(parent, child_name, lora_layer)
        adapted_count[0] += 1
    else:
        for name, subchild in child.named_children():
            _replace_module_with_lora(
                child, name, target_modules, r, lora_alpha, lora_dropout, adapted_count
            )


def apply_lora(
    model: nn.Module,
    target_modules: Optional[List[str]] = None,
    r: int = 4,
    lora_alpha: float = 8.0,
    lora_dropout: float = 0.0,
) -> Tuple[nn.Module, Dict[str, Any]]:
    """
    Freeze all base parameters in model and inject LoRALinear into specified target modules.
    Returns the adapted model and a comprehensive parameter accounting ledger.
    """
    if target_modules is None:
        target_modules = ["c_attn", "c_proj"]

    # 1. Freeze entire base model
    for param in model.parameters():
        param.requires_grad = False

    # 2. Inject LoRALinear recursively
    adapted_count = [0]
    for name, child in model.named_children():
        _replace_module_with_lora(
            model, name, target_modules, r, lora_alpha, lora_dropout, adapted_count
        )

    # 3. Compute parameter accounting ledger
    base_params = 0
    adapter_params = 0
    for name, param in model.named_parameters():
        if "lora_A" in name or "lora_B" in name:
            param.requires_grad = True
            adapter_params += param.numel()
        else:
            param.requires_grad = False
            base_params += param.numel()

    total_params = base_params + adapter_params
    trainable_pct = (adapter_params / total_params * 100.0) if total_params > 0 else 0.0

    ledger = {
        "base_parameters": base_params,
        "adapter_parameters": adapter_params,
        "total_parameters": total_params,
        "trainable_percentage": round(trainable_pct, 4),
        "target_modules": target_modules,
        "adapted_module_count": adapted_count[0],
        "r": r,
        "lora_alpha": lora_alpha,
        "scaling": lora_alpha / r,
    }

    return model, ledger


def save_adapter(
    model: nn.Module,
    save_dir: Path | str,
    base_config: Dict[str, Any],
    lora_config: Dict[str, Any],
) -> None:
    """
    Save adapter weights and configuration independently of base model.
    Saves adapter_model.pt (only trainable adapter parameters) and adapter_config.json.
    """
    save_path = Path(save_dir)
    save_path.mkdir(parents=True, exist_ok=True)

    # Extract adapter state dict
    adapter_state_dict = {}
    for name, param in model.named_parameters():
        if "lora_A" in name or "lora_B" in name:
            adapter_state_dict[name] = param.data.cpu()

    # Save weights
    weights_path = save_path / "adapter_model.pt"
    torch.save(adapter_state_dict, weights_path)

    # Save metadata & config
    config_data = {
        "format": "learning-project-lora-v1",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "torch_version": torch.__version__,
        "base_config": base_config,
        "r": lora_config.get("r", 4),
        "lora_alpha": lora_config.get("lora_alpha", 8.0),
        "lora_dropout": lora_config.get("lora_dropout", 0.0),
        "target_modules": lora_config.get("target_modules", ["c_attn", "c_proj"]),
        "parameter_ledger": lora_config.get("parameter_ledger", {}),
    }

    config_path = save_path / "adapter_config.json"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=2)


def load_adapter(
    base_model: nn.Module, adapter_dir: Path | str
) -> Tuple[nn.Module, Dict[str, Any]]:
    """
    Load adapter weights and configuration onto a clean base model.
    Attaches LoRA layers according to adapter_config.json and loads adapter_model.pt.
    """
    adapter_path = Path(adapter_dir)
    config_file = adapter_path / "adapter_config.json"
    weights_file = adapter_path / "adapter_model.pt"

    if not config_file.exists():
        raise FileNotFoundError(f"Missing adapter config: {config_file}")
    if not weights_file.exists():
        raise FileNotFoundError(f"Missing adapter weights: {weights_file}")

    with open(config_file, "r", encoding="utf-8") as f:
        config = json.load(f)

    r = config["r"]
    lora_alpha = config["lora_alpha"]
    lora_dropout = config.get("lora_dropout", 0.0)
    target_modules = config.get("target_modules", ["c_attn", "c_proj"])

    # Inject LoRA into base model
    model, _ = apply_lora(
        model=base_model,
        target_modules=target_modules,
        r=r,
        lora_alpha=lora_alpha,
        lora_dropout=lora_dropout,
    )

    # Load adapter weights
    adapter_state = torch.load(weights_file, map_location="cpu", weights_only=True)
    incompatible = model.load_state_dict(adapter_state, strict=False)

    # Verify that no adapter weights were missing
    missing_adapters = [k for k in incompatible.missing_keys if "lora_" in k]
    if missing_adapters:
        raise ValueError(f"Failed to load adapter weights; missing keys: {missing_adapters}")
    # Saved adapter tensors with no matching layer would otherwise be dropped silently.
    unexpected_adapters = [k for k in incompatible.unexpected_keys if "lora_" in k]
    if unexpected_adapters:
        raise ValueError(
            "Failed to load adapter weights; unexpected keys with no matching layer "
            f"in the base model: {unexpected_adapters}"
        )

    return model, config
