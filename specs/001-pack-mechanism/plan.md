# Implementation plan: Domain pack mechanism

**Spec:** `specs/001-pack-mechanism/spec.md`

## Technical context

- Node.js ≥ 20.19, ES modules, no runtime dependencies (do not add any).
- Tests: Node's built-in test runner (`node --test`), temporary directories, synthetic fixtures. Follow the style of `tests/core.test.mjs` and `tests/preparation.test.mjs`.
- Must hold every invariant in `docs/INVARIANTS.md`, especially PI-003 (preserve `AGENTS.md`/`CLAUDE.md`), PI-012 (no automatic commit/push) and PI-018 (dry-run, audit, idempotency).

## Design

### New module `lib/packs.mjs`

- `loadPackSource(root, source)` → resolves a bundled name, local path or `git+<url>#<ref>` into a temporary directory. Git: `git clone --no-checkout --filter=blob:none` or a shallow fetch of the tag or SHA, then `git -c core.hooksPath=/dev/null checkout`, never `--recurse-submodules`. Use `spawnSync` with `windowsHide: true`, as elsewhere in `lib/`.
- `validatePack(dir)` → enforces FR-001 and FR-013 and returns the parsed manifest and file list.
- `packHash(dir)` → FR-005.
- `packPlan(root, source)` / `applyPack(root, source)` → FR-003, FR-004, FR-007, FR-008, FR-014.
- `removePlan(root, name)` / `applyRemove(root, name)` → FR-011.
- `listPacks(root)` → lock entries plus `current`/`modified` state plus MCP recommendations (FR-005, FR-010).
- `suggestPacks(root, discovery)` → FR-012, reading bundled `packs/*/pack.json`.
- `packCheckProposals(root)` → FR-009, consumed by `lib/prepare.mjs`.

Use the existing helpers from `lib/core.mjs` (`projectFile`, `statePath`, `atomicJson`, `readJson`, `hashBytes`, `audit`, `assertNotLink`, `isWithin`, `fail`) instead of new ones.

### Managed rules block

Implement a small project-scoped block writer modelled on `withRules` in `lib/skills.mjs` (user-scope block), with different markers (FR-007). Share the marker-parsing logic if it can be extracted without changing `wire`'s behavior or tests; otherwise keep a separate function.

### Changes to existing files

| File | Change |
| --- | --- |
| `bin/project-init.mjs` | `pack list`, `pack add`, `pack remove` commands; usage text; exit code 1 when `--apply` is refused |
| `lib/core.mjs` | `manifestFingerprint` includes `.project-init/packs.json` when present (FR-006); `discover`/`recommendation` attach `packs` suggestions (FR-012) without changing existing ranking scores |
| `lib/prepare.mjs` | merge `packCheckProposals` into check proposals, prefixed `<pack>:` (FR-009) |
| `lib/skills.mjs` | only if marker parsing is shared |
| `packs/example/` | bundled example pack: `pack.json`, one rule fragment, one skill, one check proposal, one MCP recommendation |
| `package.json` | add `packs/` to `files`; add `node --check lib/packs.mjs` to `check` |
| `docs/PACKS.md` | new: what a pack is, manifest reference, sources, lock, baseline effect, removal, limits, what packs do and do not prove |
| `docs/COMMANDS.md`, `docs/INVARIANTS.md`, `README.md` | document the commands; add an invariant row for packs; one line in README daily use |
| `CHANGELOG.md` | entry under Unreleased |

### Lock file shape

```json
{
  "schemaVersion": 1,
  "packs": [
    {
      "name": "example",
      "version": "1.0.0",
      "source": "bundled:example",
      "ref": null,
      "sha256": "<content hash>",
      "installed": [{"path": ".claude/skills/pack-example-hello/SKILL.md", "sha256": "<hash>"}]
    }
  ]
}
```

`installed` lets removal delete only unmodified files (FR-011).

## Risks

- **Marker handling in user files.** Mitigation: refuse on malformed or duplicate markers; byte-for-byte tests on content outside the markers, including CRLF files.
- **Git source safety.** Mitigation: no hooks, no submodules, tag or SHA only, size and file-count limits, symlink refusal; tests use a local bare repository fixture, not the network.
- **Windows paths.** Mitigation: normalise to forward slashes in the lock; Windows CI already runs.

## Rollback

Pure addition behind new commands. Reverting the pull request removes the feature; projects that added packs keep a readable lock file and a marked block they can delete by hand, as `docs/PACKS.md` explains.
