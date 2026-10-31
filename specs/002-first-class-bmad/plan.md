# Implementation plan: First-class BMAD

**Spec:** `specs/002-first-class-bmad/spec.md`

## Technical context

- Node.js ≥ 20.19, ES modules, no new runtime dependencies. The bundled Factory scripts are Python (`vendor/factory/claude/skill/scripts/`).
- BMAD v6.12.0 is installed with `npx bmad-method@6.12.0 install` (interactive). It writes `_bmad/` (installed method and configuration) and an output folder for planning and implementation artifacts.
- The exact v6.12.0 configuration keys and file names must be recorded from a real installation (task T001). Do not hardcode paths from memory or blog posts; the adapter reads them from `_bmad/` and the fixture proves it.
- Reading the configuration may require parsing simple YAML. Implement a minimal, strict parser for the specific keys needed (or read them with a narrow line-based parser) rather than adding a YAML dependency; refuse anything it cannot parse unambiguously.

## Design

### New module `lib/bmad.mjs`

- `BMAD_DEFAULT_VERSION = '6.12.0'` (FR-001).
- `bmadLayout(root)` → `{adapter: 'v6', planningDir, implementationDir, sprintStatusFile}` resolved from `_bmad/` configuration (FR-005). Explicit failure when unresolvable.
- `bmadStories(root, layout)` → stories with id, epic, file path, status (from the sprint-status file), task IDs (from the story's task list), and related planning documents (FR-007, FR-008).
- No writes. This module only reads BMAD files (FR-011).

### Changes to existing files

| File | Change |
| --- | --- |
| `lib/bootstrap.mjs` | `selectFactoryFramework` accepts `bmad`; `summarizePlan` uses the BMAD install plan with `BMAD_DEFAULT_VERSION` when BMAD is selected; confirmation and progress text name BMAD; supervised step for the interactive installer; footprint conflicts refused both ways (FR-002–FR-004) |
| `lib/core.mjs` | `installPlan` marks the BMAD step `supervised: true`; refuse v7 versions (FR-001, FR-002); `recommendation` adds the FR-012 reason without changing scores |
| `lib/prepare.mjs` | replace the BMAD branch of `candidates` and the `nativeRoots.bmad` heuristic with `lib/bmad.mjs` (FR-007, FR-008) |
| `bin/project-init.mjs` | `--framework bmad` accepted for `init`; usage text |
| `vendor/factory/claude/skill/scripts/board.py` | accept `--source bmad:<path>` (FR-009) |
| `vendor/factory/claude/skill/SKILL.md` | `spec` accepts a BMAD story path; preflight uses Project Init preparation for BMAD; pass story, epic, PRD, architecture to the spec writer (FR-009) |
| `vendor/factory/claude/agents/factory-spec-writer.md` | BMAD input: write `J/spec.md` by reference to the story's acceptance criteria and tasks; never a second requirement set (FR-010) |
| `vendor/factory/claude/agents/factory-builder.md`, `vendor/factory/codex/skills/factory-worker/` | may tick completed task checkboxes in the assigned story; never touch status fields or the sprint-status file (FR-011) |
| `vendor/factory/codex/skills/factory/` | Codex orchestrator parity with the Claude orchestrator for BMAD sources (FR-009) |
| `vendor/factory/claude/skill/config.json` | add `bmad_story` source handling settings only if needed; existing configs keep their values on update (same migration rule as today) |
| `lib/factory.mjs` | if the bundled-file checks or config migration need to know about new keys |
| `tests/fixtures/bmad-v6.12.0/` | recorded layout fixture with fake content and a `RECORDED.md` note (FR-006) |
| Docs listed in FR-013, `CHANGELOG.md` | as specified |

## Risks

- **Layout guessed wrongly.** Mitigation: T001 records the real layout first; the adapter fails explicitly when configuration is missing.
- **Interactive installer in guided apply.** Mitigation: run it in the foreground only for new projects with consent; existing projects get the printed command (keeps the current safety rule).
- **Factory prompts drifting between Claude and Codex orchestrators.** Mitigation: same tests for both entry points where they are testable; documentation states one contract.
- **BMAD v7 lands soon.** Mitigation: the adapter is versioned and v7 is refused clearly, not half-supported.

## Rollback

Spec Kit behavior is unchanged and remains the default. Reverting the pull request restores the previous BMAD behavior (selectable, not guided, not Factory-capable).
