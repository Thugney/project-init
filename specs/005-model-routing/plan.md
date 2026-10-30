# Implementation plan: Model routing policy

**Spec:** `specs/005-model-routing/spec.md`

## Technical context

- Factory config: `vendor/factory/claude/skill/config.json` (installed as `.claude/skills/factory/config.json`); migrations in `lib/factory.mjs`.
- Claude agents: `vendor/factory/claude/agents/*.md` with `model:` frontmatter. Workers: `codex_worker.py`, `claude_worker.py`; board: `board.py`.
- Client model options and provider configuration must be taken from current client documentation (T001), not memory.

## Design

- **Config schema** additions: `routing.roles`, `routing.tiers`, `routing.familyDiversity` (default `true`), `workers.generic[]` (FR-008), `clients.<name>.approvedDataClasses`.
- **Resolution** in one Python helper used by orchestrator scripts and workers: `resolve(role, client) → {tier, model|None}`; `None` means fallback (FR-003).
- **Rendering:** at Factory install/update, agent frontmatter `model:` is rewritten only when a model is configured for that role's tier; otherwise left as shipped.
- **Generic worker:** `generic_worker.py` modelled on `codex_worker.py` (same receipt format), executing the configured argv template without a shell.
- **Data class check** in the orchestrator preflight and in `board.py init`.
- **Usage parsing:** per-client best-effort parsers for printed usage; unknown output yields `not-reported`.
- **Decide command:** orchestrator skill section plus a small script to anonymise labels and collect answers.

## Changes

| File | Change |
| --- | --- |
| `vendor/factory/claude/skill/config.json` | new keys with safe defaults |
| `vendor/factory/claude/skill/scripts/routing.py`, `generic_worker.py` | new |
| `codex_worker.py`, `claude_worker.py`, `board.py` | use routing; record usage; data class check |
| `vendor/factory/claude/agents/*.md`, `vendor/factory/claude/skill/SKILL.md`, `vendor/factory/codex/skills/*` | deterministic-first review inputs, family diversity, decide command |
| `lib/factory.mjs` | migration preserving chosen values; frontmatter rendering |
| `lib/core.mjs` | `dataClass` in project state, default `internal`; status shows routing state |
| `docs/ROUTING.md`, `docs/FACTORY-STACK.md`, `docs/COMMANDS.md` | configuration, recipes, data classes, limits |

## Risks

- **Breaking existing Factory jobs.** Mitigation: fallback is today's behavior; existing tests must pass unchanged.
- **Secrets leaking through generic workers.** Mitigation: environment variable names only, never values; receipts and logs redacted; tests assert no value appears.
- **Usage parsing brittle.** Mitigation: best effort, explicit `not-reported`.

## Rollback

Remove `routing` from config to return to today's behavior; reverting the pull request restores shipped agents and workers.
