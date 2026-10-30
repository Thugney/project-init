# Implementation plan: `m365-powershell` pack

**Spec:** `specs/003-m365-powershell-pack/spec.md`

## Technical context

- PowerShell 7 (`pwsh`), Pester 5, PSScriptAnalyzer (custom rules as a module of functions returning `DiagnosticRecord`, loaded with `-CustomRulePath`).
- Microsoft Graph PowerShell SDK only for the maintainer-run mapping generator (`Find-MgGraphCommand`), never at check time.
- The pack is data plus PowerShell files; Node changes are limited to configuration precedence and, if needed, check proposal plumbing from 001.
- `pwsh` is already on the check runner allowlist in `lib/core.mjs`.

## Layout

```text
packs/m365-powershell/
  pack.json
  config.defaults.json                 public defaults (FR-005)
  rules/powershell-standards.md        agent rule fragment
  skills/graph-app-only-auth/SKILL.md
  skills/intune-remediation/SKILL.md
  skills/asr-audit-then-block/SKILL.md
  skills/conditional-access-report-only/SKILL.md
  skills/power-automate-graph/SKILL.md
  checks/Invoke-PackCheck.ps1          single runner (FR-002, FR-003)
  checks/PackRules.psm1                custom PSScriptAnalyzer rules (FR-004)
  checks/PSScriptAnalyzerSettings.psd1 includes built-in alias rule
  checks/GraphPermissions.psm1         static Graph analysis (FR-008)
  data/graph-permissions.json          generated mapping (FR-007)
  tools/Update-GraphPermissionMap.ps1  maintainer-run generator (FR-007)
  examples/overlay/                    private overlay example (FR-011)
  review/powershell-review.md          review checklist
  mcp.json                             Microsoft Learn MCP recommendation (FR-010)
tests/fixtures/powershell/             clean and violating scripts, permission sidecars
tests/m365-powershell-pack.test.mjs    Node tests driving pwsh when available
```

## Design notes

- **Runner contract:** JSON-lines findings `{"rule","severity","file","line","message"}`; exit 0/1; exit 2 for prerequisite or usage errors with an explanatory message.
- **Configuration precedence** (FR-005) is resolved in Node when proposals are built and passed to the runner as a single JSON file path argument, so the runner does not search for configuration itself.
- **Language check** for `.SYNOPSIS`: a simple configured word list heuristic, documented as heuristic; off by default.
- **State-changing verbs** list is in configuration so it can be extended.
- **Graph analysis:** parse the script AST (`[System.Management.Automation.Language.Parser]::ParseFile`), collect `Mg*` command names and literal URI strings; map with the table; anything else is `unverifiable`.

## Changes outside the pack

| File | Change |
| --- | --- |
| `lib/packs.mjs` | configuration precedence (project → overlay → defaults) if not already in 001 |
| `.github/workflows/ci.yml` | ensure `pwsh`, Pester and PSScriptAnalyzer are available on the Windows job; install pinned versions in CI only |
| `docs/PACKS.md`, new `docs/packs/m365-powershell.md` | usage, rules, configuration, overlay, limits |
| `CHANGELOG.md` | entry |

## Risks

- **False positives** on the language and verb heuristics. Mitigation: configurable, off-by-default language check, precise messages.
- **Mapping table drift.** Mitigation: SDK version and date recorded; generator re-run on demand; stale age reported in `pack list`.
- **pwsh missing on non-Windows runners.** Mitigation: tests skip with a visible reason, Windows CI is mandatory.

## Rollback

Removing the pack with `pack remove` restores the project. Reverting the pull request removes the bundled pack.
