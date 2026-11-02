"""
Core text and data tools functions for computing corpus statistics,
deterministic splitting, and artifact generation with provenance.
"""

from collections import Counter
import hashlib
import json
import math
import os
import platform
import random
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ARTIFACT_FILENAMES: Tuple[str, ...] = (
    "train.txt",
    "val.txt",
    "test.txt",
    "stats.json",
    "vocab.json",
    "manifest.json",
)

RATIO_SUM_TOLERANCE = 1e-5


def analyze_text(text: str) -> Dict[str, Any]:
    """
    Compute comprehensive character and token statistics for a given text.
    Handles empty text, Unicode, and repeated tokens safely.
    """
    total_chars = len(text)
    tokens = text.split()
    total_tokens = len(tokens)

    char_counts = Counter(text)
    token_counts = Counter(tokens)

    token_lengths = [len(t) for t in tokens]
    min_len = min(token_lengths) if token_lengths else 0
    max_len = max(token_lengths) if token_lengths else 0
    avg_len = (sum(token_lengths) / total_tokens) if total_tokens > 0 else 0.0

    alpha_count = sum(1 for c in text if c.isalpha())
    digit_count = sum(1 for c in text if c.isdigit())
    space_count = sum(1 for c in text if c.isspace())
    punct_count = sum(1 for c in text if unicodedata.category(c).startswith("P"))
    other_count = total_chars - (alpha_count + digit_count + space_count + punct_count)

    return {
        "total_chars": total_chars,
        "total_tokens": total_tokens,
        "vocab_size": len(token_counts),
        "char_vocab_size": len(char_counts),
        "token_frequencies": dict(token_counts.most_common()),
        "char_frequencies": dict(char_counts.most_common()),
        "min_token_length": min_len,
        "max_token_length": max_len,
        "avg_token_length": round(avg_len, 4),
        "char_distribution": {
            "alphabetic": alpha_count,
            "digits": digit_count,
            "whitespace": space_count,
            "punctuation": punct_count,
            "other": other_count,
        },
    }


