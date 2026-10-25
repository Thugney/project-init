---
name: factory-audit
description: Read-only audit of a Project Init Factory integration worktree. Review the combined Codex + Claude result without assuming frontend/backend ownership.
---

# Factory Audit

This is read-only. Never modify application code, tests, specs, Factory state, Git state, or instruction files.

## Review procedure

1. Read `.factory-context/<slug>/spec.md` or the Factory job spec path supplied by the caller.
2. Review the **integration worktree**, not an individual worker worktree.
3. Compare the integrated diff against acceptance criteria, task ownership, and any binding API/data contract.
4. Run relevant tests if allowed.
5. Attribute each actionable finding to the worker whose assigned files/tasks need the fix.

## Required checks

- Acceptance criteria and task completeness.
- Contract drift across API, data, UI, tests, or other shared boundaries.
- Authorization, validation, injection, secrets, unsafe migrations, destructive behavior.
- Correct error/loading/empty states where applicable.
- Missing or weak tests.
- Merge/integration defects that were not visible in isolated worker branches.
- Unintended overlap between Codex- and Claude-owned files.

## Output

First line:

`VERDICT: PASS`

or

`VERDICT: CHANGES`

Then findings:

`- [CODEX] SEVERITY path:line — problem. Fix: concrete remediation.`

`- [CLAUDE] SEVERITY path:line — problem. Fix: concrete remediation.`

Use `- [INTEGRATION]` only when the defect cannot safely be assigned to one worker.

The tags describe **current worker ownership**, not frontend/backend roles.
