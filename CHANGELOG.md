# Changelog

All notable changes to the public Project Init package are documented here. There are **no verified earlier public releases**; the numbers reflect the local development lineage.

## Unreleased — licensing and GitHub preview distribution

### Fixed
- Windows command discovery supports native executables such as `codex.exe` without requiring a `.cmd` shim. Batch dispatch preserves the selected absolute `.cmd`/`.bat` path, quotes ordinary arguments, and rejects unsafe shell expansion/control characters.
- Added Windows regressions for executable discovery, PATH precedence, batch paths and arguments containing spaces, conflicting working-directory shims, and unsafe argument rejection. Command windows stay hidden during execution.

### Changed
- Added the unmodified Apache License 2.0 and an attribution/provenance NOTICE covering original Project Init, legacy v1, and bundled Lean Kit code with maintainer authorization.
- Updated package and lockfile SPDX metadata; the package stays `private: true` to explicitly prevent accidental npm publication while supporting reviewed GitHub release tarballs.
- Updated release checks, documentation, and contributor terms. GitHub releases still require an explicitly created version tag; production acceptance remains pending.

## [2.1.0-preview.4] — 2026-10-25 (self-contained Factory candidate)

### Fixed
- Factory no longer requires users to maintain or know an external `C:\\Tools\\factory-kit` path.
- The normal `project-init factory --project . --apply` flow now installs/updates the complete bundled Claude + Codex Factory.
- Claude Factory preflight now points missing installations back to Project Init rather than a separate kit README.

### Changed
- Unified Factory source under `vendor/factory/`; existing `config.json` and `factory/backlog.md` remain preserved on updates.
- `--kit PATH` is retained only as an explicit developer override.
- Preview version advanced to `2.1.0-preview.4`.

### Compatibility
- Codex `backend-factory` and `backend-audit` skill behavior is unchanged.
- Factory routing remains backend→Codex (Claude fallback) and frontend→Claude.

## [2.1.0-preview.3] — 2026-10-25 (factory-stack candidate)

### Added
- Added a pinned dual-agent factory profile: Spec Kit as the default single spec owner, ECC as the shared engineering toolbox, and Factory as the execution/review loop.
- Added `project-init ecc` and `project-init factory` preview/apply commands.
- Added bundled repo-local Codex `backend-factory` and read-only `backend-audit` skills plus bridge-contract validation.
- Added a concise Factory stack cheat sheet and ownership documentation.

### Changed
- Spec Kit installation can wire both Codex and Claude integrations for clean existing repositories while preserving explicit version pins and preview-first execution.
- Preview version advanced to `2.1.0-preview.3`.

### Compatibility
- Preserves the Apache-2.0 release controls and Windows native Codex command-discovery/batch-dispatch fixes already on `main`.
- Backend defaults to Codex and frontend defaults to Claude. Claude backend fallback exists; Codex frontend fallback is intentionally not claimed until the Factory bridge becomes scope-aware.

## [2.1.0-preview.2] — 2026-10-19 (public-source candidate)

### Fixed
- User-scope Codex skill path now matches the documented `$HOME/.agents/skills` location, rather than the incorrect `$HOME/.codex/skills`.
- Explicit, reversible migration with `wire --backup-conflicts`: no silent overwrites; conflicting old skill directories are backed up before installing new skill files.
- Correct package name in rollback instructions and distinguish local skill installation from remote/web skill availability.
- Regression tests for personal Codex/Claude discovery paths, safe conflict refusal, preservation of old skills and idempotent migration.
- Cross-platform CI test harness: canonical temporary directories for macOS and Windows-compatible synthetic Codex executables.
- Git-native repository-root validation via `git rev-parse --show-prefix`; clean working tree and allowed-file safety rules remain mandatory.

### Publication status
- Preview source is proposed through [PR #1](https://github.com/Thugney/project-init/pull/1). No release tag or GitHub Release has been created.
- This preview was initially published without an OSI license; Apache-2.0 was adopted in a later untagged change on `main`.

## [2.1.0-preview.1] — 2026-10-19 (public-source candidate)

### Added
- Framework discovery, ranking, explicit choice and version-pinned installation previews for OpenSpec, Spec Kit and BMAD.
- Offline high-fidelity UI review and explicit screenshot baseline verification.
- Evidence-based drift gate with hashed specifications/source, test receipts, requirement findings and approval state.
- Bundled Lean Kit renderer and descriptive Codex/Claude skill templates.
- Bounded local foreground Codex runner with Git change scope checks.
- Local JSONL audit events and preservation of v1 architecture review scripts.

### Known limitations
- Not yet production accepted; live framework installers, Windows browser capture, and real in-client skill discovery require testing.
- Claude unattended runner and autonomous semantic inference are not implemented.
- No automatic releases, background execution, PR merge or deployment from Project Init.
- No public redistribution license selected yet.

[2.1.0-preview.1]: https://github.com/Thugney/project-init/tree/main
