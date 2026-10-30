# Feature specification: `m365-config` pack — tenant configuration as code

**Feature:** `014-m365-config-pack`
**Roadmap:** Phase 14 (later) · Issue #60
**Status:** ready for build approval when scheduled; build last
**Depends on:** `003-m365-powershell-pack`, `008-github-pack`; drift intake uses `013-issue-intake`. Before building, re-read this spec against the code as built and against current Microsoft documentation, and report any mismatch instead of improvising.

## Summary

Production tenant changes need a reviewed plan, human approval, evidence and rollback — the gate Project Init already has. This pack keeps desired Microsoft 365 security configuration in Git, produces a readable plan by diffing it against the live tenant with a read-only identity, enforces safety rules, and applies only approved changes with a separate write identity. The first release covers two resource types: **Conditional Access policies** and **Intune Settings Catalog policies** (which include endpoint security ASR policies). More types come later, one at a time.

## Context

Microsoft Graph's Tenant Configuration Management (TCM) APIs are generally available for snapshots and drift monitoring across Entra, Intune, Defender, Exchange, Purview and Teams using JSON baselines. They do not deploy or remediate. Their limits (monitors every six hours, daily monitoring and monthly snapshot quotas) and licensing (Tenant Governance) make them an optional drift source, not the plan engine. The plan engine reads current state with ordinary Graph reads.

## User stories

### US1 — Export current state into Git (P1)

I export the tenant's current Conditional Access and Settings Catalog policies into normalised JSON files in my organisation's private repository.

### US2 — See a plan before any change (P1)

I edit desired-state files in a branch and get a readable plan: what will be created, changed (property by property) or deleted, computed against the live tenant with a read-only identity.

### US3 — Safety rules block dangerous changes (P1)

Before approval, checks block: Conditional Access policies that do not exclude the configured emergency-access accounts; new Conditional Access policies not in report-only; new ASR rules not in audit mode; tenant-wide blocks without exclusions.

### US4 — Apply only what I approved (P1)

After I approve the plan in the pull request and the guard passes, a separate write identity applies exactly the approved plan, idempotently, and logs every change.

### US5 — Drift and rollback (P2)

Drift between Git and the tenant becomes an issue for the intake flow. Rolling back means applying the previous approved Git version.

## Functional requirements

- **FR-001 Desired-state format.** One JSON file per resource under `tenant/<resourceType>/<displayName-slug>.json`, normalised (sorted keys, server-generated fields removed, stable references). Resource type names follow TCM resource naming where one exists (for example `microsoft.entra.conditionalaccesspolicy`) so files stay portable.
- **FR-002 Identities.** Two app registrations with certificate credentials, created by the maintainer (documented, never by Project Init): a **reader** with read-only permissions for the covered types, and a **writer** with only the write permissions for the covered types. Exact least-privilege permissions per type are taken from Microsoft Graph documentation and the 003 mapping table, and listed in the pack documentation.
- **FR-003 Export.** `project-init m365 export --apply` (reader identity) writes the normalised files for the covered types.
- **FR-004 Plan.** `project-init m365 plan` (reader identity) compares Git with the live tenant and writes `.project-init/m365/plan.json` and a readable Markdown plan: creates, property-level changes, deletes, and objects present in the tenant but not managed (reported, never deleted unless explicitly marked for deletion in Git).
- **FR-005 Safety checks.** Pack checks run on the desired state and the plan: emergency-access exclusion on every Conditional Access policy (account object IDs come from private configuration, never from the pack); new Conditional Access policies start `enabledForReportingButNotEnforced`; new ASR rules start in audit mode; any policy targeting all users or all devices with a blocking control requires explicit exclusions and an override note.
- **FR-006 Approval binding.** The plan's hash is recorded as gate evidence; apply refuses unless the current plan hash equals the approved one and the guard passed (including CI evidence from 008 when configured).
- **FR-007 Apply.** `project-init m365 apply --execute` (writer identity) applies exactly the approved plan through Microsoft Graph, one object at a time, logging request type, object ID and result (never tokens). A second apply of the same plan makes no changes.
- **FR-008 Engine.** The plan/apply engine is a PowerShell module in the pack, using Microsoft Graph PowerShell or direct REST calls with certificate authentication; Node orchestrates commands and evidence.
- **FR-009 Drift.** `project-init m365 drift` (reader identity) reports differences without applying anything; with 013 configured it can create labelled issues. Optional: create or read a TCM monitor when the tenant has it set up, using the documented baseline format.
- **FR-010 Rollback.** Documentation and a command (`m365 plan --ref <previous-commit>`) produce the plan to restore a previous approved version, which goes through the same approval.
- **FR-011 Data boundary.** Exported files contain tenant configuration and object IDs. They live only in the organisation's own private repository, on machines and tools the organisation has approved. The pack contains no tenant data, and project configuration marks such repositories `restricted` so 005 refuses unapproved model providers.
- **FR-012 Test tenant.** Live tests run only against a test tenant the maintainer supplies; CI uses recorded, fully fake fixtures.

## Out of scope

- Resource types beyond Conditional Access and Settings Catalog in this release.
- Creating app registrations, granting consent or changing tenant settings outside the approved plan.

## Success criteria

- **SC-001** Against a test tenant: a desired-state change produces a plan with property-level differences.
- **SC-002** A Conditional Access policy missing the emergency-access exclusion is blocked before approval.
- **SC-003** An approved plan applies, and a second apply changes nothing.
- **SC-004** Planning and applying the previous version restores the original state.
- **SC-005** Apply refuses when the plan changed after approval (test).
