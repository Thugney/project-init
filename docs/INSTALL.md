# Install and native framework runbook — Project Init 2.1 preview

## One local installation; no separate Lean Kit or Drift Guard

Extract into a **new** local directory, run Node >=20.19 and `npm install -g .`, then `project-init help`. Git is required for automated Codex execution. `vendor/lean-kit/` and `lib/guard.mjs`/`lib/visual-gate.mjs` ship within the package; there is no extra installer or API-key requirement for them. Native OpenSpec, Spec Kit and BMAD are separate *optional* dependencies installed only when selected and explicitly authorized.

## Discoverable commands

After installing the CLI, choose **one** scope. For a machine-wide personal experience in Codex and Claude, use `--scope user` (recommended for solo use); for team-specific project instructions, use the default `--scope project` after `init`. Do not install both scopes under the same name unless you deliberately want duplicate skills.

```powershell
project-init wire --project $project --agent both --scope user
project-init wire --project $project --agent both --scope user --backup-conflicts
# After checking the plan, authorize the migration:
project-init wire --project $project --agent both --scope user --backup-conflicts --apply
```

For a **single per-user installation**, use `--scope user` instead of installing into every project. This writes Codex skills to `$HOME/.agents/skills` and Claude skills to `$HOME/.claude/skills`, the documented personal discovery locations. Preview before applying; existing skill conflicts fail by default. To migrate an older `project-init` skill, preview `--backup-conflicts` first, then explicitly authorize with `--backup-conflicts --apply`. Previous skill folders move into `$HOME/.project-init/backups/skills/<timestamp>/` before replacement. Unrelated skills are not modified. Restart/reload both clients and verify command discovery. Local skills may not synchronize to Codex Cloud/web. Restart Codex/Claude or reload their skills.

- Codex: `$project-init`, `$project-init-design`, `$project-init-plan`, `$project-init-build`, `$project-init-verify`, `$project-init-status`, `$project-init-report`. Available in `/skills` search where the local client supports it.
- Claude: `/project-init`, `/project-init-design`, `/project-init-plan`, `/project-init-build`, `/project-init-verify`, `/project-init-status`, `/project-init-report`.
- Optional Claude namespaced commands `/project-init:design` etc.: `project-init wire --agent claude --plugin --apply` creates a **local plugin** that must be actively loaded using the returned `claude --plugin-dir "..."` launch command. Plain local skill folders do **not** automatically expose that namespace.
- Claude automatic execution parity is not provided: only Codex has a programmatic `project-init run --execute` path today. Claude skills can perform work in their interactive client and retain actual evidence.

## Vendor methodology selection

Run `inspect`, `recommend`, `init`, `select`, `install` in that order. `install` previews by default; its `--apply` executes native third-party installers or project initialization only where the repository is safe for unattended setup.

| Framework | Intended pinned tool installation | Limitation |
|---|---|---|
| OpenSpec | `npm install -g @fission-ai/openspec@<published-version>` followed by `openspec init --tools codex,claude` for both agents | Not live-validated; inspect upstream changes and generated files |
| Spec Kit | `uv tool install specify-cli==<published-version>` and native `specify init ...` | Multiple agent integration may need interactive/supervised steps; a nonempty existing repo blocks unattended scaffolding |
| BMAD | `npx bmad-method@<published-version> install` | Interactive installer must be supervised; structural detection not runtime proof |

Never use a version placeholder with `--apply`. Native install runs third-party code; inspect command and repository state first. Existing project instruction files, Git changes, and framework-owned artifacts are preserved.

## First verification loop

- Use `project-init handoff --phase ...` to find the next native step, then approved mockup via `render`.
- Register *real* specs in `baseline`; record actual design review and human approval.
- Generate `visual-cases.json` for all required desktop/mobile × light/dark × critical states. Approve original reference PNGs *before* implementation.
- Configure `.project-init/config.json` check argv (unit, build, Playwright browser behavior, security) and `.project-init/requirements.json` mapping IDs to specs/checks/visual cases.
- Actual bounded run with Codex: `project-init run --phase implementation --task '...' --allow src --allow tests --execute`, only after user authorization and a clean rooted Git worktree.
- Execute checks with `verify --execute`, produce actual screenshots, `visual compare`, independent per-ID `semantic import`, `guard`, then inspect `status`.

## Visual capture requirements

`project-init visual capture --id ... --side actual --url http://localhost:3000 --execute` invokes locally installed Chrome/Edge headlessly (not yet Windows-accepted). Screenshots must match configured **pixel dimensions**. If Chrome/Edge's headless viewport differs, use the app's Playwright/Puppeteer browser tests to write PNG images at exact viewport and device-scale values. Compare those through `project-init visual compare`. Never auto-update reference PNGs to eliminate diffs; changed baseline requires approval.

## Rollback

- Keep old Project Init installed until v2.1 passes Windows acceptance on a disposable repository. Do not simply overwrite its directory.
- To uninstall preview CLI, run `npm uninstall -g @thugney/project-init`; check that no other custom skill maps to this name.
- Versioned original v1 PowerShell scripts and tests live under `legacy/v1/`. Existing `planning/architecture/` data is left untouched.
- Repository skill files from `wire` are intentional; preserve backups and remove only files you can verify were created by this run. `wire` never overwrites pre-existing content.
- Native framework installers are external to the CLI transaction; if partially installed, inspect `git diff` and revert manually from the reviewed checkpoint, never reset uncommitted user work automatically.
