# Source-fidelity spot checks

Status: **internal recheck in progress**. Checked 2026-11-01 by Claude; corrections rechecked by ChatGPT. These are internal AI-assisted checks, not independent subject-matter review.

> One course claim per topic block of `curriculum/sources/comparison-matrix.json` was read against the cited source. This is a sample, not a full audit: twelve claims out of hundreds, picked because each depends on a specific statement in its source. A passing check shows that one claim matches one passage; it says nothing about the rest of the block. No subject-matter expert has reviewed these checks.

Method:

- Each source was downloaded on 2026-11-01 (arXiv PDFs through `pdftotext`; web pages as HTML) and the passage was found by searching the text. The "Source text checked" field quotes or closely paraphrases that passage.
- Verdicts use three values only: `agrees`, `partly agrees`, `disagrees`. "Partly agrees" means part of the claim matches and part is unsupported by, or differs from, the source.
- Locator errors found during a check were fixed in the data. `tests/projects/test_source_fidelity_spot_checks.py` checks this page's structure and those two fixes.
- Historical findings remain visible below. Resolution fields record authorized lesson corrections; they do not erase the original mismatch. Independent expert review has not occurred and is not an acceptance prerequisite.

## b01-python-semantics-and-git: Python object semantics, files and first Git workflow

- **Course claim:** day-04-act-01 answer: "bool() is False for numeric zero, the empty string, and None, but True for "0" because it is a non-empty string."
- **Source locator:** `py-docs-builtins-ticket26`, Python 3 Library Reference, Built-in Types, "Truth Value Testing" (Python 3.15.2 documentation, https://docs.python.org/3/library/stdtypes.html#truth-value-testing).
- **Source text checked:** "By default, an object is considered true unless its class defines either a `__bool__()` method that returns False or a `__len__()` method that returns zero"; the listed false values include "None and False", "zero of any numeric type: 0, 0.0, …" and "empty sequences and collections: '', (), [], …".
- **Verdict:** agrees
- **Notes:** "0" has length 1, so it is true; this follows from the `__len__` rule, and the page lists only `''` among strings.

## b02-text-tools-and-testing: Text tools project, control flow and unit testing

- **Course claim:** day-12-act-01 instructions: "with self.assertRaises(ExceptionType): proves that a call fails the way the contract says."
- **Source locator:** `py-docs-unittest`, "Classes and functions: Test cases", entry for `assertRaises` (Python 3.15.2 documentation, https://docs.python.org/3/library/unittest.html#test-cases).
- **Source text checked:** "If only the exception and possibly the msg arguments are given, return a context manager so that the code under test can be written inline rather than as a function: `with self.assertRaises(SomeException): do_something()`". The test "passes if exception is raised, is an error if another exception is raised, or fails if no exception is raised."
- **Verdict:** agrees
- **Notes:** The source draws the same distinction between a failure (no exception) and an error (a different exception) that the course relies on.

## b03-calculus: Derivatives, the chain rule and gradients

- **Course claim:** day-19-act-01 objective: "State the chain rule dy/dx = dy/du * du/dx for a composition y = g(u), u = h(x) … and apply it to a polynomial power."
- **Source locator:** `openstax-calculus-1`, Calculus Volume 1, Section 3.6 The Chain Rule (https://openstax.org/books/calculus-volume-1/pages/3-6-the-chain-rule): "Rule: The Chain Rule" box (Equation 3.17), "Rule: Chain Rule Using Leibniz's Notation", and Example 3.48 "Using the Chain and Power Rules".
- **Source text checked:** "the derivative of the composite function h(x) = (f ∘ g)(x) = f(g(x)) is given by h′(x) = f′(g(x))g′(x)" (3.17); the Leibniz box states "If y is a function of u, and u is a function of x, then dy/dx = dy/du · du/dx."
- **Verdict:** agrees
- **Notes:** Locator fixed. The card cited "Theorem 3.8", but the current page labels the general rule as an unnumbered "Rule" box, and its only numbered theorem is Theorem 3.10 (the chain rule with trigonometric functions). The Day 19 `relevant_timestamp` now names the boxes and the example that are on the page.

## b04-linear-algebra: Vectors, matrices and array memory

- **Course claim:** day-24-act-02 objective: "Apply the broadcasting rule - align trailing axes; each pair of dimensions must be equal or one must be 1."
- **Source locator:** `numpy-docs-broadcasting`, NumPy User Guide, Broadcasting, "General broadcasting rules" (NumPy v2.5 manual, https://numpy.org/doc/stable/user/basics.broadcasting.html).
- **Source text checked:** NumPy "starts with the trailing (i.e. rightmost) dimension and works its way left. Two dimensions are compatible when they are equal, or one of them is 1. If these conditions are not met, a ValueError: operands could not be broadcast together exception is thrown". It adds that "Input arrays do not need to have the same number of dimensions."
- **Verdict:** agrees
- **Notes:** The course's failure-diagnosis exercises rely on the ValueError behavior that the same paragraph documents.

## b05-probability-statistics: Probability, statistics and information theory

- **Course claim:** day-27-act-01 instructions: "The Shannon information content of an outcome with probability p is −log₂ p bits, or −ln p nats; 1 bit = ln 2 ≈ 0.6931 nats. Rarer outcomes carry more information."
- **Source locator:** `mackay-itila`, MacKay, *Information Theory, Inference, and Learning Algorithms* (Cambridge University Press 2003, author's on-screen PDF), Chapter 2 Probability, Entropy, and Inference, Section 2.4 Definition of entropy and related functions, Equation 2.34.
- **Source text checked:** "The Shannon information content of an outcome x is defined to be h(x) = log₂ 1/P(x). It is measured in bits." The example that follows gives z 10.4 bits and e 3.5 bits.
- **Verdict:** agrees
- **Notes:** Only the bits definition was checked against MacKay. The bits-to-nats conversion is a log identity, and it does not appear in the Chapter 2 pages checked. The course's numbers (for example 2 bits = 1.3863 nats) were not checked against any source. The card locator says "Chapter 2 … (Shannon information content)"; Section 2.4 would be more precise.

## b06-autodiff: Backpropagation and a scalar autograd engine

- **Course claim:** day-32-act-01 objective and answer: reverse-mode backpropagation uses a post-order DFS topological sort, and `backward()` runs `_backward()` along the reversed order, so the root fires first.
- **Source locator:** `karpathy-micrograd`, `micrograd/engine.py`, `Value.backward` (lines 54-70 of the master branch, https://github.com/karpathy/micrograd/blob/master/micrograd/engine.py).
- **Source text checked:** `build_topo(v)` marks v visited, recurses into every `child in v._prev`, then `topo.append(v)`. `backward` sets `self.grad = 1` and runs `for v in reversed(topo): v._backward()`.
- **Verdict:** agrees
- **Notes:** `_prev` is a Python set, so the order between siblings is not fixed. The course trace [f, sum, b, a] is one valid order; the source guarantees only that each node comes after all of its children in `topo`.

## b07-language-models-and-transformer: Tokenization, n-gram and neural language models, the Transformer

- **Course claim:** day-46-act-03 objective: "Contrast Pre-LN (x = x + Attn(LN(x))) with original Post-LN (x = LN(x + Attn(x))) and justify why modern LLMs exclusively use Pre-LN."
- **Source locator:** `vaswani-attention-2017`, Vaswani et al., "Attention Is All You Need" (arXiv:1706.03762v7), Section 3.1 Encoder and Decoder Stacks.
- **Source text checked:** "We employ a residual connection around each of the two sub-layers, followed by layer normalization. That is, the output of each sub-layer is LayerNorm(x + Sublayer(x))".
- **Verdict:** partly agrees
- **Notes:** The Post-LN formula matches the source. The word "exclusively" is not supported: neither cited source (Vaswani, or the Annotated Transformer's Pre-LN `SublayerConnection`) makes a claim about which normalization placement modern LLMs use. This was a content finding, not evidence that the source itself is unsuitable.
- **Resolution:** The day-46-act-03 objective, instructions and exercise in en, ja, zh-Hans and zh-Hant no longer assert exclusive adoption. They distinguish Xiong et al.'s initialization analysis and experiments from the specific GPT-2 (Section 2.3) and Llama 2 (Section 2.2) architecture examples; source cards for all three were added. No survey-wide adoption claim is made.

## b08-pretraining: Pretraining loop, decoding, checkpoints and compute

- **Course claim:** day-56-act-01 instructions: "Mixed-precision AdamW training holds 16 bytes per parameter (ZeRO paper): FP16 weights 2 + FP16 gradients 2 + FP32 master weights, first moment and second moment 4 + 4 + 4."
- **Source locator:** `rajbhandari-zero-2020`, Rajbhandari et al., "ZeRO: Memory Optimizations Toward Training Trillion Parameter Models" (arXiv:1910.02054v3), Section 3.1 Model States: Optimizer States, Gradients and Parameters.
- **Source text checked:** The optimizer keeps fp32 parameters, momentum and variance, "with memory requirements of 4Ψ, 4Ψ, and 4Ψ bytes, respectively … Mixed-precision Adam has K = 12. In total, this results in 2Ψ + 2Ψ + KΨ = 16Ψ bytes of memory requirement."
- **Verdict:** agrees
- **Notes:** The paper says Adam, not AdamW. AdamW keeps the same two moment buffers, so the byte count carries over, but that step is the course's inference, not the paper's statement.

## b09-instruction-tuning-lora: Instruction data, supervised fine-tuning and LoRA

- **Course claim:** day-64-act-02 instructions (original wording): "Examine initialization: A ~ N(0, 1/r) or Kaiming uniform, while B = 0 … at step 0, Delta W = (alpha/r) * 0 * A = 0."
- **Source locator:** `hu-lora-2021`, Hu et al., "LoRA: Low-Rank Adaptation of Large Language Models" (arXiv:2106.09685v2), Section 4.1 Low-Rank-Parametrized Update Matrices. A secondary check used the implementations: `microsoft/LoRA` `loralib/layers.py` (main) and `huggingface/peft` `src/peft/tuners/lora/layer.py` (main), fetched 2026-11-01.
- **Source text checked:** Paper: "We use a random Gaussian initialization for A and zero for B, so ∆W = BA is zero at the beginning of training. We then scale ∆W x by α/r". loralib's `Linear` uses `nn.init.kaiming_uniform_(self.lora_A, a=math.sqrt(5))` and `nn.init.zeros_(self.lora_B)`. PEFT's default does the same; its `"gaussian"` option uses `nn.init.normal_(lora_A, std=1 / r)`.
- **Verdict:** partly agrees
- **Notes:** B = 0, ∆W = 0 at step 0, and the α/r scaling all match the paper. The paper gives no variance for A. "N(0, 1/r)" read in the usual N(mean, variance) notation means a standard deviation of 1/√r, which is neither in the paper nor in PEFT (whose Gaussian option has standard deviation 1/r, variance 1/r²). "Kaiming uniform" matches both implementations, not the paper. This was an initialization-parameter attribution error.
- **Resolution:** The day-64-act-02 instructions in all four editions distinguish the paper's unspecified Gaussian variance, the taught implementation's Kaiming-uniform initialization, and PEFT's optional Gaussian standard deviation of 1/r. Zero initialization of B and alpha/r scaling are retained.

## b10-evaluation: Benchmarks, metrics and honest baselines

- **Course claim:** day-70-act-01 instructions: "GSM8K (Cobbe et al. 2021): grade-school word problems whose reference solution ends in '#### <number>'."
- **Source locator:** `cobbe-gsm8k-2021`, Cobbe et al., "Training Verifiers to Solve Math Word Problems" (arXiv:2110.14168v2), Section 2 Dataset and Appendix F Verifier Visualization.
- **Source text checked:** The abstract introduces "a dataset of 8.5K high quality linguistically diverse grade school math word problems"; Section 2 says the problems "take between 2 and 8 steps to solve". All five occurrences of `####` in the paper are in Appendix F, where each displayed solution ends in a line such as "#### 7" or "#### 4".
- **Verdict:** agrees
- **Notes:** The paper shows the format in its examples but never states it as a rule. The rule is part of the released dataset, which was not checked here.

## b11-agents-and-reliability: Tool-using agents, recovery and delivery engineering

- **Course claim:** day-78-act-01 instructions: "Cascading-failure model (Google SRE ch.22): retries multiply offered load exactly when the dependency is degraded; a retry budget plus jittered backoff bounds that amplification."
- **Source locator:** `google-sre-cascading-failures`, *Site Reliability Engineering*, Chapter 22 Addressing Cascading Failures (Mike Ulrich), "Retries" (https://sre.google/sre-book/addressing-cascading-failures/#retires; the misspelled anchor is the page's own).
- **Source text checked:** "Retries can amplify the effects seen in Server Overload." "Always use randomized exponential backoff when scheduling retries." "Consider having a server-wide retry budget … This strategy can contain the retry effect". Retries at several levels mean "a single request at the highest layer may produce a number of attempts as large as the product of the number of attempts at each layer".
- **Verdict:** agrees
- **Notes:** "Multiply" matches the chapter's per-layer product of attempts. "Bounds" is slightly stronger than the source's "can contain".

## b12-agent-evaluation-capstone: Agent evaluation, reporting and capstone

- **Course claim:** day-82-act-02 source card for `yao-taubench-2024`: τ-bench "Introduces pass^k consistency metrics and database-state outcome checks for tool-agent-user interaction, separating reliable task completion from single lucky runs."
- **Source locator:** `yao-taubench-2024`, Yao et al., "τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains" (arXiv:2406.12045v1): Section 3 (definition), Section 4.2 Key Characteristics, Section 5 Experiments.
- **Source text checked:** Section 3: "we propose a new metric – pass^k (pass hat k), defined as the chance that all k i.i.d. task trials are successful, averaged across tasks." Section 4.2, "Faithful rule-based evaluation": "subjective and noisy human judgments can be replaced by simple and objective database state comparisons."
- **Verdict:** agrees
- **Notes:** Locator fixed. The cards cited only Sections 4.2 and 5, which use pass^k without defining it. The Day 82-84 cards now name Section 3 first. The SWE-bench cards in the same block were also read: Section 2.1 defines the "fail-to-pass test", which matches the Day 89 locator.

## Resolutions and limits

The b07 and b09 findings were corrected across all four editions under the owner's authorization. The two historical `partly agrees` verdicts are preserved with explicit resolutions rather than rewritten as if the original claims had agreed. Regression tests inspect the corrected lesson text and citations.

This remains a twelve-claim sample, not a claim-by-claim verification of the entire curriculum. No independent expert review occurred. A separate source-selection review must determine whether the researched source sets meet the strict pedagogical-quality requirement; neither this page nor passing tests establishes that by itself.
