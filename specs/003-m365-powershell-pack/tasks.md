# Tasks: `m365-powershell` pack

**Spec:** `specs/003-m365-powershell-pack/spec.md` · **Plan:** `specs/003-m365-powershell-pack/plan.md`

- [ ] T001 Re-read this spec against the pack mechanism as built in 001; report mismatches before coding.
- [ ] T002 Create the pack skeleton, `pack.json` (`appliesTo` per FR-001), `config.defaults.json`, rule fragment and review checklist. (FR-001, FR-005)
- [ ] T003 [P] Fixtures: one clean script and one script per rule violation; permission sidecars (correct, under-declared, over-declared, dynamic URI). All values fake. (FR-012, SC-001, SC-002)
- [ ] T004 Runner `Invoke-PackCheck.ps1`: contract, prerequisites detection with install command, exit codes; tests. (FR-002, FR-003)
- [ ] T005 Custom PSScriptAnalyzer rules in `PackRules.psm1` plus settings file; one test per rule against the fixtures. (FR-004, SC-001)
- [ ] T006 Configuration precedence and overlay example; tests that overlay values change rule behavior. (FR-005, FR-011, SC-003)
- [ ] T007 Maintainer-run `Update-GraphPermissionMap.ps1` and an initial committed `graph-permissions.json` with SDK version and date. Record in the PR whether it was generated live or still needs the maintainer to run it. (FR-007)
- [ ] T008 `GraphPermissions.psm1` static analysis; tests for pass, under-declared, over-declared and unverifiable. (FR-006, FR-008, SC-002)
- [ ] T009 [P] Skills listed in FR-009, each with least privilege, logging, idempotency and rollback sections. (FR-009)
- [ ] T010 [P] `mcp.json` with the Microsoft Learn MCP recommendation. (FR-010)
- [ ] T011 Check proposals wired through the pack mechanism; preparation lists `m365-powershell:pester`, `:analyzer`, `:graph-permissions`. (FR-002, US1)
- [ ] T012 CI: pinned Pester and PSScriptAnalyzer on the Windows job; non-Windows tests skip with a visible reason when `pwsh` is missing. (SC-004)
- [ ] T013 [P] Docs (`docs/packs/m365-powershell.md`, `docs/PACKS.md`) and changelog.
- [ ] T014 Run `npm run test:all` and `npm run smoke`; report exact results per platform.
