---
name: factory-worker
description: Implement or fix tasks assigned to Codex by a Project Init Factory job. Work only inside the supplied isolated Git worktree. [CODEX] is a worker assignment, not a backend role.
---

# Factory Worker

Use this skill only when a Factory job assigns tasks to **Codex**.

## Core contract

You are one worker in a parallel software factory. Claude may be working at the same time in a different Git worktree.

**Neither worker owns frontend or backend.** `[CODEX]` and `[CLAUDE]` indicate which isolated worker owns a task for this job. Either worker may implement frontend, backend, tests, documentation, migrations, or full-stack changes when assigned.

## Before editing

1. Confirm the caller supplied an isolated worktree path and that your current working directory is that worktree.
2. Read the copied Factory context under `.factory-context/<slug>/spec.md`.
3. On a fix round, also read `.factory-context/<slug>/round-N/review-*.md`.
4. Inspect only enough repository source to implement your assigned tasks safely.

## Build

- Implement every unfinished task tagged `[CODEX]`.
- Do not implement tasks tagged `[CLAUDE]`.
- Treat the spec's `## API Contract` as binding when present.
- Stay within the file/path boundaries listed by the assigned tasks.
- Avoid overlapping files owned by the other worker. If overlap is unavoidable or the contract is contradictory, return BLOCKED instead of silently crossing ownership.

## Fix rounds

- Fix only review findings tagged `[CODEX]`.
- Re-read the spec before changing shared behavior.
- If a finding belongs to the integrated result rather than your assigned files, return BLOCKED and identify it as an integration issue.

## Engineering requirements

- Follow existing repository conventions.
- Add/update tests for the acceptance criteria you own.
- Preserve security boundaries, authorization, validation, secrets handling, and existing observability conventions.
- Never weaken/delete tests merely to obtain green output.
- Never modify `.claude/`, `.agents/`, `.project-init/`, `factory/`, or `.factory-context/`.
- Never run Git commit/push/pull/merge/rebase/checkout/switch/worktree commands. Factory owns branch and integration operations.

For a BMAD story assignment, never change its `Status:` field or `sprint-status.yaml`. You may tick only task checkboxes assigned to you and completed in this worktree. Keep acceptance criteria and task identifiers unchanged.

## Final message

The first non-empty line must be one of:

- `WORKER: DONE`
- `WORKER: BLOCKED <one-line reason>`

Use at most 10 short lines total.
