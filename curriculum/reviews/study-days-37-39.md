# Study Days 37–39 review record: text modeling and tokenization

**Review revision:** 2026.10.30-rev1
**Scope:** `day-37`, `day-38`, and `day-39`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.
**Evidence:** `tests/unit/test_study_days_37_39.cjs`, `tests/browser/test_study_days_37_39.cjs`, `scripts/audit_calendar_ledger.py`, `scripts/validate_source_rights.cjs`, and the deterministic tools under `projects/text_tools/`.

## Per-Lesson mathematical and programming review findings

### Lesson 37 — text to tokens: Unicode, byte encodings, and vocabularies

- The four activities total 480 active minutes (120 minutes each) and progress from Unicode code points and UTF-8 byte encodings to discrete token ID mapping tables, reproducible dataset splitting, and an independent derivation check.
- The distinction between glyphs, Unicode code points (`ord()`), and UTF-8 variable-length byte encodings (`.encode('utf-8')`) is established with concrete length classes:
  - ASCII characters (`'a'`) occupy 1 byte (`[97]`).
  - Accented Latin characters (`'é'`) occupy 2 bytes (`[195, 169]`, U+00E9).
  - CJK ideographs (`'猫'`) occupy 3 bytes (`[231, 140, 171]`, U+732B).
  - Emoji symbols (`'😀'`) occupy 4 bytes (`[240, 159, 152, 128]`, U+1F600).
  - The empty string `''` maps to 0 code points and 0 bytes.
- Vocabulary construction maps unique sorted tokens to integer IDs (`stoi`) and reverse lookup tables (`itos`). Fixed-character vocabularies require an explicit out-of-vocabulary (`<unk>`) token ID, whereas byte-level representations natively cover all 256 byte values (`0..255`) and eliminate unseen character errors.
- Deterministic dataset partitioning via `projects/text_tools/cli.py` on 32,033 corpus lines with seed 42 and ratios 0.8 / 0.1 / 0.1 yields exact splits: train = 25,626 lines, val = 3,203 lines, and test = 3,204 lines. Non-overlapping index sets (`no_leakage_verified = True`) and SHA-256 digests guarantee zero leakage between training data and evaluation splits.
- Decoding error policies (`strict`, `replace`, `ignore`) are verified: malformed bytes (e.g. `0xFF`) abort under `strict` (exit code 1) and substitute `U+FFFD` under `replace` (exit code 0).

### Lesson 38 — n-gram language models: counts, conditional probability, and smoothing

- The four activities total 480 active minutes and formalize statistical sequence modeling using bigram transition frequencies, maximum-likelihood estimation, Laplace/add-k smoothing, and log-likelihood/perplexity metrics.
- Bigram counts $C(w_{i-1}, w_i)$ are formed by sliding a 2-token window over token streams. Context totals $C(w_{i-1}) = \sum_w C(w_{i-1}, w)$ serve as normalizers. For the reference 9-token stream (`'the cat sat the cat ran the dog sat'`), context totals evaluate to: `the: 3`, `cat: 2`, `sat: 1`, `ran: 1`, `dog: 1`.
- Maximum-likelihood transition probabilities $P(w_i \mid w_{i-1}) = \frac{C(w_{i-1}, w_i)}{C(w_{i-1})}$ satisfy the probability simplex condition $\sum_{w} P(w \mid w_{i-1}) = 1$ for every context row:
  - $P(\text{cat} \mid \text{the}) = 2/3$, $P(\text{dog} \mid \text{the}) = 1/3$.
  - $P(\text{sat} \mid \text{cat}) = 1/2$, $P(\text{ran} \mid \text{cat}) = 1/2$.
  - Unsmoothed continuation score $\text{Score}(\text{'cat ran'} \mid \text{'the'}) = P(\text{cat} \mid \text{the}) \times P(\text{ran} \mid \text{cat}) = (2/3) \times (1/2) = 1/3 \approx 0.3333$.
- Zero-count defect: any unseen pair $C(w_{i-1}, w_i) = 0$ collapses the product likelihood to zero.
- Add-one (Laplace) smoothing redistributes probability mass to unseen events:
  $$P_{\text{smooth}}(w_i \mid w_{i-1}) = \frac{C(w_{i-1}, w_i) + 1}{C(w_{i-1}) + V}$$
  For vocabulary size $V=5$:
  - $P_{\text{smooth}}(\text{cat} \mid \text{the}) = (2+1)/(3+5) = 3/8 = 0.375$.
  - $P_{\text{smooth}}(\text{ran} \mid \text{cat}) = (1+1)/(2+5) = 2/7 \approx 0.2857$.
  - Smoothed likelihood $L = (3/8) \times (2/7) = 3/28 \approx 0.1071$.
  - Per-token negative log-likelihood $\text{NLL} = -\frac{\ln(3/28)}{2} \approx 1.1168\text{ nats} \approx 1.6112\text{ bits}$.
  - Perplexity $\text{PPL} = \exp(\text{NLL}) = (3/28)^{-1/2} = \sqrt{28/3} \approx 3.055$.
- Held-out evaluation discipline requires counting and vocabulary estimation exclusively on the training split, tuning hyperparameters on validation, and preserving the test split for final unbiased evaluation.

### Lesson 39 — byte-pair encoding (BPE): merge mechanics and tokenizer boundaries

