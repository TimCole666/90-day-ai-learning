# Study Days 46–48 review record: Assemble and Explain a Transformer

**Review revision:** 2026.10.30-rev1
**Scope:** `day-46`, `day-47`, and `day-48`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.
**Evidence:** `tests/unit/test_study_days_46_48.cjs`, `tests/browser/test_study_days_46_48.cjs`, `scripts/audit_calendar_ledger.py`, and verified worked numbers reproduced in this record.

## Per-Lesson mathematical review findings

### Lesson 46 — Transformer block assembly: LayerNorm, RMSNorm, and residual highways

- Four activities total 480 active minutes.
- Step-by-step hand normalization of $x = [2.0, -1.0, 0.0, 3.0]$:
  - $\mu = \frac{2 - 1 + 0 + 3}{4} = 1.0$, $\sigma^2 = \frac{1 + 4 + 1 + 4}{4} = 2.5 \implies \text{LayerNorm}(x) = [0.6325, -1.2649, -0.6325, 1.2649]$.
  - $\text{RMS}(x) = \sqrt{\frac{4 + 1 + 0 + 9}{4}} = \sqrt{3.5} \approx 1.8708 \implies \text{RMSNorm}(x) = [1.0690, -0.5345, 0.0, 1.6036]$.
- Residual addition identity highway: $\frac{\partial L}{\partial x} = \frac{\partial L}{\partial y} (I + \frac{\partial F}{\partial x}) = \frac{\partial L}{\partial y} + \frac{\partial L}{\partial y} \frac{\partial F}{\partial x}$. The identity term $I$ prevents gradient vanishing across 100+ stacked blocks.
- Pre-LN ($x = x + \text{Sublayer}(\text{Norm}(x))$) vs Post-LN ($x = \text{Norm}(x + \text{Sublayer}(x))$) shows that unnormalized residual backbones ensure stable gradient variance across all layer depths from step 0.

### Lesson 47 — Feedforward Networks (FFN), SwiGLU, and block stacking

- Four activities total 480 active minutes.
- Hand-computed FFN forward pass for $x = [1.0, 2.0]$:
  - $z = x W_1 = [1, 2] \begin{bmatrix} 1 & 0 & -1 \\ 0 & 2 & 1 \end{bmatrix} = [1, 4, 1]$
  - $h = \text{ReLU}(z) = [1, 4, 1]$
  - $y = h W_2 = [1, 4, 1] \begin{bmatrix} 1 & 0 \\ 0 & 1 \\ -1 & 1 \end{bmatrix} = [0, 5]$
- Parameter accounting for a standard block ($d_{model}=768, d_{ff}=3072$):
  - Attention parameters: $4 \times 768^2 = 2,359,296$ (33.3%).
  - FFN parameters: $2 \times 768 \times 3072 = 4,718,592$ (66.7%).
  - Total block parameters = $7,077,888$, validating the canonical 2:1 parameter distribution.

### Lesson 48 — End-to-end Decoder-Only Transformer, RoPE, and weight tying

- Four activities total 480 active minutes.
- Proves permutation equivariance of unpositioned attention: $(P Q)(P K)^T = P (Q K^T) P^T$.
- Contrasts additive learned position embeddings with Rotary Position Embeddings (RoPE).
- Weight tying analysis: ties token embedding matrix $W_{emb} \in \mathbb{R}^{V \times d}$ to final output LM head $W_{unemb}^T$, saving $V \times d_{model}$ parameters (e.g., $32,000 \times 4,096 \approx 131\text{M}$ parameters in LLaMA scale) while enforcing semantic symmetry.

## 4-Language translation equivalence

All architectural concepts (LayerNorm, RMSNorm, Pre-LN, residual connections, FFN, SwiGLU, RoPE, weight tying, logits projection) are genuinely localized across English, Simplified Chinese, Traditional Chinese, and Japanese with consistent mathematical notations and full exercise walkthroughs.
