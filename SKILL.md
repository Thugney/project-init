---
name: project-init
version: 2.1.0-preview.2
description: Local development orchestrator with native spec-framework selection, high-fidelity review, bundled Lean Kit and independent evidence-based drift gates for Codex and Claude Code.
---

# Project Init 2.1

Read `README.md` and `docs/INVARIANTS.md`. This skill orchestrates the process; the chosen framework owns its own PRD, specifications, architecture decisions and implementation tasks. Never regenerate a competing PRD or silently switch methodologies.

1. Inspect the real repository and current Project Init status before action. Preserve existing `AGENTS.md`, `CLAUDE.md`, legacy approvals, source and framework-owned files. Do not install, migrate, delete or overwrite without explicit authorization.
2. Recommend one native spec framework for the actual project. Show ranking and rationale, request a selection, pin framework and preview the exact-version installation. User approval is required before `--apply`.
3. Use the installed native methodology to produce project specifications and task lists. `project-init handoff` is an instruction handoff, not proof a worker ran.
4. For UI projects, produce explicit high-fidelity `ui-design.json` screens with real navigation, labels, typography, colors, interactions, states and responsive variants; render `review.html` for human review. Use actual mockup PNGs as immutable-by-approval reference evidence.
5. Register authoritative native spec files with `baseline`, obtain independent review and **actual** user design approval. Never fabricate reviewers, acceptance or self-approve production.
6. Execute bounded implementation work using the appropriate native workflow. `project-init run --execute` is a **Codex-only** local foreground runner; Claude follows the skill interactively and must capture genuine code/test evidence. Do not claim unattended execution for Claude.
7. Configure and run real build, unit, browser-interaction and security checks with `verify --execute`. Map requirements to actual check names and visual cases; record real source evidence in `semantic import` only after independent code review. Run `visual compare` and `guard`. Any stale reference PNG or source change invalidates cached acceptance evidence.
8. Built-in Lean Kit: `project-init lean --project . --input docs/REPORT.md --out .project-init/lean/REPORT.html --execute`; it renders reports and boards, not product screens. Do not request a separate Lean Kit installation or unsupported token-savings claims.
9. Return true status, blockers, test evidence, diff and rollback approach. Green gate permits *human release review*, not deployment. No automatic Git commit, push, merge, credentials, production changes, or API-key additions.

Menus installed with `project-init wire --agent both --apply` are discoverable as `$project-init-*` in Codex and `/project-init-*` in Claude after reloading. Claude `/project-init:design` namespace requires loading the optional generated plugin using `claude --plugin-dir`; it is not implied by project skill installation. Review `docs/INSTALL.md` for exact instructions.
