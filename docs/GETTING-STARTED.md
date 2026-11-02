# Getting started

Use Project Init to resume the work in the checkout you have open. Spec Kit
owns the native feature specification and tasks; Claude or Codex implements
them. Factory is available when the work benefits from coordinated workers
and integration review.

## 1. Set up or update the project

Open the exact project or orchestration worktree you intend to use. Multiple
clones and worktrees are supported; each has its own local state and evidence.
Keep existing work and state.

PowerShell examples:

```powershell
Set-Location 'J:\Projects\MyApp'
project-init init --project .
project-init init --project . --apply
```

The first command is a read-only preview. The second installs or resumes the
tooling, asks before missing prerequisite installations, updates managed
Project Init skills with reviewed backups where needed, and prepares an
unambiguous existing native feature. For a new directory, pass its path to
`--project`; preview does not create it.

Guided bootstrap uses Spec Kit by default. To choose BMAD for this project,
preview `project-init init --project . --framework bmad` and apply the reviewed
plan with `--apply`. It installs BMAD `6.12.0` unless you explicitly select
another v6 release. BMAD's interactive installer runs in the foreground. v7
is unsupported, and Project Init will refuse to mix BMAD with Spec Kit or
OpenSpec in one project. See [Factory stack](FACTORY-STACK.md) for guidance.

Pack commands require that setup was **applied**. After `init --apply`,
`project-init pack list --project .` returns `packs: []` until one is installed.
Preview the bundled example with `project-init pack add example --project .`,
then add `--apply` only when you want to install the displayed files. Running
plain `init` is preview-only and does not create `.project-init/project.json`.

**TOOLING READY** means the installed tools passed their setup checks. The
separate feature status tells you whether the actual work still needs
requirements, check mappings, a baseline, review or human approval. It does
not mean a feature was implemented or verified.

## 2. Choose the normal entry point

Use these skills inside the coding agent, opened in the intended checkout:

| Your goal | Claude | Codex |
|---|---|---|
| Start or resume existing work | `/project-init` | `$project-init` |
| Plan new or changed scope | `/project-init-plan` | `$project-init-plan` |
| Implement the next approved task | `/project-init-build` | `$project-init-build` |
| Verify an implementation or existing PR | `/project-init-verify` | `$project-init-verify` |
| Read current status and blockers | `/project-init-status` | `$project-init-status` |

Describe the actual task with the chosen skill. For work already in progress,
the agent reuses the existing specification, task IDs, branch and worktree.
Planning fills missing or changed scope; it does not restart a completed
feature plan.

The agent performs built-in preparation: discovers real checks, inspects
requirement coverage, resolves agent-owned mapping gaps, and registers the
completed baseline. You should not need to author configuration JSON by hand.
An unchanged approved baseline is preserved. A missing or changed baseline
still needs an actual independent review and the human's real acceptance.

A small bug or a repair to an existing PR can use the build and verify skills
directly. It does not require a Factory job or a replacement PR. Already
implemented code can use the explicit existing-code evidence path after real
checks and independent review; no dummy edit is needed.

## 3. Use Factory when coordination helps

Choose Factory for approved work with independent tasks, isolated workers or
a coordinated integration/review loop. Both agents can own any application
layer. One indivisible task may remain with a single worker.

Before dispatch, the applicable setup and native feature artifacts must be in
the committed base: worker worktrees start from committed `HEAD`. Review
and commit only the intended changes. Preserve unrelated local work; do not
delete another checkout, reset it, or stash everything merely to bootstrap.
If tracked local changes prevent dispatch, use an appropriate isolated
orchestration checkout or resolve those changes intentionally.

In Claude, use the actual existing feature path:

```text
/factory spec specs/001-example
```

Replace `specs/001-example` with your feature folder. This starts the Factory
execution workflow; it is not a command that only writes a specification.
The actual job slug identifies its worktrees, review rounds and evidence.

| Existing Factory work | Claude command |
|---|---|
| Inspect registered jobs and the board location | `/factory status` |
| Review an actual job | `/factory review <actual-slug>` |
| Address feedback within its approved scope | `/factory rework <actual-slug> <feedback>` |

Follow the installed job workflow for failures or integration conflicts.
Changed scope needs a reviewed execution context; changing a job contract
does not make old receipts valid. Verification uses the integrated worktree
and its actual process/Git receipts, checks and independent reviews.

## 4. View the Factory dashboard

First confirm the board path with `/factory status`. In another terminal,
serve that orchestration checkout's exact `factory` directory:

```powershell
Set-Location 'J:\Projects\MyApp\factory'
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/dashboard.html`. Use `python3` instead if that
is your Python command. Ctrl+C stops the viewing server, not Factory workers.

An empty board means zero registered jobs in that checkout. A missing
`board.json` is distinct from a connection failure; another worktree may own
the job. After confirming the intended checkout, preview
`project-init init --project .` from its repository root, then use
`project-init init --project . --apply` to initialize a missing board.
Existing board data is preserved; malformed state is reported instead of
replaced.

The dashboard does not discover ordinary agent sessions, Spec Kit tasks or
GitHub PRs automatically.

## 5. Verify the result and maintain the installation

Use the verify skill on the current source. Passing configured checks,
independent requirement review and applicable visual evidence are separate
gates. A passing guard prepares a candidate for human review; it does not
authorize merging or deployment.

Application CI is also separate. A workflow file proves configuration
presence, not that the current PR triggered it, passed it or requires it.
Zero reported PR checks is no successful CI result. Project Init's own CI
tests the tool; it does not install application CI automatically.

To check for a CLI update and then preview the project changes:

```powershell
project-init update --check
project-init update
project-init init --project .
project-init init --project . --apply
```

Review the selected CLI version and managed-file changes before applying.
Reload skills or restart the coding-agent session after an update, carrying
the same native feature and task context. No automatic push, merge or
deployment is performed by these setup commands.

For rollback, restore the previously reviewed tooling version and managed
files from their reviewed backup or version-control diff. Preserve native
specifications, local evidence and Factory job history.

Related: [Cheat sheet](CHEAT-SHEET.md) ·
[Feature preparation](FEATURE-PREPARATION.md) ·
[Factory evidence](FACTORY-EVIDENCE.md) ·
[Dashboard states](FACTORY-DASHBOARD.md)
