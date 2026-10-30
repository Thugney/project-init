# Feature specification: Supply chain in CI

**Feature:** `009-supply-chain-ci`
**Roadmap:** Phase 9 · Issue #57
**Status:** ready for build approval
**Depends on:** `008-github-pack`. Before building, re-read this spec against the code as built and report any mismatch instead of improvising.

## Summary

Agents add dependencies freely. The gate should notice new dependencies, leaked secrets and floating GitHub Action references, both in projects and in Project Init itself.

## User stories

### US1 — Secrets and vulnerable dependencies caught (P1)

The CI scaffold includes secret scanning and a dependency audit; CodeQL where the repository qualifies.

### US2 — Pinned actions (P1)

A check flags any third-party GitHub Action referenced by tag or branch instead of a full commit SHA, in projects and in Project Init's own workflows.

### US3 — Dependency changes reviewed (P1)

Any change to a lockfile or dependency manifest requires a dependency review finding before the guard passes.

## Functional requirements

- **FR-001 CI scaffold additions.** The 008 CI generator can add, each optional and on by default: a secret-scanning job using a pinned scanner action, a dependency audit for the detected package manager (for example `npm audit --audit-level=high`), and a CodeQL workflow when the repository is public or has GitHub code scanning available. Each job is least-privilege with only the permissions it documents as required.
- **FR-002 Local secret check.** A pack check scans the working tree changes (not history) for common secret patterns before push, reusing the 004 `before-write` patterns; findings name file and line, never the secret value.
- **FR-003 Action pinning check.** A check parses `.github/workflows/*.yml` and reports every `uses:` reference to a third-party action that is not a 40-character SHA. First-party local actions (`./`) and Docker digests are handled explicitly.
- **FR-004 Dependency review gate.** When the diff since the approved baseline touches a lockfile or manifest (`package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `requirements*.txt`, `pyproject.toml`, `*.csproj`, `go.mod`, `Cargo.toml`, `*.psd1` module manifests), the guard requires a `dependency-review` finding listing added and updated packages with versions and a verdict.
- **FR-005 Project Init itself.** Project Init's own workflows are pinned to SHAs and pass the FR-003 check; its CI runs the dependency audit.
- **FR-006 Limits.** Documentation states that secret scanning and audits find known patterns and advisories only.

## Success criteria

- **SC-001** A fixture with a tag-pinned action, a committed fake secret and an unreviewed new dependency fails with three precise findings.
- **SC-002** Project Init's own workflows pass the pinning check.
- **SC-003** Secret findings never include the secret value (test).
