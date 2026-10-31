# Implementation plan: Gated deployment

**Spec:** `specs/012-gated-deployment/spec.md`

## Design

- Extend `lib/github.mjs` with `deployPlan`, `deployApply`, `deployProtection`, `rollbackPlan`.
- Templates in `packs/github/templates/deploy/<target>.yml`, each with a header naming the documentation source and date (T001).
- Static validation via the same narrow workflow parser used in 009.

## Changes

| File | Change |
| --- | --- |
| `lib/github.mjs` | deploy commands |
| `packs/github/templates/deploy/` | target templates |
| `packs/github/checks/deploy-workflow` | FR-007 check |
| `bin/project-init.mjs` | `github deploy` subcommands |
| `docs/packs/github.md`, `docs/DEPLOYMENT.md` | environments, OIDC setup steps per target, rollback |

## Risks

- **Target documentation drift.** Mitigation: templates record source and date; check validates structure, not vendor specifics.
- **Accidental production deploys.** Mitigation: environment with required reviewers is mandatory in templates; check fails without it.

## Rollback

Delete the generated workflow; revert the pull request.
