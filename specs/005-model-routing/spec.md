# Feature specification: Model routing policy

**Feature:** `005-model-routing`
**Roadmap:** Phase 5 · Issue #53
**Status:** ready for build approval
**Depends on:** none strictly; builds on the bundled Factory. Before building, re-read this spec against the current Factory code and report any mismatch instead of improvising.

## Summary

Every bundled Factory agent declares `model: opus`, so every role runs on the most expensive tier. This feature replaces hardcoded models with role tiers the maintainer configures, keeps deterministic checks ahead of model review, pairs different model families for building and reviewing, lets other model families work through one generic CLI worker, enforces a per-project data class, and records which model each role used.

## User stories

### US1 — Route roles to tiers (P1)

As the maintainer, I map Factory roles to `top`, `mid` and `fast` tiers and map each tier to concrete models per client, so cost follows the importance of the work.

### US2 — No surprise behavior change (P1)

Until I configure routing, Factory behaves exactly as today, and `status` tells me routing is not configured.

### US3 — Other model families through one worker (P2)

I can add a worker that runs any command-line coding agent in its assigned worktree (for example Codex configured with another provider, Hermes, or another vendor's CLI) without Project Init integrating each vendor.

### US4 — Data class guard (P1)

A project declares its data class; Factory refuses to route any role to a provider not approved for that class.

### US5 — See what each job used (P2)

Each Factory job records the tier, client and model used for each role and, where the client reports it, usage.

## Functional requirements

- **FR-001 Roles.** Roles: `orchestrator`, `spec-writer`, `builder`, `code-reviewer`, `security-reviewer`, `ux-reviewer`, `ui-reviewer`, `approver`, `summarizer`.
- **FR-002 Configuration.** Factory config gains `routing`: `roles` (role → tier) and `tiers` (tier → per-client model identifier, for `claude`, `codex` and named generic workers). No concrete model names are shipped as defaults (maintainer decision). Suggested role → tier defaults are shipped: `top` for orchestrator, security-reviewer, approver; `mid` for spec-writer, builder, code-reviewer, ux-reviewer, ui-reviewer; `fast` for summarizer.
- **FR-003 Unconfigured fallback.** If a role's tier has no model for the client running it, behavior is unchanged from today (current agent frontmatter and config values), and `status` and the job record show `routing: not-configured` for that role.
- **FR-004 Rendering.** Factory installation renders each Claude agent's `model` frontmatter from the routing configuration when configured; the Codex worker and orchestrator pass the configured model with the client's documented model option. Existing configs migrate without losing chosen values.
- **FR-005 Deterministic first.** Before any reviewer role runs, the integration's configured checks run; their results are passed to reviewers, and reviewer prompts state not to re-derive what checks already decided.
- **FR-006 Family diversity.** By default, the builder and the code reviewer for the same work unit run on different clients (Codex builds → Claude reviews, Claude builds → Codex reviews). It can be disabled per project; status shows when it is.
- **FR-007 Opt-in multi-model decisions.** A `/factory decide <question>` (and Codex equivalent) runs the same question through two or more configured models with anonymised labels, then one `top`-tier model writes a synthesis. Never part of the default build loop.
- **FR-008 Generic CLI worker.** A worker type `cli` configured with: name, executable, argument template (with `{prompt_file}`, `{worktree}` placeholders), environment variable names it may read, timeout, and approved data classes. It runs in its assigned worktree like the Codex worker and leaves the same process receipt. Keys come only from the named environment variables; values are never written to config, logs or receipts.
- **FR-009 OpenAI-compatible providers.** No direct API agent loop is built. Documentation gives recipes for reaching OpenAI-compatible providers through an existing agent CLI's provider configuration (for example Codex's custom provider settings), recorded from that CLI's current documentation (task T001).
- **FR-010 Data classes.** `project.json` gains `dataClass` (`public`, `internal`, `personal`, `restricted`; default `internal`). Each client and generic worker entry declares `approvedDataClasses`. Factory refuses to start a job if any role would run on a client not approved for the project's class, naming the role and client.
- **FR-011 Usage record.** Each job's report records per role: tier, client, model (or `not-configured`), start and end time, and usage figures when the client prints them; otherwise `usage: not-reported`.

## Out of scope

- Choosing concrete models or providers (maintainer decision).
- An API-level agent loop.
- Cost in currency (usage only, as reported by clients).

## Success criteria

- **SC-001** With no routing configured, existing Factory tests pass unchanged and status reports `not-configured`.
- **SC-002** With routing configured, rendered agent files and worker invocations use the configured models; config migration preserves existing values.
- **SC-003** A generic CLI worker (fake executable in tests) produces a receipt and Git integration accepted by `execution factory`.
- **SC-004** A `restricted` project refuses a client not approved for `restricted`.
- **SC-005** The job record lists tier, client and model per role.
