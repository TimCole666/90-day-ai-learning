# Local Resumable Small-Model Pretraining & Checkpoint Recovery

[简体中文](./README.zh-Hans.md) | [繁體中文](./README.zh-Hant.md) | [日本語](./README.ja.md)

This project provides a clean, fully local end-to-end training and evaluation loop for a small generative Transformer (nanoGPT architecture) running on affordable CPU hardware. Learners can execute small-model pretraining, interrupt execution, safely resume from atomic checkpoints, verify causal attention constraints, audit parameter and resource ledgers, and enforce architectural compatibility.

---

## 1. Learning Objectives & Prerequisites

### Objectives
1. **End-to-End Pretraining Loop**: Understand character-level tokenization, deterministic train/validation splitting (90% train / 10% val), autoregressive next-token prediction, and cross-entropy loss calculation.
2. **Causal Attention Invariants**: Verify that upper-triangular masking prevents tokens from attending to future positions (forward logits at prefix positions are invariant to future mutations, and backward gradients from future positions are strictly zero).
3. **Atomic Resumable Checkpoints**: Master crash-safe checkpointing via temporary file replacement (`os.replace`). Recover model weights, AdamW optimizer moments, global step counters, and RNG states without risk of corrupting existing checkpoints upon process interruption.
4. **Architectural Compatibility Protection**: Refuse resumption when model hyperparameters (such as `n_embd` or `vocab_size`) do not match the checkpoint, preventing silent divergence.
5. **Parameter & Resource Accounting**: Calculate exact parameter counts, memory footprints, and compute FLOPs using theoretical formulas.

### Environment Requirements
- Python 3.10+
- PyTorch 2.0+ (`.venv/bin/python`)
- Zero GPU dependency (CPU smoke tests run in seconds)

---

## 2. Public Command-Line Interface (CLI)

The project provides isolated CLI entrypoints executable from any working directory:

### 2.1 Run Tiny CPU Smoke Pretraining
```bash
.venv/bin/python projects/pretrain/train.py \
  --smoke \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/smoke_pretrain \
  --max-iters 10
```
- `--smoke`: Configures minimal CPU parameters (`n_layer=2`, `n_head=2`, `n_embd=16`, `block_size=16`, `batch_size=4`).
- Outputs `latest.pt`, `step_*.pt`, and structured metadata in `run_artifact.json`.

### 2.2 Run Standard Pretraining
```bash
.venv/bin/python projects/pretrain/train.py \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/pretrain \
  --block-size 64 \
  --n-layer 4 \
  --n-head 4 \
  --n-embd 64 \
  --batch-size 32 \
  --max-iters 1000 \
  --eval-interval 200 \
  --checkpoint-interval 200
```

### 2.3 Resume Training from Checkpoint
```bash
.venv/bin/python projects/pretrain/train.py \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/pretrain \
  --max-iters 2000 \
  --resume auto
```
- `--resume auto`: Automatically finds `latest.pt` in `--work-dir` and seamlessly resumes training from the saved step.
- `--resume <path>`: Resumes from a specified checkpoint file.

### 2.4 Evaluate Checkpoint & Sample Text Generation
```bash
.venv/bin/python projects/pretrain/evaluate.py \
  --checkpoint runs/smoke_pretrain/latest.pt \
  --data-path data/tinyshakespeare.txt \
  --prompt "ROMEO:" \
  --max-new-tokens 50 \
  --output-json runs/smoke_pretrain/eval_results.json
```
- Computes cross-entropy loss and character perplexity on the held-out validation split.
- Autoregressively generates text samples from the prompt.

---

## 3. Parameter Ledger & Resource Accounting

### 3.1 Exact Parameter Breakdown

Let $V$ be vocabulary size, $T$ context window, $C$ embedding dimension, $nh$ number of heads ($hs = C / nh$), and $L$ number of layers:

