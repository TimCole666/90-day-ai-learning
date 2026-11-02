# Study Days 04–06 review evidence

## Scope and sources

The review covered all four Language Editions for Lessons 04–06, their activity IDs, 480-minute ledgers, observable Python examples, and the browser route. The Python Standard Library documentation and Git Book were compared with the lesson claims. Both are retained as links only (no text imported): Python's built-in types documentation is the normative source for truthiness, equality, identity, and mutable sequences; the Git Book is the practical source for inspecting a diff before recording a change. Offline fallback is the runnable examples plus `git diff`/`git diff --check`.

## Substantive checks

* Day 04 distinguishes a value from a name binding with `repr`, `type`, and a rebinding trace. The misleading inputs `0`, `"0"`, `""`, and `None` have explicit expected observations.
* Day 05 contrasts mutation with rebinding and tests `==` versus `is` using independent list objects. It names SyntaxError, value/type mismatch, and AttributeError as distinct beginner failures.
* Day 06 derives branching from a truthiness table, then requires normalization before handling empty text, numeric zero, and unknown text. Whitespace and `"0"` are deliberately included as misleading inputs.
* Every edition preserves the same activity IDs, executable Python literals, expected behavior, required/optional boundary, assistance policy, quiz IDs, and mastery evidence. Prose is localized; Python behavior is not translated.
* The small-diff activities require prediction, execution, `git status`, `git diff`, `git diff --check`, and a focused commit. Agent-assisted review is explicitly not independent evidence.

## Verification record

Structural and project tests validate the metadata and four editions. The browser test visits all twelve localized Day 04–06 routes and checks navigation, card count, and substantive text. The Python snippets were executed during authoring with the expected observations recorded above. No files under `lessons/` were changed.
