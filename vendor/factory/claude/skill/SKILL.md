---
name: factory
description: Project Init Factory orchestrator. Splits approved work into independent Codex and Claude work units, runs both in isolated Git worktrees in parallel, integrates them, reviews the combined result, and stops at the human gate.
argument-hint: "<idea> | next | spec <specs/NNN-x> | review <slug> | approve <slug> | rework <slug> <feedback> | status"
---

# /factory — parallel worktree orchestrator

The session running this skill is the orchestrator. It coordinates; it does not implement application code.

## Architecture invariant

**Codex is not the backend worker. Claude is not the frontend worker.**

Both are general implementation workers. Factory assigns independent work units by dependency and file boundaries. Each worker receives its own Git worktree so they can run concurrently without editing the same checkout.

```text
approved Spec Kit work
        |
 Factory task split
        |
   +----+----+
   |         |
 Codex     Claude
worktree  worktree
   |         |
   +----+----+
        |
integration worktree
        |
 reviews/tests
        |
 human approval
```

## Shortcuts

- On Windows use `python`; on macOS/Linux use `python3` for the Factory helper scripts.
- `B` = `<python> .claude/skills/factory/scripts/board.py`
- `WT` = `<python> .claude/skills/factory/scripts/worktree.py`
- `CX` = `<python> .claude/skills/factory/scripts/codex_worker.py`
- `J` = `factory/jobs/<slug>`

Keep orchestrator context small. Agents read files; you consume their short status lines.

## Preflight

1. Factory files must exist. If not, tell the user to run `project-init init --project . --apply`.
2. Refuse tracked uncommitted source changes: `git status --porcelain --untracked-files=no`. Untracked unrelated files may remain; worker worktrees start from committed `HEAD` and do not inherit them.
3. Record `base_commit=$(git rev-parse HEAD)` and `base_branch=$(git rev-parse --abbrev-ref HEAD)`. Do not checkout or pull the user's working branch.

## 1. Spec and task assignment

- `slug=$(B init "<title>" --source idea|speckit:<dir>)`
- Spawn `factory-spec-writer` to write `J/spec.md`.
- It assigns independent tasks to `[CODEX]` and `[CLAUDE]` based on parallelism/file boundaries, never frontend/backend categories.
- Record its `has_ui` result with `B note <slug> has_ui <true|false>`.
- Record base facts: `B note <slug> base_commit <sha>` and `B note <slug> base_branch <branch>`.

## 2. Create isolated worktrees

- `WT init <slug>` creates/reuses three worktrees from the recorded base commit:
  - `factory/<slug>/codex`
  - `factory/<slug>/claude`
  - `factory/<slug>/integration`
- Retrieve paths with `WT path <slug> codex|claude|integration`.
- Never send both workers into the same checkout.

## 3. Build in parallel

`B stage <slug> building`.

In the same stage, start both assigned workers:

- Codex: run `CX build <slug>`.
- Claude: spawn `factory-builder` with the Claude worktree path, job spec path, and `scope=CLAUDE`.

Wait for both. If one has zero assigned tasks, skip it. A worker failure blocks integration; do not silently move its tasks to the other worker unless the spec is explicitly reassigned and reviewed.

## 4. Integrate

`B stage <slug> integrating`.

- `WT integrate <slug> codex`
- `WT integrate <slug> claude`

Integration order may follow `J/spec.md`. Any merge conflict is an **integration blocker**: stop and report it. Do not have either worker overwrite the other worker's changes.

Run the configured tests in the integration worktree. The integration worktree is the only branch reviewed/shipped.

## 5. Review round

- `B round <slug>`
- Spawn configured reviewers in parallel against the **integration worktree** and `J/spec.md`.
- Findings must be tagged `[CODEX]`, `[CLAUDE]`, or `[INTEGRATION]` according to the task/file ownership that needs correction.
- `B collect <slug>`.

If `ALL_PASS`, continue to decision. If `CHANGES`, run a fix round.

## 6. Fix round

`B stage <slug> fixing`.

Before fixes, sync the integrated result into the worker that needs changes:

- `WT sync <slug> codex` when `codex_fixes>0`.
- `WT sync <slug> claude` when `claude_fixes>0`.

Then run affected workers in parallel:

- `CX fix <slug> <round>` for `[CODEX]` findings.
- Resume the Claude `factory-builder` in its worktree for `[CLAUDE]` findings.

`[INTEGRATION]` findings are not arbitrarily assigned. Stop for an explicit integration resolution plan, then review again.

After worker fixes, integrate affected branches again and return to the review round.

## 7. Decision and ship

- `B stage <slug> decision`
- `B risk <slug>`
- Spawn `factory-approver` against the integrated branch/review evidence.
- Ship only when decision=APPROVE, risk=LOW, and final review=ALL_PASS. Otherwise set `needs-human`.

For PR mode, push only the **integration branch** and create the PR against the recorded base branch. Never push the user's base branch.

## Human approval

`/factory approve <slug>` remains an explicit human gate. Never infer approval from a green test/review.

## Hard rules

- One worker = one isolated worktree.
- Codex/Claude ownership is per work unit, not per technology layer.
- Spec Kit remains the product/spec source of truth; Factory job files are execution contracts.
- Never force-push, auto-edit CI to pass, hide failing tests, or merge unresolved conflicts.
- Review the integrated result, not isolated worker branches.
- Worktree integration is deterministic Git state; chat messages are not synchronization.
