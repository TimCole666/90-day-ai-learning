# Study Days 34–36 review record: MLPs and backpropagation loop

**Review revision:** 2026.10.30-rev2
**Scope:** `day-34`, `day-35`, and `day-36`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.
**Evidence:** `tests/unit/test_study_days_34_36.cjs`, `tests/browser/test_study_days_34_36.cjs`, `scripts/audit_calendar_ledger.py`, and the repository's `projects.autograd.engine.Value`.

## Correction to the previous review

Revision 1's translation-equivalence claim was too broad. The non-English Day 35 activities substituted a half-squared loss with a nonlinear output and, in the final activity, a single ReLU task for the canonical nine-parameter N1 derivation. Day 36 used different learning rates, iteration counts, numerical claims, and tensor-broadcasting failures. The previous review also reported training runs not reproducible from the canonical published experiment. Those claims are superseded by the measured evidence below, not retained as successful acceptance evidence.

The repaired Day 35–36 editions retain their own learner-facing languages but share the same N1 graph, full squared loss, input and parameter order, public code examples, experiment settings, question/option identifiers, and assistance categories. Activities 01/03 are agent-assisted and activities 02/04 are independent, matching the ledger. Day 34 content was not changed by this correction.

All eight Day 35–36 activities now have `content_revision: 2026.10.30-rev2`. Previously stored evidence is not silently presented as current-revision mastery.

## Per-Lesson mathematical review findings

### Lesson 34 — Feedforward MLPs, layer composition, and activation functions

- Each day and its four required activities total 480 active minutes.
- N1 has two tanh hidden units, one **linear** output, and nine parameters in order `(w11,w12,b1,w21,w22,b2,w_o1,w_o2,b_o)`.
- Initial values: `[0.5,-0.25,0.1,-0.5,1.0,-0.2,1.0,-2.0,0.3]`.
- For input `(2.0,-1.0)` and target `1.0`: `z1=1.35`, `z2=-2.2`, `a1≈0.8741`, `a2≈-0.9757`, `o≈3.1255`, and `L=(o-y)^2≈4.5179`.
- For independent input `(1.0,1.0)`: `a1≈0.3364`, `a2≈0.2913`, `o≈0.0538`, and `L≈0.8954`.

### Lesson 35 — Backpropagation by hand and gradient flow

The output error is `delta_o=2(o-y)≈4.2511`. Hidden error terms are `delta_z1=(delta_o*w_o1)*(1-a1^2)` and `delta_z2=(delta_o*w_o2)*(1-a2^2)`. A hidden weight gradient is its hidden error times the corresponding input; a bias gradient is its error term.

Running the published backward example produces all nine gradients, rounded only for display:

| Parameter | Input `(2,-1)` | Independent input `(1,1)` |
| --- | ---: | ---: |
| w11 | 2.0068 | -1.6784 |
| w12 | -1.0034 | -1.6784 |
| b1 | 1.0034 | -1.6784 |
| w21 | -0.8149 | 3.4638 |
| w22 | 0.4075 | 3.4638 |
| b2 | -0.4075 | 3.4638 |
| w_o1 | 3.7157 | -0.6366 |
| w_o2 | -4.1480 | -0.5513 |
| b_o | 4.2511 | -1.8925 |

The focused regression executes the published example and its changed-input counterpart and checks every value. Learner hand derivations allow `1e-3` tolerance to account for displayed intermediate rounding; no `1e-6` agreement is claimed for rounded hand calculations.

Saturation measurements from the public example are `tanh'(4)≈1.34e-3` and `tanh'(8)≈4.5e-7`. A ten-layer chain with each weight magnitude `0.5` has gradient-factor bound `0.5^10=9.765625e-4`. The independent task retains all nine N1 gradients, VJP interpretation, four delta equations, and the localized three-question quiz; it is not a replacement ReLU exercise.

### Lesson 36 — Training loop, learning rate, and failure gallery

The full-batch contract is: zero parameter gradients once before the batch; construct a fresh forward graph and squared loss for each sample; run backward per sample to accumulate gradients; update parameters once after all four samples with `p -= lr * p.grad`. The update uses the **sum** of sample gradients; logging uses the **mean** loss. Zeroing before each sample would discard the earlier batch contributions.

Dataset: `[((2,-1),1), ((0.5,0.5),-1), ((-1,1),-1), ((1,1),1)]`. The initial mean loss is `2.1059580953282215`. Each learning-rate run resets the same nine initial parameters and runs 40 epochs. Loss is logged **before** the update at each indicated zero-based epoch; epoch 39 is the last logged pre-update checkpoint, not a separately measured post-final-update loss.

| Learning rate | Epoch 0 | Epoch 10 | Epoch 20 | Epoch 30 | Epoch 39 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.05 | 2.1059580953 | 0.3688519688 | 0.2680539765 | 0.1891245625 | 0.1288948964 |
| 5.0 | 2.1059580953 | 6.0302148575e36 | 1.6205220157e76 | 4.3548910264e115 | 1.3346500678e151 |

The public command is identical in all four editions and is executed by the focused regression using `.venv/bin/python`. The declining run and diverging run are local toy observations, not proof of optimal learning rates or universal convergence.

The three failure exercises are now the same across editions:

1. Repeating backward on the **same** multi-layer graph changes `w11.grad` from about `2.0068` to `4.0135` (exactly double): `.grad` fields accumulate, so the second pass adds the same vector–Jacobian product again to every non-root node (the root `loss.grad` is re-seeded to 1 on each call). `loss.zero_grad()` clears all reachable nodes; clearing only parameter leaves restores leaf values but leaves stale `.grad` records on interior nodes. The regression clears the whole graph, reruns backward, and verifies recovery of the original gradient. Fresh per-sample graphs are distinct from reused-graph reset semantics.
2. Setting `b1=8.0` gives `z1=9.25`, `tanh'(z1)≈3.7e-8`, and `w11` gradient around `3.3e-7`. This is saturation, not a tensor-broadcasting example.
3. `sum(w*x for w,x in zip([0.5,-0.25],[2,-1,999]))` returns `1.25` and silently drops `999`. An explicit `assert len(x) == len(self.w)` prevents the mismatch.

Diagnosis compares gradients at **identical inputs and parameter values** against a fresh, zeroed graph. The initial Day 35 gradient magnitude is not a universal threshold after training changes parameters.

## Four-language equivalence checks and limits

- Focused checks cover activity identities, complete learner fields, source metadata, shared mathematical/experiment requirements, identical executable blocks, independent versus assisted labels, and the preserved LaTeX gradient operator.
- The whole-candidate regression checks localized quiz identities and option-key parity against the ledger; the focused browser suite renders Days 34–36 in all four languages.
- Numerical execution verifies both nine-gradient tables, saturation at 4/8, repeated-backward corruption and whole-graph recovery, and all ten training checkpoints.
- These checks support this corrected block's local acceptance. They do not certify native-speaker quality, exhaustive semantic correctness of all 90 days, learner mastery, live provider behavior, paid model runs, cloud GPU evidence, production deployment, or the ticket-61 Course Readiness Gate.
