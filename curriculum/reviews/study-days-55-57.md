# Curriculum Review: Study Days 55-57 (Checkpoints and Resource Planning)

## Scope & Purpose
Covers Days 55, 56, and 57 of the 90-Day AI Learning curriculum:
- **Day 55**: Checkpointing mechanics, PyTorch `model.state_dict()` and `optimizer.state_dict()`, RNG seed persistence, atomic write patterns with temporary files and `os.replace`, schema versioning headers, and restart loss continuity.
- **Day 56**: Quantitative resource planning, transformer parameter calculation formulas across every layer, 16-byte-per-parameter AdamW memory overhead (ZeRO paper decomposition), dynamic activation memory modeling, and the $6ND$ compute FLOPs law with Model FLOPs Utilization (MFU) cost estimation.
- **Day 57**: Fault tolerance, diagnosing truncated checkpoint files (`EOFError`, `UnpicklingError`), SHA256 checksum sidecars, automated historical fallback, vocabulary expansion with `strict=False`, cloud Spot instance preemption signal handling (`SIGTERM`/`SIGINT`), and cloud billing hazard defense.

## Verification & Parity Across Language Editions
All four language editions (`en`, `ja`, `zh-Hans`, `zh-Hant`) were generated with genuine translations and verified:
- **Terminology Parity**:
  - English: `checkpoint`, `state_dict`, `optimizer`, `parameter`, `memory`, `FLOPs`, `activation`, `corruption`, `preemption`, `SIGTERM`.
  - Japanese: `チェックポイント`, `状態辞書`, `オプティマイザ`, `パラメータ`, `メモリ`, `活性化値`, `破損`, `プリエンプション`, `シグナル`.
  - Simplified Chinese: `检查点`, `状态字典`, `优化器`, `参数`, `显存`, `浮点运算`, `激活值`, `损坏`, `抢占`, `信号`.
  - Traditional Chinese: `檢查點`, `狀態字典`, `優化器`, `參數`, `顯存`, `浮點運算`, `激活值`, `損壞`, `搶佔`, `信號`.

## Mathematical & Quantitative Validation
1. **Parameter Derivation**:
   - GPT-2 Small ($V=50257, L=1024, N_{\text{layer}}=12, d=768$, tied weights):
     $$\text{Per Block} = 12 \times 768^2 + 4 \times 768 = 7,080,960$$
     $$\text{12 Blocks} = 84,971,520$$
     $$\text{Embeddings} = 50257 \times 768 + 1024 \times 768 = 39,383,808$$
     $$\text{Final LN} = 2 \times 768 = 1,536$$
     $$\text{Total Parameters} = 124,356,864 \approx 124.4\text{M}$$
   - Static VRAM in FP16 = $124,356,864 \times 2 \text{ bytes} \approx 248.7 \text{ MB}$.
2. **AdamW Training VRAM (16 bytes/parameter rule)**:
   - FP16 model weights: 2 bytes
   - FP16 gradients: 2 bytes
   - AdamW optimizer states (FP32 master weights 4B + 1st moment 4B + 2nd moment 4B): 12 bytes
   - Total static state: 16 bytes per parameter.
3. **Compute FLOPs & Runtime**:
   - Training compute: $C = 6ND$ FLOPs.
   - For $N=125\text{M}, D=10\text{B}$ tokens:
     $$C = 6 \times 1.25\times 10^8 \times 10^{10} = 7.5 \times 10^{18} \text{ FLOPs}$$
   - On NVIDIA A100 (312 TFLOPs FP16/BF16) at 40% MFU:
     $$\text{Effective Throughput} = 312 \times 10^{12} \times 0.40 = 1.248 \times 10^{14} \text{ FLOPs/s}$$
     $$\text{Wall-Clock Time} = \frac{7.5 \times 10^{18}}{1.248 \times 10^{14}} = 60,096 \text{ s} \approx 16.69 \text{ hours}$$

## Source Provenance & Rights
- `pytorch-save-load`: Official BSD-3-Clause PyTorch documentation.
- `karpathy-nanogpt-train`: Official MIT licensed nanoGPT repository.
- `kaplan-scaling-laws-2020`: Open Access arXiv paper.
- `chinchilla-scaling-2022`: Open Access NeurIPS/arXiv paper.
- `rajbhandari-zero-2020`: Open Access SC20/arXiv paper.
- `eleutherai-transformer-math`: CC-BY 4.0 research blog post.
All sources include $\ge 2$ compared candidates, safe fallback provisions, and prerequisite alignment.
