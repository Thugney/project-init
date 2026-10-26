---
name: factory
description: Project Init Factory orchestrator. Splits approved work into independent Codex and Claude work units, runs both in isolated Git worktrees in parallel, integrates them, reviews the combined result, and stops at the human gate.
argument-hint: "<idea> | next | spec <specs/NNN-x> | review <slug> | approve <slug> | rework <slug> <feedback> | status"
---

# /factory — parallel worktree orchestrator

The session running this skill is the orchestrator. It coordinates; it does not implement application code.

## Orchestrator role

Read `orchestrator` in `.claude/skills/factory/config.json` (a missing value means `claude`).

- If it is `codex`, stop. Say that Codex is the configured orchestrator, do not write `factory/board.json`, and work only on `[CLAUDE]` tasks when the Codex orchestrator dispatches you through `claude_worker.py`.
- To change the orchestrator, the user runs `project-init factory --project . --orchestrator claude|codex --apply`.
- Only the configured orchestrator writes `factory/board.json`, and only through the board helper.

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

0. Run `project-init status --project .`. If it exits non-zero with `blocked`, stop and follow its `next` steps: this checkout has no Project Init state of its own.
1. Factory files must exist. If not, tell the user to run `project-init init --project . --apply`.
2. Refuse tracked uncommitted source changes: `git status --porcelain --untracked-files=no`. Untracked unrelated files may remain; worker worktrees start from committed `HEAD` and do not inherit them.
3. Use Project Init's feature preparation to reuse the active native spec/tasks, configure actual checks and requirement mappings, and establish the baseline before its independent review and actual human approval. Check `project-init status --project .`; installed tooling alone is not feature approval. Commit the approved native artifacts before creating worker worktrees, using the user's existing authorization for that action. Do not fabricate approvals to satisfy this preflight.
4. After the native artifacts are committed, record `base_commit=$(git rev-parse HEAD)` and `base_branch=$(git rev-parse --abbrev-ref HEAD)`. Do not checkout or pull the user's working branch. Use this same committed base for the board entry and worktree creation.

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

Record and verify the actual integrated result with:

`project-init execution factory --project <orchestration-root> --job <actual-slug> --allow <approved-path> [--allow <approved-path>] --execute`

Derive the explicit path scope from the approved task contract. Preview without `--execute` when the scope is not yet authorized. The helper imports the actual Git integration/process receipts, copies the exact reviewed baseline into the integration worktree without inventing approval, and runs its configured checks there. A failed worker, failed integration, stale receipt or out-of-scope path blocks this step. The returned `integrationProject` is the target for subsequent verification; a worker hash is not evidence for the integrated code.

If the isolated checkout needs dependencies, use its established reproducible setup before running the checks. Do not weaken checks or hide dependency failures. The integration worktree is the only branch reviewed/shipped.

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

Refresh `execution factory ... --execute` after every integration. Old process and integration logs are retained. Once actual independent reviewers have examined the integrated source, record `project-init source-review --project <integration-root> --actor <actual-reviewer> --evidence <actual-reference>`, import the requirement-level semantic findings, and capture/compare the required visual evidence. Run `project-init guard --project <integration-root>`; missing evidence remains a blocker, even if Factory reviewers report PASS.

## 7. Decision and ship

- `B stage <slug> decision`
- `B risk <slug>`
- Spawn `factory-approver` against the integrated branch/review evidence.
- Ship only when decision=APPROVE, risk=LOW, final review=ALL_PASS, and the current integrated Project Init guard passes. Otherwise set `needs-human`.

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
- For already implemented work without a real Factory job, keep the existing PR and use Project Init's explicit `execution existing` verification path after current checks and independent source/semantic review. Do not create a dummy job or code change to manufacture an execution receipt.
