# Curriculum Review: Study Days 85-87 (Integrate the Capstone Learning Project)

## Scope & Purpose
Covers Days 85, 86, and 87 of the 90-Day AI Learning curriculum (block 29, ticket 53):
- **Day 85**: Capstone charter — a one-page bounded problem statement with named user, in/out-of-scope line, and explicit non-goals; a measurable acceptance contract (`capstone_acceptance.json`) fixing the task set, the deterministic baseline (`deterministic-v1` / `summarize-notes`, expected report SHA-256 `9e831503…d787`), per-task metrics, and resource ceilings (6 steps, 2 retries, 30-minute runtime, USD 5.00 authorized-live cost ceiling); an evidence-driven model-selection decision; and a nine-element go/no-go charter review gate ending in scope freeze.
- **Day 86**: Integration — the adapter boundary between the verified bounded harness and the selected model (harness owns validation, budgets, paths, termination; the adapter only proposes actions); re-execution of the published baseline commands into a reproducible `baseline_ledger.md`; ticket-24 CI delivery rehearsal (`scripts/ci_practice_runner.py`, five stages) and rollback on disposable fixtures; and a fault-injection drill (`invalid_arguments`, `missing_note`, `loop`) proving structured, budgeted failure handling.
- **Day 87**: Acceptance — a frozen evaluation protocol with `evidence_kind` labels separating `deterministic-fixture` from `live-model-run` fields; a sanitized capstone evidence package with provenance table and privacy pass; a blameless six-class failure-taxonomy post-mortem with hash-verified controlled recovery; and dual-rubric acceptance (Independent Mastery Check vs Agent-Assisted Engineering Check) with a project-submission evidence form, explicitly distinguished from the platform Course Readiness Gate.

## Reuse of Verified Deliverables (no hidden unbounded system)
The capstone integrates previously accepted artifacts by reference rather than replacing them:
- **Ticket 19** — `curriculum/projects/docs/pretrain-cloud-evidence/evidence-package.json` (schema `cloud-pretraining-evidence-v1`, 4-layer/4-head/64-embedding GPT recipe, tinyshakespeare provenance + SHA-256, `run_status=blocked`) informs the model-choice analysis; it is cited as a learning recipe, not as evidence of a usable model.
- **Ticket 21** — `projects/lora/evidence/comparison_contract.json` (`ticket-21-lora-comparison-v1`, base `openai-community/gpt2`, LoRA r=8 α=16 on q_proj/v_proj, seed 42, 0.8/0.1/0.1 split, `blocked-awaiting-authorization`) supplies the direction-only success-criteria style and the honest blocked status the capstone mirrors.
- **Ticket 22** — `projects/agent_learning` (CLI `evaluate --fixture summarize-notes`, `deterministic-v1` adapter, three registered tools, independent scorer, `python -m unittest discover -s tests/projects -p 'test_agent_learning.py'`) is the bounded system being integrated; no new unbounded agent is introduced.
- **Ticket 23** — `projects/agent_learning/evidence/live_eval_contract.json` (`ticket-23-agent-live-eval-v1`, six-task fixed set, fixture-hash-bound baseline, `blocked-awaiting-authorization`) is the acceptance-contract template and the live-vs-deterministic labeling rule.
- **Ticket 24** — `curriculum/engineering/ci_delivery_rollback` + `scripts/ci_practice_runner.py` (clean_install → regression_exercise → conflict_resolution → controlled_deployment → health_failure_and_rollback) is the delivery discipline rehearsed on disposable fixtures only.

