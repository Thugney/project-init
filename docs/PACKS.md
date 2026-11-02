# Domain packs

A domain pack is an opt-in directory of reusable rules, skills, check proposals, and recommendations. Packs carry knowledge, not project or tenant data. The bundled `example` pack demonstrates the format; it is not a production policy pack.

Project Init never adds a pack automatically. `inspect` and `recommend` may list bundled packs whose `appliesTo` patterns match repository files. Review the suggestion and choose whether to add it.

Pack management requires Project Init state. `project-init init --project .` is a read-only preview; apply setup first with `project-init init --project . --apply`. Until setup is applied, `pack add` and `pack remove` explain this prerequisite and make no changes.

## Commands

```powershell
project-init pack list --project .
project-init pack add example --project .
project-init pack add .\path\to\pack --project .
project-init pack add git+https://example.invalid/org/pack.git#v1.2.3 --project .
project-init pack add git+https://example.invalid/org/pack.git#0123456789abcdef0123456789abcdef01234567 --project .
project-init pack remove example --project .
```

`add` and `remove` print a plan and write nothing unless `--apply` is supplied. `add --apply` copies the pack, installs its rule and skill content, updates the lock, and records an audit event. `remove --apply` removes unchanged installed files and records an audit event. Conflicts are listed; user-edited skill files are kept.

Git sources accept an exact tag or full 40-character commit SHA. Branch names and missing refs are refused. Fetch and checkout do not recurse into submodules, and Git hooks are disabled for those operations. Credentials embedded in a URL are stripped from the stored source value.

## Manifest

Each pack has a `pack.json` at its root:

```json
{
  "schemaVersion": 1,
  "name": "example",
  "version": "1.0.0",
  "description": "Demonstration pack.",
  "appliesTo": ["**/*.example"],
  "provides": {
    "rules": ["rules/example.md"],
    "skills": [{"name": "hello", "path": "skills/hello/SKILL.md"}],
    "checks": [{"name": "example-smoke", "argv": ["npm", "run", "smoke"]}],
    "hooks": [],
    "review": [],
    "mcp": [{"name": "Context7", "description": "Documentation lookup."}]
  }
}
```

`name` uses 2–64 lowercase kebab-case characters. `version` is an exact SemVer value. `appliesTo` may be empty. `provides` accepts `rules`, `skills`, `checks`, `hooks`, `review`, and `mcp`; unknown manifest or `provides` keys are refused.

- `rules` lists Markdown fragments under `rules/`.
- `skills` lists `{name, path}` entries. Each skill path points to a `SKILL.md` under `skills/`; Project Init installs it as `pack-<pack>-<skill>` for Codex and Claude.
- `checks` lists `{name, argv, cwd?}` proposals. Preparation prefixes names as `<pack>:<name>` and validates commands with the existing check rules. Adding a pack never runs a check.
- `hooks` and `review` are reserved declarations in this feature. They are validated and stored, but are not activated.
- `mcp` lists recommendations with a required `name`. `pack list` displays them; Project Init does not install MCP servers.

`appliesTo` uses `*`, `**`, and `?` wildcards over repository-relative paths. Suggestions include the matching pattern and file.

## Storage, lock, and baseline

Applied content is copied to `.project-init/packs/<name>/`. `.project-init/packs.json` records schema version, source, version, resolved Git commit when applicable, SHA-256 content hash, and hashes for installed skill files. The pack hash is computed from the sorted relative file paths and their bytes. `pack list` and `status` recompute it and report `current` or `modified`.

The lock file is part of the approved baseline. Adding, removing, editing, or upgrading a pack changes `.project-init/packs.json` and makes the baseline stale until it is reviewed and approved again.

Rule fragments from all installed packs are rendered in pack-name order inside one project-scoped managed block in root `AGENTS.md` and `CLAUDE.md`:

```markdown
<!-- project-init:pack-rules:start -->
...
<!-- project-init:pack-rules:end -->
```

Only content inside this block is updated. Existing content outside it is preserved byte-for-byte. Missing files are created with only the block. Malformed or duplicate markers stop the operation without writing.

## Safety and limits

Pack content is never executed by `add` or `remove`. Refused inputs include symbolic links, absolute or parent-traversing manifest paths, files matching the existing secret-file pattern, manifests over 64 KiB, packs over 2 MiB, and packs containing more than 500 files. The limits include `pack.json`.

An installed skill is removed only when its current bytes match the recorded hash. If it was edited, removal keeps it and reports a conflict. Stored pack content that was changed by hand is also kept and reported. MCP entries are recommendations only; hook and review declarations remain inactive.

## What this proves

The lock detects content changes and binds the pack to the local baseline. It is not a signature or proof of publisher identity. A pack's rules and skills can influence agent behavior, so review them before applying. Proposed checks run only through the configured verification process. The pack mechanism does not prove a check is complete, make MCP recommendations safe to install, or activate hooks.
