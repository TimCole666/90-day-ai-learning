# Curriculum Review: Study Days 88-90 (Independent Assessment & Portfolio)

## Scope & Purpose
Covers Days 88, 89, and 90 of the 90-Day AI Learning curriculum — the final block,
"Demonstrate Mastery and Assemble a Portfolio":

- **Day 88**: Independent Mastery Retrieval. A sealed, declared-condition, AI-free
  gauntlet of five domains — core Python, Git/debugging, mathematics,
  gradients/autograd, and model reasoning — assembled as a fixed task inventory
  (`sealed_inventory.json`, 15 task IDs each mapped to a recovery day), executed
  unaided, and scored against a fixed 0/1/2 rubric into `score_sheet.json` plus an
  unmet-criteria ledger carrying `miss_type` (`concept_gap` | `slip` |
  `ambiguity` | `evidence_gap`) and a named `recovery_day`.
- **Day 89** (review day): Corrections and the Agent-Assisted Engineering Check.
  A four-way partial-failure taxonomy, a five-step correction protocol
  (restate → locate → minimal reproduction → fix → retest), unaided retesting on
  variant tasks logged to `corrections.jsonl`, one bounded delegated task on
  `projects/agent_learning` recorded in `assisted_check.json`, and honest ledger
  closure in `mastery_ledger.json` separating `independent_evidence` from
  `assisted_evidence`.
- **Day 90** (review day): Portfolio assembly and final review. A six-field
  portfolio checklist (`project, claim, evidence_path, verify_command,
  observed_result, status, limitations`), a `portfolio_manifest.json` over the
  accepted Learning Projects, a reproducibility verification run
  (`verification_log.json`), and a final `next_learning_plan.json` with
  spaced-review dates, retained annual-route links, and an honest scope
  statement.

## Evidence Grounding (No Fabricated Live Results)
All quantitative claims in the day content were checked against repository
artifacts on 2026-10-30:

- `projects/pretrain/artifacts/run_artifact.json` — 10-step CPU smoke: train_loss
  4.0316, val_loss 4.0372, parameter ledger total 7440 (token 1040 + position
  256 + 2×(attn 1024 + mlp 2048)), seed 1337. Used verbatim in Check B task M-2/M-5;
  perplexity exp(4.0372) ≈ 56.7 presented strictly as a plumbing verification.
- `projects/lora/artifacts/eval_results.json` — loss 4.0976→4.0945
  (loss_delta 0.0031), perplexity 60.20→60.01, `merge_verified: true`. Presented
  as random-weight mechanics only, matching its own truthful-scope disclaimer.
- `projects/lora/evidence/comparison_contract.json` — status
  `blocked-awaiting-authorization`, `authorization.approved: false`, cost ceiling
  USD 5.00. Cited wherever cloud LoRA evidence is mentioned.
- `projects/agent_learning/` — deterministic-v1 adapter, summarize-notes fixture,
  independent scorer. Live-model evaluation is cited as
  `not-run-awaiting-authorization` per `evidence/live_eval_contract.json`.
- `scripts/ci_practice_runner.py` + `tests/engineering/test_ci_practice.py` —
  verified-disposable status for the CI delivery practice entry.
- Cloud-GPU pretraining evidence (ticket 19) is labelled
  `blocked-awaiting-authorization` throughout; no GPU, runtime, or billing claim
  appears anywhere in the three days.

## Independent vs Assisted Separation Check
- Day 88: activities 02/03/04 are `independent`; activity 01 is `agent_assisted`
  for inventory organization only — the agent is explicitly forbidden from
  authoring, solving, or grading sealed tasks.
- Day 89: activity 03 is the single `agent_assisted` Agent-Assisted Engineering
  Check; its output lands in `assisted_evidence` only.
- Day 90: activity 03 is `agent_assisted` for log capture; verification evidence
  remains the command outputs themselves.
- `assistance_policy` values verified in all three `curriculum/days/*.json` files;
  the content text in all four editions repeats the declared-condition disclaimer.

## Worked-Answer & Rubric Correctness Review
- Check A answers re-verified: `top_k_words` uses `Counter` + explicit
  `sorted(key=(-count, word))` for deterministic tie order (verified against
  `most_common` behavior); the Git recovery sequence (`git branch fix/login` →
  `git reset --hard origin/main` on a disposable clone → `git reflog`) is safe
  and correct.
