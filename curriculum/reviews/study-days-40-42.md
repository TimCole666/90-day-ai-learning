# Study Days 40–42 review record: embeddings and neural language models

**Review revision:** 2026.10.30-rev1
**Scope:** `day-40`, `day-41`, and `day-42`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.
**Evidence:** `tests/unit/test_study_days_40_42.cjs`, `tests/browser/test_study_days_40_42.cjs`, `scripts/audit_calendar_ledger.py`, and the verified worked numbers reproduced in this record.

## Per-Lesson mathematical review findings

### Lesson 40 — learned embedding tables and distributed representations

- The four activities total 480 active minutes and progress from the one-hot lookup identity, through embedding-row geometry, to context concatenation and an AI-free parameter-ledger check.
- The lookup identity `e_i * C = C[i,:]` is worked for `e_2` (`[-0.4, 0.5]`) and `e_3` (`[0.0, 0.2]`) on the 4x2 table with rows `'.'`=`[0.1,0.3]`, `'a'`=`[0.2,-0.1]`, `'b'`=`[-0.4,0.5]`, `'c'`=`[0.0,0.2]`; verified by direct computation.
- Similarity exercise: `dot('.','c') = 0.06`, `cos('.','c') = 0.06/(0.3162*0.2) = 0.9487`; `dot('a','b') = -0.13`, `cos('a','b') = -0.908`. The lesson states plainly that these distances are accidents of random initialization and carry no semantics until training.
- Concatenation: context `('a','b')` gives `x = [0.2, -0.1, -0.4, 0.5]` (dimension `block*d = 4`); context `('b','.')` gives `[-0.4, 0.5, 0.1, 0.3]`. Parameter ledgers verified: tiny model `8+12+3+12+4 = 39`; names-scale `V=27, d=10, block=3, hidden=100` gives `270+3000+100+2700+27 = 6097`.
- Independent check uses a fresh configuration (`V=8, d=4, block=3, hidden=64`): `C` holds 32 parameters, input dimension is 12, and the total ledger is `32+768+64+512+8 = 1384`.

### Lesson 41 — the neural language model forward pass

- The four activities total 480 active minutes and walk a Makemore-style MLP end to end: indices, lookup, concatenation, `tanh` hidden layer, logits, stable softmax, and an AI-free held-out-context reproduction.
- Worked pass for context `('a','b')` with `x = [0.2,-0.1,-0.4,0.5]`: pre-activations `[0.31, -0.51, 0.01]`, hidden `h = [0.300437, -0.469945, 0.010000]`, logits `z = [-0.080891, -0.173033, 0.209120, 0.026044]`, probabilities `p = [0.229291, 0.209107, 0.306433, 0.255169]` (sum = 1.0). All values recomputed independently in Python and consistent across the four editions.
- The max-shift stability argument is backed by the counterexample logits `[1000,999,998]`: unshifted `exp(1000)` overflows float64 while the shifted distribution `[0.665241, 0.244728, 0.090031]` is well-defined; the lesson states the invariance `softmax(z - c) = softmax(z)` and asks for the proof optionally.
- The linear-collapse claim (`z = x*(W1*W2)` without nonlinearity) is a derivation, not an assertion, and `tanh(5.0) = 0.9999` anchors the saturation discussion.
- Independent check on held-out context `('b','a')`: `x = [-0.4, 0.5, 0.2, -0.1]`, `pre = [0.01, 0.27, -0.11]`, `h = [0.010000, 0.263625, -0.109558]`, `z = [0.190317, -0.009231, -0.084504, 0.044823]`, `p = [0.290410, 0.237875, 0.220627, 0.251087]`; argmax index 0 (`'.'`) is honestly flagged as a wrong, confident-looking prediction from untrained weights.

### Lesson 42 — loss, training discipline, and weekly consolidation

