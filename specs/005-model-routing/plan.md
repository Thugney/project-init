# Implementation plan: Model routing policy

**Spec:** `specs/005-model-routing/spec.md`

## Technical context

- Factory config: `vendor/factory/claude/skill/config.json` (installed as `.claude/skills/factory/config.json`, `preserve-existing`); migration in `migrateBundledConfig` in `lib/factory.mjs`, which today only adds missing top-level keys to a current config.
- Model sources today: agent frontmatter `model: opus` in `vendor/factory/claude/agents/*.md` (Claude-orchestrator subagents only); `claude_args()` in `claude_worker.py` (`claude.model` then `claude_model`; the `agent` mode strips frontmatter); `codex.model` in `codex_worker.py` (`-m`).
- Factory install: `bundledFactoryEntries`/`mappedEntry` in `lib/factory.mjs` plan agent files in `replace` mode by comparing installed bytes with the shipped source, and `applyFactory` copies them with `copyFileSync`, then re-plans to verify.
- Checks before review: `project-init execution factory --execute` (`lib/execution.mjs`) runs configured checks on the integrated source before the review round (`vendor/factory/claude/skill/SKILL.md`, `vendor/factory/codex/skills/factory/SKILL.md`).
- Receipts: `record_execution` in both workers writes `schemaVersion: 1`; `lib/execution.mjs` requires version 1.
- Status: `factoryRuntimeStatus` in `lib/factory.mjs`, included by `status` in `lib/core.mjs` for initialized and uninitialized projects.
- Client model options and usage output must be taken from current client documentation (T001), not memory.

## Design

- **Config schema:** `routing.roles`, `routing.tiers.<tier>.{claude,codex}`, and `approvedDataClasses` on the existing `claude` and `codex` objects. Shipped defaults: suggested role → tier map, empty tier models, `approvedDataClasses` of `["public", "internal"]` for both clients (maintainer decision during build, 2026-11-02: empty lists would refuse every job after upgrade, contradicting US2 and SC-001). `personal` and `restricted` stay refused until approved.
- **Migration:** add `routing` when missing; add `approvedDataClasses` to existing `claude`/`codex` objects when missing (nested-key merge, never overwriting a value); move `claude_model` into an empty `claude.model` and drop it, reporting a conflicting dropped value.
- **Resolution** in one Python helper used by workers and `board.py`: `resolve(role, client) → {tier, model|None}`; `None` means fallback (FR-003). The orchestrator role resolves for display only.
- **Rendering:** at Factory install/update, agent frontmatter `model:` is rewritten only when a model is configured for that role's tier. `mappedEntry` compares against the rendered content and `applyFactory` writes the rendered content instead of copying the source.
- **Reviewer inputs:** the orchestrator skills pass the latest `execution factory` check results path into each reviewer; reviewer agents read it and do not re-derive those results.
- **Data class:** `readState` accepts `dataClass` (default `internal` when absent); `project-init data-class` previews or applies changes with an audit event. `board.py init` and the orchestrator preflight read `.project-init/project.json` and the Factory config, and refuse fail-closed on an unreadable state, an unapproved client or a client without `approvedDataClasses`.
- **Usage record:** receipts gain `tier`, `client`, `model` under `schemaVersion: 2`; `execution factory` accepts 1 and 2. Workers append role entries to `factory/jobs/<slug>/routing.json`. Usage is parsed best effort from each client's documented output; unknown output yields `not-reported`.
- **Status:** `factoryRuntimeStatus` adds a `routing` section.

## Changes

| File | Change |
| --- | --- |
| `vendor/factory/claude/skill/config.json` | `routing`, `approvedDataClasses`; `claude_model` removed |
| `vendor/factory/claude/skill/scripts/routing.py` | new: resolution, data class check, `routing.json` writer |
| `codex_worker.py`, `claude_worker.py`, `board.py` | resolved models, receipt v2, usage record, data class refusal |
| `vendor/factory/claude/agents/*-reviewer.md`, `factory-approver.md`, both orchestrator `SKILL.md` files | check results passed to reviewers; data class preflight |
| `lib/factory.mjs` | required file list (`routing.py`), migration, rendered agent planning/writing, routing status |
| `lib/execution.mjs` | accept receipt schema 1 and 2 |
| `lib/core.mjs`, `bin/project-init.mjs` | `dataClass` in state; `data-class` command |
| `package.json` | no new `lib/*.mjs` expected; add any to `check` if created |
| `docs/ROUTING.md`, `docs/FACTORY-STACK.md`, `docs/COMMANDS.md`, `CHANGELOG.md` | configuration, data classes, limits, command |

## Risks

- **Breaking existing Factory jobs.** Mitigation: fallback is today's behavior through all three sources; existing tests must pass unchanged.
- **Install churn from rendering.** Mitigation: planning compares against rendered content; regression test for a clean second preview.
- **Refusing jobs after upgrade.** Shipped `approvedDataClasses` cover `public` and `internal`, so only `personal`/`restricted` projects and clients with an emptied list are refused (FR-007). Mitigation: status names the unapproved clients and the docs give the exact config edit; the refusal message says the same.
- **Usage parsing brittle.** Mitigation: best effort, explicit `not-reported`.

## Rollback

Remove `routing` from config to return to the model fallback; reverting the pull request restores shipped agents, workers and receipt version.