## Verification & Parity Across Language Editions
All four language editions (`en`, `ja`, `zh-Hans`, `zh-Hant`) were authored as genuine editions and verified for structural and terminology parity:
- **Terminology Parity**:
  - English: `capstone`, `charter`, `acceptance contract`, `scope freeze`, `adapter boundary`, `baseline ledger`, `rollback`, `fault injection`, `evidence package`, `failure taxonomy`, `post-mortem`, `dual rubric`, `Course Readiness Gate`.
  - Japanese: `キャップストーン`, `憲章`, `適合契約`, `範囲凍結`, `アダプタ境界`, `ベースライン台帳`, `ロールバック`, `フォルト注入`, `証拠パッケージ`, `失敗分類`, `事後検証`, `二重ルーブリック`, `コース準備ゲート`.
  - Simplified Chinese: `综合项目`, `章程`, `验收契约`, `范围冻结`, `适配器边界`, `基线台账`, `回滚`, `故障注入`, `证据包`, `失败分类`, `事后复盘`, `双重评分细则`, `课程就绪门禁`.
  - Traditional Chinese: `綜合專案`, `章程`, `驗收契約`, `範圍凍結`, `適配器邊界`, `基準台帳`, `回滾`, `故障注入`, `證據包`, `失敗分類`, `事後復盤`, `雙重評分細則`, `課程就緒門禁`.
- Activity IDs, commands, file paths, hashes, tool names, budgets (max_steps=6, max_retries=2, USD 5.00 ceiling, 30-minute runtime), and mastery criteria are identical across editions; code and artifact names are preserved untranslated.
- `day-87-act-04` enables `project_submission` with the established four-language submissions i18n block, declaring pasted logs self-reported evidence.

## Validation of Honesty Constraints
1. **No fabricated measurements**: all live/cloud fields follow the ticket-19/21/23 convention — `null` plus `not-run-awaiting-authorization` / `blocked-awaiting-authorization`; deterministic commands and pinned hashes are the only claimed results.
2. **Boundedness**: every in-scope capstone element maps to an existing bound (registered tool, fixture, budget); arbitrary execution, open-web access, and unbounded retries are listed non-goals.
3. **Model choice**: pretraining and LoRA outcomes inform design while an appropriate existing open model remains admissible; self-trained artifacts are not presented as proven.
4. **Acceptance separation**: learner project acceptance (dual rubric + submission evidence) is explicitly separated from the platform Course Readiness Gate (ticket 61); independent mastery is never inferred from assisted output.
5. **Recovery & privacy**: controlled recovery is demonstrated by artifact-hash equality on disposable fixtures; provenance and a zero-secrets privacy pass are required before packaging.

## Source Provenance & Rights
- `yao-react-2023`: ReAct action/observation protocol (arXiv open access) — bounded agent loop rationale.
- `mitchell-model-cards-2019`: Model Cards (FAT* 2019, open access) — model reporting/provenance schema.
- `liu-agentbench-2023`: AgentBench (ICLR 2024, open access) — fixed task-set and per-task scoring.
- `mialon-gaia-2023`: GAIA (arXiv open access) — graded assistant tasks with unambiguous scoring.
- `gebru-datasheets-2021`: Datasheets for Datasets (CACM 2021, open access) — data-provenance table.
- `schick-toolformer-2023`: Toolformer (NeurIPS 2023, open access) — model/tool API contract at the adapter boundary.
- `weng-llm-agents-2023`: LLM-agent architecture survey (personal blog, linked only, no text imported).
- `shinn-reflexion-2023`: Reflexion (NeurIPS 2023, open access) — bounded retry and self-correction.
- `fowler-continuous-integration-2006`: CI essay (martinfowler.com, linked only).
- `google-sre-release-engineering` and `google-sre-postmortem-culture`: SRE book chapters 8 and 15 (CC BY-NC-ND 4.0, linked only; noncommercial/no-derivatives terms respected).
- `jimenez-swebench-2024`: SWE-bench (ICLR 2024, open access) — execution-verified evaluation metrics.
- `zheng-mtbench-2023`: MT-Bench/Chatbot Arena judge-bias analysis (NeurIPS 2023, open access) — rubric design and evidence-cited verdicts.
- `openai-evals-framework`: existing registry entry reused for deterministic evaluation conventions.
All 13 new citations include ≥2 compared candidates, license and permission basis, prerequisites, known availability limits, and safe offline fallbacks; the SRE and blog sources are linked rather than excerpted per their rights terms.
