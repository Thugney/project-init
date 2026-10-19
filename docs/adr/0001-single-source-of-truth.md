# ADR 0001 — Keep one source of truth for planning artifacts

- Status: **Accepted design direction; runtime integrations remain preview**
- Date: 2026-10-19

## Context

BMAD, OpenSpec and GitHub Spec Kit each generate some combination of PRD, architecture, specification and implementation plans. Having Project Init generate the same documents first would produce duplication, synchronization bugs and agent drift.

## Decision

Project Init **discovers and recommends**, then the user selects one native framework (or deliberately none). That framework is authoritative for native specifications, project plans, architecture decisions and implementation tasks. Project Init stores **file references and hashes**, orchestrates explicit approval/handoff, and provides cross-framework visual review, Lean Kit rendering and evidence gates.

## Consequences

- Positive: no PRD-to-PRD converters and one authoritative task source.
- Positive: framework can change internally without Project Init inventing a duplicate methodology.
- Negative: each framework needs a maintained install/handoff integration, tested against its supported versions.
- Negative: Project Init cannot infer a framework's true task status unless an actual worker executes and supplies receipts.
- Safety: framework switching and old-version migrations require explicit approval; archived v1 approvals do not automatically authorize v2 changes.
