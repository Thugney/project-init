# Feature specification: Evals

**Feature:** `006-evals`
**Roadmap:** Phase 6 · Issue #55
**Status:** ready for build approval
**Depends on:** `005-model-routing` (configurations to compare). Before building, re-read this spec against the code as built and report any mismatch instead of improvising.

## Summary

Public benchmarks do not say whether a cheaper model tier is good enough for the maintainer's own work. `project-init eval` runs a small, versioned set of the maintainer's real tasks under a given routing configuration, records outcome, usage and time per task, and compares configurations in a report.

## User stories

### US1 — Define an eval set (P1)

I keep a set of tasks taken from my own repositories, each with a fixed starting commit, a task description and an objective acceptance: checks that must pass and requirement findings that must be present.

### US2 — Run it under a configuration (P1)

I run the set under one routing configuration and get, per task: pass/fail, guard result, checks, findings, usage and wall time. Failures are failures, never averaged away.

### US3 — Compare two configurations (P1)

I compare two recorded runs in a Lean Kit report to decide whether a cheaper configuration is good enough.

### US4 — Track my success measures (P2)

Over time I see share of tasks accepted without rework, usage per accepted task and time to green guard.

## Functional requirements

- **FR-001 Eval set format.** A directory (default `evals/`, configurable) with `evalset.json` (`schemaVersion: 1`, name, version) and one folder per task containing `task.json`: id, repository (local path or Git URL), base commit (full SHA), prompt file, native spec paths (optional), required checks (argv as in check config), required requirement IDs (optional), time limit.
- **FR-002 Isolation.** Each task runs in a fresh disposable Git worktree or clone at the base commit, outside the maintainer's working checkouts. Nothing is pushed.
- **FR-003 Execution.** The task runs through the existing Factory job path with the given routing configuration (or a single-worker mode for small tasks), using the real configured clients (tests use fake clients). Runs require `--execute`; without it, `eval` prints the plan, estimated number of model invocations and the configuration.
- **FR-004 Results.** Each run writes `.project-init/evals/<run-id>/results.json`: configuration hash and content, per-task status (`passed`, `failed`, `error`, `timeout`), checks with exit codes, guard result, findings, per-role usage (from 005's usage record), wall time, and the eval set version.
- **FR-005 Honest aggregation.** Summaries report counts per status; any failed task is listed by id. No score hides a failure.
- **FR-006 Compare.** `project-init eval compare <run-a> <run-b>` renders a Lean Kit report: per-task outcome side by side, usage and time differences, and tasks that changed status.
- **FR-007 Success measures.** `project-init eval trend` reports across recorded runs: acceptance-without-rework rate, usage per accepted task, time to green guard.
- **FR-008 Data boundary.** Eval tasks inherit the data-class rule from 005; a task whose repository is `restricted` cannot run on unapproved clients.
- **FR-009 No secrets in results.** Results never contain environment values or tokens.

## Out of scope

- Public benchmark integration.
- Automatic scheduled runs.

## Success criteria

- **SC-001** An eval set with at least two fixture tasks runs end to end (fake clients in tests) under two configurations and produces a comparison report.
- **SC-002** A task whose checks fail is reported as failed in summary, compare and trend.
- **SC-003** Without `--execute`, nothing runs and the plan is shown.
