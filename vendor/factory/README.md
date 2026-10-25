# Bundled Factory distribution

Project Init ships the reviewed software-factory templates it installs into a target repository.

- `claude/` contains the Claude Code orchestrator skill, factory-prefixed agents, board helper and Codex bridge.
- `codex/` contains the repo-local Codex backend worker and read-only backend audit skills.
- `runtime/` contains the Factory backlog and dashboard templates.

Normal users do not need to know this path or provide a Factory source directory. Use:

```powershell
project-init factory --project .          # preview
project-init factory --project . --apply  # install/update
```

`--kit PATH` is retained only as an explicit developer override for testing a different Claude Factory source. Existing target `config.json` and `factory/backlog.md` are preserved during updates.

The Claude Factory source was supplied by the Project Init maintainer and is distributed as part of this Apache-2.0 project. External Spec Kit and ECC source is not vendored here.
