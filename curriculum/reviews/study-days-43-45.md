# Study Days 43–45 review record: attention and causal constraints

**Review revision:** 2026.10.30-rev1
**Scope:** `day-43`, `day-44`, and `day-45`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.
**Evidence:** `tests/unit/test_study_days_43_45.cjs`, `tests/browser/test_study_days_43_45.cjs`, `scripts/audit_calendar_ledger.py`, and the verified worked numbers reproduced in this record.

## Per-Lesson mathematical review findings

### Lesson 43 — scaled dot-product attention and query-key-value projections

- The four activities total 480 active minutes and walk the learner through Query/Key/Value roles, raw matrix multiplication, the variance-scaling proof, and unassisted prediction.
- Worked example configuration: sequence length $T=3$, key dimension $d_k=4$, value dimension $d_v=2$.
  - Query matrix $Q$: rows $q_0 = [2.0, 0.0, 2.0, 0.0]$, $q_1 = [0.0, 2.0, 0.0, 2.0]$, $q_2 = [1.0, 1.0, 1.0, 1.0]$.
  - Key matrix $K$: rows $k_0 = [1.0, 0.0, 1.0, 0.0]$, $k_1 = [0.0, 2.0, 0.0, 1.0]$, $k_2 = [2.0, 1.0, 0.0, 1.0]$.
  - Value matrix $V$: rows $v_0 = [1.0, 0.0]$, $v_1 = [0.0, 2.0]$, $v_2 = [1.0, 1.0]$.
- Raw score matrix $S_{\text{raw}} = Q K^T$:
  - Row 0: $[4.0, 0.0, 4.0]$
  - Row 1: $[0.0, 6.0, 4.0]$
  - Row 2: $[2.0, 3.0, 4.0]$
- Scaled score matrix with $\sqrt{d_k} = \sqrt{4} = 2.0$: $S = S_{\text{raw}} / 2.0$:
  - Row 0: $[2.0, 0.0, 2.0]$
  - Row 1: $[0.0, 3.0, 2.0]$
  - Row 2: $[1.0, 1.5, 2.0]$
- Softmax attention matrix $A = \text{softmax}(S)$ (computed with stable max-subtraction):
  - Row 0: $\max=2.0 \implies \exp([0.0, -2.0, 0.0]) = [1.0, 0.135335, 1.0]$, sum = $2.135335 \implies [0.468311, 0.063379, 0.468311]$.
  - Row 1: $\max=3.0 \implies \exp([-3.0, 0.0, -1.0]) = [0.049787, 1.0, 0.367879]$, sum = $1.417666 \implies [0.035119, 0.705385, 0.259496]$.
  - Row 2: $\max=2.0 \implies \exp([-1.0, -0.5, 0.0]) = [0.367879, 0.606531, 1.0]$, sum = $1.974410 \implies [0.186324, 0.307196, 0.506480]$.
- Output representations $\text{Out} = A V$:
  - Row 0: $[0.936622, 0.595069]$
  - Row 1: $[0.294615, 1.670266]$
  - Row 2: $[0.692804, 1.120872]$
- Variance derivation: for independent zero-mean unit-variance components $q_i, k_i \sim \mathcal{N}(0, 1)$, $\mathbb{E}[q \cdot k] = 0$ and $\text{Var}(q_i k_i) = \mathbb{E}[q_i^2]\mathbb{E}[k_i^2] - (\mathbb{E}[q_i]\mathbb{E}[k_i])^2 = 1 \times 1 - 0 = 1$. By component independence, $\text{Var}(q \cdot k) = \sum_{i=1}^{d_k} 1 = d_k$. Therefore, $\text{Var}((q \cdot k)/\sqrt{d_k}) = (1/d_k) d_k = 1.0$.
- Gradient saturation counterexample: with $d_k = 64$ ($\sqrt{d_k} = 8$), unscaled logits span $\pm 16$. $\text{softmax}([16, 0, -16])$ evaluates to $[0.99999989, 1.125 \times 10^{-7}, 1.266 \times 10^{-14}]$. The local gradient $\frac{\partial p_i}{\partial z_j} = p_i(\delta_{ij} - p_j)$ collapses to near-zero, demonstrating why deep Transformers stall without variance scaling.
- Independent mastery check on fresh configuration ($T=2, d_k=4, d_v=2$): verified $S_{\text{raw}} = [[8, 0], [0, 4]]$, scaled $S = [[4, 0], [0, 2]]$, $A = [[0.982014, 0.017986], [0.119203, 0.880797]]$, and $\text{Out} = [[1.964028, 1.035972], [0.238406, 2.761594]]$.

