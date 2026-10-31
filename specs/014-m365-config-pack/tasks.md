# Tasks: `m365-config` pack

**Spec:** `specs/014-m365-config-pack/spec.md` · **Plan:** `specs/014-m365-config-pack/plan.md`

- [ ] T001 From current Microsoft Learn documentation, record endpoints, properties, read-only fields and least-privilege read and write permissions for Conditional Access policies and Intune Settings Catalog policies; write `docs/permissions.md` with sources and dates.
- [ ] T002 Re-read this spec against 003, 008 and 013 as built; report mismatches.
- [ ] T003 Normalisation rules and fake fixtures for both types; tests. (FR-001, FR-012)
- [ ] T004 Export with the reader identity (recorded responses in tests). (FR-003)
- [ ] T005 Plan with property-level differences, unmanaged objects reported, deterministic hash; tests. (FR-004, SC-001)
- [ ] T006 Safety checks: emergency-access exclusion, report-only and audit defaults, tenant-wide block exclusions; tests. (FR-005, SC-002)
- [ ] T007 Approval binding of the plan hash in the guard; refusal when the plan changed; tests. (FR-006, SC-005)
- [ ] T008 Apply with the writer identity: ordered, stop on error, resumable, idempotent, logged without tokens; tests with recorded responses. (FR-007, SC-003)
- [ ] T009 Drift command and optional issue creation through 013; optional TCM monitor reading. (FR-009)
- [ ] T010 Rollback plan from a previous ref; tests. (FR-010, SC-004)
- [ ] T011 [P] Documentation: identities and consent steps, permission table, workflow, data boundary, limits; changelog. (FR-002, FR-011)
- [ ] T012 Run `npm run test:all` and `npm run smoke`; report exact results.
- [ ] T013 Maintainer-run live check against a test tenant covering SC-001 to SC-004; record in `docs/ACCEPTANCE-REPORT.md`. Leave unticked until the maintainer has run it.