| Component | Formula (bias=False) | Formula (bias=True) | Smoke ($V=65, T=16, C=16, L=2$) | Nano ($V=65, T=64, C=64, L=4$) |
|---|---|---|---|---|
| **Token Embedding (wte)** | $V \times C$ | $V \times C$ | $65 \times 16 = 1,040$ | $65 \times 64 = 4,160$ |
| **Position Embedding (wpe)** | $T \times C$ | $T \times C$ | $16 \times 16 = 256$ | $64 \times 64 = 4,096$ |
| **Attention per Layer** | $C \times (3C) + C \times C$ | $C \times (3C) + 3C + C \times C + C + 2C$ | $16 \times 48 + 16 \times 16 = 1,024$ | $64 \times 192 + 64 \times 64 = 16,384$ |
| **MLP per Layer** | $C \times (4C) + (4C) \times C$ | $C \times (4C) + 4C + 4C \times C + C + 2C$ | $16 \times 64 + 64 \times 16 = 2,048$ | $64 \times 256 + 256 \times 64 = 32,768$ |
| **All $L$ Layers** | $L \times (\text{Attn} + \text{MLP})$ | Same | $2 \times (1,024 + 2,048) = 6,144$ | $4 \times (16,384 + 32,768) = 196,608$ |
| **Final LayerNorm (ln_f)** | $0$ (affine=False) | $2 \times C$ | $0$ | $0$ |
| **LM Head** | **Tied to wte (0 extra params)** | **Tied to wte** | $0$ (Weight Tied) | $0$ (Weight Tied) |
| **Total Parameters $N$** | **$\text{wte} + \text{wpe} + \text{Layers} + \text{ln\_f}$** | **Same** | **7,440** | **204,864** |

> **Weight Tying Note**: `wte.weight == lm_head.weight` eliminates $V \times C$ duplicate parameters and enforces semantic consistency between input token embeddings and output projection space.

### 3.2 Memory & Compute Footprint

1. **Model Weights Memory**:
   $$\text{Memory}_{\text{weights}} = N \times 4 \text{ bytes (FP32)} \quad (\approx 0.8 \text{ MB for standard configuration})$$
2. **AdamW Optimizer Memory**:
   Tracks 1st moment $m$ and 2nd moment $v$:
   $$\text{Memory}_{\text{optim}} = 2 \times N \times 4 \text{ bytes} = 8N \text{ bytes} \quad (\approx 1.6 \text{ MB for standard configuration})$$
3. **Gradient Memory**:
   $$\text{Memory}_{\text{grad}} = N \times 4 \text{ bytes} \quad (\approx 0.8 \text{ MB})$$
4. **Compute FLOPs per Step**:
   Forward pass requires $\approx 2N$ FLOPs/token, backward pass $\approx 4N$ FLOPs/token, totaling $\approx 6N$ FLOPs/token.
   For batch size $B$ and sequence length $T$:
   $$\text{FLOPs/step} \approx 6 \times N \times B \times T$$

---

## 4. Atomic Checkpointing & Resumption Guarantees

In pretraining workflows, power loss, preemptible instances, and crashes are standard hazards:
1. **Atomic Save Protocol**:
   - Checkpoints are written to a PID-tagged temporary file `latest.pt.tmp.<pid>`.
   - Once flushed and synchronized to storage, `os.replace` replaces `latest.pt` atomically.
   - If interrupted by `SIGKILL` or power failure, existing valid checkpoints remain completely intact.
2. **State Restoration Invariants**:
   Checkpoints store model weights, AdamW first/second moments, global step, validation loss, hyperparameter dictionary, dataset hash, and RNG states for both PyTorch and Python.
3. **Hyperparameter Compatibility Guard**:
   `load_checkpoint` enforces that `n_embd`, `vocab_size`, `n_layer`, and `block_size` match the checkpoint metadata, preventing silent weight corruption.

---

## 5. Exercises & Reference Feedback

### Exercise 1: Run Tiny CPU Smoke Training & Inspect Artifacts
- **Task**: Execute 10 smoke steps and inspect `run_artifact.json`.
- **Feedback**: Verify that `completed_steps == 10`, `parameter_ledger.total_parameters == 7440`, and `train_loss` shows monotonic descent.

### Exercise 2: Simulated Interruption and Resumption
- **Task**: Train for 5 steps (`--max-iters 5`), terminate, then run with `--resume auto --max-iters 10`.
- **Feedback**: Verify stdout outputs `Resumed successfully from step 5` and steps 6 to 10 execute sequentially without resetting step count or loss.

### Exercise 3: Hyperparameter Mismatch Rejection
- **Task**: Save a checkpoint with `n_embd=16`, then attempt resumption with `n_embd=32`.
- **Feedback**: Resumption should immediately abort with an explicit error:
  `Resumption rejected due to incompatible configuration: field 'n_embd': expected 32, got 16`
  Verify that the original `latest.pt` file on disk remains completely unchanged.

---

## 6. Truthful Scope Disclaimer

> **Academic & Engineering Disclaimer**:  
> The CPU smoke configurations and short step counts verify **pipeline mechanics, tensor flow, causal attention masking, cross-entropy descent, and atomic recovery**. They do **not represent a fully trained or convergent foundation language model**, nor do they replace cloud-scale distributed GPU training.
