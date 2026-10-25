# Install and native framework runbook — Project Init 2.1 preview

## One local installation; no separate Lean Kit or Drift Guard

Extract into a **new** local directory, run Node >=20.19 and `npm install -g .`, then `project-init help`. Git is required for automated Codex execution. `vendor/lean-kit/`, `vendor/factory/` and `lib/guard.mjs`/`lib/visual-gate.mjs` ship within the package; there is no extra Factory or Lean Kit download. Native OpenSpec, Spec Kit and BMAD are separate *optional* dependencies installed only when selected and explicitly authorized.

## Updating the CLI

Once preview.7 or newer is installed, Project Init no longer depends on the source checkout used for development.

```powershell
project-init update --check
project-init update
```

`update --check` compares the installed version with GitHub `main` without changing anything. `update` installs a pinned GitHub commit globally and verifies the replacement CLI. A dirty `C:\Tools\project-init` checkout cannot block this path.

The source clone is optional for normal use after the CLI is installed; keep it only when developing Project Init itself.

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

## Advanced methodology controls

The normal Factory workflow does **not** require a manual `inspect → recommend → select → install` sequence. `project-init init --project .` owns that bootstrap. The commands below remain available when intentionally using a non-Factory methodology or debugging one component.

| Framework | Intended pinned tool installation | Limitation |
|---|---|---|
| OpenSpec | `npm install -g @fission-ai/openspec@<published-version>` followed by `openspec init --tools codex,claude` for both agents | Not live-validated; inspect upstream changes and generated files |
| Spec Kit | pinned GitHub release via `uv tool install ... --from git+https://github.com/github/spec-kit.git@v<version>` and native `specify init ...` | Guided Factory bootstrap uses preserve-merge for existing repos and non-interactive initialization for recorded New projects |
| BMAD | `npx bmad-method@<published-version> install` | Interactive installer must be supervised; structural detection not runtime proof |

Never use a version placeholder with `--apply`. Native install runs third-party code; inspect command and repository state first. Existing project instruction files, Git changes, and framework-owned artifacts are preserved.

## Coding-agent runtime prerequisites

The Factory runs terminal workers in isolated Git worktrees, so desktop apps alone are not sufficient. Project Init owns these runtime checks:

```text
Codex CLI:       codex --version
Codex auth:      codex login status
Claude Code CLI: claude --version
Claude auth:     claude auth status
```

When approved, Project Init installs missing clients using the vendors' official npm packages:

```text
@openai/codex
@anthropic-ai/claude-code
```

If authentication is missing, Project Init offers to launch the official interactive sign-in flow and verifies the resulting status before moving on. Spec Kit is initialized with `--ignore-agent-tools` because Project Init, not Spec Kit, owns these readiness checks.

## Guided prerequisite bootstrap

Normal users do not separately prepare Spec Kit/ECC/Factory prerequisites. During:

```powershell
project-init init --project . --apply
```

Project Init checks the bootstrap chain and asks before each missing prerequisite or external component install. Accepted steps are installed and verified immediately, then the installer advances automatically.

Typical Windows flow:

```text
Spec Kit requires uv 0.13.5. Install a Project Init-managed user copy now? [Y/n]
Install Spec Kit 1.2.3 for Codex + Claude now? [Y/n]
Install ECC 2.2.3 for Codex + Claude now? [Y/n]
Install/update the bundled Factory for parallel Codex + Claude isolated worktrees now? [Y/n]
✓ PROJECT READY for Codex + Claude
```

A `No` answer stops cleanly without rolling back already verified prerequisites. Re-running the same command resumes from current state. `--yes` bypasses prompts only for intentionally reviewed automation.

Project Init currently manages the pinned `uv` dependency itself. On Windows it can also install missing Git/Python with user-scoped `winget` after confirmation and can repair a missing `npx` from the installed npm version.

## Recommended dual-agent factory profile

For the Claude + Codex software factory, **Project Init is the only normal bootstrap entry point**. Spec Kit is the single spec owner, ECC is the shared engineering toolbox, and Factory is the execution/review loop.

From the target repository:

```powershell
project-init init --project .
```

This inspects or resumes the repository and returns one combined plan covering prerequisites, Git (when needed), Spec Kit, ECC and the bundled Factory. It does not require a clean worktree for unrelated existing changes.

After reviewing that plan:

```powershell
project-init init --project . --apply
```

The apply order is managed by Project Init:

1. ensure Git exists for the project;
2. install/initialize Spec Kit for Codex + Claude using the safe new/existing-repo path;
3. install ECC for both agents;
4. install/update the bundled Factory (orchestrator/reviewers + generic Codex/Claude workers + isolated worktree/integration tooling).

Current reviewed pins are Spec Kit `1.2.3` and ECC `2.2.3`. Existing Project Init state is resumed rather than overwritten. Existing repos use Spec Kit preserve-merge without `--force`; ECC retains its own collision/ownership checks; Factory preserves the backlog, migrates legacy Factory config while retaining user settings, removes unchanged legacy backend-only managed skills, and refuses conflicting current Codex skill content.

The lower-level `select`, `install`, `ecc`, `factory`, and `wire` commands remain available for debugging, custom/non-Factory methodologies, or component-level maintenance. They are not the normal setup sequence.

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
