# Implementation plan: Supply chain in CI

**Spec:** `specs/009-supply-chain-ci/spec.md`

## Design

- Extend `packs/github/` with checks: `actions-pinned` (YAML `uses:` scan with a narrow line parser, no YAML dependency), `secrets-diff` (patterns shared with 004), and the dependency-review requirement.
- Extend `lib/github.mjs` CI generation with optional supply-chain jobs; scanner and CodeQL actions pinned by SHA at generation.
- Guard: new evidence type `dependency-review` required when manifest/lockfile paths changed since the baseline source revision.
- Pin Project Init's own `.github/workflows/*.yml` actions to SHAs, keeping tag comments for readability.

## Changes

| File | Change |
| --- | --- |
| `packs/github/checks/*` | new checks |
| `lib/github.mjs`, `lib/guard.mjs` | jobs and evidence |
| `.github/workflows/ci.yml`, `release.yml` | SHA pins, audit job |
| `.github/dependabot.yml` | keep GitHub Actions updates so pinned SHAs stay current |
| `docs/packs/github.md`, `docs/SECURITY-MODEL.md`, `docs/VERIFICATION.md` | what is and is not covered |

## Risks

- **Pinned SHAs going stale.** Mitigation: Dependabot for actions (already configured) updates SHAs.
- **Noisy audits.** Mitigation: configurable level, default high.

## Rollback

Disable individual checks in pack configuration; revert the pull request.
