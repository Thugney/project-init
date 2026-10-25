# Bundled Factory distribution

Project Init ships the reviewed software-factory templates installed into a target repository.

- `claude/` contains the Factory orchestrator, generic Claude worker/review agents, board helper, worktree manager, and Codex worker bridge.
- `codex/` contains repo-local generic `factory-worker` and read-only `factory-audit` skills.
- `runtime/` contains Factory backlog/dashboard templates.

## Worker architecture

Codex and Claude are **general workers**, not backend/frontend roles. Factory assigns independent work units from the approved spec and runs both in isolated Git worktrees. Their branches are merged into a third integration worktree for tests/review/human approval.

Normal users use:

```powershell
project-init init --project .
project-init init --project . --apply
```

The lower-level `project-init factory` command remains an advanced component control. Existing Factory config is migrated from the legacy backend/frontend schema while preserving user settings such as test commands; `factory/backlog.md` remains preserved.

Legacy Project Init-managed `backend-factory`, `backend-audit`, and `codex_backend.sh` files are removed during migration when their content still matches the old managed templates. Customized legacy files are preserved rather than deleted.
