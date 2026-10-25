# Getting started — new vs existing project

One page. PowerShell examples; on macOS/Linux use the same commands with `/` paths.

```text
Is the folder empty or missing?  ── yes ──> NEW
                                 └─ no  ──> EXISTING (has files or Git)
```

Project Init detects this itself. You run the same `init` command either way.

Spec Kit commands below use the installed skill names (`/speckit-*` in Claude Code, `$speckit-*` in Codex). If your Spec Kit version shows dot names (`/speckit.specify`), use those.

---

## NEW project

```powershell
# 1. Preview. The folder may not exist yet.
project-init init --project C:\Work\NewApp

# 2. Apply. Creates the folder, runs git init, installs Spec Kit + ECC + Factory.
#    Answer Y/n for each missing prerequisite (CLIs, auth, uv, Python, Git).
project-init init --project C:\Work\NewApp --apply

cd C:\Work\NewApp
git add -A; git commit -m "chore: project-init bootstrap"
```

```text
3. Constitution   Claude: /speckit-constitution   Codex: $speckit-constitution
                  stack, coding rules, security rules, test policy
4. First spec     /speckit-specify  "scaffold: <stack>, health endpoint, test runner, CI"
5. Plan + tasks   /speckit-plan  ->  /speckit-tasks
6. Commit         git add -A; git commit -m "spec: 001-scaffold"
7. Build          Claude Code: /factory spec specs/001-scaffold
```

8. After the scaffold PR is merged, set the test command so later jobs are tested after integration:

```json
// .claude/skills/factory/config.json
"base_branch": "main",
"test_command": "npm test"
```

From here, use the **daily loop** below.

---

## EXISTING project

```powershell
cd C:\Work\ExistingApp

# 1. Preview. Read it: it lists what it will add and what it preserves.
project-init init --project .

# 2. Apply. Spec Kit preserve-merge (no --force), ECC collision checks,
#    Factory writes only its own paths. Unrelated dirty work is kept.
project-init init --project . --apply
```

3. Set Factory config right away. The repo already has a branch and tests:

```json
// .claude/skills/factory/config.json
"base_branch": "main",
"test_command": "npm test",
"high_risk_paths": [ "...add your own sensitive folders..." ]
```

```text
4. Constitution   /speckit-constitution  "derive rules from this codebase: stack,
                  conventions, test command, auth pattern"
5. Commit         git add -A; git commit -m "chore: project-init bootstrap"
                  (/factory refuses tracked uncommitted changes; worktrees start from HEAD)
6. First job      keep it small, e.g. one endpoint + one UI change
```

**Existing-project checks:**
- Already has **BMAD or OpenSpec**? `init` stops on purpose. Don't run two spec owners; use that methodology instead of the Factory profile.
- Already has **Spec Kit** (`.specify/`)? It is reused, not overwritten.
- Already ran **Project Init** before? `init` resumes the recorded state.

---

## Daily loop (both)

```text
/speckit-specify "<feature>"        -> specs/NNN-x/spec.md
/speckit-plan  ->  /speckit-tasks    -> plan.md, tasks.md
review + commit the spec
/factory spec specs/NNN-x            -> Codex + Claude build in parallel worktrees
                                       -> integration -> tests -> 4 reviews -> fixes
watch: cd factory; python -m http.server 8765   (open /dashboard.html)
result: PR from factory/<slug>/integration  OR  needs-human
/factory approve <slug>              -> only after you've read decision.md
```

Small items without a full spec: add `- [ ] <feature>` to `factory/backlog.md`, then `/factory next`.

## Commands

| I want to… | Run |
|---|---|
| Bootstrap / resume a repo | `project-init init --project .` then `--apply` |
| Update Project Init itself | `project-init update --check` · `project-init update` |
| Re-install / update Factory only | `project-init factory --project .` then `--apply` |
| Make `/project-init*` skills visible everywhere | `project-init wire --project . --agent both --scope user --apply` |
| Run a feature from Spec Kit | `/factory spec specs/NNN-x` |
| Run a one-liner | `/factory <idea>` or backlog + `/factory next` |
| See all jobs | `/factory status` |
| Re-review an existing job | `/factory review <slug>` |
| Send back with feedback | `/factory rework <slug> "<feedback>"` |
| Approve an escalated job | `/factory approve <slug>` |
| Manual Codex audit of the result | in Codex, in the integration worktree: `$factory-audit` |
| See the worktrees | `git worktree list` |

## When it stops

| You see | Do |
|---|---|
| `needs-human` | Read `factory/jobs/<slug>/decision.md` → fix or `/factory approve <slug>` |
| Merge conflict at integration | The spec gave both workers the same file. Fix the spec paths, rerun |
| `[INTEGRATION]` findings | Write a short resolution plan, `/factory rework <slug> "<plan>"` |
| Codex worker failed | Check `factory/jobs/<slug>/codex/`; confirm `codex login status`; rerun |
| `/factory` refuses to start | Commit or stash tracked changes first |
| No tests ran after integration | `test_command` is empty in config.json |

Related: [Cheat sheet](CHEAT-SHEET.md) (who owns what) · [Factory stack](FACTORY-STACK.md) · [Install](INSTALL.md)
