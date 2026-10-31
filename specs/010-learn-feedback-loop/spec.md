# Feature specification: `project-init learn` feedback loop

**Feature:** `010-learn-feedback-loop`
**Roadmap:** Phase 10 · Issue #51
**Status:** ready for build approval
**Depends on:** `001-pack-mechanism`; most useful after packs and checks have recorded failures. Before building, re-read this spec against the code as built and report any mismatch instead of improvising.

## Summary

Failed checks and rejected review findings are the most valuable signal a harness gets, and today they are not reused. `project-init learn` reads recorded failures and proposes additions to a pack's rules or review checklist as a reviewable diff. Nothing changes without `--apply`, and an applied change bumps the pack version, so it invalidates the baseline like any pack change.

## User stories

### US1 — See recurring failures (P1)

I see which checks and review findings failed repeatedly, grouped by rule and pack, over a chosen period.

### US2 — Get a proposed rule (P1)

For a recurring failure, I get a proposed rule fragment or checklist line for the relevant pack, as a diff with the evidence that motivated it.

### US3 — Apply deliberately (P1)

I apply a proposal explicitly; the pack's version and hash change and the baseline is marked stale.

## Functional requirements

- **FR-001 Inputs.** Reads only local records: check receipts, guard results, source and semantic review findings, and audit events under `.project-init/`. No network.
- **FR-002 Grouping.** `project-init learn` lists failures grouped by check name or finding category, with count, first and last occurrence, and affected files, for a `--since` window (default 30 days).
- **FR-003 Threshold.** A group becomes a proposal candidate after a configurable number of occurrences (default 3).
- **FR-004 Proposals.** A proposal targets one local pack (an overlay or a local-path pack; bundled and Git-ref packs are never modified) and is one of: a rule fragment addition, a review checklist line, or a note recommending a new check. Proposals are written to `.project-init/learn/<id>.diff` with the motivating evidence references.
- **FR-005 Proposal drafting.** Proposal text is drafted by the configured `summarizer` role from 005 when available; otherwise a template with the evidence and an empty rule for the maintainer to write. Drafted text is clearly labelled as a draft.
- **FR-006 Apply.** `learn apply <id> --apply` applies the diff to the target pack, bumps its patch version, refreshes the lock and audit-logs the change. The baseline becomes stale through the 001 mechanism.
- **FR-007 Dismiss.** `learn dismiss <id>` records a dismissal so the same group is not proposed again until it recurs above threshold after the dismissal.
- **FR-008 Privacy.** Proposals never include file contents beyond the failing rule's message and file paths; no secrets.

## Success criteria

- **SC-001** A recorded recurring failure produces a proposed rule diff.
- **SC-002** Applying it changes the pack version and hash and marks the baseline stale.
- **SC-003** Bundled and Git-ref packs are never modified (test).
