# Changelog

All notable changes to the public Project Init package are documented here. There are **no verified earlier public releases**; the numbers reflect the local development lineage.

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
- No OSI redistribution license has been chosen; the preview remains `UNLICENSED`.

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