### Lesson 44 — autoregressive causal masking and strict invariance

- The four activities total 480 active minutes and examine the causal autoregressive constraint $P(x_{1:T}) = \prod_{t=1}^T P(x_t | x_{<t})$, the lower-triangular mask $M$, and the causal invariance property.
- Additive causal mask $M \in \mathbb{R}^{3 \times 3}$: $M_{i,j} = 0$ for $j \le i$ and $-\infty$ for $j > i$.
  $$M = \begin{bmatrix} 0.0 & -\infty & -\infty \\ 0.0 & 0.0 & -\infty \\ 0.0 & 0.0 & 0.0 \end{bmatrix}$$
- Masked score matrix $\tilde{S} = S + M$:
  $$\tilde{S} = \begin{bmatrix} 2.0 & -\infty & -\infty \\ 0.0 & 3.0 & -\infty \\ 1.0 & 1.5 & 2.0 \end{bmatrix}$$
- Causal softmax weights $A^{\text{causal}}$:
  - Row 0: $\max=2.0 \implies \exp([0.0, -\infty, -\infty]) = [1.0, 0.0, 0.0] \implies [1.000000, 0.000000, 0.000000]$.
  - Row 1: $\max=3.0 \implies \exp([-3.0, 0.0, -\infty]) = [0.049787, 1.0, 0.0] \implies [0.047426, 0.952574, 0.000000]$.
  - Row 2: unmasked entries $\implies [0.186324, 0.307196, 0.506480]$.
- Causal outputs $\text{Out}^{\text{causal}} = A^{\text{causal}} V$:
  - Row 0: $1.0 \times [1, 0] = [1.000000, 0.000000]$.
  - Row 1: $0.047426 \times [1, 0] + 0.952574 \times [0, 2] = [0.047426, 1.905148]$.
  - Row 2: $[0.692804, 1.120872]$.
- Causal Invariance Verification (Perturbation Test):
  - Future token at position $t=2$ is replaced with random extreme values: $q_2' = [99.0, -42.0, 13.0, 7.0]$, $k_2' = [-50.0, 12.0, 34.0, -8.0]$, $v_2' = [100.0, -200.0]$.
  - Preceding positions recomputed:
    - Row 0 attention diff: $|A_{0,:} - A_{0,:}^{\text{pert}}| = 0.0$. Output diff: $|\text{Out}_0 - \text{Out}_0^{\text{pert}}| = 0.0$.
    - Row 1 attention diff: $|A_{1,:} - A_{1,:}^{\text{pert}}| = 0.0$. Output diff: $|\text{Out}_1 - \text{Out}_1^{\text{pert}}| = 0.0$.
    - Row 2 output diff: non-zero ($\approx 1.1208$).
  - Algebraic proof: for row $i$, $\exp(S_{i,j} - \max) = \exp(-\infty) = 0$ for all $j > i$. The normalizer sum contains strictly indices $k \le i$. Therefore, no gradients or activations depend on tokens at future positions $t > i$. This algebraic invariance is the foundation for KV-caching in generative inference.
- Independent mastery check ($T=2$, $S = [[3, 1], [2, 4]]$, $V = [[1, 2], [3, 0]]$): verified $S_{\text{masked}} = [[3, -\infty], [2, 4]]$, $A^{\text{causal}} = [[1.0, 0.0], [0.119203, 0.880797]]$, and $\text{Out}^{\text{causal}} = [[1.0, 2.0], [2.761594, 0.238406]]$. Perturbing token 1 leaves $\text{Out}^{\text{causal}}[0]$ strictly invariant (difference 0.0).

