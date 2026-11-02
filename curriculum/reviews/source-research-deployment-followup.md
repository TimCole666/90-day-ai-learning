# Deployment Follow-Up: Primary-Source Research

**Date context:** 2026-11-01  
**Scope:** Three unresolved source gaps in the owner hand-off review. Research was limited to primary/first-party sources. No deployment, external training run, paid service, GPU use, or expert review occurred. Recommended mappings below are proposals, not claims of edited lesson assignments: the Anthropic article is already assigned in Days 82–83; the suggested Days 64–72 extensions are not implemented by this research note.

**Strict source-quality status: partially satisfied; expert review pending.** This status is retained verbatim. The requirement remains highest-quality publicly available learning resources per topic; this comparison is bounded evidence, not proof of global-best status. No independent expert review occurred and none is a prerequisite for internal evidence-based acceptance.

## 1. Efron 1979 bootstrap paper

### Accessibility and locator result

The official [Project Euclid article record](https://projecteuclid.org/journals/annals-of-statistics/volume-7/issue-1/Bootstrap-Methods-Another-Look-at-the-Jackknife/10.1214/aos/1176344552.full) is the canonical primary record for Bradley Efron, “Bootstrap Methods: Another Look at the Jackknife,” *The Annals of Statistics* 7(1), 1–26 (1979). The record is not a readable full text in this research session. A direct request to the DOI download endpoint returned an Incapsula block page; the nominal Euclid PDF route returned invalid PDF structure. An attempted University of Helsinki-hosted PDF timed out. Search-index results returned metadata and unrelated matches, not this article’s body. Consequently **no article section, page, equation, or passage is verified**. In particular, the commonly repeated Section 2 / page 3 locator is not validated and must not be supplied as fact.

The abstract/record alone is insufficient evidence for the course’s claims about resampling with replacement, empirical sampling distributions, standard errors, or confidence intervals. Keep the Day 71 activity’s `locator_status: pending_verification` until a readable copy is inspected; do not use abstract wording to clear it.

### Plausible primary alternatives considered

- [Koehn, “Statistical Significance Tests for Machine Translation Evaluation”](https://aclanthology.org/W04-3250/), especially Sections 5–6 (“Bootstrap Resampling” and “Paired Bootstrap Resampling”), is an accessible primary NLP application and a useful practice bridge for paired score differences. It is not Efron’s paper and does not, without inspection of its own exposition, establish the broader confidence-interval claims assigned to Day 71.
- [Dror et al., “The Hitchhiker’s Guide to Testing Statistical Significance in NLP”](https://aclanthology.org/P18-1128/) is a readable primary-authored tutorial/survey paper covering significance testing in NLP. It is more current in application context, but is not the source of Efron’s original method and is not evidence for a locator in his article.

These can support Day 71’s applied paired-resampling or significance-testing context, but neither is a verified replacement for a precise Efron locator or for a beginner explanation of percentile confidence intervals. Do not map either as the original-bootstrap source without checking its full text and matching the exact lesson claims.

### Reuse terms, separate from pedagogy

The Efron article is publisher/Institute of Mathematical Statistics material on Project Euclid; this research did not verify a reuse grant. Linking/citation is the only assumed use, not republication. ACL Anthology’s record pages provide public reading for Koehn and Dror; consult each article’s displayed license before reproducing text, figures, exercises, or translations. No content has been copied into the course.

### Course mapping and remaining uncertainty

Day 71 activity 04 remains the right location for the local non-parametric bootstrap confidence-interval exercise. The local implementation remains a fallback, not evidence that the selected external source claim is verified. Efron’s text is still unavailable for locator checking; claims about the specific paper remain unresolved.

## 2. Beginner LoRA teaching candidate: adapters and memory

### Candidate A: Hugging Face PEFT method overview (recommended teaching supplement)

**Current accessible first-party source:** [Parameter efficient fine-tuning methods](https://huggingface.co/docs/peft/methods/overview). The live documentation page is readable HTML; its linked source project is [huggingface/peft](https://github.com/huggingface/peft), whose repository license is Apache-2.0. Exact inspected passages/sections:

- “Parameter efficient fine-tuning methods”: PEFT trains fewer parameters, generally using less memory, but explicitly cautions that comparable performance is not guaranteed.
- “Adapter methods”: describes adding relatively small trainable matrices to existing models; describes LoRA as the common low-rank formulation and calls it a good starting point for readers getting started with PEFT.
- The overview’s comparison note says PEFT methods vary in quantized-base support, merging, supported layers, and runtime overhead. It explicitly warns that methods generally add runtime overhead, sometimes mitigated by merging.
- Its preliminary workflow suggests trying prompting before layer tuning/adapter methods and measuring retention after fine-tuning.

This is an accuracy-checked beginner conceptual orientation to what adapters are and what “efficient” means, but it is not a complete worked LoRA derivation or answer-keyed exercise sequence. It correctly avoids claiming that only adapter parameters occupy GPU memory. It does not enumerate the full memory ledger (base weights, activations, adapter gradients and optimizer state, temporary buffers), so the local Day 64–65 ledger remains necessary.

### Candidate B: LoRA original paper (definition and memory evidence, not beginner teaching)

[Hu et al., LoRA](https://arxiv.org/html/2106.09685), arXiv v2 / ICLR 2022, is available as readable full HTML. Exact inspected passages:

- Section 4.1, “Low-Rank-Parametrized Update Matrices”: defines `W0 + BA`, states the pretrained `W0` is frozen and `A`, `B` trainable, and says Gaussian random initialization is used for `A` and zero initialization for `B` so the initial update is zero. It then gives the paper’s `alpha/r` scaling.
- Section 4.1, “No Additional Inference Latency”: describes merging the update into `W0` for deployment.
- Section 4.2, “Applying LoRA to Transformer,” paragraph “Practical Benefits and Limitations” and its deployment-memory footnote: says the frozen model still needs to be present at deployment and reports memory savings in the paper’s specific large-model/Adam setup because optimizer state for frozen parameters is unnecessary. The numerical claims are experimental setup-specific, not universal beginner GPU-fit guarantees.
- Section 4.2 also states the study’s target matrices and frozen MLP choice; this is evidence against teaching one target-module choice as universal.

This paper is the primary technical reference, not a beginner teaching candidate. Its initialization distinction must be preserved: the **paper** uses random Gaussian `A`, zero `B`; the course implementation/PEFT initialization may use Kaiming-uniform `A`, zero `B`. Do not attribute Kaiming initialization to the paper.

### Candidate C: Hugging Face LLM Course Chapter 11.4 (not acceptable as the sole LoRA teaching source)

[Chapter 11.4 LoRA](https://huggingface.co/learn/llm-course/chapter11/4) remains readable and has beginner-oriented structure, implementation snippets, and “Try it out!” activities. Its parent course provides sequencing; adjacent [11.3 SFT](https://huggingface.co/learn/llm-course/chapter11/3) and [11.5 Evaluation](https://huggingface.co/learn/llm-course/chapter11/5) are useful elsewhere. However, Chapter 11.4’s “Key advantages” includes the overbroad sentence **“Only adapter parameters are stored in GPU memory.”** This is not accurate for ordinary non-offloaded LoRA: the frozen base weights still occupy memory during training. Do not teach or quote that claim as a general memory fact. The course is thus not accuracy-cleared for the adapter-memory objective, despite useful exercises.

### Pedagogy versus reuse terms

PEFT’s Apache-2.0 repository license and the arXiv paper’s access are distinct from pedagogical merit. The Hugging Face LLM course repository identifies Apache-2.0 for its course materials, but use the linked text rather than importing it. This note does not grant redistribution rights for screenshots or excerpts. The recommended combination is PEFT overview for beginner orientation, local memory-ledger practice, and Hu et al. for technical definition. The HF course’s hands-on tasks may be selected only with the memory statement excluded and the paper/implementation distinction made explicit.

### Concrete mapping and uncertainty

- **Day 64 activity 01:** PEFT overview “Adapter methods” as an introductory reading; Hu et al. Section 4.1 for the formal low-rank update. Keep the lesson’s Gaussian-paper versus Kaiming-implementation contrast explicit.
- **Day 64 activity 03 and Day 65 activities 01–02:** teach memory as separate components and distinguish “frozen” from “not resident.” Use the paper’s scoped optimizer-state explanation only as one contribution to the local ledger; do not reuse the Chapter 11.4 GPU-memory sentence.
- **Day 65 activity 03 and Day 66:** PEFT overview’s capability/runtime caveats plus Hu et al. Section 4.2 for target selection and merging, with implementation-specific target modules identified as such.

The gap is **improved but not fully closed**: first-party PEFT docs plus the paper are accurate supporting sources, but no single accuracy-checked beginner source found here teaches adapters and a complete memory accounting with suitable worked practice. The existing Chapter 11 route should not be presented as verified on GPU memory.

## 3. Evaluation-teaching successor to the legacy guidebook

### Candidate A: Anthropic, “Demystifying evals for AI agents” (current practical-design supplement)

[Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) is an accessible first-party long-form article, dated 2026-01-09 in the existing source audit. It is substantially more current than the guidebook README’s “no longer maintained” notice. Exact inspected passages/sections:

- “The structure of an evaluation” defines task, trial, grader, transcript/trace, outcome, evaluation harness, agent harness, and suite.
- “Types of graders for agents” distinguishes code-based, model-based, and human graders.
- “Going from zero to one: a roadmap to great evals for agents” gives a staged workflow: collect tasks, define unambiguous criteria/reference solutions, balance cases, build a stable isolated harness, select graders, inspect transcripts, and maintain healthy suites.
- “How to think about non-determinism” covers repeated trials and the distinct uses of pass@k and pass^k.
- The text specifically advises grading outcomes rather than overconstraining one valid execution path, reading traces, and validating grader/task fairness.

This is a current, readable practical-design teaching supplement for agent-eval methodology; accessibility and dated updates are not a guarantee of continuing maintenance. It is not a full replacement for the old guidebook’s breadth: it is agent-oriented, does not teach EM/F1/ROUGE/perplexity/bootstrapping derivations, and its examples/vendor recommendations should be treated as first-party practitioner guidance rather than independent evidence. The guidebook’s old stable reading on dataset/prompt/metric selection and contamination may still supplement it if linked with a legacy warning.

### Candidate B: OpenAI “Working with evals” and “Graders” (not preferred as the maintained successor)

First-party [Working with evals](https://platform.openai.com/docs/guides/evals) is readable and has a stepwise example: define a task, create test data, select grading criteria, run, inspect and iterate. [Graders](https://platform.openai.com/docs/guides/graders) explains string, similarity, model, and Python graders, including grading limitations and calibration. However, the Evals guide itself states the Evals platform is being deprecated: read-only for existing users on 2026-10-31 and scheduled to shut down 2026-11-30; it points new users to Datasets. The Graders page likewise warns that graders are being deprecated as part of those workflows. This is first-party evidence that these API-specific guides are a poor maintained successor at the stated date, even though their conceptual material is readable. They are vendor/API-specific and the API workflow requires an account and may incur paid usage; no such usage was performed.

### Candidate C: Hugging Face Agents Course Unit 5 Evaluation (not verified as a candidate)

The guessed route `https://huggingface.co/learn/agents-course/en/unit5/evaluation` returned HTTP 404 during this check. No current first-party Unit 5 evaluation teaching content or exact section was verified at that locator. Do not cite it as a successor or infer content from the course’s existence. Recheck the official current course index before revisiting.

### Pedagogy versus reuse terms

Anthropic’s article is publicly readable; no open license was verified. Treat as link-only, do not copy prose, diagrams, or exercises. OpenAI documentation is also used as a link-only source here; no redistribution grant was assessed, and the platform-specific examples/deprecation warning belong in access/currentness notes, not pedagogical scoring. The legacy guidebook’s CC BY-NC-SA 4.0 terms remain separate from its teaching quality and maintenance status. No source text or exercise has been reproduced in course material by this research.

### Concrete mapping and uncertainty

- **Day 70 activity 01:** Anthropic “The structure of an evaluation” and “Going from zero to one” for defining a task, success criteria, test set, balanced cases, and evaluation workflow. Keep HELM/MMLU/GSM8K as separate framework/benchmark references.
- **Day 71 activities 01–04:** use Anthropic selectively for experiment quality, repeated trials, grader validation, and inspecting evidence. It does not teach the specific metric formulas or bootstrap; retain original metric sources and the unresolved Efron locator separately.
- **Day 72 activity 04:** use Anthropic grader/transcript/calibration and maintenance passages for reproducible reporting and limits; keep local report rubric and primary model/dataset documentation.

**Finding:** a first-party accessible practical evaluation-design teaching route exists (Anthropic), but not a verified like-for-like maintained successor for every legacy guidebook chapter or for the course’s metric lessons. The evaluation gap is **partially resolved with a qualified mapping**, not globally settled. OpenAI’s guides are useful comparison sources but are explicitly in deprecation transition; the HF course route was not verified.

## Summary of evidence status

- **Efron 1979 full text and precise locator:** not obtained; no primary section/page locator supported by readable body text. Gap remains open.
- **Beginner LoRA teaching:** primary evidence verifies a sound conceptual combination (PEFT overview plus LoRA paper) and exposes the HF Chapter 11.4 memory error; no single fully sufficient beginner teaching candidate was established. Gap partly addressed, still open for an accuracy-checked worked teaching sequence.
- **Evaluation teaching successor:** primary evidence supports Anthropic’s current first-party article as a practical supplement for eval design. It does not replace all legacy-guidebook topics, especially metric derivations/bootstrap. Gap partly resolved and scope-limited.

No independent expert review occurred. Preserve the exact strict status: **partially satisfied; expert review pending.**
