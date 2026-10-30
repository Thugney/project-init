# Implementation plan: `m365-config` pack

**Spec:** `specs/014-m365-config-pack/spec.md`

## Technical context

- PowerShell 7 module in the pack; Microsoft Graph endpoints for Conditional Access policies and Intune Settings Catalog (`configurationPolicies`) policies. Exact endpoints, properties, read-only fields and least-privilege permissions must be taken from current Microsoft Learn documentation (task T001), not memory.
- Certificate-based app-only authentication for reader and writer identities; certificate location from configuration (store thumbprint reference or file path outside the repository), never committed.
- Node: commands, evidence and guard integration only.

## Layout

```text
packs/m365-config/
  pack.json
  config.defaults.json         covered types, safety rule settings
  rules/tenant-config.md
  review/tenant-change-review.md
  engine/M365Config.psm1       export, plan, apply, drift
  engine/normalise/*.json      per-type field rules (read-only fields, references)
  checks/safety-rules          FR-005 checks
  docs/permissions.md          least-privilege table per type and identity
tests/fixtures/m365-config/    fake exported objects and recorded API responses
```

## Design notes

- **Normalisation** per type: drop server fields (`id` kept separately as a reference, timestamps, `@odata.*`), sort arrays where order is not meaningful, resolve references to stable identifiers.
- **Plan** is deterministic JSON plus Markdown; its SHA-256 is the evidence bound to approval.
- **Apply** iterates the plan in a fixed order (creates, updates, then explicit deletes), stops on first error, and records completed steps so a re-run continues idempotently.
- **Configuration secrets:** emergency-access object IDs and tenant ID come from a private configuration file outside the pack and are never logged.

## Changes

| File | Change |
| --- | --- |
| `packs/m365-config/` | new pack |
| `lib/m365.mjs` | `m365 export|plan|apply|drift` orchestration and evidence |
| `lib/guard.mjs` | `m365-plan` evidence binding (FR-006) |
| `bin/project-init.mjs` | commands |
| `docs/packs/m365-config.md` | setup of identities, permissions, workflow, data boundary, rollback, limits |

## Risks

- **Locking users out.** Mitigation: emergency-access exclusion check, report-only default for new policies, human approval of the exact plan, ordered apply that stops on error.
- **Over-privileged writer.** Mitigation: per-type permission table; 003 Graph permission check on the engine.
- **Tenant data leaving approved systems.** Mitigation: `restricted` data class, documentation, no tenant data in the pack or CI fixtures.

## Rollback

Plan and apply the previous approved Git version; the engine never deletes unmanaged objects.
