# Project Init Factory Stack — Cheat Sheet

Use this page when you forget which tool owns what.

## The rule

**Project Init sets the project up. Spec Kit defines the work. Factory executes the work. ECC improves how the agents work. Claude and Codex write/review code.**

```text
Project Init
  |
  +-- Spec Kit  -> requirements / plan / tasks (single source of truth)
  +-- ECC       -> reusable engineering, security and review skills
  +-- Factory   -> splits independent work, isolated worktrees, integration/review
                    |
                    +-- [CODEX]  -> Codex worktree (any assigned stack)
                    +-- [CLAUDE] -> Claude worktree (any assigned stack)
```

## What each component owns

| Component | Owns | Does not own |
| --- | --- | --- |
| **Project Init** | Inspect, select, install, wire, verify | Feature implementation |
| **Spec Kit** | Requirements, spec, plan, implementation tasks | Coding-agent routing |
| **Factory** | Task routing, build/review/fix loop, job state | Product/spec authority |
| **ECC** | Reusable coding/security/testing capabilities | Specs or Factory state |
| **Codex** | General implementation worker + integrated audit skill | Factory orchestration |
| **Claude Code** | General implementation worker + Factory orchestration/review agents | Project Init state |

## Start a new or existing repository

```powershell
cd C:\Work\MyProject

# Preview the complete bootstrap.
project-init init --project .

# Apply the same bootstrap.
project-init init --project . --apply
```

That is the normal workflow. Project Init automatically detects **New vs Existing**, resumes prior Project Init state when present, uses **Spec Kit** as the Factory profile's single spec owner, prepares **ECC** for both coding agents, and installs the bundled **Factory**.

For an **existing** repo, you do not need to stash or commit unrelated work first. Project Init records the dirty state and preserves unrelated files. Spec Kit uses preserve-merge (no `--force`), ECC performs its own collision preflight, and Factory writes only its managed paths.

For a new path, Project Init creates the project directory and initializes Git during `--apply`.

## Update Project Init itself

This updates the CLI, not the current application project:

```powershell
project-init update --check
project-init update
```

No `cd C:\Tools\project-init`, `git pull`, or clean source checkout is required.

## ECC channel selection

Project Init chooses one ECC install channel per harness:

```text
Claude: native-plugin | managed-project
Codex:  native-plugin | managed-home | legacy-sync (custom CODEX_HOME)
```

Missing Codex plugin commands are a compatibility signal, not a reason to reinstall the same CLI.

## Desktop app vs CLI
On Windows, **PowerShell success does not by itself prove ECC can launch the CLI**: Project Init also verifies a native `codex.exe` runtime for shell-less vendor execution.


Factory workers require terminal executables:

```text
Codex desktop/app   ≠ codex CLI readiness
Claude desktop/app  ≠ Claude Code CLI readiness
```

Project Init checks/installs/authenticates both CLIs during guided bootstrap.

## What `init --apply` does

```text
check prerequisite
    |
missing? -> ask Y/n
              |
        +-----+-----+
        |           |
       Yes          No
        |           |
 install+verify    STOPPED
        |
 next prerequisite/component
        |
 Spec Kit -> ECC -> Factory
        |
 ✓ PROJECT READY
```

Do not manually install `uv` first during the normal workflow. Project Init should ask for permission and handle it.

## Day-to-day feature flow

```text
1. Describe the feature
2. Spec Kit creates/updates the spec and tasks
3. Approve the spec
4. Factory creates the job
5. Factory creates isolated Codex + Claude worktrees
6. Independent work units run in parallel
7. Worker branches merge into the integration worktree
8. Reviewers/tests inspect the integrated result
9. Findings go back to the worker that owns the affected task/file
10. Human approves merge/release
```

### Factory job contract

The Factory job is authoritative during execution:

```text
factory/jobs/<slug>/spec.md
```

- `[CODEX]` = task assigned to the Codex worker (any layer).
- `[CLAUDE]` = task assigned to the Claude worker (any layer).
- `API Contract` = binding. Workers do not rewrite it.
- Review findings tagged `[CODEX]` / `[CLAUDE]` go back to that worker; `[INTEGRATION]` findings stop for a resolution plan.
- Job/report files are execution evidence, not a second product spec.

## Which command do I use?

| I want to... | Use |
| --- | --- |
| Bootstrap/resume a repository | `project-init init --project .` then the same command with `--apply` |
| Inspect only | `project-init inspect --project .` |
| Advanced: manage Spec Kit directly | `project-init select` / `project-init install` |
| Advanced: manage ECC directly | `project-init ecc ...` |
| Advanced: manage Factory directly | `project-init factory ...` |
| See Project Init skills | `project-init wire ...` |
| Check evidence/status | `project-init status` / `project-init verify` workflow |
| Build a `[CODEX]` Factory task | Codex `factory-worker` skill (run by `/factory` via `codex_worker.py`) |
| Build a `[CLAUDE]` Factory task | Claude `factory-builder` agent (run by `/factory`) |
| Audit the integrated result | Codex `factory-audit` skill (manual, read-only) |

## Spec Kit vs BMAD

**Default: Spec Kit.** It is the single spec owner for this Factory profile and supports both Claude Code and Codex.

Use **BMAD instead** only when a project intentionally needs BMAD's deeper product/UX methodology. Do not run Spec Kit and BMAD as competing sources of truth for the same change.

## Worker assignment

Codex and Claude are peers for implementation. Factory assigns work from **parallelism, dependency and file boundaries**, not frontend/backend ownership.

```text
Codex  -> isolated worktree -> assigned work unit
Claude -> isolated worktree -> assigned work unit
                     \\       /
                  integration
```

If the feature cannot be split safely, Factory may assign one indivisible unit to one worker rather than fabricating parallelism.

## Files you should recognize

```text
.specify/                        Spec Kit runtime/config
specs/NNN-feature/               Spec Kit feature artifacts
.claude/skills/factory/          Claude Factory orchestrator
.claude/agents/                  Claude Factory workers/reviewers
.agents/skills/factory-worker/   Codex generic Factory worker skill
.agents/skills/factory-audit/    Codex integrated-result audit skill
.project-init/worktrees/          Isolated Codex/Claude/integration worktrees
factory/jobs/                    Factory runtime jobs/evidence
.project-init/                   Project Init local state/evidence
```

## One sentence to remember

> **Project Init bootstraps it; Spec Kit specifies it; Factory isolates and coordinates it; ECC strengthens it; Claude and Codex build it in parallel.**

Factory itself ships with Project Init. `--kit PATH` is only an advanced developer override for testing a different Factory source.
