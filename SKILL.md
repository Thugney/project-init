---
name: project-init
version: 2.1.0-preview.11
description: Local development orchestrator with native spec-framework selection, high-fidelity review, bundled Lean Kit and independent evidence-based drift gates for Codex and Claude Code.
---

# Project Init 2.1

Read `README.md` and `docs/INVARIANTS.md`. This skill orchestrates the process; the chosen framework owns its own PRD, specifications, architecture decisions and implementation tasks. Never regenerate a competing PRD or silently switch methodologies.

1. For the normal software-factory workflow, start or resume with `project-init init --project .`. It inspects the real repository, preserves existing `AGENTS.md`, `CLAUDE.md`, source and unrelated dirty work, and returns one combined Factory bootstrap plan. Re-run the same command with `--apply` only after reviewing that plan.
2. The Factory profile uses Spec Kit as the single planning/spec owner, ECC as the shared engineering/security/testing toolbox, and the bundled Factory as a parallel isolated-worktree execution/review loop for Codex and Claude. The lower-level `recommend`, `select`, `install`, `ecc`, `factory`, and `wire` commands are advanced controls, not required setup steps. If an existing repository already has another methodology, stop rather than creating a competing Spec Kit source of truth.
3. Use Spec Kit to produce project specifications and task lists. `project-init handoff` is an instruction handoff, not proof a worker ran.
4. For UI projects, produce explicit high-fidelity `ui-design.json` screens with real navigation, labels, typography, colors, interactions, states and responsive variants; render `review.html` for human review. Use actual mockup PNGs as immutable-by-approval reference evidence.
5. Register authoritative native spec files with `baseline`, obtain independent review and **actual** user design approval. Never fabricate reviewers, acceptance or self-approve production.
6. Execute bounded implementation work using the appropriate native workflow. `project-init run --execute` is a **Codex-only** local foreground runner; Claude follows the skill interactively and must capture genuine code/test evidence. Do not claim unattended execution for Claude.
7. Configure and run real build, unit, browser-interaction and security checks with `verify --execute`. Map requirements to actual check names and visual cases; record real source evidence in `semantic import` only after independent code review. Run `visual compare` and `guard`. Any stale reference PNG or source change invalidates cached acceptance evidence.
8. Built-in Lean Kit: `project-init lean --project . --input docs/REPORT.md --out .project-init/lean/REPORT.html --execute`; it renders reports and boards, not product screens. Do not request a separate Lean Kit installation or unsupported token-savings claims.
9. Return true status, blockers, test evidence, diff and rollback approach. Green gate permits *human release review*, not deployment. No automatic Git commit, push, merge, credentials, production changes, or API-key additions.

Menus installed with `project-init wire --agent both --apply` are discoverable as `$project-init-*` in Codex and `/project-init-*` in Claude after reloading. Claude `/project-init:design` namespace requires loading the optional generated plugin using `claude --plugin-dir`; it is not implied by project skill installation. Review `docs/INSTALL.md` for exact instructions.
