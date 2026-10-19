# CLI command reference

This documents **the shipped Project Init 2.1.0-preview.2 CLI**, not a speculative roadmap. Every command accepts `--json` for structured output. Use `project-init help` for canonical syntax and arguments; new commands are not available simply by installing agent skills.

| Command | What it does | Side effect / safety |
| --- | --- | --- |
| `inspect` | Discover existing files, technology indicators and Git state | Read-only |
| `recommend` | Rank OpenSpec, Spec Kit, BMAD and none | Read-only heuristic |
| `init` | Initialize `.project-init/` state in a repo | Writes new local state; refuses overwrite |
| `status` | Report selected framework, approval, tests, evidence and blockers | Reads state, may recalculate stale evidence |
| `select` | Pin one framework | Requires initialized project, does not install |
| `wire` | Generate local/user-level Codex and Claude skills | Preview by default; `--apply` creates without clobbering; explicit `--backup-conflicts` allows backed-up migration |
| `install` | Plan native framework installation for selected exact version | Preview by default; `--apply` executes vendor process with prerequisites/constraints |
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

**Operational boundaries:** A skill is not a scheduler, a Codex invocation is not a successful acceptance test, a screenshot diff is not a UI interaction test, and a recorded local `actor` is not an authenticated approval. Learn how to configure `requirements.json`, `ui-design.json`, reference PNGs, and checks in [Verification](VERIFICATION.md).
