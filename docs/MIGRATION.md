# Controlled migration from Project Init v1 / v2.0 to v2.1

**Do not replace the current installed skill directory in place.** The original user's `project-init.rar` is the rollback baseline. The preview package is independently installed/tested first.

## Preserved v1 source

Original architecture-first `SKILL.md`, `architecture-first.md`, `scripts/architecture.ps1`, `scripts/render-architecture.ps1`, `scripts/source-drift.ps1` and relevant PowerShell tests are copied to `legacy/v1/` unchanged. They are retained as **read-only compatibility reference**; new Project Init does not automatically upgrade their trust records. Old global `setup.ps1` and `scripts/scaffold.ps1` have been retired from the active package for safe migration.

Existing repositories' `planning/architecture/` review workspaces remain untouched. Version 1 approval files may only be used as historical evidence, **not** as v2.1 approvals. No native framework document or source code is overwritten by `init`.

## Changes in 2.1

- Built-in Lean Kit source, audited local renderer and `$project-init-report` / `/project-init-report` skills. No standalone Lean Kit installation needed.
- Two-agent skill discovery: project-local or user-scoped Codex and Claude skills; namespaced Claude plugin opt-in.
- Versioned high-fidelity mockup review with desktop/mobile, light/dark and critical states.
- Real screenshot case comparison and diff-report output; approved PNG references participate in design approval hash.
- Per-requirement semantic review evidence attached to current native framework spec, source hashes and actual configured tests.
- Fail-closed `guard` for approved design, source reconciliation, implementation run, deterministic tests, semantic evidence and visual review.
- Still preview: no automated semantic reasoning engine, unattended dispatcher, native Claude executor, auto release approval or production deployments.

## Correcting personal skill discovery from v2.1.0-preview.1

The previous user-scope installer mistakenly targeted `$HOME/.codex/skills`; Codex currently documents `$HOME/.agents/skills` for **personal** skills. Preview.2 fixes this and adds explicit migration backups. No old skill is overwritten automatically.

For a preview installed locally (PowerShell):

```powershell
$project = 'J:\workspace-full\projects\TenantScope'
project-init wire --project $project --scope user --agent both
project-init wire --project $project --scope user --agent both --backup-conflicts
# Only after reading the preview output:
project-init wire --project $project --scope user --agent both --backup-conflicts --apply
```

The optional backup operation moves only matching skill directories that conflict with the generated names, preserves their contents, and writes current skills in `$HOME/.agents/skills` and `$HOME/.claude/skills`. The generated backup paths are returned for rollback. It also reports older `$HOME/.codex/skills/project-init*` entries without touching them. Restart Codex and Claude Code, or reload skills where the client supports it. Check **skill origin** if an older personal or cloud skill still appears; local setup does not automatically update cloud-hosted skills.

For rollback, stop both agent sessions, move the newly installed skill folder out of the discovery directory, then move its saved backup folder into the original path shown by the migration receipt. Do not indiscriminately remove other skills or reset the repository.

## Suggested acceptance sequence

1. Backup/retain original skill and projects. Install v2.1 into a new folder and check `project-init help` and `npm run check`.
2. Test a disposable repository with `init`, `recommend`, `select`, `wire` preview and `--apply`. Verify `$project-init` in Codex and `/project-init` in Claude after reload.
3. Inspect high-fidelity `review.html`. Approve genuine design, create reference PNGs before coding, capture real app screenshots in required cases, verify the diff report.
4. Run a small real feature through one selected and verified native framework. Confirm Codex Git diff, normal tests and independent semantic review. `guard` should fail on deliberate screenshot/source changes.
5. Only after that, review an existing project migration on a separate branch; do not import v1 approvals silently.
6. For rollback, uninstall only the preview global CLI, restore previous skill path from backup, and review any new `.project-init/`, `.agents/skills` and `.claude/skills` files before removing them. Never reset unrelated local changes.
