# Tasks: Local-first checks and CI cost

**Spec:** `specs/007-local-first-ci/spec.md` · **Plan:** `specs/007-local-first-ci/plan.md`

- [ ] T001 Re-read this spec against 004 as built; report mismatches.
- [ ] T002 `fast` flag in check validation, discovery defaults and `verify --fast`; receipts record scope; tests. (FR-001, SC-003)
- [ ] T003 Built-in `core` pre-push hook through the 004 mechanism; fixture test blocking and allowing a push. (FR-002, SC-001)
- [ ] T004 Agent rules, build/verify skills and Factory worker contracts: finish on local checks, don't wait on CI. (FR-003)
- [ ] T005 CI defaults template with version header. (FR-004)
- [ ] T006 Adopt defaults in `.github/workflows/ci.yml`; verify on a docs-only PR and a code PR and record the job counts in the PR description. (FR-005, SC-002)
- [ ] T007 [P] Docs: `docs/CI.md` (including self-hosted runner warning), `docs/CHECK-DISCOVERY.md`, `docs/COMMANDS.md`; changelog. (FR-006, FR-007)
- [ ] T008 Run `npm run test:all` and `npm run smoke`; report exact results.