def compute_sha256(content: str) -> str:
    """Compute deterministic SHA256 hex digest of string content."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def compute_splits(
    lines: List[str],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    test_ratio: float = 0.1,
    seed: int = 42,
) -> Dict[str, Any]:
    """
    Deterministically split lines into train, val, and test partitions using fixed seed.
    Guarantees reproducible ordering and verifies record-index disjointness across
    splits -- an index-overlap check only: it does not detect duplicated content or
    enforce a deduplication policy.
    """
    requested = {"train": train_ratio, "val": val_ratio, "test": test_ratio}
    for name, ratio in requested.items():
        if not math.isfinite(ratio):
            raise ValueError(f"Split ratios must be finite numbers; {name}={ratio!r}")
        if ratio < 0.0 or ratio > 1.0:
            raise ValueError(f"Split ratio {name}={ratio} is outside the allowed range [0.0, 1.0]")

    total_ratio = train_ratio + val_ratio + test_ratio
    if abs(total_ratio - 1.0) > RATIO_SUM_TOLERANCE:
        raise ValueError(
            f"Split ratios must sum to 1.0; received {train_ratio} + {val_ratio} + {test_ratio} = {total_ratio}"
        )

    # The sum is accepted with a small tolerance; rescale by that sum so allocation
    # weights sum to 1.0 within floating-point precision (not bit-exact) and the
    # acceptance rule is explicit rather than implicit.
    weights = {name: ratio / total_ratio for name, ratio in requested.items()}

    n = len(lines)
    indices = list(range(n))
    rng = random.Random(seed)
    rng.shuffle(indices)

    counts = {
        "train": int(round(n * weights["train"])),
        "val": int(round(n * weights["val"])),
        "test": n - int(round(n * weights["train"])) - int(round(n * weights["val"])),
    }

    # Rounding can over-allocate train+val so the residual test count goes negative.
    # Remove only the deficit, and only from partitions that requested a positive
    # weight -- a zero-weight partition must never absorb rounding error.
    if counts["test"] < 0:
        deficit = -counts["test"]
        counts["test"] = 0
        for name in sorted(("train", "val"), key=lambda k: (-weights[k], k)):
            take = min(counts[name], deficit)
            counts[name] -= take
            deficit -= take
            if deficit == 0:
                break

    # The residual partition can collect rounding remainder even when its weight is
    # zero. Move those records to the positive-weight partition with the largest
    # fractional share so a requested zero weight stays zero.
    if weights["test"] == 0.0 and counts["test"] > 0:
        positive = [k for k in ("train", "val") if weights[k] > 0.0]
        target = sorted(
            positive,
            key=lambda k: (-(n * weights[k] - math.floor(n * weights[k])), k),
        )[0]
        counts[target] += counts["test"]
        counts["test"] = 0

    n_train = counts["train"]
    n_val = counts["val"]

    train_indices = indices[:n_train]
    val_indices = indices[n_train : n_train + n_val]
    test_indices = indices[n_train + n_val :]

    train_set = set(train_indices)
    val_set = set(val_indices)
    test_set = set(test_indices)

    # Assert disjoint record indices across partitions (not a content check)
    leakage = (train_set & val_set) | (train_set & test_set) | (val_set & test_set)

    train_lines = [lines[i] for i in train_indices]
    val_lines = [lines[i] for i in val_indices]
    test_lines = [lines[i] for i in test_indices]

    # Map each original index to its split identity
    split_identities = {}
    for idx in train_indices:
        split_identities[idx] = "train"
    for idx in val_indices:
        split_identities[idx] = "val"
    for idx in test_indices:
        split_identities[idx] = "test"

    return {
        "train_lines": train_lines,
        "val_lines": val_lines,
        "test_lines": test_lines,
        "train_indices": train_indices,
        "val_indices": val_indices,
        "test_indices": test_indices,
        "split_identities": split_identities,
        "no_leakage_verified": len(leakage) == 0,
        "leakage_count": len(leakage),
        "seed": seed,
        "ratios": {
            "train": train_ratio,
            "val": val_ratio,
            "test": test_ratio,
        },
        "normalized_ratios": weights,
        "ratio_normalization": (
            "Requested ratios accepted within sum tolerance "
            f"{RATIO_SUM_TOLERANCE} and divided by their sum ({total_ratio}) so "
            "allocation weights sum to 1.0 within floating-point precision "
            "(not bit-exact)."
        ),
        "counts": {
            "train": len(train_lines),
            "val": len(val_lines),
            "test": len(test_lines),
            "total": n,
        },
    }


def generate_artifacts(
    input_path: Path,
    output_dir: Path,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    test_ratio: float = 0.1,
    seed: int = 42,
    encoding: str = "utf-8",
    errors: str = "strict",
) -> Dict[str, Any]:
    """
    Process input text corpus and write out reusable data artifacts and provenance manifest.
    """
    # Snapshot the original source bytes once; stats, hashes, and split artifacts
    # all describe this single snapshot.
    source_bytes = input_path.read_bytes()
    source_sha256 = hashlib.sha256(source_bytes).hexdigest()
    source_size_bytes = len(source_bytes)

    # Reject input/output collisions before any artifact write: overwriting an
    # artifact path that IS the input (or a symlink/hardlink alias of it) would
    # destroy the source bytes.
    input_resolved = input_path.resolve()
    for name in ARTIFACT_FILENAMES:
        artifact = output_dir / name
        if artifact.resolve() == input_resolved:
            raise ValueError(
                f"Refusing to write artifacts: output path '{artifact}' is the input file itself."
            )
        if (artifact.exists() or artifact.is_symlink()) and input_path.exists():
            try:
                if os.path.samefile(artifact, input_path):
                    raise ValueError(
                        f"Refusing to write artifacts: '{artifact}' resolves to the input file "
                        f"'{input_path}' (symlink/hardlink alias)."
                    )
            except OSError:
                pass

    output_dir.mkdir(parents=True, exist_ok=True)
    for name in ARTIFACT_FILENAMES:
        artifact = output_dir / name
        if artifact.exists() and not artifact.is_file():
            raise OSError(
                f"Artifact path is not a regular file: '{artifact}'"
            )

    # Decode the snapshot, then apply universal-newline normalization so behavior
    # matches a text-mode read regardless of the source's line endings.
    full_text = source_bytes.decode(encoding, errors)
    full_text = full_text.replace("\r\n", "\n").replace("\r", "\n")
    decoded_text_sha256 = hashlib.sha256(full_text.encode("utf-8")).hexdigest()

    # Split only on LF: other Unicode separators are valid corpus content and
    # must remain attached to the same record for deterministic partitioning.
    raw_lines = full_text.split("\n")
    if raw_lines and raw_lines[-1] == "":
        raw_lines.pop()

    stats = analyze_text(full_text)
    splits = compute_splits(
        raw_lines,
        train_ratio=train_ratio,
        val_ratio=val_ratio,
        test_ratio=test_ratio,
        seed=seed,
    )

    train_content = "\n".join(splits["train_lines"]) + ("\n" if splits["train_lines"] else "")
    val_content = "\n".join(splits["val_lines"]) + ("\n" if splits["val_lines"] else "")
    test_content = "\n".join(splits["test_lines"]) + ("\n" if splits["test_lines"] else "")

    train_file = output_dir / "train.txt"
    val_file = output_dir / "val.txt"
    test_file = output_dir / "test.txt"
    stats_file = output_dir / "stats.json"
    vocab_file = output_dir / "vocab.json"
    manifest_file = output_dir / "manifest.json"

    # Explicit UTF-8 byte writes: the recorded hashes describe the actual bytes on
    # disk rather than an implicit platform newline representation.
    train_file.write_bytes(train_content.encode("utf-8"))
    val_file.write_bytes(val_content.encode("utf-8"))
    test_file.write_bytes(test_content.encode("utf-8"))
    stats_file.write_bytes(
        json.dumps(stats, indent=2, ensure_ascii=False).encode("utf-8")
    )

    # Vocab artifact
    vocab_data = {
        "vocab_size": stats["vocab_size"],
        "char_vocab_size": stats["char_vocab_size"],
        "tokens": [
            {"id": idx, "token": tok, "count": cnt}
            for idx, (tok, cnt) in enumerate(stats["token_frequencies"].items())
        ],
        "chars": [
            {"id": idx, "char": ch, "count": cnt}
            for idx, (ch, cnt) in enumerate(stats["char_frequencies"].items())
        ],
    }
    vocab_file.write_bytes(
        json.dumps(vocab_data, indent=2, ensure_ascii=False).encode("utf-8")
    )

    manifest_data = {
        "source_file": str(input_path.resolve()),
        "source_sha256": source_sha256,
        "source_size_bytes": source_size_bytes,
        "decoded_text_sha256": decoded_text_sha256,
        "input_decoding": {
            "encoding": encoding,
            "errors": errors,
            "newline_normalization": "universal newlines (CRLF and CR are normalized to LF before analysis)",
        },
        "total_lines": len(raw_lines),
        "seed": seed,
        "split_ratios": splits["ratios"],
        "normalized_ratios": splits["normalized_ratios"],
        "ratio_normalization": splits["ratio_normalization"],
        "split_counts": splits["counts"],
        "split_sha256": {
            "train": compute_sha256(train_content),
            "val": compute_sha256(val_content),
            "test": compute_sha256(test_content),
        },
        "leakage_check": {
            "no_leakage_verified": splits["no_leakage_verified"],
            "overlap_indices_count": splits["leakage_count"],
        },
        "environment": {
            "python_version": sys.version,
            "platform": platform.platform(),
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    manifest_file.write_bytes(
        json.dumps(manifest_data, indent=2, ensure_ascii=False).encode("utf-8")
    )

    return {
        "stats": stats,
        "splits": splits,
        "manifest": manifest_data,
    }