- The four activities total 480 active minutes and teach iterative subword construction from raw UTF-8 bytes to learned rank-ordered merge tables.
- Tracing the toy corpus `'aaabdaaabac'` with byte IDs `[97,97,97,98,100,97,97,97,98,97,99]`:
  - Round 1: pair `(97, 97)` occurs 4 times $\to$ assigned ID 256 (`'aa'`). Sequence becomes `[256, 97, 98, 100, 256, 97, 98, 97, 99]`.
  - Round 2: pairs `(256, 97)` and `(97, 98)` tie at count 2. Insertion-order tie-breaking selects `(256, 97)` $\to$ ID 257 (`'aaa'`). Sequence becomes `[257, 98, 100, 257, 98, 97, 99]`.
  - Round 3: pair `(257, 98)` occurs 2 times $\to$ assigned ID 258 (`'aaab'`). Sequence becomes `[258, 100, 258, 97, 99]`.
  - Compression result: 11 bytes compressed to 5 tokens (2.2× compression ratio); vocabulary expands from 256 base bytes to 259 subword tokens.
- Lossless decoding: concatenating byte slices from the reverse vocabulary table recovers the original text bit-for-bit (`decode([258, 100, 258, 97, 99]) == 'aaabdaaabac'`).
- Unknown-input immunity: because base IDs cover all byte values $0..255$, foreign or unmerged inputs (such as `'é猫'` $\to$ `[195, 169, 231, 140, 171]`) decode losslessly without triggering out-of-vocabulary `<unk>` replacements.
- Compression disparity on held-out text: the merge table fit on `'aaabdaaabac'` compresses its own training text at 2.2× (11 bytes $\to$ 5 tokens), but compresses the held-out string `'aab'` at only 1.5× (3 bytes $\to$ 2 tokens `[256, 98]`). This proves why merge statistics specialize to training data and must not be learned on validation or test sets.
- Contrast with production tokenizers (e.g. OpenAI `tiktoken`): production tokenizers add regex pre-tokenization (preventing merges across whitespace, punctuation, and contractions), special token handling (`<|endoftext|>`), and 50,000–100,000 vocabulary sizes.

## Four-language translation review findings

For all three target Study Days (`day-37`, `day-38`, `day-39`) across English (`en`), Simplified Chinese (`zh-Hans`), Traditional Chinese (`zh-Hant`), and Japanese (`ja`):

- **Structural Parity:** Every language edition contains the exact 4 activity IDs per day, totaling 12 activities across the 3 days. All activities possess the required field set: `title`, `prerequisites`, `objective`, `assistance_policy_label`, `instructions`, `exercise_prompt`, `hint`, `answer`, and `mastery_criterion`.
- **Mathematical and Technical Invariance:** Numeric counts, character code points, UTF-8 byte arrays (`[231,140,171]`, `[195,169]`, `[240,159,152,128]`), merge IDs (`256`, `257`, `258`), transition probabilities ($2/3$, $1/3$, $1/2$, $1$), smoothed probabilities ($3/8$, $2/7$, $3/28$), NLL ($\approx 1.1168\text{ nats}$), perplexity ($\approx 3.055$), line counts ($25626 / 3203 / 3204$), CLI flags (`--input`, `--split`, `--errors strict`), and Python function calls remain strictly identical across all four languages.
- **Natural Technical Localization:**
  - *English:* Standard terminology (Unicode code points, UTF-8 bytes, vocabulary mapping, bigram counts, maximum likelihood, Laplace smoothing, perplexity, Byte-Pair Encoding, lossless round-trip).
  - *Simplified Chinese (zh-Hans):* 码位, 字节编码, 词汇表 (stoi/itos), 二元语法 (bigram), 最大似然估计, 加一平滑 (Laplace smoothing), 负对数似然 (NLL), 困惑度 (Perplexity), 字节对编码 (BPE), 无损解码, 留出集 (held-out).
  - *Traditional Chinese (zh-Hant):* 碼位, 位元組編碼, 詞彙表, 二元語法, 最大概似估計, 加一平滑化, 負對數概似度, 困惑度, 位元組對編碼 (BPE), 無損解碼, 留出集.
  - *Japanese (ja):* コードポイント, バイトエンコーディング, 語彙, バイグラム (2-gram), 最尤推定, 加算スムージング (Add-one smoothing), 負の対数尤度 (NLL), パープレキシティ, バイト対符号化 (BPE), 可逆（ロスレス）デコード, ホールドアウト.
- **Edge-Case and Round-Trip Validation:** All language editions explicitly demonstrate empty string handling (`''`, `空字串`, `空文字列`, `空字符串`) and multi-byte Unicode handling (`'é猫'`, `'😀'`).

## Source resources and rights provenance review

- All referenced sources (`py-unicode-howto`, `karpathy-minbpe`, `openai-tiktoken`, `karpathy-makemore`, `cs336-basics`, `jurafsky-slp3-ngram`, `sennrich-bpe-paper`) are registered in `curriculum/sources/registry.json`.
- Every activity in Days 37–39 carries at least 2 full source resource entries with:
  - Canonical provenance metadata (author, title, verified URL, verification date).
  - Permissive linking/original explanation reuse categorization.
  - Transparent disclosure of licenses and restrictions (e.g. YouTube subtitle distribution reservations for video lectures).
  - Robust offline safe fallback descriptions ensuring complete offline study capability.
  - At least 2 compared candidate sources with substantive comparative selection rationales.

## Verification limits

This record documents deterministic mathematical derivations, structural four-language equivalence, CLI reproducibilities, and automated browser rendering seams. It does not certify human subjective learning outcomes or unconstrained live network access.
