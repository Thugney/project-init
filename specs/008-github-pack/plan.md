# Implementation plan: `github` pack

**Spec:** `specs/008-github-pack/spec.md`

## Design

- Pack `packs/github/`: rule fragment, naming and attribution checks (Node scripts run through the check runner), `commit-msg` hook, review checklist, ship skill for both agents, configuration defaults.
- `lib/github.mjs`: workflow generation (`ci`, `release`), SHA resolution for actions (via `gh api` or REST; plan shows tag → SHA), protection guidance, CI evidence reader.
- CI evidence: REST `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` and `/status`; owner/repo from the `origin` remote; token from environment or `gh auth token` at call time only.
- Guard integration: new evidence type `ci` in `lib/guard.mjs`, required when configured; stale when head commit changes.
- Templates reuse the 007 CI defaults and Project Init's own `release.yml` as the reference design.

## Changes

| File | Change |
| --- | --- |
| `packs/github/` | new pack |
| `lib/github.mjs` | new |
| `lib/guard.mjs`, `lib/core.mjs` | `ci` evidence; status shows it |
| `bin/project-init.mjs` | `github ci|release|protection` subcommands |
| `tests/fixtures/github-api/` | recorded API responses |
| `docs/packs/github.md`, `docs/VERIFICATION.md`, `docs/COMMANDS.md` | usage and limits |

## Risks

- **Token handling.** Mitigation: never persisted or logged; tests assert absence.
- **API rate limits or outages.** Mitigation: `unavailable` state, clear guard message.
- **Action SHA resolution wrong.** Mitigation: plan shows each tag and SHA for review.

## Rollback

`pack remove github`; generated workflow files are ordinary files the maintainer can delete; reverting removes the commands.
