# Feature specification: `web-gdpr` pack

**Feature:** `011-web-gdpr-pack`
**Roadmap:** Phase 11 · Issue #50
**Status:** ready for build approval
**Depends on:** `001-pack-mechanism`. Before building, re-read this spec against the code as built and report any mismatch instead of improvising.

## Summary

For web applications in the maintainer's repositories that handle personal data. A change that introduces or alters personal-data handling must carry a privacy-review finding before the guard passes. The pack also proposes accessibility checks and optional locale completeness checks.

## User stories

### US1 — Personal-data changes are reviewed (P1)

When a change adds or alters forms, data models, analytics or third-party scripts that may handle personal data, the guard requires a privacy-review finding that follows the pack's checklist.

### US2 — Accessibility checks proposed (P2)

Where the project has a browser test runner, the pack proposes accessibility checks mapped to requirements.

### US3 — No half-translated pages (P3)

For configured locales (for example `nb` and `en`), missing translation keys are findings.

## Functional requirements

- **FR-001 Detection.** `appliesTo` matches common web project markers (`package.json` with a web framework dependency, `*.html`, `*.tsx`, `*.vue`, `*.svelte`).
- **FR-002 Personal-data change detection.** A pack check inspects the diff since the approved baseline for configured signals: form input fields with personal-data names (`email`, `phone`, `name`, `address`, `birth`, `ssn`, `personnummer`, configurable), database schema or migration changes adding such columns, analytics and tag-manager scripts, and newly added third-party script origins. Matches produce a `privacy-review-required` finding listing files and signals.
- **FR-003 Privacy review evidence.** The guard requires a `privacy-review` finding covering each flagged file when FR-002 fires. The pack's checklist covers: purpose, lawful basis, data minimisation, retention, processors and transfers, user rights, and logging. The judgment comes from the reviewer; Project Init only checks presence, coverage and freshness.
- **FR-004 Accessibility proposals.** When Playwright or another supported browser test runner is detected, propose an accessibility check (for example an axe-based test script the project adds) mapped to requirement IDs; never install packages automatically.
- **FR-005 Locale completeness.** Optional check for configured locale files (JSON key sets): keys present in the default locale but missing in others are findings.
- **FR-006 Limits.** Documentation states that detection is pattern-based and cannot find every personal-data flow, and that the pack is not legal advice.

## Success criteria

- **SC-001** A fixture change adding a personal-data form field is blocked until a privacy finding is imported, and passes after.
- **SC-002** A change with no signals does not require a privacy finding.
- **SC-003** Locale check reports missing keys precisely.
