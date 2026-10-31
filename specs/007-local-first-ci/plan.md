# Implementation plan: Local-first checks and CI cost

**Spec:** `specs/007-local-first-ci/spec.md`

## Design

- `fast` flag: extend `validateChecks` in `lib/core.mjs` to accept an optional boolean; `runChecks` gains a `fast` filter; receipts record `scope: fast|full`.
- Discovery (`lib/check-discovery.mjs`) marks proposals fast by script name, preserving existing names and mappings.
- Pre-push: a built-in hook definition rendered by the 004 mechanism for Git; Project Init's own hooks are treated as an always-available internal pack named `core`.
- CI template: `assets/ci/github-actions-defaults.yml` (fragments for paths filter, cache, concurrency) with a version header, consumed by 008.
- Own CI: split `ci.yml` into a change-detection job and conditional jobs; docs-only path list maintained in one place.

## Changes

| File | Change |
| --- | --- |
| `lib/core.mjs`, `lib/check-discovery.mjs` | `fast` flag, `verify --fast` |
| `lib/hooks.mjs` (from 004) | built-in `core` pre-push hook |
| `lib/skills.mjs`, `vendor/factory/**` | agent rules and worker contracts per FR-003 |
| `assets/ci/github-actions-defaults.yml` | new template |
| `.github/workflows/ci.yml` | adopt defaults |
| `docs/CI.md`, `docs/CHECK-DISCOVERY.md`, `docs/COMMANDS.md` | local-first, fast checks, runner guidance |

## Risks

- **Skipping needed CI on mislabelled changes.** Mitigation: conservative docs-only path list (`**/*.md`, `docs/**` only); anything else runs the full matrix.
- **Pre-push too slow.** Mitigation: fast set only; documented.

## Rollback

Remove the hook with `hooks apply` after disabling; revert workflow changes by reverting the pull request.