### Lesson 45 — multi-head attention mechanics and numerical stability

- The four activities total 480 active minutes and cover projection matrices $W^Q, W^K, W^V, W^O$, parallel subspace routing, batched tensor transpositions $(B, h, T, d_k)$, full parameter ledgers, and edge-case floating-point stability.
- Subspace projection mechanics: $d_{\text{model}} = 4, h = 2, d_k = d_v = 2$.
  - Projections: $W^Q, W^K, W^V, W^O \in \mathbb{R}^{4 \times 4}$. Weights total $4 \times 16 = 64$ parameters (with biases, $64 + 16 = 80$).
  - GPT-2 Small configuration ($d_{\text{model}} = 768, h = 12, d_k = 64$):
    - Weights: $4 \times (768 \times 768) = 2,359,296$.
    - Biases: $4 \times 768 = 3,072$.
    - Total parameters per attention layer = $2,362,368$.
- Batched tensor shape transformations:
  - Input $X$: $(B, T, d_{\text{model}}) = (1, 2, 4)$.
  - Projected $Q, K, V$: $(1, 2, 4)$.
  - View split: $(B, T, h, d_k) = (1, 2, 2, 2)$.
  - Transpose(1, 2): $(B, h, T, d_k) = (1, 2, 2, 2)$.
  - Score matmul $Q K^T$: $(1, 2, 2, 2) \times (1, 2, 2, 2) \to (1, 2, 2, 2)$ (shape $(B, h, T, T)$).
  - Scaled by $\sqrt{2} \approx 1.414214$ and causal masked.
  - Multiplied by $V$: $(1, 2, 2, 2)$.
  - Transpose back and flatten: $(1, 2, 4)$.
  - Output projection $W^O$: $(1, 2, 4)$.
- Worked multi-head numerical trace with identity projections and $X = [[1, 0, 1, 0], [0, 2, 0, 1]]$:
  - Head 0 ($d_0, d_1$): $A_0 = [[1.0, 0.0], [0.055807, 0.944193]]$, $\text{Out}_0 = [[1.0, 0.0], [0.055807, 1.888386]]$.
  - Head 1 ($d_2, d_3$): $A_1 = [[1.0, 0.0], [0.330238, 0.669762]]$, $\text{Out}_1 = [[1.0, 0.0], [0.330238, 0.669762]]$.
  - Concatenated output post-$W^O$: Row 0: $[1.0, 0.0, 1.0, 0.0]$; Row 1: $[0.055807, 1.888386, 0.330238, 0.669762]$.
- Numerical stability analysis:
  - Max-shift invariance proof: $\text{softmax}(z - c)_i = \frac{e^{z_i - c}}{\sum_j e^{z_j - c}} = \frac{e^{z_i} e^{-c}}{e^{-c} \sum_j e^{z_j}} = \text{softmax}(z)_i$. Setting $c = \max(z)$ guarantees $\max(z - c) = 0$, so $\exp(z_i - c) \in (0, 1]$, entirely eliminating floating-point exponent overflow.
  - Precision boundaries: float32 overflows at $z \approx 88.7$; float16 overflows at $z \approx 11.1$ ($\exp(15) \approx 3.269 \times 10^6 > 65504$). Max-shift is mathematically mandatory in fp16/bf16.
  - All-masked row edge case: when a row contains only $-\infty$, $\max(z) = -\infty$, creating $-\infty - (-\infty) = \text{NaN}$. Safe implementations clamp the maximum to a finite lower bound or zero-fill NaN rows post-softmax.
  - Position-wise invariance through $W^O$: because $W^O$ operates position-wise within each token step $t$ across concatenated head channels, it cannot mix features across different sequence positions, preserving causal invariance strictly.

## Four-language translation review findings

For every target day (Days 43, 44, 45) and each language edition (`en`, `zh-Hans`, `zh-Hant`, `ja`):

