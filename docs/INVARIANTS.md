# Frozen requirements — Project Init 2.1

Based on decisions through October 19, 2026 and the uploaded original `project-init.rar`. Do not silently change agreed responsibilities or imply a gate passed without evidence.

| ID | Required capability | Delivery and limitation |
|---|---|---|
| PI-001 | One installer and CLI entry point | Local npm `project-init`. Lean Kit + Drift Guard bundled; native spec framework installed only when selected and approved |
| PI-002 | Safely discover new/existing projects | `inspect`, `recommend`, `init`; contextual rankings are heuristics, not factual intent inference |
| PI-003 | Preserve working app and instructions | Existing source, `AGENTS.md`, `CLAUDE.md`, v1 `planning/architecture`, and unknown files are not overwritten |
| PI-004 | Select OpenSpec, BMAD, Spec Kit or deliberately none | Pinned selection, no unreviewed methodology switch or PRD/task replication |
| PI-005 | Native framework owns project plans and specs | `handoff` + native artifact paths in baseline; no second Project Init product backlog |
| PI-006 | High-fidelity visual mockups | Real navigation, text, buttons, colors, typography, states, screen dimensions in generated HTML from explicit JSON, no invented project data |
| PI-007 | Approved screenshot baseline and theme/state coverage | Reference PNGs, visual case manifest, UI design and check config all hashed; changed mockup invalidates approval |
| PI-008 | Independent review + user acceptance | Review/approval receipts enforced, but local actor names are unverified user input |
| PI-009 | Source/spec drift invalidation | SHA-256 source/spec/visual/evidence fingerprints; cached guard status invalidates on altered screenshots |
| PI-010 | Actual execution, not only reports | Codex foreground `run --execute` with actual Git delta and scoped paths; no unattended daemon and no programmatic Claude runner |
| PI-011 | Real check results | `verify --execute` records exit code, timings/logs and source hash; empty checks cannot pass |
| PI-012 | No automatic Git commit/push/merge/deploy | No automatic production release, no new paid API key, no unapproved source modification |
| PI-013 | Original v1 rollback | Original PowerShell review scripts, tests and instructions copied unchanged under `legacy/v1/` |
| PI-014 | Retired destructive setup/scaffold | Active v2.1 package excludes old overwrite/global scaffolder |
| PI-015 | Lean Kit bundled | Actual prior Lean Kit source vendored; `lean --execute` renders with Node, auditable, no extra install |
| PI-016 | Evidence-based semantic and visual drift guard | Real screenshot pixels/dimensions/diff coverage; every requirement maps to current specs, tests and independently supplied source evidence. Not infallible semantic AI proof |
| PI-017 | Codex and Claude discoverable skills | Seven descriptive skill files per agent with explicit `wire --apply`, conflict refusal; Claude namespaced commands require plugin activation |
| PI-018 | Idempotency, rollback and audit | Local JSONL events, exact hashes, dry-run by default for external actions, v1 protected. No tamper-resistant identity signature |
| PI-019 | Human release decision | `guard` may produce a human-review-ready candidate, but no automatic release approval is possible |

## Evidence ownership

- `.project-init/project.json` — orchestrator state, pinned framework, local project path.
- `.project-init/config.json` — deterministic verification command arrays.
- `.project-init/requirements.json` — mapping stable requirement IDs to authoritative native specs, test names and visual cases; not a competing requirement document.
- `.project-init/ui-design.json` — explicit screen mockup representation.
- `.project-init/visual-cases.json` — required screenshot matrix.
- `.project-init/visual/baselines/*.png` — exact approved mockup/reference images; hashed during baseline.
- `.project-init/visual/actual/*.png` — screenshots of the implementation, generated from real browser or approved test process.
- `.project-init/review.html` — presentation only, not behavior proof.
- `.project-init/baseline.json`, `review.json`, `approval.json`, `source-review.json` — local decision/evidence references.
- `.project-init/evidence/` and `runs/` — source/test/visual/semantic/check receipts with audit logging.
- `planning/architecture/` — preserved historical v1 workspaces, never silently migrated.

## Fail closed

Refuse incomplete/outdated specs, UI screen references, unapproved reference edits, missing screen state/theme/viewport comparisons, failed tests, incomplete requirement coverage, modified source since last independent review, missing Codex implementation receipts, out-of-scope changes and conflicting project framework selections. A green local report does not replace protected branches, authenticated reviewer identity, CI or a real release approval.

## Validation still required

Real Windows/PowerShell (legacy Pester), native framework installation, authenticated Codex, actual Claude/Codex CLI command menus, Chrome/Edge local screenshot capture, application browser interactions and CI branch protection. These gaps must not be represented as complete.
