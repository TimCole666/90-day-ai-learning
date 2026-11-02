# Study Days 49–51 review record: Run the Pretraining Loop

**Review revision:** 2026.10.30-rev1
**Scope:** `day-49`, `day-50`, and `day-51`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.
**Evidence:** `tests/unit/test_study_days_49_51.cjs`, `tests/browser/test_study_days_49_51.cjs`, `scripts/audit_calendar_ledger.py`, and verified mathematical derivations reproduced in this record.

## Per-Lesson mathematical review findings

### Lesson 49 — Pretraining Data Pipeline: Batching, Chunking, and Autoregressive Targets

- Four activities total 480 active minutes.
- Autoregressive target offset derivation:
  - Let raw contiguous token sequence be $T = [t_0, t_1, t_2, \dots, t_N]$.
  - For batch index $i$ and sequence context length $L$:
    - Input sequence: $x = [t_i, t_{i+1}, \dots, t_{i+L-1}] \in \mathbb{Z}^{L}$
    - Target sequence: $y = [t_{i+1}, t_{i+2}, \dots, t_{i+L}] \in \mathbb{Z}^{L}$
  - Target invariant: $\forall j \in [0, L-1]$, target $y_j = t_{i+j+1}$ represents the causal ground-truth next token given prefix $x_{\le j}$.
- Tensor memory footprint and shape transformation:
  - For batch size $B=64$, block size $L=1024$ stored as `uint16` ($2\text{ bytes}$ per token):
    - Input tensor memory = $64 \times 1024 \times 2 = 131,072\text{ bytes} = 128\text{ KB}$.
    - Combined $(x, y)$ batch footprint = $256\text{ KB}$.
  - Loss computation reshaping: Logits $\hat{Y} \in \mathbb{R}^{B \times L \times V}$ are flattened to $(B \cdot L, V)$, and targets $Y \in \mathbb{Z}^{B \times L}$ to $(B \cdot L)$, feeding directly into PyTorch `F.cross_entropy`.
- Off-by-one hazard diagnosis:
  - If targets are improperly unshifted ($y = x$), cross-entropy drives predictions toward identity replication ($x_t \to x_t$), yielding artificially low loss but completely broken generation semantics.

### Lesson 50 — Optimization Mechanics: AdamW Decoupled Weight Decay and Schedules

- Four activities total 480 active minutes.
- Mathematical derivation of AdamW vs Adam L2 regularization (Loshchilov & Hutter 2019):
  - In standard Adam with L2 regularization $\frac{1}{2} \lambda \|w\|^2$, the penalized gradient is $g_t = \nabla f(w_t) + \lambda w_t$.
  - First and second moment estimators scale this gradient:
    $m_t = \beta_1 m_{t-1} + (1 - \beta_1) g_t, \quad v_t = \beta_2 v_{t-1} + (1 - \beta_2) g_t^2$
    $\hat{m}_t = \frac{m_t}{1 - \beta_1^t}, \quad \hat{v}_t = \frac{v_t}{1 - \beta_2^t}$
  - The effective weight decay update is $-\eta \frac{\lambda w_t}{\sqrt{\hat{v}_t} + \epsilon}$. Thus, weights with large historical gradients (large $v_t$) experience artificially suppressed decay, distorting regularization.
  - AdamW decouples weight decay directly from gradient moments:
    $w_{t+1} = w_t (1 - \eta \lambda) - \eta \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon}$
- Exact numerical step verification:
  - Given $w_0 = 1.0, \lambda = 0.1, \eta = 0.01, \beta_1 = 0.9, \beta_2 = 0.999, \epsilon = 10^{-8}$, and initial gradient $g_1 = 0.5$:
    - $m_1 = (1 - 0.9)(0.5) = 0.05 \implies \hat{m}_1 = \frac{0.05}{0.1} = 0.5$
    - $v_1 = (1 - 0.999)(0.5^2) = 0.00025 \implies \hat{v}_1 = \frac{0.00025}{0.001} = 0.25$
    - $\sqrt{\hat{v}_1} = 0.5$
    - Decoupled decay component: $w_0 (1 - \eta \lambda) = 1.0 (1 - 0.001) = 0.9990$
    - Gradient descent step: $\eta \frac{\hat{m}_1}{\sqrt{\hat{v}_1} + \epsilon} = 0.01 \frac{0.5}{0.5 + 10^{-8}} = 0.0100$
    - Resulting updated parameter: $w_1 = 0.9990 - 0.0100 = 0.9890$.
- Parameter group segregation:
  - 2D weight matrices (Linear projections, Attention QKV/Output, FFN weights) are assigned $\text{weight\_decay} = 0.1$.
  - 1D tensors (biases, RMSNorm/LayerNorm scale vectors $\gamma$) and embedding tables are assigned $\text{weight\_decay} = 0.0$.
- Warmup and Cosine Decay Schedule:
  - Linear warmup for $t \le T_{warm}$: $\eta(t) = \eta_{max} \frac{t}{T_{warm}}$.
  - Cosine annealing for $T_{warm} < t \le T_{max}$:
    $\eta(t) = \eta_{min} + \frac{1}{2}(\eta_{max} - \eta_{min}) \left(1 + \cos\left(\pi \frac{t - T_{warm}}{T_{max} - T_{warm}}\right)\right)$.

### Lesson 51 — Running the Pretraining Loop: Loss Tracking, Checkpointing, and Failure Diagnosis

- Four activities total 480 active minutes.
- The 5-step pretraining iteration invariant:
  1. `optimizer.zero_grad(set_to_none=True)`: deallocates gradient buffers rather than writing zeros, saving memory bandwidth.
  2. Forward computation: `logits, loss = model(x, targets)`.
  3. Backward autograd pass: `loss.backward()`.
  4. Gradient clipping: `torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)` protects against loss spikes by scaling gradients if $\|\mathbf{g}\|_2 > 1.0$.
  5. Optimizer update: `optimizer.step()`.
- Train/Validation loss tracking:
  - `estimate_loss()` executes under `torch.no_grad()` and `model.eval()`, sampling $K$ evaluation batches without graph retention.
  - Monitors training loss vs validation loss gap to detect overfitting or underfitting.
- Checkpoint serialization and state recovery:
  - Persists atomic dictionaries containing model weights, optimizer moment buffers, iteration counter, and best validation score.
  - Guarantees exact reproducible training resumption without loss discontinuities.
- Pretraining failure diagnosis:
  - Loss Explosion ($\text{Loss} \to \text{NaN}$ or sudden surge): diagnosed as excessive learning rate or missing gradient clipping.
  - Initial Loss Baseline: for vocabulary size $V=50,257$, the expected initial uniform loss is $-\ln(1/V) = \ln(50257) \approx 10.82$. Any initial loss far above this indicates projection misconfiguration.

## 4-Language translation equivalence

All core pretraining loop concepts (autoregressive targets, sequence chunking, decoupled weight decay, parameter group segregation, cosine annealing, gradient clipping, train/eval estimation, and checkpoint resumption) are faithfully localized across English, Simplified Chinese, Traditional Chinese, and Japanese with rigorous mathematical fidelity, unified notation, and complete worked exercise code.
