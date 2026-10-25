# Project Init

**Spec-driven development orchestration for Claude Code and Codex.**

[![CI](https://github.com/Thugney/project-init/actions/workflows/ci.yml/badge.svg)](https://github.com/Thugney/project-init/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Node 20.19%2B](https://img.shields.io/badge/Node-%3E%3D20.19-339933)](package.json)

Project Init is a **local-first development orchestrator** that connects your specifications, coding agents and verification workflow. It prepares repositories, preserves existing feature context, coordinates Claude Code and Codex through the bundled Factory, and checks the evidence behind completed work.

Use it for **new projects, existing repositories and features already in progress**. Continue focused fixes through build and verify skills, or use Factory for coordinated tasks, isolated worktrees and integration review. The selected framework owns the requirements and tasks; Project Init carries that context through implementation and handoffs.

[Get started](docs/GETTING-STARTED.md) · [Command cheat sheet](docs/CHEAT-SHEET.md) · [Existing features](docs/FEATURE-PREPARATION.md) · [Architecture](docs/ARCHITECTURE.md)

## What Project Init does

| Work you need to do | How Project Init helps |
| --- | --- |
| Set up a project for Claude Code and Codex | Inspects the repository, checks prerequisites, installs the selected framework and ECC, and wires the agent skills and bundled Factory |
| Continue an existing feature | Reuses its native specifications, plan and task IDs; prepares checks, requirement mappings and the approval baseline |
| Hand work between agents or sessions | Carries the selected feature, remaining tasks, branch, worktree, configured checks and actual Factory job context |
| Coordinate implementation | Factory assigns tasks by dependency and file boundaries, runs workers in isolated worktrees, and integrates their changes |
| Follow progress | The local Factory dashboard displays registered jobs, stages, review rounds and findings |
| Verify completed changes | Runs configured checks and validates current execution, source review, requirement and applicable visual evidence |
| Review designs and reports | Renders local UI design reviews and bundles Lean Kit for reports, diagrams and boards |

The manual work it removes is repeated setup, reconstructing task context, copying handoffs between agents and collecting disconnected completion reports. Product decisions, scope approval and the final merge or release decision stay with the maintainer.

## Who owns what

![Project Init architecture and ownership](docs/architecture.svg)

| Component | Responsibility |
| --- | --- |
| **Project Init** | Setup, feature preparation, workflow handoffs, baseline tracking and verification gates |
| **Spec Kit, OpenSpec, BMAD or an explicitly selected existing specification** | The authoritative requirements, architecture decisions and native tasks; one source of truth per workflow |
| **ECC** | Engineering, security and review capabilities available to the coding agents |
| **Claude Code and Codex** | Implementation and review work, directly or through Factory |
| **Bundled Factory** | Task assignment, isolated worker and integration worktrees, review/fix rounds and job state |
| **Bundled Lean Kit** | Deterministic local HTML reports |
| **Human maintainer** | Product decisions, approval of the baseline and final merge/release authorization |

The guided setup uses **Spec Kit** for the normal Claude + Codex workflow. Existing framework ownership is preserved. Factory translates approved native work into an execution contract without creating a competing product specification. See the [ownership ADR](docs/adr/0001-single-source-of-truth.md) and [Factory stack](docs/FACTORY-STACK.md).

## Install and start

**Requirements:** Node.js **20.19+** and Git. Guided setup checks the actual Codex and Claude Code terminal clients, authentication and the prerequisites of the selected tools. Missing supported prerequisites can be installed after confirmation. Project Init has no runtime npm package dependencies.

Install from GitHub source:

```powershell
git clone https://github.com/Thugney/project-init.git
cd project-init
npm ci
npm install --global .
project-init version
```

Then open the repository or worktree where you want to work:

```powershell
Set-Location 'C:\Work\MyProject'

# Inspect the checkout and review the proposed setup.
project-init init --project .

# Apply the reviewed setup and resume completed steps.
project-init init --project . --apply
```

The first command is a read-only preview. Apply installs or resumes the tooling, refreshes project-local skills for both agents with reviewed backups when needed, prepares an unambiguous existing feature and initializes a missing Factory board. Existing source changes, native specifications and Factory history are preserved; conflicting managed files are reported for review.

**Tooling ready, feature prepared and implementation verified are separate states.** The agent resolves check and requirement-mapping gaps from the existing specification and tests. A missing or changed approval baseline still needs actual review and human acceptance.

Reload the agent's skills or restart its session in the same checkout after setup. For an upgrade from older personal skills, use the [migration guide](docs/MIGRATION.md). See [installation](docs/INSTALL.md) for platform details and optional personal skill installation.

### Update an existing installation

The global CLI updates independently of a development checkout:

```powershell
project-init update --check
project-init update
project-init version
```

The updater resolves `main` to an exact Git commit, installs that source with npm and verifies the resulting version. In each active project checkout, preview and apply `project-init init --project .` again to refresh its managed files. Keep the current feature and task context when reloading the agent.

Source installation and updates use GitHub. Package versions, tagged releases and promotion policy are documented in [Releases](docs/RELEASES.md).

## Choose the workflow for your task

Use these skills inside the coding agent, opened in the checkout that owns the work:

| Your task | Claude Code | Codex |
| --- | --- | --- |
| Start or resume existing work | `/project-init` | `$project-init` |
| Prepare or review a UI design | `/project-init-design` | `$project-init-design` |
| Plan new or changed scope | `/project-init-plan` | `$project-init-plan` |
| Implement an approved task or bounded bug fix | `/project-init-build` | `$project-init-build` |
| Verify an existing PR or implementation | `/project-init-verify` | `$project-init-verify` |
| Inspect progress and blockers | `/project-init-status` | `$project-init-status` |
| Render a project report | `/project-init-report` | `$project-init-report` |

Describe the actual task after the skill name. These entry points use the existing native feature and preparation lifecycle. Planning fills missing or changed scope; build and verify can continue work that already has a specification and PR.

For example, in Claude Code:

```text
/project-init-verify Verify the current PR against its existing requirements.
```

Or in Codex:

```text
$project-init-build Continue the remaining approved tasks in specs/001-example.
```

Replace the example feature path with the actual folder. The [cheat sheet](docs/CHEAT-SHEET.md) explains daily use; the [command reference](docs/COMMANDS.md) covers lower-level controls.

## Coordinate work with Factory

Choose Factory when the work benefits from multiple agents, isolated tasks or a coordinated integration and review cycle. Focused changes can stay in the normal build/verify workflow.

Before dispatch, include the required setup and approved native artifacts in the reviewed committed base, because worker worktrees start from that commit. Preserve unrelated local work. From Claude Code, start the execution workflow with the actual feature directory:

```text
/factory spec specs/001-example
```

This dispatches Factory work from the existing specification. The resulting job has its own slug, assignments and recorded history.

![Factory flow: parallel Codex and Claude in isolated worktrees](docs/factory-flow.svg)

1. **Assign.** Factory decomposes the approved work into tasks tagged `[CODEX]` or `[CLAUDE]`, grouped by dependency and file boundaries. Either agent can own frontend, backend, tests, documentation or migrations.
2. **Isolate.** Worker and integration Git worktrees start from the same committed base. Each worker has its own checkout.
3. **Implement.** Codex runs through the worker bridge; Claude runs through the Factory builder. Independent assignments can proceed in parallel.
4. **Integrate.** The worktree manager merges worker branches into the integration branch. Conflicts stop for resolution.
5. **Check and review.** Configured checks and code/security reviews assess the integrated result, with UX/UI reviews when applicable. Findings return to their owning worker for up to two fix rounds.
6. **Hand off.** Factory records its decision and produces a PR when its documented conditions allow it, or reports what needs human resolution. The maintainer controls final approval.

For an existing job, use its actual slug:

| Action | Claude Code command |
| --- | --- |
| Inspect jobs and the board location | `/factory status` |
| Review an existing job | `/factory review <actual-slug>` |
| Address feedback within its approved scope | `/factory rework <actual-slug> <feedback>` |

Codex's `$factory-audit` skill provides an additional read-only audit of the integration worktree. See [Factory evidence](docs/FACTORY-EVIDENCE.md) for how worker outcomes, Git integrations and current checks are connected to the approved scope.

### View the dashboard

Use `/factory status` to identify the orchestration checkout. From that checkout's root, open a terminal and run:

```powershell
Set-Location '.\factory'
python -m http.server 8765 --bind 127.0.0.1
```

Open [http://127.0.0.1:8765/dashboard.html](http://127.0.0.1:8765/dashboard.html). Use `python3` if that is your installed Python command.

The dashboard displays registered Factory jobs. An empty board means that checkout has no registered jobs; ordinary agent sessions, Spec Kit tasks and GitHub PRs are not imported automatically. Moving cards show recorded workflow progress. Completion is assessed through the associated code, checks and review evidence. See [dashboard states and recovery](docs/FACTORY-DASHBOARD.md).

## Verification and design review

Project Init connects the native specification to a concrete verification lifecycle:

1. Select the existing feature and prepare its actual check commands, requirement mappings and applicable design references.
2. Register the completed baseline and obtain the required review and human approval.
3. Implement the task or integrate its Factory workers, retaining the actual execution context.
4. Run checks on the current source and obtain independent source/requirement review and applicable screenshot evidence.
5. Run the guard and report the result for human review, including any unresolved blockers.

Already implemented code can use the reviewed existing-code evidence path. A current baseline and passing evidence remain required; no dummy implementation task is necessary. See [feature preparation](docs/FEATURE-PREPARATION.md) and the [verification contract](docs/VERIFICATION.md).

### Visual design example

These examples use demonstration data. Projects supply their own design content and approved reference screenshots.

| Light | Dark |
| --- | --- |
| ![Light theme visual-review example](docs/visual-light.png) | ![Dark theme visual-review example](docs/visual-dark.png) |

UI review supports navigation, typography, colors, component states and responsive variants. Screenshot checks compare actual images against approved references for the expected viewport, theme and state matrix. Browser interaction and accessibility tests remain separate checks.

### Evidence boundaries

- **Current evidence:** source, specification or relevant configuration changes can invalidate earlier results. Missing or stale evidence blocks acceptance.
- **Requirement review:** an independent reviewer supplies per-requirement findings. The guard checks their coverage and evidence freshness.
- **Execution:** `project-init run --execute` is a foreground Codex runner. Claude works through its interactive client and Factory agents. Work proceeds while an actual agent or runner is executing; the CLI is not a continuous background service.
- **CI:** this repository's CI tests Project Init. Application CI must be configured and verified in the application repository.
- **Approval:** local actor names and evidence records provide an audit trail, not authenticated identity signatures. A passing guard prepares work for human review; merge and release authorization remain separate.

Repository CI covers Windows, Linux and macOS with Node 22 and 24. Test coverage, maintainer-reported operational observations and remaining acceptance work are recorded in the [validation report](docs/ACCEPTANCE-REPORT.md). See the [security model](docs/SECURITY-MODEL.md) for guarantees and limits.

## Documentation

| For | Read |
| --- | --- |
| New vs existing project, step by step | [Getting started](docs/GETTING-STARTED.md) |
| Daily commands and responsibilities | [Cheat sheet](docs/CHEAT-SHEET.md) |
| Installation and platform details | [Install](docs/INSTALL.md) |
| All CLI operations | [Commands](docs/COMMANDS.md) |
| Adopt existing work and preserve task progress | [Feature preparation](docs/FEATURE-PREPARATION.md), [Check discovery](docs/CHECK-DISCOVERY.md) |
| Factory progress and execution evidence | [Dashboard](docs/FACTORY-DASHBOARD.md), [Evidence bridge](docs/FACTORY-EVIDENCE.md) |
| Architecture and ownership | [Architecture](docs/ARCHITECTURE.md), [Factory stack](docs/FACTORY-STACK.md) |
| Threats and verification boundaries | [Security model](docs/SECURITY-MODEL.md), [Verification](docs/VERIFICATION.md) |
| Validation and operational evidence | [Validation report](docs/ACCEPTANCE-REPORT.md) |
| Versioning and releases | [Releases](docs/RELEASES.md), [Changelog](CHANGELOG.md) |
| Migration from older installations | [Migration](docs/MIGRATION.md) |
| Helping out | [Contributing](CONTRIBUTING.md), [Security policy](SECURITY.md) |

## Community and license

Maintained by **[Thugney](https://github.com/Thugney)**. Practical Microsoft cloud/security writing: **[Eriteach blog](https://blog.eriteach.com/)**. Professional updates: **[LinkedIn](https://www.linkedin.com/in/eriteach/)**. Contributions, reproducible bug reports and technical reviews are welcome.

Project Init, bundled Lean Kit, bundled Factory templates and preserved v1 sources are licensed under [Apache-2.0](LICENSE). External tools such as Spec Kit, ECC, OpenSpec and BMAD retain their own licenses. See [NOTICE](NOTICE.md) for provenance and attribution.

Project Init is an independent community project with no affiliation to OpenAI, Anthropic, GitHub, ECC, OpenSpec or BMAD. Respective names belong to their owners.
