# Tasks: Pack-declared hooks

**Spec:** `specs/004-pack-hooks/spec.md` · **Plan:** `specs/004-pack-hooks/plan.md`

- [ ] T001 Record the current hook configuration format and supported events for Claude Code and for Codex from their official documentation into `lib/hook-clients.json` (version, date, source URL). If Codex documentation is unavailable, record it as unsupported. (FR-002)
- [ ] T002 [P] Manifest validation for `provides.hooks`, including refusal of a blocking hook without a matching check; tests. (FR-001, FR-007, SC-003)
- [ ] T003 Claude renderer with marker-scoped merge into `.claude/settings.json`; tests for creation, merge with existing user hooks, invalid JSON refusal, removal. (FR-003, SC-001, SC-004)
- [ ] T004 [P] Codex renderer per registry; tests including the unsupported path. (FR-004)
- [ ] T005 [P] Git dispatcher renderer; tests for clean repository, existing hook files and `core.hooksPath` conflicts. (FR-005)
- [ ] T006 `hook run` with timeout, payload passing and block/report results; tests. (FR-006)
- [ ] T007 `hooks plan|apply` commands and integration with `pack add/remove`; audit events. (FR-008, FR-009)
- [ ] T008 Example hook in `packs/example/`; disposable-project demonstration of a blocked write and a blocked command in Claude Code, recorded in the PR. (SC-002)
- [ ] T009 [P] Docs: `docs/HOOKS.md`, `docs/COMMANDS.md`, security model bypass note; changelog. (FR-010)
- [ ] T010 Run `npm run test:all` and `npm run smoke`; report exact results.
