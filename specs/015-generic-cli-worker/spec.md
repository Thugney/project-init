# Feature specification: Generic CLI worker

**Feature:** `015-generic-cli-worker`
**Roadmap:** Phase 5 (split out of `005-model-routing`) · Issue: none yet
**Status:** drafted ahead; re-check first
**Depends on:** `005-model-routing` (tiers, data classes, receipt schema and usage record). Before building, re-read this spec against the code as built and report any mismatch instead of improvising.

## Summary

Roadmap Phase 5 lets the `mid` and `fast` tiers point at other model families through one generic adapter instead of one integration per vendor. This feature adds a Factory worker type that runs any command-line coding agent in its own isolated worktree and leaves the same process receipt and Git integration as the Codex and Claude workers.

## Why this was split from 005

The re-check of 005 found that Factory hardcodes exactly two workers in many places, so a third worker is a topology change, not one new script:

- `vendor/factory/claude/skill/scripts/worktree.py`: worker names, branches, worktree creation, sync, integrate and process evidence lookup.
- `lib/execution.mjs`: merge receipts accepted only for `codex` and `claude`; process evidence and "latest result integrated" checks for those two only.
- `vendor/factory/claude/skill/scripts/board.py`: job `workers` initialized as `codex`/`claude`; review fix tags counted only for `CODEX|CLAUDE|INTEGRATION`.
- `vendor/factory/claude/agents/factory-spec-writer.md` and every reviewer agent: task and finding tags `[CODEX]`/`[CLAUDE]` only.
- `lib/factory.mjs`: required bundled file list, bridge contract check on `codex_worker.py`, and the two-worker `workers` plan output.
- Both orchestrator `SKILL.md` files: build, integrate and fix steps name the two workers.

## User stories

### US1 — Other model families through one worker (P1)

I can add a worker that runs any command-line coding agent in its assigned worktree (for example Codex configured with another provider, or another vendor's CLI) without Project Init integrating each vendor.

### US2 — Same evidence as existing workers (P1)

A generic worker's run produces a process receipt and Git integration that `execution factory` verifies exactly like Codex and Claude runs.

### US3 — No secret leaks (P1)

API keys reach the agent only through named environment variables; values never appear in config, logs, receipts or job files.

## Functional requirements

- **FR-001 Worker entry.** Factory config gains named generic worker entries: name, executable, argument template (with `{prompt_file}` and `{worktree}` placeholders), environment variable names it may read, timeout, and `approvedDataClasses` (empty or missing means not approved, as in 005).
- **FR-002 Topology.** Factory supports N named workers: worktree creation, branches, sync, integrate, board job state, spec-writer task tags, reviewer finding tags and fix-tag counting work for generic worker names. Tag format is decided at re-check (for example `[CLI:<name>]`).
- **FR-003 Execution.** The worker runs the argument template as an argument vector in its assigned worktree. Behavior for Windows `.cmd`/`.bat` executables matches the existing workers' batch dispatch rules, including rejection of unsafe arguments.
- **FR-004 Receipt and integration.** Same receipt format and schema as the Codex and Claude workers after 005, including tier, client and model; `execution factory` accepts generic worker receipts and merges.
- **FR-005 Secrets.** The child environment includes only the named variables plus the minimal process environment; values are never written to config, logs, receipts or `routing.json`.
- **FR-006 Routing and data class.** Generic workers are clients in 005's `routing.tiers` and data class check.
- **FR-007 Off by default.** No generic worker is configured by default; pay-per-token providers are used only after the maintainer adds an entry.

## Out of scope

- Choosing concrete models, providers or CLIs (maintainer decision).
- An OpenAI-compatible endpoint adapter or any API-level agent loop.
- Family diversity and the multi-model `decide` command (deferred in 005).

## Success criteria

- **SC-001** A generic CLI worker (fake executable in tests) produces a receipt and Git integration accepted by `execution factory`.
- **SC-002** Tests prove no environment variable value appears in receipts, logs or job files.
- **SC-003** A generic worker without `approvedDataClasses` is refused for every data class.
- **SC-004** Existing two-worker Factory tests pass unchanged when no generic worker is configured.
