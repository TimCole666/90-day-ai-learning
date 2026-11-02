"""
projects/lora
=============
Real Open Model LoRA Fine-Tuning and Evaluation Package.
Provides low-rank adapter injection for open transformer models, frozen-base
training, adapter serialization, and held-out before/after evaluation.
"""

from importlib import import_module

__all__ = ["LoRALinear", "apply_lora", "save_adapter", "load_adapter"]


def __getattr__(name):
    if name not in __all__:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    value = getattr(import_module(".model", __name__), name)
    globals()[name] = value
    return value


def __dir__():
    return sorted(set(globals()) | set(__all__))
