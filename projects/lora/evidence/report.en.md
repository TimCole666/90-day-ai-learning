# Ticket 21: Authorized cloud-GPU LoRA comparison

## Decision and gate

**Result: blocked-awaiting-authorization.** No cloud provider, paid GPU, account, purchase, or external mutation was used. The contract is a plan and evidence schema, not a claim that a cloud run happened. `null` in `comparison_contract.json` means unavailable measured evidence, never zero.

Before any paid execution, an approver must record the provider, model revision, data/model rights review, GPU/runtime/storage estimate, USD ceiling, checkpoint policy, and stop conditions in the contract. The deterministic gate is:

```bash
python projects/lora/evidence/validate_contract.py
python projects/lora/evidence/validate_contract.py --require-authorized  # intentionally fails now
```

The second command must remain failing until specific authorization exists. A future runner must refuse to launch before this gate.

## Planned comparison

The existing real-model path (`projects/lora/train.py` and `evaluate.py`) is the implementation under test. The proposed base is `openai-community/gpt2` at a reviewed immutable revision (not yet selected). The repository's synthetic instruction JSONL is the proposed dataset; its hash and rights statement are recorded in the contract. The planned configuration fixes seed 42, deterministic 80/10/10 split, rank 8, alpha 16, dropout .05, `q_proj,v_proj`, 10 iterations, batch size 1, length 128, and CUDA. A provider must be selected and its price checked at execution time.

The ceiling is one GPU, 30 minutes, 8 GiB persistent storage, and USD 5 total. Stop on missing approval/rights/revision/price, non-finite loss, frozen-base mutation, missing adapter gradients, leakage, provider failure, or any ceiling. Save only a sanitized manifest and adapter checkpoint; release ephemeral compute after evidence capture.

## Evidence contract

The before measurement loads the frozen base and evaluates the predeclared held-out test records. The after measurement reloads the saved adapter on the same base revision, tokenizer, prompt format, and test records. Required metrics are loss, perplexity, exact test count, and sample generations. Lower held-out loss is a predeclared direction, not an achieved result. Regressions, failed runs, limitations, checkpoint path/hash, last completed step, and a sanitized failure class are explicit fields.

The contract also requires frozen-base hashes/immutability, trainable adapter count, observed adapter gradients and updates, adapter reload verification, and independent-evaluation verification. It does not accept smoke metrics as cloud evidence.

## What is observed now

The checked-in local artifacts are a CPU random-weight smoke run. The run trains on prompt-masked labels (prompt tokens are `-100`) and checks only frozen-base immutability, adapter gradients, adapter reload and merge (the run stops if any check fails); the masking itself is tested in `tests/unit/test_lora.py` and `tests/unit/test_lora_bos_prompt_mask.py`, not recorded in the artifacts. They are not a pretrained-model comparison, GPU measurement, quality result, or cost result. No cloud execution was attempted; therefore cloud runtime, GPU name/memory, persistent storage, and cost remain null. No improvement, regression, or failure rate is claimed for the unavailable run.

## Reproduction boundary

After authorization and rights review, use the public commands in `projects/lora/docs/guide.en.md`, pin the same reviewed revision in both commands, and write outputs outside source control until sanitized. The real path currently rejects real-mode resume; after a failure, start a new work directory and preserve the failure manifest. CPU smoke commands remain useful for mechanics but cannot satisfy the cloud-run criterion.
