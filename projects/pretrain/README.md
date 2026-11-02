# Resumable Small-Model Pretraining Project (Ticket 18)

A lightweight, crash-safe, local pretraining and evaluation framework for small generative language models (nanoGPT architecture).

## Language Editions (四语言指南)

- 🇨🇳 [简体中文 (Simplified Chinese)](./docs/README.zh-Hans.md)
- 🇭🇰 [繁體中文 (Traditional Chinese)](./docs/README.zh-Hant.md)
- 🇬🇧 [English (US)](./docs/README.en.md)
- 🇯🇵 [日本語 (Japanese)](./docs/README.ja.md)

## Quick Start

### 1. Tiny CPU Smoke Run
```bash
.venv/bin/python projects/pretrain/train.py \
  --smoke \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/smoke_pretrain \
  --max-iters 10
```

### 2. Resume from Interrupted Checkpoint
```bash
.venv/bin/python projects/pretrain/train.py \
  --smoke \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/smoke_pretrain \
  --max-iters 20 \
  --resume auto
```

### 3. Evaluate and Sample Text
```bash
.venv/bin/python projects/pretrain/evaluate.py \
  --checkpoint runs/smoke_pretrain/latest.pt \
  --data-path data/tinyshakespeare.txt \
  --prompt "ROMEO:" \
  --max-new-tokens 50
```

### 4. Run Unit & Process-Isolated Tests
```bash
.venv/bin/python -m unittest tests/unit/test_pretrain.py
```
