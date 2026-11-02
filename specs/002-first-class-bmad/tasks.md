# Tasks: First-class BMAD

**Spec:** `specs/002-first-class-bmad/spec.md` · **Plan:** `specs/002-first-class-bmad/plan.md`

`[P]` = can run in parallel with other `[P]` tasks in the same phase. Tick each task only when it is implemented and its tests pass.

## Phase A — Record the real layout

- [x] T001 In a disposable directory, install `bmad-method@6.12.0` and create one PRD, one architecture document, one epic and two stories with BMAD's own workflows (or minimal files in exactly the generated format). Record the resulting `_bmad/` configuration and artifact layout as `tests/fixtures/bmad-v6.12.0/`, replacing all content with fake text, plus `RECORDED.md` with the command, date and anything that could not be recorded. If this cannot be done in the environment, stop and report instead of inventing the layout. (FR-006)

## Phase B — Layout adapter

- [x] T002 [P] Failing tests for `bmadLayout`: resolves folders and sprint-status file from the fixture; fails explicitly when configuration is missing or ambiguous. (FR-005, SC-004)
- [x] T003 [P] Failing tests for `bmadStories`: ids, epic, status, task IDs, related planning documents from the fixture. (FR-007, FR-008)
- [x] T004 Implement `lib/bmad.mjs` (read-only, minimal strict parsing, no new dependency); add it to the `check` script. T002–T003 pass. (FR-005, FR-007, FR-011)

## Phase C — Preparation

- [x] T005 Tests, then replace the BMAD branch in `lib/prepare.mjs` with the adapter; single ready/in-progress story auto-selected; several reported; `--feature` and `--spec` still work. (FR-007, FR-008, US2, SC-002)

## Phase D — Guided setup

- [x] T006 Tests, then version handling: default `6.12.0`, explicit v6 allowed, v7 refused. (FR-001, SC-004)
- [x] T007 Tests, then `init --framework bmad` plan and apply for a new project with a recorded fake installer; supervised interactive step; resume after completion. (FR-002, US1, SC-001)
- [x] T008 Tests, then existing non-empty project: printed supervised command, resume once BMAD is detected; footprint conflicts refused in both directions. (FR-003, FR-004, SC-004)

## Phase E — Factory

- [x] T009 Tests, then `board.py init --source bmad:<path>`. (FR-009)
- [x] T010 Update the Claude orchestrator skill, spec writer, builder and the Codex orchestrator and worker skills for BMAD sources and status ownership; keep both orchestrators' contracts identical. (FR-009, FR-010, FR-011)
- [x] T011 Tests: a BMAD fixture story produces a registered job and integration evidence accepted by `execution factory` (fake workers, as the existing Factory tests do). (US3, SC-003)

## Phase F — Recommendation, docs, finish

- [x] T012 [P] Recommendation reason line when BMAD ranks first; scores unchanged; test. (FR-012)
- [x] T013 [P] Documentation listed in FR-013, including the v6.12.0 pin, the v7 limitation and how to choose per project; changelog entry. (FR-013)
- [x] T014 Run `npm run test:all` and `npm run smoke`; report exact results and any platform not run. (SC-005)
- [ ] T015 Maintainer-run live check: real `bmad-method@6.12.0` in a disposable project through preparation and one Factory job; record it in `docs/ACCEPTANCE-REPORT.md` as maintainer-run evidence. Leave unticked until the maintainer has run it. (SC-006)
