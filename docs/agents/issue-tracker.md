# Issue Tracker: Local Markdown

Issues and specs live in `.scratch/`, relative to the project root.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `.scratch/<feature-slug>/spec.md`.
- Implementation tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`,
  numbered from `01`, with one file per ticket.
- Record triage state as a `Status:` line near the top of each ticket.
  Use the role strings in `triage-labels.md`.
- Append discussion under `## Comments`; preserve existing history.

## Publishing and Fetching

When instructed to publish a spec or ticket, create its file at the appropriate
path above. Create directories as needed.

When fetching a ticket, read the supplied path. If given only a number,
resolve it within the specified feature. Ask for the feature when ambiguous.

## Wayfinding Operations

- Map: `.scratch/<effort>/map.md`, containing Notes, Decisions-so-far, and Fog.
- Child tickets: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`,
  with the question in the body.
- Record `Type:` as `research`, `prototype`, `grilling`, or `task`.
- Wayfinding tickets use `Status: claimed` and `Status: resolved` for their
  lifecycle rather than the implementation-ticket triage roles.
- Dependencies: `Blocked by: NN, NN`. A ticket is unblocked when every listed
  dependency is resolved.
- Frontier: select the lowest-numbered open, unblocked, unclaimed ticket.
- Claim: save `Status: claimed` before starting work.
- Resolve: append the result under `## Answer`, set `Status: resolved`,
  and append a gist and link under Decisions-so-far in the map.
