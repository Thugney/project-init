# Feature specification: Model routing policy

**Feature:** `005-model-routing`
**Roadmap:** Phase 5 · Issue #53
**Status:** ready to build (re-checked against the bundled Factory code; corrections approved by the maintainer)
**Depends on:** none strictly; builds on the bundled Factory. The generic CLI worker was split out to `015-generic-cli-worker`.

## Summary

Factory roles today take their model from three places, and all defaults point at the most expensive tier:

1. **Agent frontmatter.** `vendor/factory/claude/agents/factory-*.md` declare `model: opus`. This applies only when the Claude orchestrator spawns those agents as subagents.
2. **Headless Claude.** `claude_worker.py` (Claude builder under either orchestrator, and every Claude agent run by the Codex orchestrator through `claude_worker.py agent`) strips the frontmatter and passes `--model` from `claude.model`, falling back to the legacy top-level `claude_model` (shipped as `"opus"`).
3. **Codex.** `codex_worker.py` passes `-m` from `codex.model` (shipped empty, so Codex uses its own default).

This feature replaces those hardcoded choices with role tiers the maintainer configures, passes deterministic check results to reviewers, enforces a per-project data class, and records which model each role used.

## User stories

### US1 — Route roles to tiers (P1)

As the maintainer, I map Factory roles to `top`, `mid` and `fast` tiers and map each tier to concrete models per client, so cost follows the importance of the work.

### US2 — No surprise behavior change (P1)

Until I configure routing, Factory behaves exactly as today through all three model sources, and `status` tells me routing is not configured.

### US3 — Data class guard (P1)

A project declares its data class; Factory refuses to route any role to a client not approved for that class.

### US4 — See what each job used (P2)

Each Factory job records the tier, client and model used for each role and, where the client reports it, usage.

## Functional requirements

- **FR-001 Roles.** Routable roles: `spec-writer`, `builder`, `code-reviewer`, `security-reviewer`, `ux-reviewer`, `ui-reviewer`, `approver`. The `orchestrator` role is **advisory**: the orchestrator is the user's own interactive session, which Project Init does not launch, so its tier is shown by `status` (configured tier and model, for the user to select themselves) but is not enforced. A `summarizer` role is not part of 005; it is added by `010-learn-feedback-loop`.
- **FR-002 Configuration.** Factory config (`.claude/skills/factory/config.json`) gains `routing`: `roles` (role → tier) and `tiers` (tier → model identifier per client, keyed `claude` and `codex`). No concrete model names are shipped as defaults (maintainer decision). Suggested role → tier defaults are shipped: `top` for orchestrator (advisory), security-reviewer and approver; `mid` for spec-writer, builder, code-reviewer, ux-reviewer and ui-reviewer.
- **FR-003 Unconfigured fallback.** If a role's tier has no model for the client running it, that role behaves exactly as today: frontmatter for Claude-orchestrator subagents, `claude.model` then `claude_model` for headless Claude, `codex.model` for Codex. `status` and the job record show `routing: not-configured` for that role.
- **FR-004 Rendering and invocation.**
  - At Factory install/update, each Claude agent's `model` frontmatter is rendered from routing only when a model is configured for that role's tier; otherwise it stays as shipped.
  - Factory install planning compares installed agent files against the **rendered** content, so a routed install reports `unchanged` on the next preview instead of `replace`.
  - Headless workers pass the resolved model with the client's documented model option (`--model` for Claude, `-m` for Codex, confirmed in T001), for build, fix and `agent` runs.
- **FR-005 Deprecate `claude_model`.** `claude.model` is the single headless Claude model setting. Migration moves a non-empty `claude_model` into an empty `claude.model` and removes `claude_model`; if both are set and differ, `claude.model` wins and the migration result reports the dropped value. No chosen value is lost silently.
- **FR-006 Deterministic results passed to reviewers.** Configured checks already run on the integrated source through `project-init execution factory --execute` before the review round. Reviewer prompts receive those results (check name, command, exit code, log path) and state not to re-derive what the checks already decided.
- **FR-007 Data classes.** `.project-init/project.json` gains `dataClass` (`public`, `internal`, `personal`, `restricted`; default `internal`). The `claude` and `codex` config entries declare `approvedDataClasses`. A client entry with no `approvedDataClasses` is **not approved for any class** (fail closed). Factory refuses to start a job (`board.py init` and the orchestrator preflight) if any role would run on a client not approved for the project's class, naming the role and client. If the project state cannot be read, the job is refused.
- **FR-008 Setting the data class.** `project-init data-class --project . [--set <class>] [--apply]` shows the current class, or previews a change; only `--apply` writes `project.json` and records an audit event. No other path writes the field.
- **FR-009 Usage record.** Worker process receipts record `tier`, `client` and `model` (or `not-configured`), with a receipt `schemaVersion` bump that `execution factory` accepts alongside version 1. Each job keeps `factory/jobs/<slug>/routing.json` listing per role: tier, client, model (or `not-configured`), start and end time, and usage figures when the client prints them, otherwise `usage: not-reported`. Roles run as interactive Claude-orchestrator subagents are recorded with the frontmatter model and `usage: not-reported`.
- **FR-010 Status.** Routing state (configured or `not-configured` per role, the advisory orchestrator tier, the project data class, and any client not approved for it) is reported through Factory runtime status in `lib/factory.mjs`, which `project-init status` already includes.

## Out of scope

- Choosing concrete models or providers (maintainer decision).
- **Generic CLI worker** for other model families: split out to `015-generic-cli-worker`.
- **OpenAI-compatible endpoint adapter** (base URL and model name), listed as an option in `docs/ROADMAP-2.2.md` Phase 5: left out for now. No API-level agent loop is built.
- **Family diversity** (builder and reviewer on different clients): deferred. Every reviewer is a Claude agent today and reviews the integrated result once per round, so there is no Codex reviewer path to route to. Revisit after a Codex reviewer path exists.
- **Opt-in multi-model `decide` command:** deferred with family diversity.
- Enforcing the orchestrator's model.
- Cost in currency (usage only, as reported by clients).

## Success criteria

- **SC-001** With no routing configured, existing Factory tests pass unchanged and status reports `not-configured`.
- **SC-002** With routing configured, rendered agent files and headless worker invocations use the configured models; a second `factory` preview reports the rendered agents `unchanged`.
- **SC-003** Config migration preserves existing values, including moving `claude_model` into `claude.model`.
- **SC-004** A `restricted` project refuses a client not approved for `restricted`, and a client with no `approvedDataClasses` is refused for every class.
- **SC-005** The job record lists tier, client and model per role.
