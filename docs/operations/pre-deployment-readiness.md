# Pre-deployment readiness

## Scope and authority

The owner asked on 2026-11-01 to complete locally executable work and stop at the
owner deployment boundary. This is an engineering hand-off, not a passed Course
Readiness Gate. No VPS connection, DNS/TLS change, paid API/GPU run, publication,
commit or push is authorized. Preserve `.pi/` and the legacy lecture archive.

Use the clean delivery artifact, never the development workspace or its Git
history, for deployment/publication. The operational procedure is
[deployment-and-rollback.md](deployment-and-rollback.md). Local verification is
run from the source checkout, not the production-only tarball (which excludes
tests, the verifier and development resources).

## Repeatable local verification

```bash
# Inspect the groups without running or certifying anything:
npm run verify:local:list

# Full local run; uses .venv/bin/python when available:
npm run verify:local

# Inspect whether its evidence still matches the current files and logs:
python3 scripts/verify_local.py --check-receipt runs/local-verification/latest.json

# A targeted retry is explicitly partial, not a replacement for the full run:
python3 scripts/verify_local.py --suite packaging --suite browser
```

The runner covers curriculum, calendar/time/prerequisite ledger, source-rights
structure, rendered source matrix, Python unit/project/engineering suites,
**every** CJS unit/packaging file, and **every** browser test file. Browser tests
run sequentially after CPU-heavy Python checks. `npm run test:browser` now invokes
all browser files, not just Day 1. Existing local/global Playwright is discovered
using `NODE_PATH` or `npm root -g`; the runner installs nothing.

Prerequisites are a supported patched Node release satisfying the package's
`>=22.13.0` compatibility floor, Python with the existing project test dependencies,
GNU-compatible tar, and Playwright plus its Chromium browser. The version floor
is not a recommendation to install an old, unpatched runtime. Missing commands,
missing/empty suites, zero collected Python tests, skipped Python tests, command
failures and timeouts cannot silently count as a complete local pass.

The default output is the Git-ignored `runs/local-verification/` directory. Each
run preserves its own `receipt.json` and command logs; `latest.json` is a copy of
the most recent finished run. A failed attempt is not overwritten by an implicit
retry. Receipts record exact argument vectors, exit status, elapsed time, test
counts where available, log hashes, relevant input-file hashes before/after,
known external evidence limits, and the archive hash when packaging passes.
A changed input invalidates the overall run. `--check-receipt` also detects
changed/missing logs and an altered packaged archive. It checks freshness and
integrity, not authenticity: these are unsigned local engineering receipts.

`status: passed` requires all groups. Selecting only some groups produces
`status: partial` even if every selected command exits zero. A receipt check may
exit zero for an intact partial receipt; inspect `complete` and `recorded_status`
when deciding whether a full local run exists. Neither result changes
`course_readiness: not_established_by_local_checks` or grants deployment approval.
Re-run the full command after changing any relevant file; do not splice results
from different candidate fingerprints into a fabricated full pass.

The runner allowlists necessary process environment variables: it does not pass
production DB/config paths, auth-adapter settings or paid-provider credentials
to tests, and does not print environment values. This is not a network sandbox;
the repository's fixture/mock tests are not evidence of live provider acceptance.
Logs/receipts stay outside the public tarball and are not legal review artifacts.

## Owner hand-off inputs (not requested or used yet)

Before any connection or change, provide non-secret target details and approval
for a bounded plan: host/OS/resources, existing services, chosen origin, persistent
storage/service-user locations, permitted proxy/DNS/TLS operations, intended
artifact hash, backup target and explicit rollback snapshot. Confirm that other
services and learner data must remain untouched. Never paste secrets into the
repository, released config, routine logs or review notes; inject them through
an approved secret channel/environment file as the runbook specifies.

Google/GitHub applications need callbacks matching the actual approved HTTPS
origin, plus authorized test accounts for sign-in, linking, logout, isolation,
export and deletion checks. Local fake-provider tests do not satisfy this step.
GPU/provider runs require separate account access and approved budget ceilings;
none is implied by deployment approval. Publication needs a separate repository,
visibility/version and rights decision, not an incidental push of this worktree.

## Conditions local checks cannot satisfy

- Actual host/deployment, DNS/TLS, live HTTPS and production recovery acceptance.
- Live Google/GitHub OAuth using owner-controlled applications and test accounts.
- Approved real GPU pretraining/LoRA and all four live Agent Tool Track runs.
- Native-language review and publication/legal approval.
- Remaining primary-source/teaching evidence gaps; see the
  [source selection review](../../curriculum/reviews/source-selection-review.md)
  and [bounded follow-up](../../curriculum/reviews/source-research-deployment-followup.md).

The complete Course Readiness Gate stays open until its required evidence exists.
Strict source-quality status remains **partially satisfied; expert review pending.**
No independent expert review occurred; it is not a mandatory prerequisite for
internal source acceptance. Known evidence gaps are not waived by green tests.
Automated/agent review is neither native-speaker nor independent expert review.

## Evidence interpretation

`runs/local-verification/latest.json` supplies current local results only when its
freshness/integrity check succeeds and `complete` is true with `status: passed`.
It is generated evidence, not a promise that future runs will pass. Earlier logs
under `/tmp/learn-source-final-checks/` remain historical/session-local and do not
silently certify the changed worktree. Tickets 57–61 remain owner/evidence-gated;
this hand-off does not mark them passed or backdate the learner's study clock.
