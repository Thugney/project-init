# Getting started — exactly how to use it

PowerShell examples. One page. Follow it top to bottom the first time.

```text
Project Init  -> installs everything            (once per repo)
Spec Kit      -> decides WHAT to build          (every feature)
/factory      -> Codex + Claude BUILD it        (every feature)
ECC           -> extra agent skills             (automatic, never called directly)
You           -> approve the spec, merge the PR
```

---

## Rule 0 — three things that break everything

1. **One clone per repo.** Delete or stop using any other copy of the same repo. Two clones = you install in one and open the other.
2. **Commit the setup.** The Claude desktop app and `/factory` both work in Git *worktrees* made from your **last commit**. Uncommitted files (skills, `.specify/`, factory) do not exist there.
3. **Open the repo folder itself.** Not its parent, not a cloud session. Local, exact folder.

---

## A. First time in a repo (once)

### New project
```powershell
project-init init --project J:\Projects\MyApp            # preview (folder may not exist)
project-init init --project J:\Projects\MyApp --apply    # answer Y/n per prerequisite
cd J:\Projects\MyApp
```

### Existing project
```powershell
cd J:\Projects\MyApp
project-init init --project .            # preview: read what it adds/keeps
project-init init --project . --apply
```
- Existing **BMAD/OpenSpec**? `init` stops. Pick one spec owner; don't force Spec Kit in.
- Your unrelated changes are kept. Existing `.specify/` is reused.

### Then, both
```powershell
# 1. Config: open .claude\skills\factory\config.json and set
#    "base_branch": "main"
#    "test_command": "npm test"          (empty for a new repo until the scaffold exists)
#    add your own sensitive folders to "high_risk_paths"

# 2. Commit the setup (Rule 0.2)
git add .specify .claude .agents factory .gitignore
git commit -m "chore: project-init bootstrap"
git push
```

### Check it works
| App | Do | Expect |
|---|---|---|
| Claude desktop | **Code** tab → new **local** session → folder = the repo | `/speck` lists `speckit-specify`, `/factory` exists |
| Claude CLI | `cd` repo → `claude` | same |
| Codex | open the repo | `$speckit-specify`, `$factory-worker` listed |

Ask the session *"What is your working directory?"* — it must be inside your repo (a `.claude\worktrees\…` subfolder is fine).

New project only: make your first feature a scaffold (`/speckit-specify "scaffold: <stack>, health endpoint, test runner, CI"`), run it through section B, then fill in `test_command`.

---

## B. Every feature (the normal day)

Use **Claude Code** for this whole flow. Codex is called by `/factory` automatically.

```powershell
git checkout main; git pull; git status     # must be clean
```

| # | Type in Claude Code | You get | You do |
|---|---|---|---|
| 1 | `/speckit-specify <feature in plain words>` | `specs/00X-name/spec.md` | read it |
| 2 | `/speckit-clarify` (optional) | open questions answered | answer them |
| 3 | `/speckit-plan` | `plan.md` | read it |
| 4 | `/speckit-tasks` | `tasks.md` | read it |
| 5 | *(PowerShell)* `git add specs; git commit -m "spec: 00X-name"` | spec saved | — |
| 6 | `/factory spec specs/00X-name` | Codex + Claude build in parallel → integrate → tests → 4 reviews → fixes | wait |
| 7 | — | **PR opened**, or **`needs-human`** | see C |

Watch it live (optional):
```powershell
cd factory; python -m http.server 8765     # open http://localhost:8765/dashboard.html
```

---

## C. When it finishes

| Result | Do |
|---|---|
| **PR opened** | Review on GitHub, merge it yourself (squash-merge = signed commit under your name) |
| **needs-human** | Read `factory\jobs\<slug>\decision.md`, then `/factory approve <slug>` **or** `/factory rework <slug> "what to change"` |
| **Merge conflict** | Spec gave both workers the same file. Fix the paths in `factory\jobs\<slug>\spec.md`, `/factory review <slug>` |
| **Codex failed** | `codex login status`; look in `factory\jobs\<slug>\codex\`; run `/factory review <slug>` |
| **No tests ran** | `test_command` is empty in config.json |
| **`/factory` refuses to start** | You have uncommitted tracked changes. Commit or stash |

---

## D. Which tool for which job

| Job | Use | Not |
|---|---|---|
| New feature, backend + frontend | Spec Kit → `/factory spec …` | — |
| Small one-liner | `/factory <idea>` or backlog + `/factory next` | Spec Kit |
| Fix review comments on an **existing PR** | Plain Claude Code (or Codex): *"check out branch X, fix PR #N comments, add tests, push"* | `/factory` (it makes a new PR) |
| Bug fix with a known cause | Plain Claude Code / Codex on a branch | `/factory` |
| Extra independent audit of a factory result | Codex in the integration worktree: `$factory-audit` | — |
| Feature that targets another feature branch | `git checkout <that-branch>` first, set `"base_branch"` to it, then section B | — |

---

## E. Keeping it up to date

```powershell
project-init update --check
project-init update                          # updates the CLI
project-init init --project .                # preview what changed for this repo
project-init init --project . --apply        # applies; keeps your config.json + backlog
git add .claude .agents factory .specify; git commit -m "chore: update project-init"
```
After any update: commit (Rule 0.2), then start a **new** Claude/Codex session.

---

## F. One picture

```text
             (once)  project-init init --apply  →  commit setup
                                   │
 /speckit-specify → /speckit-plan → /speckit-tasks → commit spec      WHAT
                                   │
                    /factory spec specs/00X-name                       BUILD
                                   │
          ┌────────────────────────┴───────────────────────┐
   Worktree A: Codex                              Worktree B: Claude
          └────────────────────────┬───────────────────────┘
                     integration branch → tests → 4 reviews
                                   │
                    PR on GitHub  →  YOU merge
```

Related: [Cheat sheet](CHEAT-SHEET.md) (who owns what) · [Factory stack](FACTORY-STACK.md) · [Install](INSTALL.md)
