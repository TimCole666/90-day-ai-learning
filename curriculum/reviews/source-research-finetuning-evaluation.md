# Source research: instruction tuning, LoRA, and evaluation

Assessed 2026-11-01 from first-party Hugging Face pages and repositories. This is an evidence-based curriculum recommendation, not a claim of absolute global best. No expert review is required by this review scope.

## Scope checked

The matrix currently scores mostly papers and library references. The relevant lesson cards are:

- **b09, Days 61-69:** instruction schemas and chat templates; target-only loss masking; LoRA rank, freezing, optimizer memory, target modules, merging and adapters; training configuration and monitoring; baseline/post-training delta evaluation and forgetting audits.
- **b10, Days 70-72:** honest baselines and benchmark design; EM/F1/ROUGE-L/log-likelihood/perplexity/bootstrap; contamination, prompt and tokenization effects; qualitative failures, evaluator limits, forgetting, trade-offs, and reproducible reporting.

The existing activity titles were checked in `curriculum/days/day-{61..72}.json`.

## Candidates and scores

Scale: 1 absent/poor fit, 5 very strong fit. Scores are ordered `pedagogical_quality / coverage / clarity / exercises / currency / accessibility / relevance`.

### 1. Hugging Face LLM Course, Chapter 11: Fine-tuning LLMs

