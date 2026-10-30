# Feature specification: Domain pack mechanism

**Feature:** `001-pack-mechanism`
**Roadmap:** Phase 1 in `docs/ROADMAP-2.2.md` · Issue #47
**Status:** ready for build approval

## Summary

Project Init applies the same rules and checks to every repository. A domain pack is a versioned, pinned bundle of rules, skills, check proposals and review checklists that a project opts into. This feature delivers the pack mechanism and its safety properties. Concrete packs (PowerShell/M365, GitHub, web/GDPR) and hook rendering are separate features.

## User stories

### US1 — Add a pack to a project (priority P1)

As the maintainer, I add a pack to a project so its rules and skills reach both agents, after previewing exactly what will change.

**Acceptance scenarios**

1. Given a project with Project Init state, when I run `project-init pack add <source> --project .`, then I see a read-only plan listing the pack name, version, source, content hash, files that will be created or changed, and conflicts, and nothing is written.
2. Given the same command with `--apply`, then the pack content is stored, the lock file records it, rules and skills are installed, and an audit event is written.
3. Given a pack source that fails validation, then `add` refuses with a precise reason and writes nothing.

### US2 — A pack change invalidates the approved baseline (P1)

As the maintainer, I want any change to a project's packs to invalidate an approved baseline, because packs change what agents are told and checked against.

**Acceptance scenarios**

1. Given a registered baseline, when a pack is added, removed or upgraded, then `project-init check --project .` reports the baseline as not current and names the lock file as modified.
2. Given a pack's stored content is edited by hand after adding, then `pack list` and `status` report the pack as modified.

### US3 — Remove a pack cleanly (P2)

As the maintainer, I remove a pack and get my project back to its previous state without losing my own edits.

**Acceptance scenarios**

1. Given an added pack, when I run `pack remove <name> --apply`, then its rules block entries, the skills it installed and its lock entry are removed, and an audit event is written.
2. Given I edited a skill file the pack installed, then removal leaves that file in place and reports it as a conflict.

### US4 — See which packs fit a project (P3)

As the maintainer, I see suggested packs when inspecting or recommending, so I know a pack exists for my kind of work. Nothing is added automatically.

## Functional requirements

- **FR-001 Manifest.** A pack is a directory containing `pack.json` with `schemaVersion: 1`, `name` (lowercase kebab-case, 2–64 characters), `version` (exact SemVer), `description`, `appliesTo` (list of glob patterns, may be empty) and `provides` with optional `rules`, `skills`, `checks`, `hooks`, `review` and `mcp` entries. Unknown top-level keys are refused.
- **FR-002 Sources.** `add` accepts: the name of a pack bundled in this package's `packs/` directory; a local directory path; or `git+<url>#<ref>` where `<ref>` is a tag or a full 40-character commit SHA. Branch names and missing refs are refused.
- **FR-003 Commands.** `project-init pack list`, `pack add <source>`, `pack remove <name>`. `add` and `remove` are read-only plans unless `--apply` is given.
- **FR-004 Storage and lock.** Applied packs are copied into `.project-init/packs/<name>/`. `.project-init/packs.json` (`schemaVersion: 1`) records for each pack: name, version, source, resolved ref (for Git sources), and a content hash.
- **FR-005 Content hash.** The content hash is SHA-256 over the sorted list of relative file paths and their bytes. `pack list` and `status` recompute it and report each pack as `current` or `modified`.
- **FR-006 Baseline.** When `.project-init/packs.json` exists, it is included in the baseline fingerprint, so adding, removing, upgrading or modifying the lock invalidates an approved baseline.
- **FR-007 Rules.** Each pack's `rules/*.md` fragments are rendered, in pack-name order, into one project-scoped managed block delimited by `<!-- project-init:pack-rules:start -->` and `<!-- project-init:pack-rules:end -->` in the project-root `AGENTS.md` and `CLAUDE.md`. A missing file is created containing only the block. Content outside the markers stays byte-identical. A malformed or duplicated marker pair is a conflict and nothing is written.
- **FR-008 Skills.** Each pack skill is installed into the project-local Codex and Claude skill locations used by `wire --scope project`, named `pack-<pack>-<skill>`. An existing file at a target path that Project Init did not install for that pack is a conflict and is not overwritten.
- **FR-009 Check proposals.** A pack may declare static checks (`name`, `argv`, optional `cwd`). Preparation includes them as proposals alongside discovered checks, named `<pack>:<name>`, subject to the existing check validation and runner allowlist. They are never executed by `pack add`.
- **FR-010 Declared but inactive items.** `hooks` and `review` entries are validated and stored but not activated by this feature. `mcp` entries are shown as recommendations in `pack list` only; nothing is installed.
- **FR-011 Removal.** `remove` deletes only files whose current hash matches what the pack installed; modified files are reported as conflicts and kept. The pack's rules are removed from the managed block; the block markers are removed when no packs remain.
- **FR-012 Suggestions.** `inspect` and `recommend` include a `packs` list of bundled packs whose `appliesTo` patterns match files in the repository, each with the matching reason. They never add a pack.
- **FR-013 Safety.** Pack content is never executed during `add` or `remove`. Refuse: symbolic links; paths containing `..` or absolute paths; files matching the existing secret-file pattern; a manifest over 64 KiB; a pack over 2 MiB or 500 files. Git sources are fetched without submodules and without running hooks.
- **FR-014 Audit.** `pack-added` and `pack-removed` audit events record name, version, source and content hash.
- **FR-015 Packaging.** The `packs/` directory is included in the npm package `files`. This feature ships one bundled example pack used by the tests and documentation, clearly labelled as an example.

## Out of scope

- Concrete domain packs (PowerShell/M365, GitHub, web/GDPR, tenant configuration).
- Rendering hooks for clients (roadmap Phase 4).
- Check-discovery adapter code inside packs (introduced with the PowerShell pack).
- Automatic pack updates.

## Success criteria

- **SC-001** A synthetic pack can be added, pinned, hashed into the baseline and removed cleanly, with regression tests.
- **SC-002** Adding, removing or editing a pack makes `check` report the baseline as not current.
- **SC-003** Conflicts in `AGENTS.md`/`CLAUDE.md` or skill paths are reported and leave every file unchanged.
- **SC-004** Each refusal in FR-013 has a regression test.
- **SC-005** `npm run test:all` passes on Windows, Linux and macOS in CI.
