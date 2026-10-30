# Implementation plan: Work intake from issues

**Spec:** `specs/013-issue-intake/spec.md`

## Design

- `lib/intake.mjs`: list candidates via the GitHub REST API (reuse 008's client), match against existing jobs by source, plan and apply.
- `board.py`: add `proposed` to stages, `init --source issue:<n>|dependabot:<pr> --proposed`, approval recording, and a transition guard from `proposed`.
- Orchestrator skills (Claude and Codex): `approve-proposal`, `reject-proposal`; drafting step uses the native methodology handoff.
- Dependabot verification proposals reuse 009 dependency review.

## Changes

| File | Change |
| --- | --- |
| `lib/intake.mjs` | new |
| `vendor/factory/claude/skill/scripts/board.py` | stage, sources, guard |
| `vendor/factory/claude/skill/SKILL.md`, `vendor/factory/codex/skills/factory/` | proposal commands |
| `lib/factory.mjs` | board schema validation accepts `proposed` |
| `bin/project-init.mjs` | `intake` |
| `docs/INTAKE.md`, `docs/FACTORY-DASHBOARD.md` | usage, data boundary, external scheduling |

## Risks

- **Prompt injection through issue text.** Mitigation: issue text is untrusted input; drafts are unapproved; nothing builds without approval; documented in the security model.
- **Usage spikes.** Mitigation: per-run proposal limit.

## Rollback

Proposed jobs can be rejected; reverting removes the command and stage (existing boards keep working because unknown stages are preserved as data).
