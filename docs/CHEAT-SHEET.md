# Project Init Factory Stack — Cheat Sheet

Use this page when you forget which tool owns what.

## The rule

**Project Init sets the project up. Spec Kit defines the work. Factory executes the work. ECC improves how the agents work. Claude and Codex write/review code.**

```text
Project Init
  |
  +-- Spec Kit  -> requirements / plan / tasks (single source of truth)
  +-- ECC       -> reusable engineering, security and review skills
  +-- Factory   -> routes tasks, runs review/fix loops
                    |
                    +-- [BACKEND]  -> Codex by default
                    +-- [FRONTEND] -> Claude by default
```

## What each component owns

| Component | Owns | Does not own |
| --- | --- | --- |
| **Project Init** | Inspect, select, install, wire, verify | Feature implementation |
| **Spec Kit** | Requirements, spec, plan, implementation tasks | Coding-agent routing |
| **Factory** | Task routing, build/review/fix loop, job state | Product/spec authority |
| **ECC** | Reusable coding/security/testing capabilities | Specs or Factory state |
| **Codex** | Backend implementation + backend audit by default | Factory orchestration |
| **Claude Code** | Frontend implementation + UX/UI review by default | Project Init state |

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

## Day-to-day feature flow

```text
1. Describe the feature
2. Spec Kit creates/updates the spec and tasks
3. Approve the spec
4. Factory creates the job
5. [BACKEND] tasks -> Codex
6. [FRONTEND] tasks -> Claude
7. Reviewers run
8. Findings go back to the responsible worker
9. Tests + Project Init verification
10. Human approves merge/release
```

### Factory job contract

The Factory job is authoritative during execution:

```text
factory/jobs/<slug>/spec.md
```

- `[BACKEND]` = Codex backend worker.
- `[FRONTEND]` = Claude frontend worker.
- `API Contract` = binding. Workers do not rewrite it.
- Review findings tagged `[BACKEND]` go back to Codex.
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
| Build a backend Factory task | Codex `backend-factory` skill |
| Audit backend changes | Codex `backend-audit` skill |
| Build frontend Factory task | Claude Factory frontend worker |

## Spec Kit vs BMAD

**Default: Spec Kit.** It is the single spec owner for this Factory profile and supports both Claude Code and Codex.

Use **BMAD instead** only when a project intentionally needs BMAD's deeper product/UX methodology. Do not run Spec Kit and BMAD as competing sources of truth for the same change.

## Interchangeability

The architecture allows either coding agent to implement code, but the current Factory routing is intentionally opinionated:

```text
Backend:  Codex primary -> Claude can be fallback
Frontend: Claude primary -> Codex frontend fallback is not wired yet
```

Do not remove the Codex backend-only guard until the Factory gains an explicit Codex frontend worker/route. That future change belongs in the Factory orchestration, not Project Init.

## Files you should recognize

```text
.specify/                        Spec Kit runtime/config
specs/NNN-feature/               Spec Kit feature artifacts
.claude/skills/factory/          Claude Factory orchestrator
.claude/agents/                  Claude Factory workers/reviewers
.agents/skills/backend-factory/  Codex backend worker skill
.agents/skills/backend-audit/    Codex backend audit skill
factory/jobs/                    Factory runtime jobs/evidence
.project-init/                   Project Init local state/evidence
```

## One sentence to remember

> **Project Init bootstraps it; Spec Kit specifies it; Factory runs it; ECC strengthens it; Claude and Codex build it.**

Factory itself ships with Project Init. `--kit PATH` is only an advanced developer override for testing a different Factory source.
