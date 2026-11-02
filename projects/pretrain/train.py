#!/usr/bin/env python3
"""
projects/pretrain/train.py
==========================
Public command interface for small-model pretraining and checkpoint recovery.
Supports CPU smoke runs, atomic resumable checkpoints, and execution from any directory.
"""

import argparse
import json
import math
import os
import random
import sys
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import torch

from projects.pretrain.checkpoint import load_checkpoint, save_checkpoint
from projects.pretrain.data import TextCorpusDataset
from projects.pretrain.model import GPT, GPTConfig


def parse_args():
    parser = argparse.ArgumentParser(
        description="Resumable small-model pretraining CLI",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--data-path",
        type=str,
        default=str(PROJECT_ROOT / "data" / "tinyshakespeare.txt"),
        help="Path to training text corpus",
    )
    parser.add_argument(
        "--work-dir",
        type=str,
        default="runs/pretrain",
        help="Directory to save checkpoints and run metadata",
    )
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Use tiny CPU smoke configuration for fast tests and verifications",
    )
    parser.add_argument(
        "--resume",
        nargs="?",
        const="auto",
        default=None,
        help="Resume training from latest checkpoint (or specified path)",
    )

    # Architecture hyperparameters
    parser.add_argument("--block-size", type=int, default=64, help="Context window size")
    parser.add_argument("--n-layer", type=int, default=4, help="Number of Transformer layers")
    parser.add_argument("--n-head", type=int, default=4, help="Number of attention heads")
    parser.add_argument("--n-embd", type=int, default=64, help="Embedding dimension")
    parser.add_argument("--dropout", type=float, default=0.1, help="Dropout rate")
    parser.add_argument("--bias", action="store_true", help="Enable bias in layers")

    # Training hyperparameters
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
    parser.add_argument("--learning-rate", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--weight-decay", type=float, default=1e-2, help="Weight decay")
    parser.add_argument("--max-iters", type=int, default=1000, help="Total iterations to train")
    parser.add_argument("--eval-interval", type=int, default=200, help="Evaluation interval")
    parser.add_argument("--eval-iters", type=int, default=20, help="Batches for loss estimate")
    parser.add_argument("--checkpoint-interval", type=int, default=200, help="Checkpoint interval")
    parser.add_argument("--grad-clip", type=float, default=1.0, help="Max gradient norm")
    parser.add_argument("--seed", type=int, default=1337, help="Random seed")
    parser.add_argument(
        "--device",
        type=str,
        default="cuda" if torch.cuda.is_available() else "cpu",
        help="Compute device (cpu, cuda)",
    )
    parser.add_argument("--quiet", action="store_true", help="Minimize logging output")

    return parser.parse_args()


def set_seed(seed: int):
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def main():
    args = parse_args()

    # Apply smoke defaults if requested
    if args.smoke:
        args.block_size = min(args.block_size, 16)
        args.n_layer = min(args.n_layer, 2)
        args.n_head = min(args.n_head, 2)
        args.n_embd = min(args.n_embd, 16)
        args.batch_size = min(args.batch_size, 4)
        args.device = "cpu"
        if args.max_iters == 1000:
            args.max_iters = 10
        if args.eval_interval == 200:
            args.eval_interval = 5
        if args.eval_iters == 20:
            args.eval_iters = 2
        if args.checkpoint_interval == 200:
            args.checkpoint_interval = 5

    set_seed(args.seed)
    work_dir = Path(args.work_dir).resolve()
    work_dir.mkdir(parents=True, exist_ok=True)

    data_path = Path(args.data_path).resolve()
    if not data_path.exists():
        print(f"Error: dataset corpus not found at {data_path}", file=sys.stderr)
        sys.exit(1)

    dataset = TextCorpusDataset.from_file(data_path, train_ratio=0.9)

    config = GPTConfig(
        block_size=args.block_size,
        vocab_size=dataset.vocab_size,
        n_layer=args.n_layer,
        n_head=args.n_head,
        n_embd=args.n_embd,
        dropout=args.dropout,
        bias=args.bias,
    )
    try:
        config.validate()
    except ValueError as e:
        print(f"Configuration error: {e}", file=sys.stderr)
        sys.exit(1)

    device = args.device
    model = GPT(config).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.learning_rate, weight_decay=args.weight_decay
    )

    start_step = 0
    initial_val_loss = None

    # Handle resumption
    if args.resume:
        ckpt_to_load = None
        if args.resume == "auto":
            ckpt_to_load = work_dir / "latest.pt"
        else:
            ckpt_to_load = Path(args.resume).resolve()

        if not ckpt_to_load.exists():
            print(f"Error: resume requested but checkpoint {ckpt_to_load} does not exist", file=sys.stderr)
            sys.exit(1)

        try:
            state = load_checkpoint(
                ckpt_path=ckpt_to_load,
                model=model,
                optimizer=optimizer,
                expected_config=config,
                device=device,
                expected_vocab=dataset.chars,
            )
            start_step = state.step
            initial_val_loss = state.loss
            if not args.quiet:
                print(f"Resumed successfully from step {start_step} with loss {initial_val_loss:.4f}")
        except ValueError as e:
            print(f"Resumption rejected due to incompatible configuration: {e}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Error loading checkpoint {ckpt_to_load}: {e}", file=sys.stderr)
            sys.exit(1)

    if start_step >= args.max_iters:
        if not args.quiet:
            print(f"Training already completed up to step {start_step} (target: {args.max_iters})")
        return

    @torch.no_grad()
    def estimate_loss():
        out = {}
        model.eval()
        for split in ["train", "val"]:
            losses = torch.zeros(args.eval_iters)
            for k in range(args.eval_iters):
                x, y = dataset.get_batch(split, args.batch_size, config.block_size, device=device)
                _, l = model(x, y)
                losses[k] = l.item()
            out[split] = losses.mean().item()
        model.train()
        return out

    if not args.quiet:
        print("=" * 60)
        print("  Resumable Small-Model Pretraining")
        print("=" * 60)
        print(f"  Corpus: {dataset.data_path} ({dataset.data_hash[:12]})")
        print(f"  Vocab Size: {dataset.vocab_size} | Block Size: {config.block_size}")
        print(f"  Parameters: {config.parameter_ledger()['total_parameters']:,} (Weight Tied)")
        print(f"  Steps: {start_step} -> {args.max_iters} | Device: {device.upper()}")
        print("-" * 60)

    start_time = time.time()
    last_losses = None
    step = start_step

    for step in range(start_step + 1, args.max_iters + 1):
        x, y = dataset.get_batch("train", args.batch_size, config.block_size, device=device)
        logits, loss = model(x, y)

        optimizer.zero_grad(set_to_none=True)
        loss.backward()

        # Invariant check: finite gradients
        for p in model.parameters():
            if p.grad is not None and not torch.isfinite(p.grad).all():
                print(f"Error: Non-finite gradient encountered at step {step}", file=sys.stderr)
                sys.exit(1)

        torch.nn.utils.clip_grad_norm_(model.parameters(), args.grad_clip)
        optimizer.step()

        # Periodic evaluation & checkpointing
        is_last = step == args.max_iters
        if step % args.eval_interval == 0 or is_last:
            last_losses = estimate_loss()
            elapsed = time.time() - start_time
            if not args.quiet:
                print(
                    f"  Step {step:05d}/{args.max_iters:05d} | "
                    f"Train Loss: {last_losses['train']:.4f} | "
                    f"Val Loss: {last_losses['val']:.4f} | "
                    f"Elapsed: {elapsed:.1f}s"
                )

        if step % args.checkpoint_interval == 0 or is_last:
            cur_loss = last_losses["val"] if last_losses else loss.item()
            step_ckpt = work_dir / f"step_{step:06d}.pt"
            latest_ckpt = work_dir / "latest.pt"

            save_checkpoint(
                ckpt_path=step_ckpt,
                model=model,
                optimizer=optimizer,
                step=step,
                loss=cur_loss,
                config=config,
                vocab=dataset.chars,
                data_hash=dataset.data_hash,
            )
            # Atomic update of latest.pt
            save_checkpoint(
                ckpt_path=latest_ckpt,
                model=model,
                optimizer=optimizer,
                step=step,
                loss=cur_loss,
                config=config,
                vocab=dataset.chars,
                data_hash=dataset.data_hash,
            )

    # Autoregressive generation sample
    if last_losses is None:
        last_losses = estimate_loss()

    prompt = dataset.chars[0] if dataset.chars else "\n"
    prompt_ids = torch.tensor([[dataset.stoi.get(prompt, 0)]], dtype=torch.long, device=device)
    sampled = model.generate(prompt_ids, max_new_tokens=min(50, config.block_size), temperature=0.8)
    sample_text = dataset.decode(sampled[0])

    # Save run artifact
    run_artifact = {
        "completed_steps": step,
        "resumed_from_step": start_step,
        "train_loss": last_losses["train"],
        "val_loss": last_losses["val"],
        "model_config": config.to_dict(),
        "parameter_ledger": config.parameter_ledger(),
        "dataset_info": {
            "data_path": dataset.data_path,
            "data_hash": dataset.data_hash,
            "vocab_size": dataset.vocab_size,
            "train_ratio": dataset.train_ratio,
        },
        "generated_sample": sample_text,
        "seed": args.seed,
        "device": device,
        "truthful_scope_disclaimer": (
            "This small-model training run serves as an empirical verification of tokenization, "
            "causal masking, loss descent, and atomic checkpoint recovery. It is a local smoke/learning fixture "
            "and does not represent full convergence or cloud-scale foundation model pretraining."
        ),
    }

    artifact_path = work_dir / "run_artifact.json"
    with open(artifact_path, "w", encoding="utf-8") as f:
        json.dump(run_artifact, f, indent=2, ensure_ascii=False)

    if not args.quiet:
        print("=" * 60)
        print("  Training finished successfully!")
        print(f"  Artifacts saved to {work_dir}")
        print("=" * 60)


if __name__ == "__main__":
    main()
