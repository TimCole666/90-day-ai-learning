# Ticket 19: Authorized Cloud-GPU Pretraining Evidence

This is the cloud extension of the existing resumable small-model project at
`projects/pretrain`. It is a **prepared, blocked evidence package**, not a claim
of cloud execution. The checked-in `evidence-package.json` deliberately contains
`null` for provider, GPU, elapsed time, metrics, and spending.

## Approval gate (before any paid action)

Do not rent a GPU, upload data, or create a paid storage resource until a human
explicitly approves the provider, region, GPU shape, model/data/runtime
assumptions, a USD 25 spending ceiling, and the stop behavior. The request is
recorded in `approval_gate.request_text`. Approval must be recorded with a
scope, approver, and timestamp. Credentials, account IDs, resource IDs, and
private provider pages remain outside this repository.

The proposal is: the four-layer/four-head/64-embedding recipe in
`cloud-run-config.json`, `tinyshakespeare.txt` (SHA-256 recorded there), Python
>=3.10, PyTorch >=2.0, and a provider image whose exact CUDA/driver versions are
recorded before launch. The theoretical estimate is 2 GPU-hours and 5 GB-days
of storage, but the provider quote, quota, taxes, minimums, and billing lag must
be checked before approval. No free quota is assumed and a provider hard cap is
not promised.

## Authorized run and recovery recipe

After approval, record the pre-launch git SHA, config/data hashes, image digest,
CUDA/driver versions, and GPU identity in a private run log. Then run the
provider-specific command in `evidence-package.json`. Stop/release compute at
the ceiling, on a failed health check, or after the planned run. Keep storage
only if authorized; report continuing storage charges. Destructive deletion
needs separate confirmation.

At a checkpoint (for example step 200), interrupt the process without deleting
`latest.pt`. Resume with `--resume auto` to the same target. Run
`evaluate.py` against the held-out split in a separate process and retain the
checkpoint and evaluation JSON. The report must include the interruption and
resume steps, independent loss/perplexity, failure cases, elapsed wall time,
GPU identity, and actual billing snapshot.

## Evidence discipline

Theoretical values are estimates from the config and provider quote. Measured
values are observations from the authorized run. Never fill a measured field
from a CPU smoke test, a synthetic log, or a provider price page. Local test:

```sh
PYTHONPATH=. python3 -m unittest discover -s tests/unit -p 'test_cloud_evidence.py'
```

This deterministic test validates the metadata contract only; it is not cloud
or GPU evidence. Until approval and a real run exist, Ticket 19's actual-run
acceptance remains unmet.
