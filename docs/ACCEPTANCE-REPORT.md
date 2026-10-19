# Project Init 2.1 — Acceptance and test report

Build: 2026-10-19  
Artifact: `ProjectInit-OpenSource-Preview-2.1.0-preview.2.zip`  
Version: `2.1.0-preview.2`  
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
| Codex and Claude skill menu integration | Seven descriptive local/user-level skills per agent, optional Claude plugin namespace | Skill file generation, correct personal directory paths, safe backup migration and no-overwrite tests; UI discovery in installed clients untested |
| Source/spec drift guard | Approved baseline, recorded source review, required command evidence; change invalidates | Regression and synthetic whole-cycle tests |
| Screenshot fidelity gate | Strict PNG decoder, viewport dimensions, per-pixel comparison with configurable thresholds, visual diff report, theme/state matrix | Synthetic screenshot mutation tests and real-browser PNG decode; direct actual Chrome/Edge CLI capture untested |
| Semantic evidence gate | Per-requirement mapping to native specs, passing real configured checks, reviewer findings and hashed source evidence | Synthetic positive/negative review tests; claims are local attestations, not automatic semantic understanding |
| Release acceptance safeguard | `guard` requires current implementation, tests, semantic and visual evidence and reports ready only for *human* release review | Synthetic end-to-end acceptance succeeds, later code/screenshot edits invalidate; `releaseApproved` always false |
| Auditing and rollback | Local JSONL records, isolated v1 backup, no silent overwrite of existing AGENTS/CLAUDE, no commits/merge/deploy | Core regression suite, manual code inspection |

## Local test results

- `npm run check`: **30/30 Project Init Node regression tests passed**; JavaScript syntax checks passed.
- `node --test vendor/lean-kit/tests/render.test.mjs`: **8/8 Lean Kit tests passed**.
- Synthetic positive whole lifecycle reached `readyForHumanReleaseReview: true` and `releaseApproved: false`, then failed correctly after modified source.
- Screenshot drift after a green cached gate correctly made `status.releaseCandidateReady: false`.
- At least one genuine Playwright-rendered browser PNG decoded and compared successfully by the new strict PNG comparator.

## Important test limits

- Codex execution regression uses **a fake local Codex program**, not an authenticated ChatGPT subscription. It produces a real Git code change to test receipts and scoping only.
- Semantic review `actor`, `evidence` and `verdict` are unverified local attestations. Machine checks verify existence, mapping and freshness of evidence, **not an agent's ability to understand semantics**. Real semantic review remains a separately required operation.
- Screenshot comparison is pixel-based. It does not validate working links, keyboard operation, ARIA, API permissions, functional flows or hidden states. Those require genuine browser/functional tests configured per app.
- Browser was rendered in Python Playwright with HTML directly injected because file/local server navigation was blocked by this container. The direct Chrome/Edge screenshot capture command has not passed a Windows acceptance test.
- Vendor installers, Windows-local CLI, native command discovery in Codex/Claude, old v1 PowerShell Pester, authenticated user approval and CI branch-protection checks were **not run** in this environment.
- No continuous autonomous task runner, automatic Claude programmatic executor, production release or live vendor setup is claimed.

## Operations / rollback

1. Keep the original `project-init.rar` and existing installed skill; extract preview ZIP to a separate new folder.
2. Test in a disposable Windows repo with `wire --apply` (no overwrite), native framework setup, real Codex/Claude menus, valid screenshot capture and real project tests.
3. Do not migrate original `planning/architecture/` review records as already-approved v2 records.
4. For rollback, uninstall the preview global CLI if desired, restore original skill directory from backup, and inspect `.project-init`, `.agents/skills`, `.claude/skills` before removing only newly-created files. Never reset unrelated source automatically.
