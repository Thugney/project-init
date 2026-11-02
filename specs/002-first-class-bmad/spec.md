# Feature specification: First-class BMAD

**Feature:** `002-first-class-bmad`
**Roadmap:** Phase 2 in `docs/ROADMAP-2.2.md` · Issue #61
**Status:** ready for build approval
**Depends on:** nothing in `001-pack-mechanism`; can be built after it or in parallel.

## Summary

Project Init already ranks, pins and installs BMAD, but a BMAD project cannot use guided setup, cannot start Factory jobs, and its features are not discovered automatically. This feature makes BMAD a first-class methodology next to Spec Kit for the BMAD Method **v6.12.0**, the project's selected supported v6 pin. Spec Kit remains the default; the methodology is chosen per project and only one is ever active.

## Background: BMAD v6 versus v7

BMAD v6 (stable, frozen except for bug fixes) writes planning documents and stories into an output folder (`_bmad-output/` by default, configurable) and tracks story status in a sprint-status file. BMAD v7 is pre-release and uses a different "initiative store" layout with `tickets.toml` files. This feature supports v6.12.0 only, reads the layout from the installed copy instead of assuming paths, and isolates layout handling so a v7 adapter can be added later without changing callers.

## User stories

### US1 — Guided setup with BMAD (P1)

As the maintainer, I run one guided command to set up a BMAD project for Claude and Codex, the same way Spec Kit projects are set up.

**Acceptance scenarios**

1. Given a new project, when I run `project-init init --project . --framework bmad`, then the read-only plan shows BMAD v6.12.0, ECC, Factory and skills, and marks the BMAD installer step as interactive and supervised.
2. Given `--apply` on a new project, then the steps run in order, the interactive BMAD step is run in the foreground for me to complete, and a re-run resumes completed steps.
3. Given an existing non-empty project without BMAD, then the plan prints the exact supervised BMAD install command for me to run, and `init --apply` continues once BMAD is detected.
4. Given a project that already has Spec Kit or OpenSpec, then `--framework bmad` is refused and nothing is written.

### US2 — Prepare BMAD stories automatically (P1)

As the maintainer, I want preparation to find my BMAD epics and stories without pointing at files by hand.

**Acceptance scenarios**

1. Given a BMAD v6.12.0 project with planning documents and stories, when I run `project-init prepare --project .`, then each story is listed as a candidate feature with its PRD, architecture and epic documents as spec paths, the story file as its task path, and the story's task IDs.
2. Given exactly one story in a ready or in-progress state, then it is selected; given several, preparation reports them and asks for `--feature`.
3. Given a BMAD layout that cannot be resolved from the installed configuration, then preparation fails with an explicit message and does not guess.

### US3 — Start a Factory job from a BMAD story (P1)

As the maintainer, I start a parallel Codex/Claude Factory job from an approved BMAD story, the same way I do from a Spec Kit feature.

**Acceptance scenarios**

1. Given a prepared, approved BMAD story, when I run `/factory spec <story path>` in Claude Code (or the Codex orchestrator equivalent), then a job is registered with source `bmad:<story path>` and `J/spec.md` is an execution contract derived from the story's acceptance criteria and tasks, citing them rather than redefining them.
2. Given that job's workers complete and integrate, then `project-init execution factory` accepts its evidence the same way as for a Spec Kit job.
3. Given the job runs, then BMAD's story status and sprint status are not changed by Factory; workers may only tick the story's task checkboxes for tasks they completed.

## Functional requirements

- **FR-001 Version.** The default BMAD version is the exact string `6.12.0`. Any other exact v6 version may be passed explicitly. A v7 version is refused with a message that v7 is not yet supported.
- **FR-002 Guided setup.** Guided `init` accepts `--framework bmad`. Its plan and apply flow uses the BMAD install plan in place of the Spec Kit plan, with ECC, Factory and project skills unchanged. The BMAD installer step is marked `interactive: true` and `supervised: true`.
- **FR-003 Existing projects.** For existing non-empty projects, the existing refusal to run vendor scaffolding automatically is kept; the plan states the exact command for the maintainer to run, and resuming detects the installed result.
- **FR-004 One methodology.** Guided `init --framework bmad` is refused when a Spec Kit or OpenSpec footprint exists, and `--framework spec-kit` is refused when a BMAD footprint exists. Existing selection rules in `lib/core.mjs` are unchanged.
- **FR-005 Layout resolution.** A BMAD layout adapter resolves the planning-artifacts folder, implementation-artifacts folder and sprint-status file from the installed BMAD configuration under `_bmad/`. If they cannot be resolved, it fails with an explicit message. The adapter has a version field so a v7 adapter can be added separately.
- **FR-006 Real-layout fixture.** The adapter's tests use a fixture recorded from an actual `bmad-method@6.12.0` installation (configuration files and a minimal set of planning and story files with fake content), together with a note of the command and date it was recorded from.
- **FR-007 Preparation.** BMAD feature discovery replaces the current `_bmad-output/<dir>/prd.md` heuristic in `lib/prepare.mjs` with the adapter: candidates are stories; spec paths are the PRD, architecture and the story's epic document when they exist; the task path is the story file; task IDs are read from the story's task list.
- **FR-008 Story selection.** With no `--feature`, a single story whose sprint status is ready-for-development or in-progress is selected; otherwise preparation reports the candidates. `--feature <story path>` and `--spec` keep working.
- **FR-009 Factory source.** `board.py init` accepts `--source bmad:<story path>`. The Claude orchestrator skill and the Codex orchestrator skill accept a BMAD story path in `spec` and pass the story, its epic, the PRD and the architecture document to the spec writer.
- **FR-010 Execution contract.** For a BMAD source, the spec writer writes `J/spec.md` that lists the story's acceptance criteria and tasks by reference (path and identifier) and assigns work units to `[CODEX]` and `[CLAUDE]`. It does not create a second requirement set.
- **FR-011 Status ownership.** Factory and Project Init never write BMAD status fields or the sprint-status file. Workers may tick task checkboxes in the assigned story for completed tasks, matching BMAD's own development workflow.
- **FR-012 Recommendation text.** `recommend` keeps its scores and adds, when BMAD ranks first, a reason line that it is the heavier process best suited to new products and large scope. `docs/FACTORY-STACK.md` explains choosing Spec Kit or BMAD per project.
- **FR-013 Documentation.** `README.md`, `docs/GETTING-STARTED.md`, `docs/FACTORY-STACK.md`, `docs/FEATURE-PREPARATION.md`, `docs/INSTALL.md` and `docs/COMMANDS.md` describe the BMAD path, including the v6.12.0 pin and the v7 limitation.

## Out of scope

- BMAD v7 and its initiative-store layout.
- Converting projects between methodologies.
- Running BMAD's own agents or workflows from Project Init; the maintainer and agents use BMAD's installed skills directly.

## Success criteria

- **SC-001** Guided `init --framework bmad --apply` completes on a new-project fixture (BMAD installer replaced by a recorded fake in tests, as the Codex runner is today).
- **SC-002** Preparation finds the recorded fixture's stories without `--spec`, with correct spec paths and task IDs.
- **SC-003** A BMAD story starts a Factory job whose integration evidence passes `execution factory`.
- **SC-004** Every refusal in FR-001, FR-004 and FR-005 has a regression test.
- **SC-005** `npm run test:all` passes on Windows, Linux and macOS in CI.
- **SC-006** A live check is recorded in `docs/ACCEPTANCE-REPORT.md`: a real `bmad-method@6.12.0` install in a disposable project, prepared and run through one Factory job, labelled as maintainer-run evidence.
