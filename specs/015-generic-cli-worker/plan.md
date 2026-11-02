# Implementation plan: Generic CLI worker

**Spec:** `specs/015-generic-cli-worker/spec.md`

Drafted ahead of `005-model-routing`. Re-check every path below against the code as built before coding.

## Technical context

- Workers: `vendor/factory/claude/skill/scripts/codex_worker.py`, `claude_worker.py` (receipt writer `record_execution`, Windows batch dispatch in `run_process`).
- Topology: `worktree.py`, `board.py`, `lib/execution.mjs`, `lib/factory.mjs`, spec-writer and reviewer agents, both orchestrator skills (see the spec's split rationale).
- Routing, data class and receipt schema come from 005.

## Design

- **Worker registry:** one list of worker names derived from config (`codex`, `claude`, plus generic entries), used by `worktree.py`, `board.py`, `lib/execution.mjs` and `lib/factory.mjs` instead of hardcoded pairs.
- **Generic worker:** `generic_worker.py` modelled on `codex_worker.py`: writes the prompt to a file, expands the argument template into an argument vector, runs it in the worktree with a filtered environment, commits through the Factory bridge, and writes the same receipt.
- **Tags:** spec-writer and reviewers use the registry's tag for each worker; `board.py collect` counts fixes per registered worker.
- **Secrets:** environment filtered to named variables; receipts record names only; tests scan outputs for planted values.

## Changes

| File | Change |
| --- | --- |
| `vendor/factory/claude/skill/scripts/generic_worker.py` | new |
| `worktree.py`, `board.py` | worker registry |
| `lib/execution.mjs` | accept registered worker receipts |
| `lib/factory.mjs` | required files, worker plan output |
| `vendor/factory/claude/agents/*.md`, both orchestrator `SKILL.md` files, `vendor/factory/codex/skills/*` | worker tags and steps |
| `docs/ROUTING.md`, `docs/FACTORY-STACK.md`, `CHANGELOG.md` | configuration and limits |

## Risks

- **Breaking the two-worker flow.** Mitigation: registry defaults to `codex`, `claude`; existing tests unchanged.
- **Secrets leaking.** Mitigation: names only, filtered environment, planted-value tests.
- **Unsafe command execution.** Mitigation: argument vector, existing Windows batch rules, no shell interpolation of placeholders.

## Rollback

Remove generic worker entries from config; reverting the pull request restores the two-worker topology.
