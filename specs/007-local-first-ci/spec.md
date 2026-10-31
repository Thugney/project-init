# Feature specification: Local-first checks and CI cost

**Feature:** `007-local-first-ci`
**Roadmap:** Phase 7 · Issue #56
**Status:** ready for build approval
**Depends on:** `004-pack-hooks` (pre-push hook). Spec 008 consumes the CI defaults defined here. Before building, re-read this spec against the code as built and report any mismatch instead of improvising.

## Summary

CI should confirm work, not be the first place a problem shows up, and a documentation-only change should not run a six-job matrix. This feature adds a pre-push hook that runs the same fast checks as CI, changes the agent skills so agents finish on local checks instead of waiting on CI, defines reusable CI cost defaults, and applies them to Project Init's own workflow.

## User stories

### US1 — Problems found before pushing (P1)

When I or an agent push, the fast checks that CI would run run first; a failing check stops the push with the findings.

### US2 — Agents don't wait on CI (P1)

Workers finish when local checks pass. CI results are read later, at human review (spec 008); only a red run sends work back.

### US3 — Cheap CI (P1)

Documentation-only changes run one quick job; dependencies are cached; superseded runs are cancelled. Project Init's own CI follows this.

## Functional requirements

- **FR-001 Fast check set.** Check configuration gains an optional `fast: true` flag per check. `project-init verify --fast --execute` runs only fast checks. Discovery proposes `lint`, `typecheck`, `check` and unit `test` scripts as fast by default; the maintainer can change it.
- **FR-002 Pre-push hook.** A `pre-push` hook (via the 004 hook mechanism, provided by the `core` hooks of Project Init itself, not a domain pack) runs `verify --fast --execute` and blocks on failure. It has a matching verify-time check by construction.
- **FR-003 Skill rule.** The build and verify skills, the Factory worker contracts and the managed agent rules state: finish on local checks; do not poll or wait for CI; CI results are evaluated at human review.
- **FR-004 CI defaults template.** A versioned template fragment for GitHub Actions with: path filters (documentation and Markdown-only changes run a single quick job), dependency caching for the detected package manager, and `concurrency` with `cancel-in-progress` for pull requests. Stored in Project Init for use by spec 008.
- **FR-005 Project Init's own CI.** `.github/workflows/ci.yml` adopts the defaults: docs-only pull requests run one Ubuntu job (syntax check plus link check of changed Markdown); code changes keep the full matrix; caching and concurrency added.
- **FR-006 Self-hosted runner guidance.** Documentation describes self-hosted runners as an option for private repositories only, with the warning never to use them for public repositories that accept outside pull requests.
- **FR-007 Honesty.** Local fast checks are labelled as local evidence; they do not replace CI evidence in the guard.

## Success criteria

- **SC-001** In a fixture repository, the pre-push hook blocks a push whose fast checks fail and allows it when they pass.
- **SC-002** A docs-only change to Project Init runs one job in CI; a `lib/` change runs the full matrix (verified on real pull requests and recorded in the PR).
- **SC-003** `verify --fast` runs only checks flagged fast; tests.
