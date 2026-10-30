# Tasks: Gated deployment

**Spec:** `specs/012-gated-deployment/spec.md` · **Plan:** `specs/012-gated-deployment/plan.md`

- [ ] T001 Record each target's current OIDC/deployment documentation (source URL, date) and write the target templates. (FR-002)
- [ ] T002 Re-read this spec against 008 and 009 as built; report mismatches.
- [ ] T003 `github deploy plan|apply` with no-overwrite rule; tests. (FR-001, FR-003)
- [ ] T004 Release-gate link and pre-release environment handling; tests. (FR-005)
- [ ] T005 Rollback dispatch and `rollback-plan`; tests. (FR-006, SC-002)
- [ ] T006 Deploy workflow check; tests. (FR-007, SC-001)
- [ ] T007 Environment protection guidance output. (FR-004)
- [ ] T008 [P] Docs and changelog.
- [ ] T009 Run `npm run test:all` and `npm run smoke`; report exact results.
- [ ] T010 Maintainer-run live check on one real project; record in `docs/ACCEPTANCE-REPORT.md`. Leave unticked until the maintainer has run it. (SC-003)