**Verified URLs and locators:** [chapter index](https://huggingface.co/learn/llm-course/chapter11/1), [11.2 Chat Templates](https://huggingface.co/learn/llm-course/chapter11/2), [11.3 Supervised Fine-Tuning](https://huggingface.co/learn/llm-course/chapter11/3), [11.4 LoRA](https://huggingface.co/learn/llm-course/chapter11/4), [11.5 Evaluation](https://huggingface.co/learn/llm-course/chapter11/5), [11.7 quizzes](https://huggingface.co/learn/llm-course/chapter11/7). First-party source repository: [huggingface/course](https://github.com/huggingface/course), English files `chapters/en/chapter11/{1..7}.mdx`; first-party `LICENSE` is Apache-2.0.

**Score: 5 / 4 / 4 / 4 / 5 / 4 / 5.**

- **Pedagogy 5:** explicitly sequenced index -> templates -> SFT -> LoRA -> evaluation; explains when SFT is justified before code.
- **Coverage 4:** directly covers instruction formatting, SFT configuration/monitoring, PEFT/LoRA, adapter loading/merging, and benchmark/custom evaluation. It does not fully cover the local curriculum's masking derivation, decontamination algorithms, bootstrap, or forgetting theory.
- **Clarity 4:** short headings, model/data examples, parameter table, warnings, and complete snippets; some claims are compressed and require instructor qualification.
- **Exercises 4:** Chapter 11.2 has a hands-on ChatML conversion exercise; 11.4 has two explicit `Try it out!` tasks; 11.3 and 11.5 have quizzes; 11.7 links a multiple-choice and code quiz. Exercises require a model/runtime and the chapter recommends an account.
- **Currency 5:** first-party `learn` pages and repository are the maintained current course surface checked here; use the linked versioned notebook/repository files when freezing a lesson.
- **Accessibility 4:** free public HTML/MDX and Colab links; practical runs need an account, model downloads, and potentially GPU/large memory.
- **Relevance 5:** the chapter's stated four-part structure exactly matches instruction tuning, SFT, LoRA, and evaluation in b09, with a useful bridge into b10.

### 2. Hugging Face LLM Evaluation Guidebook (legacy readable edition)

**Verified URLs and locators:** [repository](https://github.com/huggingface/evaluation-guidebook), [README](https://github.com/huggingface/evaluation-guidebook/blob/main/README.md), [automated benchmark basics](https://github.com/huggingface/evaluation-guidebook/blob/main/contents/automated-benchmarks/basics.md), [designing automatic evaluation](https://github.com/huggingface/evaluation-guidebook/blob/main/contents/automated-benchmarks/designing-your-automatic-evaluation.md), [contamination and practical tips](https://github.com/huggingface/evaluation-guidebook/blob/main/contents/automated-benchmarks/tips-and-tricks.md), [judge basics](https://github.com/huggingface/evaluation-guidebook/blob/main/contents/model-as-a-judge/basics.md), [evaluating the evaluator](https://github.com/huggingface/evaluation-guidebook/blob/main/contents/model-as-a-judge/evaluating-your-evaluator.md), [reproducibility](https://github.com/huggingface/evaluation-guidebook/blob/main/contents/troubleshooting/troubleshooting-reproducibility.md). First-party `LICENSE` is CC BY-NC-SA 4.0.

**Score: 5 / 5 / 4 / 2 / 1 / 4 / 5.**

- **Pedagogy 5:** README gives beginner/advanced reading routes; chapters explain decisions, pros/cons, pitfalls, and practical workflows rather than only naming metrics.
- **Coverage 5:** directly addresses dataset construction/inspection, held-out generalization, inference method, prompts, metrics, contamination, human evaluation, LLM judges, evaluator validation, and reproducibility.
- **Clarity 4:** plain Markdown with concrete examples and sectioned checklists; some informal wording and broad claims need careful local framing.
- **Exercises 2:** asks learners to inspect samples, compare evaluators, and troubleshoot, but supplies no graded notebook, answer key, or executable exercise sequence.
- **Currency 1:** the first-party README explicitly says “THIS GUIDEBOOK IS NO LONGER MAINTAINED” and points to an OpenEvals Space as the latest version.
- **Accessibility 4:** free Markdown and lightweight reading; the license is noncommercial/share-alike, and the current replacement is not reliably readable as guidebook content.
- **Relevance 5:** its practical guidance fills exactly the matrix gap for b10's honest baselines, contamination, prompt sensitivity, error review, and reporting.

### 3. Current OpenEvals Space pointer (not accepted as a substitute)

**URL checked:** [OpenEvals/evaluation-guidebook](https://huggingface.co/spaces/OpenEvals/evaluation-guidebook). **Score: 1 / 1 / 1 / 1 / 1 / 2 / 1.** The repository tree and first-party README currently describe a “Research Article Template,” not the evaluation guidebook, and the readable page is an embedded app. Its displayed README/LICENSE identify CC BY 4.0 for that template, but this does not establish a license for the missing guidebook text. Record this as a broken/stale locator requiring re-verification, not as a teaching source.

## Concrete lesson-card mapping

### b09

- **Day 61 activities 01-03:** use Chapter 11.2 locators `Model Types vs Instruct Models`, `Common Template Formats`, `Advanced Features`, `Best Practices`, and `Hands-on Exercise` for the teaching spine. It supports ChatML roles, special tokens, multi-turn structure, tool-aware messages, and tokenizer `apply_chat_template` examples. Keep local role-sandboxing, truncation, and boundary-validator exercises; the course does not prove those controls.
- **Day 62 activities 01-04:** use Chapter 11.3 `Dataset Preparation`, `Implementation with TRL`, and the linked `SFTTrainer` documentation as a workflow reference. Keep PyTorch shifting/`ignore_index=-100`, gradient-isolation, and collator derivations as local practice: the chapter names labeled input-output data but does not teach the full target-mask arithmetic.
- **Days 64-66:** use Chapter 11.4 `Understanding LoRA`, `LoRA Configuration`, `Using TRL with PEFT`, `Loading LoRA Adapters with PEFT`, `Merging LoRA Adapters`, and `Merging Implementation`. This is the best verified teaching replacement for the current PEFT-only card. Retain Hu et al., Sections 4.1-4.2, as the method-definition reference, not the teaching sequence.
- **Days 67-69:** use Chapter 11.3 `Training Configuration`, `Monitoring Training Progress`, `Warning Signs to Watch For`, and Chapter 11.5 `Custom Evaluation`/`Example Evaluation Pipeline`. Retain local budget gates, exact pre/post deltas, catastrophic-forgetting tests, and teardown evidence; these are not supplied by the course.

### b10

- **Day 70 activities 01-04:** use the guidebook `Automated benchmarks > Basics`, `Designing your automatic evaluation > Choosing a dataset`, `Choosing an inference method`, and `Choosing a prompt`; pair with Chapter 11.5 `Automatic Benchmarks`, `General Knowledge Benchmarks`, and `Custom Evaluation` for MMLU/GSM8K/HELM context.
- **Day 71 activities 01-04:** use guidebook `Choosing a metric`, `Tips and tricks > Tokenization`, and `Troubleshooting reproducibility`; these directly support metric choice, log-probability versus generation, normalization, prompt sensitivity, seeds, backend, batch size, and precision. Keep SQuAD/ROUGE/GPT-2/Efron papers as definition references because the guidebook does not derive every requested formula, especially bootstrap.
- **Day 72 activities 01-04:** use guidebook `Model-as-a-judge > Basics`, `Evaluating your evaluator`, `Human evaluation > Basics`, and `Custom evaluation` for judge bias, human-vs-automatic trade-offs, and transparent reporting. Keep the hallucination, forgetting, model-card, and datasheet papers for their formal taxonomies and reporting definitions; the guidebook does not cover catastrophic-forgetting theory.

## Acceptance recommendation

Add the Chapter 11 course and the legacy guidebook as teaching `Source Resource` candidates, with the verified locators above and explicit limitations. Do not remove the original papers: label them **definition/reference sources**, while the HF course and guidebook carry the **teaching sequence/practice guidance**. Do not advertise the current OpenEvals pointer as verified until its readable evaluation content and license are independently restored or located.
