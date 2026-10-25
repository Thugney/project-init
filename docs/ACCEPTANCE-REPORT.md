# Project Init 2.1 — Acceptance and test report

Build: 2026-10-25  
Artifact: GitHub source candidate + `npm pack --dry-run` package inspection  
Version: `2.1.0-preview.11`  
**Status: FUNCTIONAL PREVIEW — NOT PRODUCTION ACCEPTED**

## Delivered and checked

| Agreed requirement | Implementation | Evidence |
|---|---|---|
| One Project Init installation | Local Node CLI with source and checked-in built-in features | npm isolated-prefix smoke test and `npm run check` |
| Keep original discovery, approval and drift history | v1 PowerShell scripts and tests preserved; v2 registers specs, approval hashes and source fingerprint | 18 original regression tests; bytewise SHA-256 preservation checks |
| No duplicate PRD/architecture/task documents | Native framework is the single owner; Project Init stores spec file references/hashes only | Core tests and code review |
| Framework recommendation/selection | OpenSpec, Spec Kit, BMAD or none, pin + human choice; native setup dry-run by default | Core unit tests; live vendor installers untested |
| High-fidelity review UI | Offline HTML preview with real navigation, labels, buttons, states, desktop/mobile, light/dark, with no imaginary project data | Real Playwright screenshot render via HTML injection + visual inspection; native browser CLI capture on Windows untested |
| Lean Kit bundled | Original Lean Kit source included in `vendor/lean-kit/` and invoked with `lean --execute` | Real local render + 8 standalone Lean Kit tests |
| Factory bundled | Orchestrator/reviewers, generic Codex + Claude workers, isolated Codex/Claude/integration Git worktree tooling, dashboard and backlog ship in `vendor/factory/`; no external Factory path | Cross-platform install/migration regression plus real Git worktree creation and `npm pack --dry-run` package inspection |
| Codex and Claude skill menu integration | Seven descriptive local/user-level skills per agent, optional Claude plugin namespace | Skill file generation, correct personal directory paths, safe backup migration and no-overwrite tests; UI discovery in installed clients untested |
| Source/spec drift guard | Approved baseline, recorded source review, required command evidence; change invalidates | Regression and synthetic whole-cycle tests |
| Screenshot fidelity gate | Strict PNG decoder, viewport dimensions, per-pixel comparison with configurable thresholds, visual diff report, theme/state matrix | Synthetic screenshot mutation tests and real-browser PNG decode; direct actual Chrome/Edge CLI capture untested |
| Semantic evidence gate | Per-requirement mapping to native specs, passing real configured checks, reviewer findings and hashed source evidence | Synthetic positive/negative review tests; claims are local attestations, not automatic semantic understanding |
| Release acceptance safeguard | `guard` requires current implementation, tests, semantic and visual evidence and reports ready only for *human* release review | Synthetic end-to-end acceptance succeeds, later code/screenshot edits invalidate; `releaseApproved` always false |
| Auditing and rollback | Local JSONL records, isolated v1 backup, no silent overwrite of existing AGENTS/CLAUDE, no commits/merge/deploy | Core regression suite, manual code inspection |

## Validation results

- GitHub CI matrix: **6/6 jobs passed** on Windows, Ubuntu and macOS with Node 22 and Node 24.
- Windows Node 24: **49/49 Project Init regression tests passed**, 0 failed/skipped; JavaScript syntax and CLI smoke passed.
- Ubuntu Node 24: **45/45 applicable Project Init tests passed**, 4 Windows-only tests skipped, 0 failed.
- `node --test vendor/lean-kit/tests/render.test.mjs`: **8/8 Lean Kit tests passed** across the CI matrix.
- `npm pack --dry-run` includes the complete `vendor/factory/` Claude, Codex and runtime distribution.
- Dirty-existing-repo regressions passed on Windows: Project Init init, Spec Kit preserve-merge apply, ECC apply and bundled Factory install all preserve unrelated modified/untracked files.
- Guided Factory bootstrap regressions passed: one `init` selects/plans the full Spec Kit + ECC + Factory stack, `init --apply` executes it and resumes idempotently, and a missing new project path is correctly recorded as `New`.
- Self-update regressions passed: preview version comparison, read-only `update --check`, and pinned GitHub-source installation with post-update CLI verification.
- Parallel Factory worktree regressions create distinct Codex, Claude and integration branches/checkouts from one base; Codex/Claude are general workers and legacy backend-only config/skills migrate safely.
- Guided-installer regressions passed: apply prompts can be accepted to continue through the stack or declined to return `STOPPED` cleanly without starting the declined component.
- Agent-runtime readiness regressions passed: Project Init distinguishes desktop apps from terminal clients, requires the `codex` and `claude` executables plus authentication status, and Spec Kit init uses `--ignore-agent-tools` so Project Init remains the prerequisite owner.
- Authentication-command regressions passed on Windows/Linux: Codex uses `codex login` -> `codex login status`; Claude Code uses `claude auth login` -> `claude auth status`. Unexpected auth argv fails the regression.
- Synthetic positive whole lifecycle reached `readyForHumanReleaseReview: true` and `releaseApproved: false`, then failed correctly after modified source.
- Screenshot drift after a green cached gate correctly made `status.releaseCandidateReady: false`.
- At least one genuine Playwright-rendered browser PNG decoded and compared successfully by the new strict PNG comparator.

## Important test limits

- Codex execution regression uses **a fake local Codex program**, not an authenticated ChatGPT subscription. It produces a real Git code change to test receipts and scoping only.
- Semantic review `actor`, `evidence` and `verdict` are unverified local attestations. Machine checks verify existence, mapping and freshness of evidence, **not an agent's ability to understand semantics**. Real semantic review remains a separately required operation.
- Screenshot comparison is pixel-based. It does not validate working links, keyboard operation, ARIA, API permissions, functional flows or hidden states. Those require genuine browser/functional tests configured per app.
- Browser was rendered in Python Playwright with HTML directly injected because file/local server navigation was blocked by this container. The direct Chrome/Edge screenshot capture command has not passed a Windows acceptance test.
- Live upstream Spec Kit/ECC installs, the real network download/extraction path for managed uv, the real npm install/browser sign-in path for Codex/Claude CLIs, old v1 PowerShell Pester, authenticated user approval and end-to-end Factory behavior in a real user project are **not yet acceptance-tested**. Synthetic execution now validates the dirty-existing-repo contract, but the user's real Trace repository remains the next acceptance test.
- No continuous autonomous task runner, automatic Claude programmatic executor, production release or live vendor setup is claimed.

## Operations / rollback

1. Use `project-init init --project .` to preview the complete guided Factory bootstrap on a real Windows project, then run the same command with `--apply` after reviewing the plan.
2. Verify real Spec Kit/ECC installation plus actual Codex/Claude command discovery and one complete Factory job.
3. Re-run `project-init init --project . --apply` to verify resume/idempotence and preservation of existing Factory config/backlog.
4. For rollback, reinstall the previous reviewed Project Init commit; inspect `.project-init/worktrees`, `.project-init/factory-worktrees`, `.agents/skills`, `.claude/skills`, `.specify/` and `factory/` before removing only Project Init-managed artifacts. Never reset unrelated source automatically.
