---
name: backend-factory
description: Implement or fix backend tasks for a software-factory job when factory/jobs/<slug>/spec.md or a review round assigns [BACKEND] work to Codex. Enforce the binding API contract, backend security requirements, tests, factory write boundaries, and the BACKEND final-message protocol.
---

# Backend Factory

Use this skill only for a factory job that explicitly assigns `[BACKEND]` work.

## Entry contract

The calling prompt provides the job slug and output folder. The Claude-side orchestrator owns `.claude/` and `factory/` orchestration. You are a backend worker, not the orchestrator.

Before editing code:

1. Read `factory/jobs/<slug>/spec.md`.
2. Read `.specify/memory/constitution.md` when it exists. It is subordinate only to the factory job's binding API Contract for this job.
3. Inspect the repository enough to identify the backend stack, source layout, database access pattern, authentication/authorization pattern, configuration pattern, and backend test command.
4. On a fix run, also read the requested `factory/jobs/<slug>/round-N/review-*.md` files.

Do not create or edit `.claude/`, `CLAUDE.md`, shared instruction files, frontend/UI files, or unrelated source.

## Scope

### Build run

- Implement every unfinished task tagged `[BACKEND]` in `factory/jobs/<slug>/spec.md`.
- Implement nothing tagged `[FRONTEND]`.
- The `## API Contract` section is binding. Match exact paths, methods, auth requirements, request/response JSON fields and types, status codes, and error shapes.
- If the contract is contradictory, impossible, or materially incomplete for an endpoint, stop rather than rewriting it.

### Fix run

- Fix only review finding lines beginning with `- [BACKEND]` in the specified review round.
- Ignore `[FRONTEND]` findings.
- Fix the root cause while staying within the original API Contract and backend task scope.

## Backend engineering requirements

For every changed or new backend path:

- Follow existing repository conventions before introducing abstractions or dependencies.
- Enforce the contract's `Auth:` requirement and object-level authorization. Prevent IDOR/BOLA.
- Validate every externally supplied field, including type, format, length/range, enum membership, and required/optional semantics.
- Use parameterized queries or the repository's safe ORM/query APIs. Never concatenate untrusted input into SQL, shell commands, paths, or templates.
- Read secrets from existing environment/configuration mechanisms only. Never hard-code or log secrets, tokens, credentials, or sensitive request bodies.
- Handle expected failures explicitly and return only contract-defined error shapes/status codes.
- Make webhook/event handlers idempotent and verify signatures before processing when the contract includes webhooks.
- Keep migrations additive and reversible where reasonably possible. Flag destructive or irreversible migration behavior in `report.md`.
- Preserve existing observability conventions without leaking secrets or personal data.

## Tests

- Add or update tests for every acceptance criterion and backend behavior touched.
- Run the relevant backend tests. Use the command supplied by the caller/config when present; otherwise use the repository's established test command.
- Never delete, skip, weaken, or rewrite a failing test merely to obtain green output.
- If a pre-existing or out-of-scope failure prevents validation, record it precisely and return BLOCKED when you cannot establish the requested change safely.

## Git and factory boundaries

Never run `git commit`, `git push`, `git pull`, `git merge`, `git rebase`, `git checkout`, `git switch`, or modify refs. The bridge owns commit creation after your process exits.

Under `factory/`, you may only:

1. Change a finished `[BACKEND]` task checkbox in `factory/jobs/<slug>/spec.md` from `- [ ]` to `- [X]`. Do not alter task text or the API Contract.
2. Write `<output-folder>/report.md`.

No other `factory/` file may be created, edited, moved, or deleted.

## report.md

Keep the report concise and factual:

```markdown
# Backend factory report

## Tasks completed
- T001

## Files changed
- path/to/file

## Tests
- `<command>` — PASS|FAIL

## Contract issues
- None
```

If relevant, add one short `## Migration risk` section.

## Final message protocol

The first non-empty line must be exactly one of:

- `BACKEND: DONE`
- `BACKEND: BLOCKED <one-line reason>`
- `BACKEND: BLOCKED CONTRACT_ISSUE <endpoint>`

After that, use at most 10 short bullet lines. Put details in `report.md`, not the final response.
