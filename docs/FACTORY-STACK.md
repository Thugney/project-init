# Project Init factory stack

This is the recommended factory profile for projects that use both Claude Code and Codex.

## Ownership

```text
Project Init
  ├─ inspects a new/existing repo
  ├─ selects + installs one spec methodology
  ├─ installs ECC for the coding harnesses
  └─ installs/validates the factory wiring

Spec Kit (default)
  └─ owns requirements -> spec -> plan -> tasks in specs/NNN-x/

Factory
  ├─ converts approved Spec Kit work into factory/jobs/<slug>/spec.md
  ├─ routes [BACKEND] -> Codex by default
  ├─ routes [FRONTEND] -> Claude by default
  ├─ runs security/code/UX/UI review rounds
  └─ stops for contract issues, high risk, failed review, or human approval

ECC
  └─ provides reusable engineering/security/review capabilities to both harnesses

Codex / Claude
  └─ write and test application code; neither owns the product specification
```

## Why Spec Kit is the default

The factory already has a native entry point for `specs/NNN-x/`, and current Spec Kit integrations install skills into both `.agents/skills/` for Codex and `.claude/skills/` for Claude. This gives both coding agents the same spec source without creating a second planning system.

BMAD remains supported by Project Init, but it is intentionally **not** installed alongside Spec Kit for the same project workflow. Use BMAD instead when the project needs its broader product discovery, UX and architecture process and you are willing to let BMAD become the one spec owner.

## Install sequence

Preview every external change first.

```powershell
project-init init --project C:\Work\App --mode Existing --intent feature --ui auto
project-init select --project C:\Work\App --framework spec-kit
project-init install --project C:\Work\App --version 1.2.3 --agent both
project-init install --project C:\Work\App --version 1.2.3 --agent both --apply

project-init ecc --project C:\Work\App --version 2.2.3 --agent both --scope local
project-init ecc --project C:\Work\App --version 2.2.3 --agent both --scope local --apply

project-init factory --project C:\Work\App --kit C:\Tools\factory-kit
project-init factory --project C:\Work\App --kit C:\Tools\factory-kit --apply
```

`factory --kit` copies the reviewed Claude factory files using Project Init's Node process, preserves an existing factory `config.json` and backlog, creates the runtime jobs directory, updates only the factory runtime ignore entries, validates `codex_backend.sh`, and installs:

- `.agents/skills/backend-factory/SKILL.md`
- `.agents/skills/backend-audit/SKILL.md`

If the Claude factory is already installed, omit `--kit`; Project Init validates the existing bridge and only installs/verifies the Codex skills.

## Normal workflow

1. Use either Claude or Codex with the installed Spec Kit skills to create/refine the feature specification.
2. Keep the approved feature in `specs/NNN-x/`.
3. Run Claude's `/factory spec specs/NNN-x` orchestration.
4. The factory creates its execution contract in `factory/jobs/<slug>/spec.md`.
5. Codex receives `[BACKEND]`; Claude receives `[FRONTEND]`.
6. Review findings are routed by `[BACKEND]` / `[FRONTEND]` tags.
7. Low-risk, fully passing work may become a PR according to factory config; higher-risk or unresolved work stops for the human gate.

## Interchangeability: current vs target

Current supplied factory behavior is **asymmetric**:

- Claude can take backend work when Codex is missing/fails (`scope=BACKEND` fallback already exists).
- Codex cannot take frontend work through the current orchestrator because `codex_backend.sh` and its parsed status protocol are backend-specific.

Do not claim full interchangeability yet. The minimal future change is to generalize the bridge into a scope-aware Codex worker (for example `codex_worker.sh backend|frontend`) and add a matching Codex frontend skill/status contract. That change belongs to the Claude-owned factory orchestrator, not in `backend-factory`.

## Boundaries

- Project Init does not duplicate the Spec Kit PRD/spec/plan/tasks.
- ECC does not own requirements or task status.
- Codex backend skills do not edit `.claude/`, `CLAUDE.md`, frontend files, or factory orchestration state.
- The API Contract in a factory job is binding for both sides.
- Factory runtime job files are evidence/state, not a second product backlog.
