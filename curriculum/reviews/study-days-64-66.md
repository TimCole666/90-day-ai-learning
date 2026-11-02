# Curriculum Review: Study Days 64-66 (LoRA Mathematics and Engineering)

## Scope & Purpose
Covers Days 64, 65, and 66 of the 90-Day AI Learning curriculum:
- **Day 64**: LoRA mathematics, intrinsic dimensionality hypothesis (Aghajanyan et al. 2020), low-rank matrix decomposition $W = W_0 + \frac{\alpha}{r} BA$, Gaussian initialization of $A$ with zero-initialization of $B$ (guaranteeing $\Delta W = 0$ at step 0), the $\frac{\alpha}{r}$ scaling factor, exact trainable parameter ledgers across attention and MLP projections, and strict conceptual distinction from 4-bit quantized QLoRA (Dettmers et al. 2023).
- **Day 65**: LoRA engineering, strict base model weight freezing (`param.requires_grad = False`), autograd computational graph branching, absence of gradient memory allocation for base weights, AdamW optimizer footprint collapse (from 16 bytes per base parameter to 16 bytes per adapter parameter only), target module selection tradeoffs ($W_q, W_v$ vs all linear projections), and automated unit tests for gradient isolation.
- **Day 66**: Adapter lifecycles, inference weight folding ($W_{\text{merged}} = W_0 + \frac{\alpha}{r} BA$) for zero-latency deployment, reversible weight unmerging for multi-tenant hot-swapping, lightweight artifact packaging (`adapter_model.safetensors` and `adapter_config.json`), and end-to-end integration testing proving 1e-6 numerical equivalence between merged and unmerged forward evaluations.

## Verification & Parity Across Language Editions
All four language editions (`en`, `ja`, `zh-Hans`, `zh-Hant`) were generated with authentic translations and verified:
- **Terminology Parity**:
  - English: `LoRA`, `low-rank`, `adapter`, `freezing`, `gradient`, `optimizer`, `merge`, `unmerge`, `safetensors`.
  - Japanese: `低ランク`, `アダプタ`, `凍結`, `勾配`, `オプティマイザ`, `マージ`, `アンマージ`, `ゼロ遅延`.
  - Simplified Chinese: `低秩`, `适配器`, `冻结`, `梯度`, `优化器`, `融合`, `反融合`, `零延迟`.
  - Traditional Chinese: `低秩`, `適配器`, `凍結`, `梯度`, `優化器`, `融合`, `反融合`, `零延遲`.

## Mathematical & Quantitative Validation
1. **Low-Rank Parameter Reduction**:
   - For linear projection $d_{\text{in}} = 4096, d_{\text{out}} = 4096$:
     $$\text{Full Parameters} = 4096 \times 4096 = 16,777,216$$
     $$\text{LoRA Parameters } (r=8) = 8 \times (4096 + 4096) = 65,536$$
     $$\text{Reduction} = 1 - \frac{65,536}{16,777,216} = 99.61\%$$
2. **AdamW Optimizer VRAM Collapse**:
   - 7B Model ($7 \times 10^9$ parameters):
     - Full fine-tuning: $7 \times 10^9 \times 16 \text{ bytes} \approx 112 \text{ GB}$ optimizer VRAM.
     - LoRA ($r=16$, all linear layers, $\approx 33.5 \times 10^6$ parameters):
       $$\text{LoRA Optimizer VRAM} = 33.5 \times 10^6 \times 16 \text{ bytes} \approx 536 \text{ MB}$$
     - Reduction in optimizer memory $> 99.5\%$.
3. **Weight Merge Linearity**:
   - For input vector $x$:
     $$y_{\text{merged}} = W_{\text{merged}} x = \left(W_0 + \frac{\alpha}{r} BA\right) x = W_0 x + \frac{\alpha}{r} (B(Ax)) = y_{\text{unmerged}}$$
   - Machine precision verified with $|y_{\text{merged}} - y_{\text{unmerged}}| < 10^{-6}$.

## Source Provenance & Rights
- `hu-lora-2021`: Original arXiv ICLR 2022 open-access paper introducing LoRA.
- `huggingface-peft`: Apache-2.0 open-source library.
- `aghajanyan-intrinsic-dim-2020`: ACL 2021 arXiv open-access paper on intrinsic dimensionality.
- `dettmers-qlora-2023`: NeurIPS 2023 arXiv open-access paper on QLoRA.
All citations include $\ge 2$ compared candidates, safe fallback implementations, and complete rights verification.
