#!/usr/bin/env python3
"""
projects/pretrain/evaluate.py
=============================
Public command interface for evaluating pretrained checkpoints and generating text.
Computes held-out cross-entropy loss, character-level perplexity, and autoregressive samples.
"""

import argparse
import json
import math
import random
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import torch

from projects.pretrain.checkpoint import load_checkpoint
from projects.pretrain.data import TextCorpusDataset
from projects.pretrain.model import GPT, GPTConfig


def parse_args():
    parser = argparse.ArgumentParser(
        description="Pretrained model evaluation and generation CLI",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        required=True,
        help="Path to checkpoint file (.pt)",
    )
    parser.add_argument(
        "--data-path",
        type=str,
        default=str(PROJECT_ROOT / "data" / "tinyshakespeare.txt"),
        help="Path to text corpus for evaluation split",
    )
    parser.add_argument(
        "--prompt",
        type=str,
        default="KING:\n",
        help="Prompt text for autoregressive completion",
    )
    parser.add_argument(
        "--max-new-tokens",
        type=int,
        default=100,
        help="Number of tokens to generate",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.8,
        help="Sampling temperature (lower = more deterministic)",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=None,
        help="Top-k filtering for sampling (None = disable)",
    )
    parser.add_argument(
        "--eval-iters",
        type=int,
        default=10,
        help="Number of batches to evaluate for loss estimation",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=8,
        help="Batch size during evaluation",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cuda" if torch.cuda.is_available() else "cpu",
        help="Compute device (cpu, cuda)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=1337,
        help="Random seed",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default=None,
        help="Optional path to write evaluation results JSON",
    )
    args = parser.parse_args()
    if args.top_k is not None and args.top_k <= 0:
        parser.error("--top-k must be a positive integer when provided")
    if args.eval_iters <= 0:
        parser.error("--eval-iters must be positive")

    return args


def main():
    args = parse_args()

    # Set seed
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    ckpt_path = Path(args.checkpoint).resolve()
    if not ckpt_path.exists():
        print(f"Error: checkpoint file not found: {ckpt_path}", file=sys.stderr)
        sys.exit(1)

    data_path = Path(args.data_path).resolve()
    if not data_path.exists():
        print(f"Error: dataset corpus file not found: {data_path}", file=sys.stderr)
        sys.exit(1)

    dataset = TextCorpusDataset.from_file(data_path, train_ratio=0.9)

    # First load checkpoint metadata to know model architecture.
    # restore_rng=False keeps --seed in control of evaluation sampling.
    try:
        ckpt_state = load_checkpoint(
            ckpt_path=ckpt_path,
            device=args.device,
            restore_rng=False,
            expected_vocab=dataset.chars,
        )
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    config = ckpt_state.config

    # Reconstruct model and load weights
    model = GPT(config).to(args.device)
    load_checkpoint(
        ckpt_path=ckpt_path, model=model, device=args.device, restore_rng=False
    )
    model.eval()

    # Calculate train and val split loss
    @torch.no_grad()
    def compute_loss(split: str) -> float:
        losses = []
        for _ in range(args.eval_iters):
            x, y = dataset.get_batch(
                split=split,
                batch_size=args.batch_size,
                block_size=config.block_size,
                device=args.device,
            )
            _, loss = model(x, targets=y)
            losses.append(loss.item())
        return float(sum(losses) / len(losses))

    train_loss = compute_loss("train")
    val_loss = compute_loss("val")
    train_ppl = math.exp(train_loss)
    val_ppl = math.exp(val_loss)

    # Generate from prompt
    prompt_tokens = dataset.encode(args.prompt)
    if not prompt_tokens:
        prompt_tokens = [0]

    idx = torch.tensor([prompt_tokens], dtype=torch.long, device=args.device)
    generated_indices = model.generate(
        idx=idx,
        max_new_tokens=args.max_new_tokens,
        temperature=args.temperature,
        top_k=args.top_k,
    )[0].tolist()

    generated_text = dataset.decode(generated_indices)

    print("=" * 65)
    print("  Pretrained Language Model Evaluation")
    print("=" * 65)
    print(f"  Checkpoint: {ckpt_path.name} (Step {ckpt_state.step})")
    print(f"  Architecture: {config.n_layer}L, {config.n_head}H, {config.n_embd}D")
    print(f"  Parameters: {config.parameter_ledger()['total_parameters']:,}")
    print(f"  Train Loss: {train_loss:.4f} (Perplexity: {train_ppl:.2f})")
    print(f"  Val Loss:   {val_loss:.4f} (Perplexity: {val_ppl:.2f})")
    print("-" * 65)
    print("  Autoregressive Sample Output:")
    print(f"  Prompt: {repr(args.prompt)}")
    print(f"  Output:\n{generated_text}")
    print("=" * 65)

    results = {
        "checkpoint": str(ckpt_path),
        "step": ckpt_state.step,
        "model_config": config.to_dict(),
        "parameter_ledger": config.parameter_ledger(),
        "train_loss": train_loss,
        "train_perplexity": train_ppl,
        "val_loss": val_loss,
        "val_perplexity": val_ppl,
        "prompt": args.prompt,
        "generated_text": generated_text,
    }

    if args.output_json:
        try:
            out_path = Path(args.output_json).resolve()
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
        except OSError as exc:
            print(f"Error: unable to write evaluation results: {exc}", file=sys.stderr)
            sys.exit(1)
        print(f"  Saved evaluation results to {out_path}")


if __name__ == "__main__":
    main()
