"""
Text and Data Tools for AI Curriculum.
Provides corpus statistics, token distributions, deterministic splitting, and data artifact generation.
"""

from .core import analyze_text, compute_splits, generate_artifacts

__all__ = ["analyze_text", "compute_splits", "generate_artifacts"]
