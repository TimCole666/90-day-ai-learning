# Study Days 52–54 review record: Generation, Overfitting, and Evaluation

**Review revision:** 2026.10.30-rev1
**Scope:** `day-52`, `day-53`, and `day-54`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.
**Evidence:** `tests/unit/test_study_days_52_54.cjs`, `tests/browser/test_study_days_52_54.cjs`, `scripts/audit_calendar_ledger.py`, and verified worked numbers reproduced in this record.

## Per-Lesson mathematical review findings

### Lesson 52 — Autoregressive sampling: temperature, Top-k, and Nucleus (Top-p)

- Four activities total 480 active minutes.
- Temperature scaling for $z = [2.0, 1.0, 0.0]$:
  - At $T=1.0$: $\exp(z) = [7.389, 2.718, 1.0] \implies p = [0.665, 0.245, 0.090]$.
  - At $T=0.5$: $z/0.5 = [4, 2, 0] \implies \exp(z/0.5) = [54.598, 7.389, 1.0] \implies p = [0.867, 0.117, 0.016]$.
  - At $T=2.0$: $z/2.0 = [1, 0.5, 0] \implies p = [0.506, 0.307, 0.186]$.
  - Verified: $T \to 0$ collapses onto greedy argmax, $T \to \infty$ converges to uniform probability.
- Top-p truncation: for sorted probabilities $p = [0.40, 0.30, 0.15, 0.10, 0.05]$, $p_{\text{cutoff}}=0.80$ accumulates $0.40 + 0.30 + 0.15 = 0.85 \ge 0.80$, retaining $\{A, B, C\}$ and renormalizing to $[0.471, 0.353, 0.176]$.
- Multiplicative repetition penalty $\theta=1.2$: $z_i > 0 \implies z_i / 1.2$; $z_i < 0 \implies z_i \times 1.2$, monotonically depressing repeated tokens.

### Lesson 53 — Evaluation protocols: validation loss, perplexity, and leakage audit

- Four activities total 480 active minutes.
- Validation loss and perplexity:
  - Cross-entropy $L_{\text{val}} = 1.6094 \text{ nats} \implies \text{PPL} = \exp(1.6094) = 5.0$.
  - Cross-entropy $L_{\text{val}} = 2.3026 \text{ nats} \implies \text{PPL} = \exp(2.3026) = 10.0$.
  - Random baseline for $V=50,000$: $L = \ln(50,000) \approx 10.82 \implies \text{PPL} = 50,000$.
- Overfitting diagnosis: train loss $0.85$ vs val loss $1.75$ exhibits a $0.90$ gap indicating memorization.
- Leakage defense: document-level partitioning strictly enforced before tokenization; token-level shuffling across split boundaries prohibited.

### Lesson 54 — Qualitative failure gallery, small-model boundaries, and capstone exam

- Four activities total 480 active minutes.
- Autoregressive degeneration taxonomy:
  - Greedy loops: positive feedback attractor where emitted phrases self-reinforce transition probabilities.
  - Entropy explosion ($T > 2.0$): breaks grammatical transitions into syntax-free garbage.
  - Fluent hallucination: small models (<50M) simulate surface statistics without factual knowledge or reasoning.
- Quantitative ablation metric: $\text{Distinct-2} = \frac{\text{Unique Bigrams}}{\text{Total Bigrams}}$.

## 4-Language translation equivalence

All concepts (temperature scaling, Top-k, Nucleus Top-p, repetition penalty, perplexity, document-level leakage, Distinct-n, hallucination) are genuinely translated across English, Simplified Chinese, Traditional Chinese, and Japanese with consistent mathematical notation and reproducible test cases.
