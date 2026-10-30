# Feature specification: Gated deployment

**Feature:** `012-gated-deployment`
**Roadmap:** Phase 12 · Issue #58
**Status:** ready for build approval
**Depends on:** `008-github-pack`. Before building, re-read this spec against the code as built and report any mismatch instead of improvising.

## Summary

The last mile for projects that deploy: the guard passes, the maintainer approves, CI deploys. Project Init scaffolds and checks a deployment workflow that waits for approval in a protected GitHub environment, uses federated credentials instead of stored deploy secrets where the target supports it, and has a tested rollback. Project Init never deploys anything itself.

## User stories

### US1 — Approve deployment from my phone (P1)

A deployment workflow waits on a protected GitHub environment with me as required reviewer, so I approve or reject from GitHub's mobile app.

### US2 — No long-lived deploy secrets (P1)

Where the deployment target supports OpenID Connect federation, the workflow authenticates with it and stores no deploy secret.

### US3 — One-command rollback (P1)

I can roll back to the previous release with one documented command, and that path is exercised in tests.

## Functional requirements

- **FR-001 Scaffold.** `project-init github deploy plan|apply --target <name>` generates `.github/workflows/project-init-deploy.yml` triggered by a published release (or a configured branch), with a job bound to a named environment (default `production`). Never overwrites an existing file.
- **FR-002 Targets.** Ship templates for a small set of targets, each recorded from the target's current documentation in task T001: a static site host with OIDC support, Azure (federated credentials with `azure/login`), and a generic `script` target that runs a project-provided deploy script. Additional targets are out of scope.
- **FR-003 Least privilege.** The deploy job requests only `id-token: write` (for OIDC) and `contents: read`; actions pinned to SHAs (as in 008/009).
- **FR-004 Environment guidance.** `project-init github deploy protection` prints how to create the environment with required reviewers and deployment branch/tag rules; Project Init does not change repository settings.
- **FR-005 Gate link.** The deploy workflow runs only for a release whose tag passed the 008 release workflow; a pre-release tag deploys only to a non-production environment when configured.
- **FR-006 Rollback.** Each template documents and implements rollback as re-running the deployment for the previous release tag (`workflow_dispatch` with a tag input). `project-init github deploy rollback-plan` prints the exact steps for the current repository.
- **FR-007 Check.** A pack check validates an existing deploy workflow: environment present, no plaintext secrets in `env`, OIDC used when the target supports it, actions pinned.

## Out of scope

- Deploying from Project Init, managing infrastructure, or configuring cloud identities (documented as maintainer steps).

## Success criteria

- **SC-001** A fixture deployment workflow is generated, waits for environment approval (validated statically), uses no stored deploy secret for OIDC targets, and passes the FR-007 check.
- **SC-002** A rollback dispatch for the previous tag is generated and documented; a test validates the workflow's dispatch inputs.
- **SC-003** Maintainer-run live check on one real project recorded in the acceptance report.
