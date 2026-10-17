---
name: thermo-nuclear-code-quality-review
description: Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth. Use for a thermo-nuclear code quality review, thermonuclear review, deep code quality audit, or especially harsh maintainability review.
---

# Thermo-Nuclear Code Quality Review

Use this skill for an unusually strict review focused on implementation quality,
maintainability, abstraction quality, and codebase health. Look for ways to
preserve behavior while deleting complexity, branches, helper layers, or unclear
state.

## Core Prompt

> Perform a deep code quality audit of the current branch's changes.
> Rethink how to structure or implement the changes to improve quality without
> changing behavior.
> Improve abstractions, modularity, succinctness, and legibility.
> Be rigorous, and prefer direct maintainable code over clever or magical code.

## Review Standards

- Do not accept structural regressions just because tests pass.
- Push for simpler ownership boundaries. Logic should live in the package or
  layer that owns the concept.
- Reject spaghetti growth: ad-hoc conditionals, one-off flags, scattered special
  cases, and nullable modes need a strong reason.
- Do not let a PR push a file from under 1000 lines to over 1000 lines without a
  strong structural reason.
- Challenge weak abstractions: pass-through helpers, identity wrappers, generic
  mechanisms, or indirection that does not reduce cognitive load.
- Tighten type boundaries. Avoid unnecessary `any`, broad `unknown`, optionality,
  and casts when explicit contracts would make invariants visible.
- Keep related updates atomic where partial state would be hard to reason about.
- Reuse canonical helpers instead of introducing bespoke near-duplicates.
- Preserve TryAgent's security boundaries, especially around runtime/provider
  secrets.

## Questions To Ask

- Can the change be reframed so fewer concepts, branches, or helper layers are
  needed?
- Does this improve or worsen the local architecture?
- Is the logic in the right file, package, and layer?
- Did the diff add branching complexity where a better model or helper should
  exist?
- Did the change make a cohesive module more coupled, stateful, or hard to scan?
- Are state transitions explicit, recoverable, and tested at the real invariant?
- Did the diff introduce casts, optionality, or ad-hoc object shapes that obscure
  the real contract?
- Is this orchestration more sequential or less atomic than it needs to be?

## Preferred Remedies

- Delete a layer of indirection.
- Move logic to the canonical owner.
- Replace repeated conditionals with a typed model or explicit dispatcher.
- Extract a pure helper where it clarifies a repeated invariant.
- Split a large file into focused modules.
- Collapse duplicate branches into one direct flow.
- Make type boundaries explicit.
- Restructure related updates to be atomic or cleanly idempotent.

## Output Expectations

Prioritize findings in this order:

1. Structural code-quality regressions
2. Missed opportunities for major simplification
3. Spaghetti or branching complexity increases
4. Boundary, abstraction, and type-contract problems
5. File-size and decomposition concerns
6. Modularity and maintainability concerns

Do not flood the review with low-value nits if there are larger structural
issues. Prefer a smaller number of high-conviction comments over a long list of
cosmetic notes.

## Approval Bar

Do not approve merely because behavior seems correct. Do not approve if there is:

- a clear structural regression
- avoidable wrong-layer logic
- obvious spaghetti branching
- unjustified file-size explosion
- an obvious simplification that would delete major complexity
- unnecessary wrapper, cast, optionality, or generic machinery
- duplicated canonical helper behavior
- runtime/provider secret handling that weakens TryAgent's security boundary

If issues are found, patch them before committing or clearly document why they
are deferred.
