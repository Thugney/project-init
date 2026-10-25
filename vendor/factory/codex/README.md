# Codex Factory skills

Repo-local Codex skills for the Project Init parallel-worktree Factory.

- `.agents/skills/factory-worker/SKILL.md` — implements tasks dynamically assigned `[CODEX]` in the Codex isolated worktree.
- `.agents/skills/factory-audit/SKILL.md` — read-only audit of the integrated Codex + Claude result.

`[CODEX]` means worker ownership for a specific job. It does **not** mean backend. Codex may own frontend, backend, tests, docs, migrations, or full-stack work when the Factory spec assigns it.

Install through the normal Project Init bootstrap:

```powershell
project-init init --project . --apply
```
