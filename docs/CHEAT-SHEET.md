# Project Init cheat sheet

Start with the task you have, in the checkout that owns it. Use the normal
Project Init skills to carry existing specification and task context through
preparation, implementation and verification.

## Which command do I use?

| Situation | Claude | Codex |
|---|---|---|
| Resume an existing project or feature | `/project-init` | `$project-init` |
| New feature or an approved scope change | `/project-init-plan` | `$project-init-plan` |
| Implement an approved task or bounded bug fix | `/project-init-build` | `$project-init-build` |
| Verify an existing PR or completed implementation | `/project-init-verify` | `$project-init-verify` |
| See current gates, evidence and worktree context | `/project-init-status` | `$project-init-status` |
| Coordinate an approved feature through Factory | `/factory spec <actual-native-feature-directory>` | Runs as a worker when dispatched by Factory |
| Inspect actual Factory jobs | `/factory status` | Read the reported orchestration state |
| Review or rework a Factory job | `/factory review <actual-slug>` / `/factory rework <actual-slug> <feedback>` | `$factory-audit` provides an additional read-only audit of the integrated result |

A PR does not automatically require Factory. A small repair can stay in the
normal build/verify workflow and retain its existing PR. An existing Factory
job must be resumed using its real slug; never invent one to satisfy a gate.

## Who owns what?

| Component | Responsibility |
|---|---|
| Project Init | Discover and prepare the feature, preserve its baseline/approval state, coordinate handoffs and validate evidence. |
| Spec Kit | Native feature requirements, plan and task progress. Reuse existing artifacts for work already underway. |
| Factory | Optional worker assignment, isolated worktrees, integration, review/fix loop and job state. |
| ECC | Reusable engineering, security and review capabilities selected when useful. Installation does not mean every capability ran. |
| Claude and Codex | Actual implementation and review work with real source changes and check results. |
| Human | Real scope/approval decisions and the separate merge/release decision. |

Factory's job contract translates approved native work into execution
assignments. It is not a second product specification. `[CODEX]` and
`[CLAUDE]` identify workers, not frontend/backend ownership.

## Setup, preparation and acceptance are different

| State | What it means |
|---|---|
| Tooling ready | Required tools and installed workflow files passed setup checks. |
| Feature preparation required | The selected native feature, checks, requirement mappings or applicable design references need work. |
| Review/approval required | The current baseline still needs actual review or human acceptance. |
| Prepared | The feature configuration, baseline, review and approval agree. Execution and verification are still separate. |
| Verification blocked | Current checks, source/semantic review, visual evidence or execution evidence is missing, stale or failing. |
| Ready for human release review | The guard passed for the current source. Release is still a separate human decision. |

The normal skills invoke preparation and ask the agent to resolve check and
mapping gaps from the existing specification and tests. They preserve valid
approval and do not invent review evidence. Direct inspection is available:

```powershell
project-init status --project .
project-init prepare --project .
```

Both are read-only. Authorized `prepare --apply` configures discovered checks,
records mappings and registers a complete baseline. It does not implement
application code or record approval on your behalf. If several native
features are plausible, select the actual one with `--feature`; use
`--spec` for an existing authoritative document outside the usual folder.

## First use or tool update

From the exact repository/worktree root:

```powershell
project-init init --project .
project-init init --project . --apply
```

Preview is read-only. Apply installs/resumes the guided Spec Kit/ECC/Factory
tooling, refreshes managed Project Init skills with reviewed backups, prepares
unambiguous existing work and creates a missing empty Factory board. An
existing board is preserved. Existing BMAD/OpenSpec ownership is not silently
replaced.

The CLI itself is checked/updated separately:

```powershell
project-init update --check
project-init update
```

Keep other clones, worktrees and their state. Identify the correct checkout
instead of deleting copies. For Factory dispatch, the necessary setup and
approved native artifacts must be committed so worker worktrees receive them;
unrelated local changes remain yours to preserve. Setup does not require a
blanket stash, commit, push or checkout of `main`.

Factory execution requires the terminal Codex and Claude Code clients.
Desktop-app presence alone does not establish CLI readiness. Guided bootstrap
checks the required clients, authentication and platform runtime.

## Recognize these files

| Path | Meaning |
|---|---|
| `.specify/` | Spec Kit configuration/templates. |
| `specs/<feature>/` | Native specification, plan and task progress. |
| `.claude/skills/factory/` | Installed Claude Factory instructions/helpers. |
| `.agents/skills/factory-worker/` and `factory-audit/` | Codex worker/audit instructions. |
| `.project-init/config.json` | Actual check commands; an empty checks array means none are configured. |
| `.project-init/requirements.json` | Requirement-to-evidence mappings; file existence does not prove coverage. |
| `.project-init/preparation.json` | Recorded native feature/task handoff context. |
| `.project-init/evidence/` | Actual receipts; inspect their results and currentness. |
| `factory/board.json` and `factory/jobs/` | Registered Factory jobs and runtime evidence in the orchestration checkout. |
| `.project-init/worktrees/` | Factory's isolated worker and integration checkouts. |

A linked worktree has its own source and verification state. A new session
must carry the feature path, task IDs, branch/worktree, checks and actual
Factory slug when one exists.

## Dashboard and CI

Confirm the board location with `/factory status`, then serve the exact
orchestration checkout's `factory` folder:

```powershell
Set-Location 'J:\Projects\MyApp\factory'
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/dashboard.html`. Use `python3` if appropriate.
A missing board/404 means the server responded but that file is absent in
the served checkout. Confirm the worktree, then preview
`project-init init --project .` and run
`project-init init --project . --apply` at its repository root to initialize
missing state. Do not replace an existing or malformed board with a
placeholder. Ctrl+C stops only the viewing server.

The board tracks registered Factory work, not all PRs or coding sessions.
Application CI configuration, actual CI runs and required-check enforcement
are separate facts. Neither a workflow file nor an empty PR checks list is
proof of a passing build. Project Init's own CI validates this tool.

Preserve runtime evidence during upgrades and rollback. Review managed-file
backups/diffs; no setup command automatically pushes, merges or deploys.

Details: [Getting started](GETTING-STARTED.md) ·
[Preparation](FEATURE-PREPARATION.md) · [Evidence](FACTORY-EVIDENCE.md) ·
[Dashboard](FACTORY-DASHBOARD.md) · [Check discovery](CHECK-DISCOVERY.md)
