# Feature specification: Pack-declared hooks

**Feature:** `004-pack-hooks`
**Roadmap:** Phase 4 · Issue #49
**Status:** ready for build approval
**Depends on:** `001-pack-mechanism`. Before building, re-read this spec against the code as built and report any mismatch instead of improvising.

## Summary

Rules in `AGENTS.md` and `CLAUDE.md` are suggestions to the agent. Hooks act immediately: after an edit, before a write, before a shell command, and around Git operations. Packs declare hooks once in a client-neutral form; Project Init renders them for each agent client that supports them and for Git, through a reviewed preview/apply flow. Every rule enforced by a hook also exists as a verify-time check, so the gate never depends on hook support.

## User stories

### US1 — Fast feedback after edits (P1)

After an agent edits a file, the pack's fast checks for that file run and their findings are returned to the agent.

### US2 — Blocked writes and commands (P1)

An agent's attempt to write a file containing a forbidden pattern (for example a secret), or to run a command a pack marks as production-affecting without the configured confirmation flag, is blocked with a clear reason.

### US3 — Git hooks for local-first checks and commit messages (P1)

Packs can declare `pre-commit`, `commit-msg` and `pre-push` hooks. Specs 007 and 008 use these.

### US4 — Safe installation (P1)

Hook configuration is previewed, applied only with `--apply`, preserves the user's existing hooks and settings, and is removed cleanly with the pack.

## Functional requirements

- **FR-001 Neutral hook declaration.** `pack.json` `provides.hooks` entries: `id`, `event` (`after-edit`, `before-write`, `before-command`, `pre-commit`, `commit-msg`, `pre-push`), `match` (file globs or command patterns), `run` (a script path inside the pack plus fixed arguments), `timeoutSeconds` (default 30, max 120), and `onFailure` (`block` or `report`).
- **FR-002 Client support registry.** Project Init keeps a small registry of how each supported client expresses each event, recorded from the client's current documentation with the client version and date (task T001). Events a client cannot express are listed as unsupported for that client.
- **FR-003 Claude Code rendering.** Agent events render into the project's `.claude/settings.json` `hooks` section using the documented event names and matchers recorded in T001. Only entries carrying a Project Init marker are managed; other settings and hooks are preserved byte-for-byte where the JSON structure allows, and never removed.
- **FR-004 Codex rendering.** Rendered only for events the installed Codex client supports per the registry; otherwise reported as unsupported in the plan and in `pack list`.
- **FR-005 Git hooks.** Git events render as small dispatcher scripts. If the repository already uses `core.hooksPath` or has existing hook files, Project Init does not replace them: it reports the conflict and prints the line to add to the existing hook. Otherwise it installs dispatchers in `.git/hooks/` with a managed marker.
- **FR-006 Hook runner.** A single Node entry point, `project-init hook run <pack>:<id>`, executes the declared script with a timeout, passes the event payload, and returns a client-appropriate result (block or report). Hook scripts never receive secrets or tokens through arguments.
- **FR-007 Verify-time parity.** Every hook with `onFailure: block` must name a corresponding check in the same pack; pack validation refuses a blocking hook without one.
- **FR-008 Commands.** `project-init hooks plan` and `project-init hooks apply` render all active packs' hooks (preview by default). `pack add --apply` and `pack remove --apply` call the same logic.
- **FR-009 Audit.** Applying, updating and removing hooks are audit events. Blocked events are logged locally with pack, hook id, event and reason, without file contents.
- **FR-010 Bypass is visible.** Git's `--no-verify` and client-side disabling cannot be prevented; documentation says so, and verify-time checks still apply.

## Out of scope

- Hooks for clients other than Claude Code, Codex and Git.
- Network calls from hooks.

## Success criteria

- **SC-001** Rendered configuration for each client and Git is covered by regression tests, including preservation of existing user hooks and settings.
- **SC-002** A blocked write and a blocked command are demonstrated in a disposable project for Claude Code; Codex behavior matches the registry.
- **SC-003** A blocking hook without a matching check is refused at pack validation.
- **SC-004** Removing the pack removes only its managed hook entries.
