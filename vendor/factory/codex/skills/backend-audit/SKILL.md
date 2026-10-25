---
name: backend-audit
description: Read-only audit of backend changes on a factory/<slug> branch. Use when reviewing a software-factory backend diff for API contract drift, authorization/IDOR, injection, validation, secrets, migrations, and test coverage. Never edit code.
---

# Backend Audit

This is a read-only factory review skill. Never modify application code, tests, specs, factory state, Git state, or instruction files.

## Review procedure

1. Identify the job slug from the branch/prompt and read `factory/jobs/<slug>/spec.md`.
2. Read `.specify/memory/constitution.md` when present.
3. Review `git diff main...HEAD` unless the caller supplies a different base branch. Restrict findings to backend files and backend-relevant tests/migrations/configuration.
4. Compare every changed endpoint against the spec's binding `## API Contract`.
5. Inspect enough surrounding source to verify actual authorization, validation, query construction, error handling, and tests. Do not infer safety from names alone.

## Required checks

Report concrete findings for:

- API contract drift: route/method, request/response field, type, status code, error shape, or `Auth:` mismatch.
- Authentication or authorization gaps, especially object-level authorization / IDOR / BOLA.
- SQL/NoSQL/command/template/path injection or unsafe dynamic query construction.
- Missing or insufficient validation for externally supplied fields.
- Hard-coded or logged credentials, keys, tokens, connection strings, or other secrets.
- Unsafe webhooks: missing signature verification, replay protection, or idempotency where relevant.
- Destructive/irreversible migrations, unsafe defaults, data exposure, or missing indexes required by new access patterns.
- Missing tests for changed acceptance criteria, security boundaries, or error paths; failing relevant tests.

Do not block on formatting/style unless it creates correctness or security risk.

## Output contract

First line:

`VERDICT: PASS`

or

`VERDICT: CHANGES`

Then findings only in this exact shape:

`- [BACKEND] SEVERITY path:line — problem. Fix: concrete remediation.`

Use `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW`. `CHANGES` is required for any CRITICAL/HIGH/MEDIUM finding or a relevant failing test. LOW-only observations may remain under PASS.

Do not edit code to fix what you find.
