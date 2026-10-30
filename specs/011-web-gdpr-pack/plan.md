# Implementation plan: `web-gdpr` pack

**Spec:** `specs/011-web-gdpr-pack/spec.md`

## Design

- `packs/web-gdpr/`: configuration defaults (signal lists, locales), privacy checklist in `review/`, Node check scripts run through the check runner: `privacy-signals`, `locales`.
- Diff source: `git diff` between the baseline's `sourceRevision` and the working tree, file-scoped, run by the check script.
- Guard: new evidence type `privacy-review`, required when the latest `privacy-signals` receipt lists flagged files; stale when those files change.
- Accessibility: proposal only, through check discovery when a runner is detected.

## Changes

| File | Change |
| --- | --- |
| `packs/web-gdpr/` | new pack |
| `lib/guard.mjs` | `privacy-review` evidence requirement |
| `tests/fixtures/web-gdpr/` | small web fixture with and without signals |
| `docs/packs/web-gdpr.md` | usage, checklist, limits (not legal advice) |

## Risks

- **False positives on field names.** Mitigation: configurable lists, findings name the signal, review can mark not applicable with a reason.

## Rollback

`pack remove web-gdpr`; revert the pull request.