- **Structural Parity**: Each edition contains identical activity identifiers (`day-43-act-01` through `day-45-act-04`), the same activity fields (`title`, `prerequisites`, `objective`, `instructions`, `exercise_prompt`, `hint`, `answer`, `mastery_criterion`, `assistance_policy_label`), and a 3-question diagnostic quiz in Activity 4.
- **Terminology Alignment**:
  - English: *scaled dot-product attention*, *queries/keys/values*, *scaling factor*, *score matrix*, *causal mask*, *causal invariance*, *multi-head attention*, *subspace projections*, *max-shift numerical stability*.
  - Simplified Chinese: 缩放点积注意力, 查询/键/值, 缩放因子, 分数矩阵, 因果掩码, 因果不变性, 多头注意力, 子空间投影, 最大值平移数值稳定性.
  - Traditional Chinese: 縮放點積注意力, 查詢/鍵/值, 縮放因子, 分數矩陣, 因果遮罩, 因果不變性, 多頭注意力, 子空間投影, 最大值平移數值穩定性.
  - Japanese: スケール化内積アテンション, クエリ/キー/バリュー, スケール係数, スコア行列, 因果マスク, 因果不変性, マルチヘッドアテンション, 部分空間射影, 最大値シフト数値的安定性.
- **Numerical Invariance**: All worked numerical values across all four languages are mathematically identical:
  - Day 43: $S_{\text{raw}}$ rows $[4, 0, 4]$, $[0, 6, 4]$, $[2, 3, 4]$; scaled $S$ rows $[2, 0, 2]$, $[0, 3, 2]$, $[1, 1.5, 2]$; attention probabilities $0.468311$, $0.705385$, $0.506480$; outputs $0.936622$, $1.670266$, $1.120872$.
  - Day 44: causal attention probabilities $1.000000$, $0.047426$, $0.952574$; causal outputs $[1.0, 0.0]$, $[0.047426, 1.905148]$; perturbation difference $0.0$.
  - Day 45: head outputs $[0.055807, 1.888386]$ and $[0.330238, 0.669762]$; parameter ledgers 64/80 (tiny), 2,359,296 / 2,362,368 (GPT-2 Small), 4,194,304 / 4,198,400 (GPT Medium).

## Source and rights review

- `vaswani-2017-attention`: Vaswani et al. (2017) *Attention Is All You Need* (NeurIPS 2017 / arXiv:1706.03762). Primary literature reference for Section 3.2 equations. Open access under arXiv perpetual non-exclusive distribution terms. Reused via lawful hyperlink (`linking`); all lesson prose, derivations, and worked examples are original formulations.
- `karpathy-nanogpt`: Andrej Karpathy *nanoGPT* (`model.py` CausalSelfAttention implementation). MIT License. Reused via lawful hyperlink (`linking`). Software repository license only; no video subtitles or proprietary transcripts imported.
- `annotated-transformer`: Harvard NLP *The Annotated Transformer* (Rush et al., updated by Hendrickson et al.). Apache-2.0 License. Reused via lawful hyperlink (`linking`). Code-level commentary on `subsequent_mask` and multi-head splits.
- All three sources are registered in `curriculum/sources/registry.json` with verified provenance, license terms, permission basis, safe fallbacks, and at least three evaluated candidate comparisons (Bahdanau additive attention, Shaw relative positions, CS336 transformer basics, Hugging Face gpt2, Jay Alammar Illustrated Transformer, Stanford CS224N).
- Each activity across Days 43-45 carries at least two full `source_resources` objects with complete required provenance metadata and safe offline fallbacks.

## Execution and acceptance limits

- All worked matrix multiplications, scaling divisions, softmax distributions, and perturbation differences were independently recomputed and verified in Python (`numpy` and standard library `math`).
- The causal invariance test confirms exactly $0.0$ difference on historical token outputs when future tokens are perturbed.
- Unit test `tests/unit/test_study_days_43_45.cjs` verifies 480-minute time budgeting, activity counts, available status, source object schemas, candidate comparisons, localized field completeness, and domain terminology across all four editions.
- Browser test `tests/browser/test_study_days_43_45.cjs` runs headless Chromium across all 12 localized routes (`en`, `zh-Hans`, `zh-Hant`, `ja` for Days 43, 44, 45).
- `scripts/audit_calendar_ledger.py` passes with zero errors across the entire 90-day calendar ledger.
