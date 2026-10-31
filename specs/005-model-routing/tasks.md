# Tasks: Model routing policy

**Spec:** `specs/005-model-routing/spec.md` · **Plan:** `specs/005-model-routing/plan.md`

- [ ] T001 Record from current official documentation: how Claude Code subagent `model` frontmatter and CLI model selection work, how Codex selects a model and configures custom OpenAI-compatible providers, and what usage each client prints. Save as `docs/ROUTING.md` reference notes with dates and URLs. (FR-004, FR-009, FR-011)
- [ ] T002 Config schema and migration preserving existing values; tests. (FR-002, SC-002)
- [ ] T003 `routing.py` resolution with fallback; tests for configured, unconfigured and partially configured roles. (FR-001–FR-003, SC-001)
- [ ] T004 Agent frontmatter rendering at install/update; tests. (FR-004, SC-002)
- [ ] T005 Codex and Claude workers use resolved models; tests with fake executables. (FR-004)
- [ ] T006 Deterministic-first: integration checks run before reviewers; results passed in; prompt updates. (FR-005)
- [ ] T007 Family diversity default and per-project switch; tests. (FR-006)
- [ ] T008 `generic_worker.py` with argv template, environment-name-only secrets, receipt; tests proving no secret values in receipts or logs; `execution factory` accepts its evidence. (FR-008, SC-003)
- [ ] T009 Data class in project state and preflight refusal; tests. (FR-010, SC-004)
- [ ] T010 Usage record per role in job reports; tests with fake outputs. (FR-011, SC-005)
- [ ] T011 Opt-in `decide` command for both orchestrators with anonymised labels. (FR-007)
- [ ] T012 [P] Docs: `docs/ROUTING.md` (configuration, provider recipes, data classes), `docs/FACTORY-STACK.md`, `docs/COMMANDS.md`; changelog.
- [ ] T013 Run `npm run test:all` and `npm run smoke`; report exact results.
