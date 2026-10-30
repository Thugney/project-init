# Tasks: Supply chain in CI

**Spec:** `specs/009-supply-chain-ci/spec.md` · **Plan:** `specs/009-supply-chain-ci/plan.md`

- [ ] T001 Re-read this spec against 008 as built; report mismatches.
- [ ] T002 `actions-pinned` check; tests including local actions and Docker digests. (FR-003)
- [ ] T003 `secrets-diff` check reusing 004 patterns; tests proving values are never printed. (FR-002, SC-003)
- [ ] T004 Dependency-review evidence and guard requirement; tests. (FR-004)
- [ ] T005 CI generator supply-chain jobs with least privilege and SHA pins; tests. (FR-001)
- [ ] T006 Pin Project Init's own workflow actions; add audit job; confirm Dependabot covers actions. (FR-005, SC-002)
- [ ] T007 Combined fixture producing the three findings. (SC-001)
- [ ] T008 [P] Docs and changelog. (FR-006)
- [ ] T009 Run `npm run test:all` and `npm run smoke`; report exact results.