- The four activities total 480 active minutes; `day-42` is a review day and its retrieval/independent-assessment work is counted inside the ledger, not appended to it.
- Cross-entropy: `L = -ln(0.255169) = 1.365831` nats for context `('a','b')` target `'c'`, compared honestly against the uniform baseline `ln(4) = 1.386294` (untrained model at about chance level; perplexity `1/0.255169 = 3.92`). The auxiliary 3-class example `z = [1.0, 0.5, -0.5]` gives `p = [0.5465, 0.3315, 0.1220]` and `NLL = 0.6041`.
- The training-loop activity describes forward -> mean NLL -> backward -> `p <- p - lr*dL/dp` and the role of fixed 80/10/10 splits and fixed seeds; it explicitly promises no loss threshold and claims only direction plus honest measurement.
- Counterexamples are numerical, not rhetorical: memorization (train NLL -> 0 vs dev near `ln(4)`), overflow (`exp(1000)` vs the shifted `[0.665241, 0.244728, 0.090031]`), and a bigram baseline `p(c|b) = 0.75 -> NLL 0.287682` that beats the untrained MLP's `1.365831` while losing on unseen pairs (`-ln(0.25) = 1.386294`).
- The final assessment recomputes `L = -ln(0.237875) = 1.436009` for context `('b','a')` target `'a'` — above uniform, so the untrained model is worse than chance on that pair — and restates the two conditions (dev loss below baseline on held-out data, fixed splits/seeds) for an honest better-than-bigram claim.

## Four-language translation review findings

For every target day and each language (`en`, `zh-Hans`, `zh-Hant`, `ja`):

- The edition contains the same four activity IDs, the same activity field set (`title`, `prerequisites`, `objective`, `instructions`, `exercise_prompt`, `hint`, `answer`, `mastery_criterion`), the same assistance-policy labels, and the same final three-question quiz shape.
- All numerical constants (embedding rows, weight matrices, pre-activations, hidden values, logits, probabilities, losses, parameter counts, baselines), symbol vocabularies, matrix/vector notation, and identifiers (`C`, `W1`, `b1`, `W2`, `b2`, `tanh`, `softmax`, `NLL`, `argmax`) are identical across editions. The Traditional Chinese edition is separately authored (e.g., 串接/欄/網路/機率/復原), not a mechanical conversion of Simplified Chinese.
- The localized check verifies the embedding term (`embedding`/`嵌入`/`埋め込み`), `softmax`, and the cross-entropy/NLL terminology appear in every edition, and that the worked values `0.255169`, `1.365831`, `0.237875`, `1.436009`, `6097`, and `39` appear invariantly.
- Navigation, prompts, hints, reference answers, quiz explanations, policy labels, and source/provenance labels are localized rather than English-only placeholders. This is deterministic structural evidence; it is not native-speaker certification.

## Source and rights review

- `karpathy-makemore-mlp`: the Makemore repository is MIT-licensed public code; the lecture video is under the Standard YouTube License with unknown subtitle rights, so reuse is `linking` only — no video, audio, subtitle, or transcript text is imported, and the software license is not generalized to the video (`has_unknown_subtitle_rights` and `software_repository_license_only` are recorded).
- `bengio-2003-nplm`: JMLR open-access paper linked as the primary theoretical citation; all lesson explanations and worked numbers are original formulations.
- Each new registry entry records attribution, original URL, verification date, reuse category, license and restrictions, permission basis, availability limitations, safe fallbacks, and at least three compared candidates with decision status and rationale (CS336 deferred, 3Blue1Brown alternative, Jurafsky & Martin alternative, word2vec deferred).
- Day ledgers carry two full source objects per activity with the same provenance fields; registry merges supply the compared-candidate records at validation time.

## Execution and acceptance limits

Verified locally: the worked forward-pass, softmax, and loss numbers were recomputed in Python (`math.tanh`, `math.exp`, `math.log`) and match the published values to 6 decimals; `exp(1000)` raises `OverflowError` in float64 as claimed. The structural unit test checks 480-minute accounting, four-edition parity, required fields, source objects, manifest status, and that `lessons/` is untouched. The browser test visits all 12 language/day routes. This review does not claim live video playback, GPU training runs, learner mastery outcomes, or independent native-speaker review.