- Check B answers re-derived: ∂f/∂a = b+1 = 4.0 and ∂f/∂b = a = 2.0 for
  f = ab + a at (2, 3); the two-sided finite difference f'(x) ≈
  (f(x+h) − f(x−h))/(2h), h ≈ 1e-5, O(h²) error; parameter ledger recomputes to
  exactly 7440; LoRA adapter count 2·d·r = 32,768 vs dense 1,048,576 (≈3.1%);
  exp(4.0372) ≈ 56.7.
- Rubric: fixed 0/1/2 scale, domain bar ≥5/6 with no zero, defined before
  scoring — consistent with transparent-assessment practice; partial-credit
  feedback must cite the failed rubric criterion.
- Recovery routes resolve to real days: PY → day-09/11/12, GIT → day-14/80/81,
  MATH → day-19/25/27, GRAD → day-31/32/33, MODEL → day-43/50/65/83, plus
  day-84/day-89 recovery links in the day files.

## Verification & Parity Across Language Editions
All four language editions (`en`, `ja`, `zh-Hans`, `zh-Hant`) were authored with
genuine translations and checked for parity of structure, task numbers, and
terminology:

- **Terminology Parity**:
  - English: `retrieval`, `sealed task`, `declared condition`, `rubric`,
    `miss_type`, `partial failure`, `remediation ledger`, `delegation`,
    `diff review`, `portfolio`, `provenance`, `reproducibility`,
    `blocked-awaiting-authorization`, `limitations`, `annual route`.
  - Japanese: `リトリーバル`, `封印タスク`, `申告条件`, `ルーブリック`,
    `未達タイプ`, `部分失敗`, `是正台帳`, `委譲`, `差分レビュー`,
    `ポートフォリオ`, `来歴`, `再現性`, `認可待ち`, `制限`, `年間ルート`.
  - Simplified Chinese: `检索`, `封存任务`, `声明条件`, `量规`, `未达类型`,
    `部分失败`, `补救台账`, `委派`, `diff 审查`, `作品集`, `出处`,
    `可复现`, `受阻待授权`, `局限`, `年度路线`.
  - Traditional Chinese: `檢索`, `封存任務`, `聲明條件`, `量規`, `未達類型`,
    `部分失敗`, `補救台帳`, `委派`, `diff 審查`, `作品集`, `出處`,
    `可複現`, `受阻待授權`, `局限`, `年度路線`.
- Activity IDs, JSON schema, numeric answers (4.0/2.0, 7440, 32768, 56.7,
  0.0031), and artifact paths are byte-identical across editions; JSON blobs in
  `answer` fields intentionally remain in English as canonical artifacts.
- All four editions keep the declared-assistance disclaimer: independent work is
  an honest declared condition, not claimed surveillance.

## Source Provenance & Rights
Seven sources were newly registered in `curriculum/sources/registry.json`
(82 → 89 entries) and five existing entries reused:

- `roediger-karpicke-2006` — Test-Enhanced Learning (Psychological Science 2006);
  publisher copyright, linking only; grounds the retrieval-check design.
- `dunlosky-2013-effective-techniques` — PSPi 2013 technique-utility review;
  publisher copyright, linking only; grounds retrieval + spaced-review schedule.
- `yao-react-2023` — ReAct (ICLR 2023, arXiv); action/observation loop for the
  delegated-agent check.
- `jimenez-swebench-2024` — SWE-bench (ICLR 2024, arXiv); bounded repository
  task evaluation precedent for spec/diff-review/test-verify protocol.
- `mitchell-model-cards-2019` — Model Cards (FAT* 2019, arXiv); provenance and
  limitation fields for portfolio entries.
- `gebru-datasheets-2021` — Datasheets for Datasets (CACM 2021, arXiv); dataset
  provenance fields for the manifest.
- `turing-way-2024` — The Turing Way (CC BY 4.0); reproducibility checklist for
  the verification run.
- Reused: `py-docs-unittest`, `py-docs-exceptions`, `git-book`,
  `cs231n-backprop`, `karpathy-micrograd`, `nist-sematech-ehandbook`,
  `openai-evals-framework`, `pytorch-save-load`, `d2l-ai`
  (registry entries for the two deficient Python docs sources were topped up to
  ≥2 compared candidates).
- Every activity carries ≥2 full source objects, each with ≥2 compared
  candidates, license/reuse category, permission basis, prerequisites, and a
  safe offline fallback.

## Honest-Scope Statements Verified
- No official certification is claimed anywhere; the scope statement is embedded
  verbatim in the Day 88/90 answer blocks.
- Unmet criteria remain visibly unmet (`domain_pass`, `remaining_gaps`,
  `verified: false` rows are all supported structures).
- The retained advanced annual route is linked via `/lessons/index.html` in the
  Day 90 plan; no claim of universal three-month mastery.
