# Tasks: Domain pack mechanism

**Spec:** `specs/001-pack-mechanism/spec.md` · **Plan:** `specs/001-pack-mechanism/plan.md`

`[P]` = can run in parallel with other `[P]` tasks in the same phase. Tick each task only when it is implemented and its tests pass.

## Phase A — Foundation

- [ ] T001 Create `packs/example/` (manifest, one rule fragment, one skill, one check proposal, one MCP recommendation), labelled as an example. (FR-001, FR-015)
- [ ] T002 [P] Write failing tests in `tests/packs.test.mjs` for manifest validation and every FR-013 refusal: unknown keys, bad name, non-exact version, symlink, `..` path, absolute path, secret-pattern file, oversize manifest, oversize pack, too many files. (FR-001, FR-013, SC-004)
- [ ] T003 [P] Write failing tests for `packHash` stability across file order and platforms, and change detection. (FR-005)
- [ ] T004 Implement `validatePack` and `packHash` in `lib/packs.mjs`; add it to the `check` script. T002–T003 pass. (FR-001, FR-005, FR-013)

## Phase B — Sources

- [ ] T005 Tests and implementation for bundled-name and local-path sources. (FR-002)
- [ ] T006 Tests and implementation for `git+<url>#<ref>` using a local bare-repository fixture: tag accepted, full SHA accepted, branch refused, missing ref refused, submodules not fetched, hooks not run. (FR-002, FR-013)

## Phase C — Add and lock

- [ ] T007 Tests, then `packPlan`: read-only plan with name, version, source, hash, file changes and conflicts; nothing written. (US1, FR-003)
- [ ] T008 Tests, then `applyPack`: store content, write the lock with `installed` hashes, audit `pack-added`; re-applying the same pack is a no-op. (FR-004, FR-014)
- [ ] T009 Tests, then the managed rules block: create a missing file, update an existing one, keep outside content byte-identical (LF and CRLF), refuse malformed or duplicated markers. (FR-007, SC-003)
- [ ] T010 Tests, then skill installation as `pack-<pack>-<skill>` for both agents; an unrelated existing file is a conflict and is not overwritten. (FR-008, SC-003)

## Phase D — Integration

- [ ] T011 Tests, then include `.project-init/packs.json` in `manifestFingerprint`; add, remove and edit each make `check` report a stale baseline. (FR-006, US2, SC-002)
- [ ] T012 [P] Tests, then `packCheckProposals` merged into preparation as `<pack>:<name>`, validated by the existing check rules. (FR-009)
- [ ] T013 [P] Tests, then `suggestPacks` in `inspect`/`recommend` output; existing ranking scores unchanged. (FR-012, US4)
- [ ] T014 Tests, then `listPacks` with `current`/`modified` state and MCP recommendations; `status` shows packs. (FR-005, FR-010, US2)

## Phase E — Removal

- [ ] T015 Tests, then `removePlan`/`applyRemove`: unmodified files deleted, modified files kept and reported, rules removed, markers removed when no packs remain, audit `pack-removed`. (FR-011, FR-014, US3)

## Phase F — CLI, docs, finish

- [ ] T016 Wire `pack list|add|remove` in `bin/project-init.mjs` with usage text and exit codes; CLI smoke tests. (FR-003)
- [ ] T017 [P] Write `docs/PACKS.md`; update `docs/COMMANDS.md`, `docs/INVARIANTS.md`, `README.md`; add `packs/` to package `files`; changelog entry. (FR-015)
- [ ] T018 Run `npm run test:all` and `npm run smoke`; confirm `npm pack --dry-run` includes `packs/`; report exact results and any platform not run. (SC-001–SC-005)
