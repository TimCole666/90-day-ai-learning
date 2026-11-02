# Study Days 22–24 review record

**Review revision:** 2026.10.30-rev1
**Scope:** `day-22`, `day-23`, and `day-24`; English, Simplified Chinese, Traditional Chinese, and Japanese editions.

## Per-lesson findings

- Day 22 teaches vectors as both arrows and ordered lists: component-wise addition, scalar multiplication, linear combinations, dot products as alignment/attention scores, and the two views (row-dot and column combination) of a matrix-vector product. All worked values were re-derived independently during authoring (e.g., `v+w = (4,1)`, `2v - w = (-1,5)`, `u.v = 5`, `W*x = (4,5)` for `x = (2,1)`).
- Day 23 covers matrix multiplication as composed linear maps, non-commutativity (`A*B = [[2,1],[4,3]]` vs `B*A = [[3,4],[1,2]]`), explicit `(m x k)(k x n) -> m x n` shape ledgers, transpose with `(C*D)^T = D^T*C^T` verified numerically, identity, and inverse intuition including a singular counterexample (`det = 0`, `S*(2,-1) = 0`).
- Day 24 generalizes to rank-n tensors with named batch/time/channel axes: the `(V,d)` + `(B,T) -> (B,T,d)` embedding lookup, broadcasting rules with a deliberate failure case `(2,3) + (4,)`, reshape element-count invariance, the transpose/non-contiguous view-versus-copy caveat, and byte-level memory ledgers (`(32,128,768)` float32 = 12 MiB).
- The final activity on each day requires an independent prediction-and-verification pass under a declared no-assistance condition, followed by an honest recovery note; no unattended runtime or break is counted inside the 480 active minutes.
- Numerical review: every worked answer in all four editions was recomputed by hand and cross-checked with a pure-Python verifier during authoring; values, matrix entries, shapes, and byte counts are identical across language editions.

## Language-edition review

All four editions share the same stable activity IDs and equivalent objectives, instructions, exercise prompts, hints, reference answers, recovery links, and mastery criteria. Numeric results, shape ledgers, and code/API names (`reshape`, `.T`, `.contiguous()`, `keepdims`, `softmax`) are invariant across editions. Terminology follows each locale's math convention: vector = 向量 / 向量 / ベクトル, matrix = 矩阵 / 矩陣 / 行列, tensor = 张量 / 張量 / テンソル, broadcast = 广播 / 廣播 / ブロードキャスト; Simplified and Traditional editions use 行 (row) and 列 (column) consistently. This deterministic review checks structural and numerical equivalence; it does not claim native-speaker certification.

## Source and rights review

Co-primary sources are the 3Blue1Brown *Essence of Linear Algebra* series (CC BY-NC-SA 4.0, linking only) and MIT OCW 18.06 Linear Algebra by Gilbert Strang (CC BY-NC-SA 4.0, linking only) for Days 22–23; NumPy's broadcasting user-guide page and ndarray reference (BSD 3-Clause, linking only) are co-primary for Day 24 (with the ndarray reference also cited on Day 23 for shape semantics). All four are registered in `curriculum/sources/registry.json` with license restrictions, permission basis, availability limitations, and compared-candidate analyses (including a rejected candidate with unclear licensing). No source text, transcript, or video content is imported; lesson explanations and worked examples are original course text and the lesson is complete offline.

## Execution and acceptance limits

Structural tests validate 480-minute accounting, activity/source-resource completeness, four-edition content parity with required fields, localized linear-algebra terminology, and that nothing under `lessons/` changed. Browser tests verify all twelve day/language routes render activity cards, headers, and language switchers. They do not prove learner mastery, live library behavior, or human translation review.
