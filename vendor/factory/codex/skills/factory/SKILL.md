---
name: factory
description: Project Init Factory orchestrator for Codex. Use only when the Factory config selects Codex as orchestrator. Splits approved work into independent Codex and Claude work units, runs both in isolated Git worktrees, integrates them, has the bundled agents review the combined result, and stops at the human gate.
---

# Factory — Codex as orchestrator

The session running this skill is the orchestrator. It coordinates; it does not implement application code.

## Orchestrator role

Read `orchestrator` in `.claude/skills/factory/config.json` (a missing value means `claude`).

- If it is not `codex`, stop. Say which agent is the configured orchestrator, do not write `factory/board.json`, and work only as a worker through the `factory-worker` skill when a Factory job assigns you `[CODEX]` tasks.
- To change the orchestrator, the user runs `project-init factory --project . --orchestrator codex|claude --apply`.
- Only the configured orchestrator writes `factory/board.json`, and only through the board helper.

## Architecture invariant

**Codex is not the backend worker. Claude is not the frontend worker.** Both are general implementation workers. Factory assigns independent work units by dependency and file boundaries, and each worker gets its own Git worktree.

## Shortcuts

- On Windows use `python`; on macOS/Linux use `python3`.
- `B` = `<python> .claude/skills/factory/scripts/board.py`
- `WT` = `<python> .claude/skills/factory/scripts/worktree.py`
- `CX` = `<python> .claude/skills/factory/scripts/codex_worker.py` (Codex worker, headless `codex exec`)
- `CL` = `<python> .claude/skills/factory/scripts/claude_worker.py` (Claude worker and Factory agents, headless `claude -p`)
- `J` = `factory/jobs/<slug>`

Keep orchestrator context small. Workers and agents read files; you consume their short status lines.

## Preflight

1. Run `project-init status --project .`. If it exits non-zero with `blocked`, stop and follow its `next` steps: this checkout has no Project Init state of its own.
2. Factory files must exist. If not, tell the user to run `project-init init --project . --apply`.
3. Refuse tracked uncommitted source changes: `git status --porcelain --untracked-files=no`. Worker worktrees start from committed `HEAD`.
4. Use Project Init's feature preparation, baseline, independent review and actual human approval. Installed tooling alone is not feature approval. Commit the approved native artifacts before creating worker worktrees, using the user's existing authorization for that action. Never fabricate approvals.
5. Record `base_commit=$(git rev-parse HEAD)` and `base_branch=$(git rev-parse --abbrev-ref HEAD)`. Do not checkout or pull the user's working branch.

## 1. Spec and task assignment

- `slug=$(B init "<title>" --source idea|speckit:<dir>)`
- `CL agent <slug> factory-spec-writer` writes `J/spec.md` and assigns independent tasks to `[CODEX]` and `[CLAUDE]` by parallelism and file boundaries, never by frontend/backend.
- Record `B note <slug> has_ui <true|false>`, `B note <slug> base_commit <sha>` and `B note <slug> base_branch <branch>`.

## 2. Create isolated worktrees

- `WT init <slug>` creates the `codex`, `claude` and `integration` worktrees from the recorded base commit.
- Never send both workers into the same checkout.

## 3. Build in parallel

`B stage <slug> building`, then start both assigned workers. They use separate worktrees, so run them concurrently when your shell allows:

- `CX build <slug>`
- `CL build <slug>`

Skip a worker with zero assigned tasks. A worker failure or `BLOCKED` result blocks integration; do not silently move its tasks to the other worker.

## 4. Integrate

`B stage <slug> integrating`, then `WT integrate <slug> codex` and `WT integrate <slug> claude`. Any merge conflict is an integration blocker: stop and report it.

Record and verify the integrated result with `project-init execution factory --project <orchestration-root> --job <slug> --allow <approved-path> [--allow ...] --execute`. A failed worker, failed integration, stale receipt or out-of-scope path blocks this step. Both workers' process receipts are verified.

## 5. Review round

- `B round <slug>`
- For each configured reviewer (`security`, `code`, `ux`, `ui`; skip UI reviewers when `has_ui` is false), run `CL agent <slug> factory-<reviewer>-reviewer <round>`. Each writes `J/round-<N>/review-<reviewer>.md` with findings tagged `[CODEX]`, `[CLAUDE]` or `[INTEGRATION]`.
- `B collect <slug>`. `ALL_PASS` continues to decision; `CHANGES` starts a fix round.

## 6. Fix round

`B stage <slug> fixing`. Sync the integrated result into each worker that has findings (`WT sync <slug> codex|claude`), then run `CX fix <slug> <round>` and/or `CL fix <slug> <round>`. `[INTEGRATION]` findings need an explicit resolution plan before another review. Integrate again, refresh `execution factory ... --execute`, and review again.

Once independent reviewers have examined the integrated source, record `project-init source-review`, import the requirement-level semantic findings, capture and compare visual evidence, and run `project-init guard --project <integration-root>`. Missing evidence remains a blocker even when reviewers report PASS.

## 7. Decision and ship

- `B stage <slug> decision`, `B risk <slug>`, then `CL agent <slug> factory-approver`.
- Ship only when decision=APPROVE, risk=LOW, final review=ALL_PASS and the integrated Project Init guard passes. Otherwise `B stage <slug> needs-human`.
- In PR mode push only the integration branch and open the PR against the recorded base branch.

## Human approval and hard rules

- Approval is an explicit human gate. Never infer it from green tests or reviews.
- One worker = one isolated worktree. Ownership is per work unit, not per technology layer.
- Spec Kit stays the product source of truth; Factory job files are execution contracts. Exchange work through job files, not chat relays.
- Never force-push, edit CI to pass, hide failing tests or merge unresolved conflicts. Review the integrated result, not worker branches.
- For already implemented work without a Factory job, use Project Init's `execution existing` path. Do not create a dummy job.
