# Domain Docs

## Layout and Reading Rules

This project uses a single-context layout:
- `GLOSSARY.md` at the project root.
- `docs/adr/` for architectural decision records.

Before exploring the codebase, read the glossary if present and the ADRs
relevant to the area being changed.

If these files or directories are absent, proceed silently. Create them
lazily through domain modeling when a term or decision is actually resolved;
their absence alone is not a task to scaffold them.

If a root `GLOSSARY-MAP.md` is introduced later, follow its pointers to the
glossaries relevant to the task and read applicable context-scoped ADRs.

## Vocabulary

Use glossary terms in issue titles, proposals, hypotheses, and test names.
Avoid synonyms the glossary explicitly excludes.

When a needed concept is missing, reconsider whether the term belongs in the
domain. Record genuine terminology gaps for domain modeling.

## Decision Conflicts

Explicitly flag proposals that contradict an existing ADR. Identify the ADR
and explain why reopening its decision is justified instead of silently
overriding it.
