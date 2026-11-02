#!/usr/bin/env python3
"""
Command-line interface for Text and Data Tools.
Can be executed directly: python3 projects/text_tools/cli.py [options]
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Add project root to path if needed for local module resolution
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from projects.text_tools.core import analyze_text, generate_artifacts


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Text and Data Tools: compute statistics, deterministic splits, and provenance artifacts."
    )
    parser.add_argument(
        "--input",
        type=str,
        required=True,
        help="Path to the input text corpus file.",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Compute character and token statistics.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output statistics in JSON format.",
    )
    parser.add_argument(
        "--split",
        action="store_true",
        help="Perform deterministic train/val/test splitting and generate artifacts.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Directory to save generated data artifacts and manifest.",
    )
    parser.add_argument(
        "--train-ratio",
        type=float,
        default=0.8,
        help="Fraction of data allocated to train split (default: 0.8).",
    )
    parser.add_argument(
        "--val-ratio",
        type=float,
        default=0.1,
        help="Fraction of data allocated to validation split (default: 0.1).",
    )
    parser.add_argument(
        "--test-ratio",
        type=float,
        default=0.1,
        help="Fraction of data allocated to test split (default: 0.1).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for deterministic reproducible splitting (default: 42).",
    )
    parser.add_argument(
        "--encoding",
        type=str,
        default="utf-8",
        help="Character encoding for input file (default: utf-8).",
    )
    parser.add_argument(
        "--errors",
        type=str,
        default="strict",
        choices=["strict", "replace", "ignore"],
        help="Encoding error handling strategy (default: strict).",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    input_path = Path(args.input)
    if not input_path.exists() or not input_path.is_file():
        sys.stderr.write(f"Error: Input file does not exist: {args.input}\n")
        return 1

    stats = None

    if args.split:
        if not args.output_dir:
            sys.stderr.write("Error: --output-dir is required when --split is specified.\n")
            return 1

        output_dir = Path(args.output_dir)
        try:
            result = generate_artifacts(
                input_path=input_path,
                output_dir=output_dir,
                train_ratio=args.train_ratio,
                val_ratio=args.val_ratio,
                test_ratio=args.test_ratio,
                seed=args.seed,
                encoding=args.encoding,
                errors=args.errors,
            )
        except (UnicodeDecodeError, LookupError) as err:
            sys.stderr.write(
                f"Error: Failed to decode '{args.input}' using encoding '{args.encoding}': {err}\n"
            )
            return 1
        except OSError as err:
            sys.stderr.write(f"Error: Failed to read input or write split artifacts: {err}\n")
            return 1
        except ValueError as err:
            sys.stderr.write(f"Error: {err}\n")
            return 1

        if not args.json:
            print(f"Data artifacts generated successfully in {output_dir}")
            print(f"  Train samples: {result['splits']['counts']['train']}")
            print(f"  Val samples:   {result['splits']['counts']['val']}")
            print(f"  Test samples:  {result['splits']['counts']['test']}")
            print(f"  No index overlap: {result['splits']['no_leakage_verified']}")

        # Reuse the stats computed from the same source snapshot as the artifacts.
        stats = result["stats"]

    if args.stats:
        if stats is None:
            try:
                with open(input_path, "r", encoding=args.encoding, errors=args.errors) as f:
                    text = f.read()
            except (UnicodeDecodeError, LookupError) as err:
                sys.stderr.write(
                    f"Error: Failed to decode '{args.input}' using encoding '{args.encoding}': {err}\n"
                )
                return 1
            except OSError as err:
                sys.stderr.write(
                    f"Error: Failed to read input '{args.input}': {err}\n"
                )
                return 1
            stats = analyze_text(text)
        if args.json:
            print(json.dumps(stats, indent=2, ensure_ascii=False))
        else:
            print("=== Corpus Statistics ===")
            print(f"Total Characters: {stats['total_chars']}")
            print(f"Total Tokens:     {stats['total_tokens']}")
            print(f"Vocabulary Size:  {stats['vocab_size']}")
            print(f"Unique Chars:     {stats['char_vocab_size']}")
            print(f"Avg Token Length: {stats['avg_token_length']}")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
