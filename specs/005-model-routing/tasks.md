# Tasks: Model routing policy

**Spec:** `specs/005-model-routing/spec.md` · **Plan:** `specs/005-model-routing/plan.md`

- [ ] T000 Re-read `spec.md`, `plan.md` and these tasks against the current Factory code before coding; report any mismatch to the maintainer instead of improvising.
- [ ] T001 Record from current official documentation: how Claude Code subagent `model` frontmatter and CLI `--model` work, how Codex selects a model (`-m`), and what usage each client prints in the output formats Factory uses (`stream-json`, `codex exec --json`). Save as `docs/ROUTING.md` reference notes with dates and URLs. (FR-004, FR-009)
- [ ] T002 Config schema and migration: `routing`, nested `approvedDataClasses`, `claude_model` → `claude.model`; tests that no chosen value is lost and that a conflicting `claude_model` is reported. (FR-002, FR-005, SC-003)
- [ ] T003 `routing.py` resolution with fallback; tests for configured, unconfigured and partially configured roles, and the advisory orchestrator role. (FR-001–FR-003, SC-001)
- [ ] T004 Agent frontmatter rendering at install/update, with planning that compares installed agents against rendered content; tests including a clean second preview. (FR-004, SC-002)
- [ ] T005 Codex and Claude workers (build, fix, `agent`) use resolved models; tests with fake executables. (FR-004, SC-002)
- [ ] T006 Pass `execution factory` check results into reviewer prompts; reviewer and orchestrator skill text updated. (FR-006)
- [ ] T007 `dataClass` in project state and `project-init data-class` (preview by default, `--apply`, audit event); tests. (FR-007, FR-008)
- [ ] T008 Data class refusal in `board.py init` and orchestrator preflight, fail closed on unreadable state and on clients without `approvedDataClasses`; tests. (FR-007, SC-004)
- [ ] T009 Receipt schema 2 with tier, client and model; `execution factory` accepts 1 and 2; `routing.json` per job with usage or `not-reported`; tests with fake outputs. (FR-009, SC-005)
- [ ] T010 Routing section in `factoryRuntimeStatus`; tests for configured and `not-configured`. (FR-010, SC-001)
- [ ] T011 [P] Docs: `docs/ROUTING.md` (configuration, data classes, limits, what is deferred), `docs/FACTORY-STACK.md`, `docs/COMMANDS.md`; changelog.
- [ ] T012 Run `npm run test:all` and `npm run smoke`; report exact results.
