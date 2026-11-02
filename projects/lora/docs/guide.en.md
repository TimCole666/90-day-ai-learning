# Real-model LoRA project

## Ticket 21 evidence package

The authorized cloud-GPU comparison contract and four-language report live in [`../evidence/`](../evidence/). Start with [`comparison_contract.json`](../evidence/comparison_contract.json) and run the deterministic validator before any paid action. It currently reports `blocked-awaiting-authorization`; no cloud run or cost is claimed. The validator's `--require-authorized` mode must fail until a specific approval, rights review, and provider plan are recorded.

This project provides two explicitly different execution modes. `--smoke` builds a tiny random-weight Transformer locally, performs deterministic CPU LoRA training, saves and reloads the adapter, and downloads nothing. It validates mechanics only. Real mode uses a Hugging Face causal model with PEFT; an example is `openai-community/gpt2` (model card: https://huggingface.co/openai-community/gpt2, MIT license declared by the publisher). Check the current model card and any gated-access terms before running. The included instruction examples are original, synthetic practice data; do not treat them as a benchmark or claim quality improvements from them.

## Environment

Python 3.10+, PyTorch 2.2+, Transformers 4.46.3, PEFT 0.13.2. Install the base CPU/smoke dependency from the repository's existing environment, and install `projects/lora/requirements.txt` only for real model runs. A GPU is optional. The example model download is several hundred MB and requires network access; training on CPU can be slow. No cloud provider, paid GPU, or external mutation is needed or authorized by these commands. Model downloads consume local storage. Use `--local-files-only` to require an already-cached model.

## Reproduce the local smoke

```bash
.venv/bin/python projects/lora/train.py --smoke \
  --data-path data/instruction_sample.jsonl --work-dir runs/lora-smoke \
  --seed 42 --max-iters 4 --max-length 96
.venv/bin/python projects/lora/evaluate.py \
  --adapter-dir runs/lora-smoke --data-path data/instruction_sample.jsonl \
  --output-json runs/lora-smoke/eval_results.json
```

Expected files include `adapter_model.pt`, `adapter_config.json`, `base_model.pt`, `tokenizer.json`, `run_artifact.json`, and `telemetry.jsonl` (one JSON line per optimizer step: `step`, `train_loss`, `lr`, `elapsed_seconds`, `mode`; follow a running job with `tail -f`; `--resume` appends). The artifact states `smoke: true`, records zero downloads and random local base weights, and requires `adapter_round_trip_verified: true`. Evaluation reports held-out loss/perplexity and a generated sample; do not interpret a tiny result as model quality.

## Run a real open-model adapter

Check the model card and available disk/RAM/VRAM first. Use a new output directory for each run.

```bash
.venv/bin/python -m pip install -r projects/lora/requirements.txt
.venv/bin/python projects/lora/train.py \
  --model openai-community/gpt2 --revision <reviewed-commit-hash> \
  --data-path data/instruction_sample.jsonl --work-dir runs/gpt2-lora \
  --device cpu --max-iters 10 --batch-size 1 --max-length 128 --seed 42
.venv/bin/python projects/lora/evaluate.py \
  --adapter-dir runs/gpt2-lora --data-path data/instruction_sample.jsonl \
  --model openai-community/gpt2 --revision <same-reviewed-commit-hash> \
  --device cpu --output-json runs/gpt2-lora/eval_results.json
```

Replace the placeholder with a revision you have inspected; omitting `--revision` is permitted but makes the source mutable. `--local-files-only` disables provider downloads. Training freezes base parameters and trains PEFT adapters only; the run artifact records model/revision, data hash, split counts, seed, rank/scale, parameter ledger, losses, and download policy. Evaluation reloads the adapter and compares base/adapted loss on the deterministic independent test partition. With fewer than ten records the split may have no test partition and evaluation fails rather than leaking validation/training data. Results may worsen; report them honestly. Training resume is not implemented; `--resume` is rejected for real mode. Start a new work directory after failure.

## Math and accounting

For frozen base matrix $W_0 \in \mathbb{R}^{d_{out}\times d_{in}}$, LoRA learns $A \in \mathbb{R}^{r\times d_{in}}$ and $B \in \mathbb{R}^{d_{out}\times r}$:

$$W = W_0 + (\alpha/r)BA.$$

The adapter adds $r(d_{in}+d_{out})$ parameters per targeted linear map instead of $d_{out}d_{in}$ trainable parameters. A GPT-2 attention projection target may differ in naming from architectures exposing `q_proj`/`v_proj`; inspect the model modules and pass `--target-modules` if needed. The ledger reports actual counts; optimizer state and activations still consume memory, so adapter parameter count is not total run memory.

For a batch, `input_ids`, `attention_mask`, and `labels` have shape `[batch, sequence]`. Prompt labels are `-100`; the causal-LM loss therefore trains response tokens only. The deterministic split is shared with the text/data project and identified by record hash and seed.

## Exercises and feedback

1. Run smoke twice with the same seed and compare artifacts' data hash, metrics, and adapter round-trip flag. Timestamps and serialized weights metadata may vary; learned predictions and metrics should match in the same PyTorch environment. Smoke never accesses Transformers/PEFT or the network.
2. Compute the adapter count for a linear layer with input width 768, output width 2304, and rank 8: $8(768+2304)=24,576$. Compare this with $768\cdot2304=1,769,472$ base matrix parameters. The ratio is about 1.39%; biases and other model layers are excluded.
3. Inspect labels for one tokenized example. Every prompt position must be `-100`; at least one response token must remain. Increase `--max-length` if truncation removes the entire response.
4. Compare evaluation `held_out_samples`, `data_hash`, and split counts. A missing test partition is an error, not permission to reuse training examples.
5. Explain a failed or worse after-loss result without selecting examples: check the baseline, data size, target modules, optimization steps, and independent evaluation. No fixed improvement is required.

Answers: tasks 1-2 follow the stated repeatability and matrix-size formulas. For task 3, prompt positions are masked and response labels are token IDs; zero response labels triggers a clear validation error. For task 4, use at least ten distinct records with the default 80/10/10 split. For task 5, report observed numbers and limitations; do not claim success from generated examples alone.

Acceptance boundary: tests exercise the public commands with deterministic local smoke data. They do not prove that a remote model was downloaded, licensed for every intended use, affordable on a particular device, or improved by fine-tuning. Do not use paid compute without separate authorization.
