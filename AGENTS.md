# Instructions for coding agents working on Project Init

This file is for Codex, Claude Code and any other agent changing **this repository**. `CLAUDE.md` imports it, so both agents follow the same rules.

## What this project is

Project Init is a personal development harness around Claude Code and Codex: discovery, one spec owner, evidence and a fail-closed gate. Read `README.md`, `docs/INVARIANTS.md` and `docs/ROADMAP-2.2.md` before changing behavior. It is not an orchestrator, a business-operations system or a background service; do not add scheduling, daemons or network listeners.

## How work is done here

1. **Spec first.** Work comes from an approved feature in `specs/NNN-name/` (`spec.md`, `plan.md`, `tasks.md`); `specs/README.md` gives the build order and dependencies. Implement only what the approved spec covers. If the spec is wrong or incomplete, stop and say so instead of improvising scope. Specs marked *drafted ahead* were written before their dependencies existed: re-read them against the current code first and report mismatches before coding.
2. **One feature per branch and pull request.** Branch names: `feat/NNN-short-name`, `fix/short-name`, `docs/short-name`. Keep unrelated changes out.
3. **Follow the task list.** Work through `tasks.md` in order, respecting `[P]` (parallel-safe) markers, and tick each task (`- [x]`) when it is done and tested.
4. **Tests with every change.** New behavior gets regression tests in `tests/`, including the failure and refusal paths. Guards and authorization changes need tests that prove they fail closed.
5. **Before reporting done:** run `npm run test:all` and `npm run smoke`. Report the exact results. If a platform is unavailable, say which tests did not run.
6. **Keep docs and changelog current.** Update the relevant `docs/*.md`, `docs/COMMANDS.md` for CLI changes, and add an entry under *Unreleased* in `CHANGELOG.md`. Add every new `lib/*.mjs` file to the `check` script in `package.json`.

## Rules that must not be broken

- The invariants in `docs/INVARIANTS.md` hold. In particular: never overwrite existing `AGENTS.md`/`CLAUDE.md` content outside a marked managed block, never create a competing spec or task list, dry-run by default for anything that writes or installs, no automatic commit, push, merge or deploy from the CLI.
- **No AI attribution.** Do not add `Co-Authored-By` trailers, "Generated with" lines or any AI author, co-author or contributor credit to commits, pull requests, changelog entries or code comments.
- **No secrets or real data.** No credentials, tokens, tenant IDs, customer data or real screenshots in code, tests, fixtures or docs. Fixtures use obviously fake values.
- **Honest status.** Never claim a test, check, review or approval happened unless it did. Distinguish "implemented", "tested" and "verified". Document what each new capability proves and what it does not.
- **No new runtime dependencies** for the Node CLI without the maintainer's approval. Project Init deliberately has none.
- **Pin, don't float.** External tools are installed only at an explicit exact version, after a preview.

## Decisions already made

These are settled. Use them; do not re-decide them.

- **Packs:** generic packs ship inside this repository under `packs/`. The maintainer's personal values (for example a Norwegian `.SYNOPSIS` or a specific log path) belong in a separate private overlay pack, never in the public defaults.
- **BMAD:** support the latest stable release, **v6.12.0**. BMAD v7 is pre-release with a different layout and is out of scope until it is stable. Read BMAD's actual layout from an installed copy; never guess paths.
- **Default methodology:** Spec Kit stays the default in guided setup. BMAD is first-class and chosen per project.
- **Model tiers:** the maintainer chooses which concrete models map to `top`, `mid` and `fast`. Do not pick models or providers on the maintainer's behalf; leave them as required configuration.
- **Default data class:** `internal`, unless a project declares otherwise.

## Repository map

- `bin/project-init.mjs` — CLI entry point and command parsing.
- `lib/core.mjs` — state, discovery, recommendation, framework selection/installation, baselines and fingerprints.
- `lib/bootstrap.mjs` — guided `init` (prerequisites, framework, ECC, Factory, skills).
- `lib/prepare.mjs` — native feature discovery and preparation.
- `lib/check-discovery.mjs` — check proposals from project manifests.
- `lib/skills.mjs` — generated skills and the managed rules block.
- `lib/factory.mjs` and `vendor/factory/` — bundled Factory (orchestrator skills, workers, board).
- `lib/guard.mjs`, `lib/visual-gate.mjs`, `lib/execution.mjs` — evidence and gates.
- `tests/` — Node test runner suites; `vendor/lean-kit/tests/` — Lean Kit.
- `legacy/v1/` — preserved v1 files; never modify.
