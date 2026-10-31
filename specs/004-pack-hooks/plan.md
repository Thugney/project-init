# Implementation plan: Pack-declared hooks

**Spec:** `specs/004-pack-hooks/spec.md`

## Technical context

- Claude Code hooks are configured in `.claude/settings.json` per its current documentation. Codex hook support must be checked against the installed client's documentation; do not assume parity.
- Node only; no new dependencies. Hook scripts are pack files (PowerShell or Node) invoked through the runner.

## Design

- `lib/hooks.mjs`: registry (FR-002), `hooksPlan(root)`, `applyHooks(root)`, `removeHooks(root, pack)`, renderers per target (`claude`, `codex`, `git`), and `runHook(root, ref, payload)`.
- Registry file `lib/hook-clients.json`: per client, version, date, event mapping, unsupported events, source URL. Updated deliberately, never at runtime.
- Managed marker: a `"projectInit": "<pack>:<id>"` property (or the closest documented equivalent) on each rendered Claude entry; a comment marker in Git dispatcher scripts.
- Settings JSON is read, merged and written atomically; if the file is not valid JSON, refuse and report.

## Changes

| File | Change |
| --- | --- |
| `lib/hooks.mjs`, `lib/hook-clients.json` | new |
| `lib/packs.mjs` | validate `provides.hooks` (FR-001, FR-007); call hooks apply/remove with pack add/remove |
| `bin/project-init.mjs` | `hooks plan`, `hooks apply`, `hook run` |
| `packs/example/` | one example hook with its matching check |
| `docs/HOOKS.md`, `docs/COMMANDS.md`, `docs/SECURITY-MODEL.md` | how hooks work, client support table, bypass limits |
| `package.json` | add `lib/hooks.mjs` to `check` |

## Risks

- **Client formats change.** Mitigation: registry with versions and dates; tests on rendered output; unsupported is reported, not guessed.
- **Damaging user settings.** Mitigation: refuse on invalid JSON, marker-scoped changes, byte tests.
- **Slow hooks hurting agent flow.** Mitigation: timeouts, `after-edit` restricted to the edited file.

## Rollback

`pack remove --apply` or `hooks apply` after removing the pack removes managed entries; reverting the pull request leaves rendered entries inert because `hook run` no longer exists, and `docs/HOOKS.md` explains manual cleanup.
