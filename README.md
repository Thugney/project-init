# Project Init

**The workflow harness around Claude Code and Codex: approved specs in, verified evidence out, the human decides.**

[![CI](https://github.com/Thugney/project-init/actions/workflows/ci.yml/badge.svg)](https://github.com/Thugney/project-init/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Node 20.19%2B](https://img.shields.io/badge/Node-%3E%3D20.19-339933)](package.json)
[![Channel: preview](https://img.shields.io/badge/channel-preview-9b59b6)](docs/RELEASES.md)

Project Init runs locally. It sets up a repository for Claude Code and Codex, carries the feature context between agents and sessions, and refuses to call work done until there is current evidence: checks that actually ran, an independent review, and screenshots where the work has a UI. It never commits, merges or deploys on its own.

Use it on new projects, existing repositories and features that are already in progress.

[Get started](docs/GETTING-STARTED.md) · [Cheat sheet](docs/CHEAT-SHEET.md) · [Existing features](docs/FEATURE-PREPARATION.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP-2.2.md)

## How it works

![Project Init architecture and ownership](docs/architecture.svg)

Every artifact has exactly one owner, so agents never produce competing plans:

| Component | Owns |
| --- | --- |
| **Spec Kit** (default), OpenSpec or BMAD | Requirements, architecture decisions and tasks. One methodology per project. |
| **Claude Code and Codex** | Writing and reviewing code, directly or through Factory |
| **Bundled Factory** | Splitting approved work into tasks, isolated worktrees, integration and review rounds |
| **ECC** | Shared engineering, security and testing capabilities for both agents |
| **Project Init** | Setup, handoffs, check configuration, evidence and the verification gate |
| **You** | Product decisions, baseline approval and the final merge or release |

Spec Kit stays the guided default. Choose BMAD for a project that needs its broader
product discovery and staged planning: run `project-init init --project . --framework bmad`
to preview, then add `--apply` to install. Project Init defaults to BMAD `6.12.0`
(or accepts another explicit v6 pin); BMAD v7 is not supported. Use one methodology
per project. See [Factory stack](docs/FACTORY-STACK.md) for the tradeoffs.

See the [ownership ADR](docs/adr/0001-single-source-of-truth.md) and [Factory stack](docs/FACTORY-STACK.md).

## Install

Requires Node.js 20.19+ and Git. Project Init has no runtime npm dependencies. Setup checks that the `claude` and `codex` terminal clients are installed and signed in.

```shell
git clone https://github.com/Thugney/project-init.git
cd project-init
npm ci
npm install --global .
project-init version
```

To update later: `project-init update --check`, then `project-init update`. See [Install](docs/INSTALL.md) for platform details and [Releases](docs/RELEASES.md) for versioning.

## Set up a project

Run this in the repository or worktree you want to work in:

```shell
project-init init --project .           # read-only preview of the setup plan
project-init init --project . --apply   # apply it; safe to re-run to resume
```

Apply installs or resumes the tooling, refreshes the agent skills (backing up anything it would overwrite), prepares an existing feature if there is exactly one candidate, and creates the Factory board. Your source, existing `AGENTS.md`/`CLAUDE.md`, native specs and uncommitted work are left alone.

Afterwards, reload the agent's skills or restart its session in the same checkout.

> **Three separate states.** *Tooling ready* means the tools installed. *Feature prepared* means checks, requirement mappings and the baseline are in place. *Verified* means the guard passed on current evidence. One does not imply the next.

## Daily use

Run these skills inside the coding agent, in the checkout that owns the work, followed by a description of the task:

| Task | Claude Code | Codex |
| --- | --- | --- |
| Start or resume | `/project-init` | `$project-init` |
| Design or review a UI | `/project-init-design` | `$project-init-design` |
| Plan new or changed scope | `/project-init-plan` | `$project-init-plan` |
| Build an approved task or bounded fix | `/project-init-build` | `$project-init-build` |
| Verify a PR or implementation | `/project-init-verify` | `$project-init-verify` |
| Status and blockers | `/project-init-status` | `$project-init-status` |
| Render a report | `/project-init-report` | `$project-init-report` |

```text
/project-init-verify Verify the current PR against its existing requirements.
$project-init-build Continue the remaining approved tasks in specs/001-example.
```

The [cheat sheet](docs/CHEAT-SHEET.md) covers daily use; the [command reference](docs/COMMANDS.md) covers the lower-level CLI.

## Larger work: Factory

Use Factory when work benefits from several agents working in parallel. Focused fixes can stay in the build and verify skills.

![Factory flow: parallel Codex and Claude in isolated worktrees](docs/factory-flow.svg)

1. **Assign:** approved tasks are split by dependency and file boundaries and tagged `[CODEX]` or `[CLAUDE]`. Either agent can take any kind of task.
2. **Isolate:** each worker gets its own Git worktree from the same committed base.
3. **Integrate:** worker branches merge into an integration worktree. Conflicts stop for resolution.
4. **Review:** checks plus code, security and (for UI) UX reviews run on the integrated result, with up to two fix rounds.
5. **Hand off:** Factory opens a PR when its conditions are met, or reports what needs you.

Commit the setup and approved specs first, since worker worktrees start from that commit. Then, from Claude Code:

| Action | Command |
| --- | --- |
| Start a job from a spec | `/factory spec specs/001-example` |
| List jobs and the board location | `/factory status` |
| Review a job | `/factory review <slug>` |
| Address feedback within scope | `/factory rework <slug> <feedback>` |

Codex can be the orchestrator instead (`init --orchestrator codex`). Its `$factory-audit` skill gives a read-only audit of the integration worktree. To watch progress, open the local board: see [Factory dashboard](docs/FACTORY-DASHBOARD.md). How worker runs and integrations become evidence is described in [Factory evidence](docs/FACTORY-EVIDENCE.md).

## Verification

1. Prepare the feature: its check commands, requirement mappings and, for UI work, approved reference screenshots.
2. Register the baseline and get a review and your approval.
3. Implement, directly or through Factory.
4. Run the checks on the current source, get an independent per-requirement review, and compare screenshots.
5. Run the guard. A pass means *ready for your review*, never *released*.

Code that already exists can go through the same gate without a fake implementation run. See [Feature preparation](docs/FEATURE-PREPARATION.md) and the [verification contract](docs/VERIFICATION.md).

| Light | Dark |
| --- | --- |
| ![Light theme visual-review example](docs/visual-light.png) | ![Dark theme visual-review example](docs/visual-dark.png) |

*The design review above uses demonstration data.*

### What the gate does and doesn't prove

- **Freshness:** any change to source, specs, configuration or reference screenshots invalidates earlier evidence. Missing or stale evidence blocks.
- **Review:** the guard checks that every requirement has a current finding. The judgment itself comes from the reviewer, not from Project Init.
- **Screenshots:** pixel comparison catches visual drift. Clicks, accessibility and behavior need separate browser tests.
- **Identity:** records are a local audit trail, not signatures. Use branch protection and CI for enforcement.
- **CI:** this repository's CI tests Project Init itself (Windows, Linux and macOS on Node 22 and 24). Your application's CI is its own.

Details: [Security model](docs/SECURITY-MODEL.md) and [validation report](docs/ACCEPTANCE-REPORT.md).

## Documentation

| For | Read |
| --- | --- |
| Step-by-step setup, new or existing project | [Getting started](docs/GETTING-STARTED.md) |
| Daily commands | [Cheat sheet](docs/CHEAT-SHEET.md), [Commands](docs/COMMANDS.md) |
| Installation and upgrades | [Install](docs/INSTALL.md), [Migration](docs/MIGRATION.md) |
| Existing work | [Feature preparation](docs/FEATURE-PREPARATION.md), [Check discovery](docs/CHECK-DISCOVERY.md) |
| Factory | [Stack](docs/FACTORY-STACK.md), [Dashboard](docs/FACTORY-DASHBOARD.md), [Evidence](docs/FACTORY-EVIDENCE.md) |
| Design and guarantees | [Architecture](docs/ARCHITECTURE.md), [Invariants](docs/INVARIANTS.md), [Security model](docs/SECURITY-MODEL.md), [Verification](docs/VERIFICATION.md) |
| Status and plans | [Validation report](docs/ACCEPTANCE-REPORT.md), [Changelog](CHANGELOG.md), [Releases](docs/RELEASES.md), [Roadmap](docs/ROADMAP-2.2.md) |
| Domain packs | [Pack format, commands, lock and safety limits](docs/PACKS.md) |
| Contributing | [Contributing](CONTRIBUTING.md), [Security policy](SECURITY.md) |

## Community and license

Maintained by **[Thugney](https://github.com/Thugney)**. Microsoft cloud and security writing on the **[Eriteach blog](https://blog.eriteach.com/)**; updates on **[LinkedIn](https://www.linkedin.com/in/eriteach/)**. Bug reports, reviews and contributions are welcome.

Project Init, the bundled Lean Kit and Factory, and the preserved v1 sources are licensed under [Apache-2.0](LICENSE). Spec Kit, ECC, OpenSpec and BMAD keep their own licenses. See [NOTICE](NOTICE.md).

Project Init is an independent project, not affiliated with OpenAI, Anthropic, GitHub, ECC, OpenSpec or BMAD.
