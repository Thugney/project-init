# CLI command reference

This documents **the Project Init 2.1.0-preview.16 CLI**. Every command accepts `--json` for structured output. Use `project-init help` for canonical syntax and arguments; new commands require the matching CLI version as well as updated agent skills.

| Command | What it does | Side effect / safety |
| --- | --- | --- |
| `inspect` | Discover existing files, technology indicators and Git state | Read-only |
| `recommend` | Rank OpenSpec, Spec Kit, BMAD and none | Read-only heuristic |
| `init` | Guided bootstrap/resume: prerequisites, Spec Kit, ECC, bundled Factory, agent skills and existing-feature preparation | Read-only preview; `--apply` installs/resumes accepted steps, then reports tooling/feature/approval separately; `--yes` is explicit non-interactive consent |
| `update` | Check/update the globally installed Project Init CLI from GitHub `main` | `--check` is read-only; default updates when a newer version is available; independent of local source clones |
| `status` | Report selected framework, approval, tests, evidence and blockers | Reads state, may recalculate stale evidence. In a linked worktree with no state of its own while another worktree is initialized, exits 1 with `blocked` and the initialized checkout to work through |
| `prepare` | Select/reuse native feature; discover check commands, preserve/fill mappings, then baseline | Read-only preview; `--feature`, repeatable `--spec`, optional `--mapping FILE`; `--apply` never invents a spec, review, approval or test result |
| `select` | Pin one framework | Requires initialized project, does not install |
| `wire` | Generate local/user-level Codex and Claude skills | Preview by default; `--apply` creates without clobbering and updates skills an earlier Project Init generated; explicit `--backup-conflicts` allows backed-up migration of hand-written skills. `--scope user` also maintains a marked Project Init rules block in `~/.claude/CLAUDE.md` and Codex `AGENTS.md`, so every agent session follows Project Init |
| `install` | Plan native framework installation for selected exact version | Preview by default; `--apply` executes vendor process with prerequisites/constraints |
| `ecc` | Plan/install pinned ECC for Claude Code, Codex, or both | Preview by default; `--apply` runs the official `ecc-universal` guided installer with explicit harness choices |
| `factory` | Install/update the bundled parallel-worktree Claude + Codex Factory | Preview by default; `--apply`; migrates legacy managed Factory roles/config safely, preserves backlog/custom legacy files, and uses isolated worker/integration worktrees. `--orchestrator claude|codex` chooses which agent orchestrates and writes the board (default `claude`); the other agent works as a worker |
| `handoff` | Produce next phase instructions for selected framework | Instructions only; does not run agent |
| `render` | Generate offline HTML high-fidelity design review | Writes `.project-init/review.html` |
| `lean` | Render Markdown/JSON report/board/diagram using bundled Lean Kit | Preview; `--execute` renders and audits |
| `visual plan` | Check required screen/theme/viewport/state screenshot matrix | Read-only |
| `visual capture` | Capture local page screenshot with installed Chrome/Edge | Preview by default; `--execute`; local-only sources |
| `visual compare` | Compare reference and actual PNG pixels | Writes diff and evidence report |
| `semantic plan` | Check requirement mapping to native spec, checks and visual cases | Read-only |
| `semantic import` | Record independent reviewer findings per requirement | Writes evidentiary records; actor is unverified input |
| `guard` | Fail closed on incomplete/stale evidence | Writes gate result; never approves release |
| `baseline` | Register authoritative spec paths and design/visual baseline | Requires actual paths; records SHA-256 |
| `check` | Report approved baseline/spec/visual drift | Read-only validation |
| `source-review` | Reconcile changed source after independent review | Records review evidence; cannot prove identity |
| `review` | Record review verdict for design/spec | Actual reviewer/evidence required |
| `approve` | Record human approval of current baseline | Does not authorize deployment |
| `verify` | Run configured deterministic build/tests | Preview; `--execute` runs and captures exit codes |
| `run` | Run bounded foreground Codex task with allowlisted paths | Preview; `--execute` requires local authenticated Codex CLI and Git |
| `execution factory` | Validate actual worker/integration history and run checks on integrated source | `--job SLUG --allow PATH` (repeatable), explicit `--execute`; returns the integration project for remaining review/guard steps |
| `execution existing` | Record independently reviewed existing code without claiming a new implementation | `--task TEXT --actor NAME --evidence REF`, explicit `--execute`; requires current actual checks and independent source/semantic review |

**Operational boundaries:** A skill is not a scheduler, a Codex invocation is not a successful acceptance test, a screenshot diff is not a UI interaction test, and a recorded local `actor` is not an authenticated approval. Learn how to configure `requirements.json`, `ui-design.json`, reference PNGs, and checks in [Verification](VERIFICATION.md).
