# Feature specification: `github` pack

**Feature:** `008-github-pack`
**Roadmap:** Phase 8 · Issue #54
**Status:** ready for build approval
**Depends on:** `001-pack-mechanism`, `004-pack-hooks`, `007-local-first-ci`. Before building, re-read this spec against the code as built and report any mismatch instead of improvising.

## Summary

Project Init's own repository follows a release policy that consuming projects do not get. The `github` pack makes it reusable and checkable: naming rules, a least-privilege CI scaffold with the 007 cost defaults, a tag-triggered release workflow, CI results as gate evidence, a configurable AI-attribution policy, and a `ship` skill that walks a change from branch to release while stopping at each human decision.

## User stories

### US1 — Consistent names (P2)

Branches and pull request titles follow a configured pattern; violations are precise findings.

### US2 — CI and release workflows without hand-writing them (P1)

I get a previewed CI workflow built from my discovered checks and a release workflow, without touching workflows I already have.

### US3 — CI as evidence (P1)

The guard can require a successful CI run for the exact head commit before work is ready for my review, so I never relay "CI passed" by hand.

### US4 — My attribution rule enforced (P1)

I set the AI-attribution policy for a project (for example forbid), and commits or pull request descriptions breaking it are findings.

### US5 — Ship skill (P2)

`/project-init-ship` (Claude) and `$project-init-ship` (Codex) take approved, verified work through branch, pull request, CI and release tag, stopping for my decisions.

## Functional requirements

- **FR-001 Naming.** Configurable branch regex (default `^(feat|fix|docs|chore|refactor|test)/[a-z0-9][a-z0-9._-]*$`) and Conventional Commit PR-title regex. Checked by a pack check (current branch and, when available, PR title) and by a `commit-msg` hook for commit subjects.
- **FR-002 CI scaffold.** `project-init github ci plan|apply` generates `.github/workflows/project-init-ci.yml` from the configured checks with `permissions: contents: read`, the 007 defaults, and third-party actions pinned to full commit SHAs (resolved at generation time and shown in the plan). Never overwrites an existing file; an existing file of the same name is a conflict.
- **FR-003 Release scaffold.** `project-init github release plan|apply` generates a tag-triggered workflow that: requires the tag to equal `v` + the package version (or a configured version source), requires the tagged commit to be reachable from the default branch, runs the checks, marks tags containing a hyphen as pre-releases, creates a GitHub Release, and publishes to a registry only when explicitly configured.
- **FR-004 CI evidence.** With `ci.required: true` in project configuration, `guard` reads the check runs and commit statuses for the exact head commit through the GitHub REST API (token from `GH_TOKEN`/`GITHUB_TOKEN` or the authenticated `gh` CLI, never stored) and requires the configured workflow to have concluded successfully. Results are recorded as evidence with run URLs; `runsVerified` becomes true only then.
- **FR-005 Branch protection guidance.** `project-init github protection plan` prints recommended branch protection settings and the exact steps or API calls for the maintainer to apply. Project Init never changes branch protection itself.
- **FR-006 Attribution policy.** Configuration `attribution: forbid|allow|require`. `forbid` fails on `Co-Authored-By` trailers naming AI tools, "Generated with/by" lines naming AI tools, and configured patterns, in commit messages and the PR description. `require` checks for a configured trailer. Checked by the `commit-msg` hook and at verify time over the branch's commits.
- **FR-007 Ship skill.** For both agents: confirm guard state, create or reuse the branch per naming, push, open a PR using the repository's template filled with real evidence, wait for my review, read CI through FR-004, and on my explicit instruction create the release tag. Never merges, never tags without instruction.
- **FR-008 Offline behavior.** Without network or token, CI evidence is reported as `unavailable` and the guard blocks if `ci.required` is true.

## Out of scope

- Hosts other than GitHub.
- Changing repository settings or branch protection.

## Success criteria

- **SC-001** A fixture repository gets previewed CI and release workflows; existing workflows are untouched.
- **SC-002** A misnamed branch and a forbidden trailer each fail with a precise finding.
- **SC-003** With `ci.required`, the guard blocks until a successful CI run exists for the current head commit (tests use a recorded API fixture, not the network).
- **SC-004** Generated workflows pin every third-party action to a full SHA.
