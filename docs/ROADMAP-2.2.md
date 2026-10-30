# Roadmap — Project Init 2.2: domain packs

**Status:** proposed. Nothing in this document is implemented. Items move to the [changelog](../CHANGELOG.md) only when they ship with tests.

## Goal

Project Init 2.1 is a general workflow harness: discovery, one spec owner, evidence and a fail-closed gate. It knows nothing about the *kind* of work in a repository. A PowerShell automation repo and a public website get the same checks — which, for PowerShell, means none, because check discovery only reads `package.json`.

2.2 keeps the core general and adds **domain packs**: versioned bundles of rules, checks, hooks and skills that a project opts into.

| Pack | For | Carries |
| --- | --- | --- |
| `core` (built in) | Every repository | What 2.1 does today |
| `m365-powershell` | Microsoft 365 / Intune / Defender / Entra automation in PowerShell | Script standards, Pester and PSScriptAnalyzer checks, Graph least-privilege checks, admin-automation skills |
| `web-gdpr` | Public websites and apps that handle personal data | Privacy-review gate, accessibility and content checks |

## Principles

1. **The core stays general.** Domain knowledge lives in packs, not in `lib/core.mjs`.
2. **Packs carry knowledge, never data.** No tenant IDs, customer records, credentials or exports in a pack, an example or a test fixture. A pack must be safe to publish.
3. **A pack is part of the baseline.** Its pinned version and hash are recorded like specs and check configuration; changing a pack invalidates approval.
4. **Enforcement beats instruction.** A rule that matters becomes a check the guard can fail on. Prompt rules and hooks give early feedback; checks are the gate.
5. **Project Init stays the gate, not the orchestrator.** External orchestrators may read its state; Project Init does not become one.
6. **Same honesty rules.** Every capability documents what it proves and what it does not, as the rest of the docs do.

## Phase 1 — Pack mechanism

A pack is a folder with a manifest:

```text
packs/<name>/
  pack.json            name, version, applies-to detection, provided items
  rules/               fragments merged into the managed AGENTS.md / CLAUDE.md block
  skills/              extra Claude and Codex skills
  checks/              check-discovery adapters and check definitions
  hooks/               client hook definitions (Phase 3)
  review/              per-domain review checklists for source/semantic review
```

- `project-init pack list | add <name|path|git-url@ref> | remove <name>`, dry-run by default, `--apply` to change.
- `inspect`/`recommend` suggest packs from what the repository contains (for example `*.ps1`/`*.psd1` → `m365-powershell`). The user decides.
- Pack sources may be local paths or pinned Git refs, so a pack can live in a private repository.
- Rule fragments only touch the existing marked managed block; user-written instructions are preserved, as `wire --scope user` already guarantees.

**Done when:** a synthetic pack can be added, pinned, hashed into the baseline, removed cleanly, and a pack change makes `status` report a stale baseline. Regression tests cover conflicts and removal.

## Phase 2 — `m365-powershell` pack

**PowerShell check adapter** (extends [check discovery](CHECK-DISCOVERY.md)):

- Detect `*.ps1`, `*.psm1`, `*.psd1`, Pester test files and a `PSScriptAnalyzerSettings.psd1`.
- Propose argv checks for `Invoke-Pester` and `Invoke-ScriptAnalyzer`, following the same rules as npm discovery: proposals only, never run during discovery, unsupported layouts reported rather than guessed.

**Script-standard rules**, shipped as PSScriptAnalyzer custom rules so they run as ordinary checks. Each rule is configurable per repository:

- Comment-based help present, with a configurable `.SYNOPSIS` language and a `.DESCRIPTION`.
- A logging function is used, with a configurable log path pattern.
- `try`/`catch` around the main body and explicit `exit 0` / `exit 1`.
- No aliases, no non-ASCII identifiers or paths.
- `SupportsShouldProcess` on functions and scripts that change state.
- No hardcoded tenant IDs, client secrets, certificate thumbprints or bearer tokens.

**Graph least-privilege check:** a script declares the application permissions it needs in a small manifest. The check maps the Graph cmdlets and endpoints the script uses to the minimum documented permission and fails when the script needs more than it declares, or flags declared permissions it never uses. The mapping table is versioned in the pack and cites Microsoft Learn for every entry. It is a static check: it does not prove the permission is granted, and dynamic URIs are reported as unverifiable rather than passed.

**Skills:** app-only Graph authentication, Intune remediation scripts, Defender/ASR rollout in audit-then-block stages, Power Automate flows that call Graph. Recommended MCP: Microsoft Learn, so guidance comes from current documentation.

**Done when:** a fixture repository with deliberate violations fails each rule with a precise finding, a clean fixture passes, and the Graph check passes a correctly declared script and fails an over- and an under-declared one. Windows CI runs the PowerShell checks.

## Phase 3 — Hooks

Rules in `AGENTS.md` and `CLAUDE.md` are suggestions to the agent. Hooks act immediately:

- After an edit: run the fast checks for the touched file (lint, analyzer).
- Before a write: block secrets and the identifiers a pack forbids.
- Before a shell command: block commands a pack marks as production-affecting unless an explicit flag is present.

Packs declare hooks once; Project Init renders them for each client that supports them, through the same reviewed `wire` flow. Where a client has no equivalent hook, the docs say so and the same rule still runs as a check at verify time, so the gate does not depend on hook support.

**Done when:** generated hook configuration is covered by regression tests, existing user hooks are preserved, and a blocked write is demonstrated in a disposable project.

## Phase 4 — `web-gdpr` pack

- **Privacy gate:** requirements or source changes that introduce or change personal-data fields (forms, database columns, analytics, third-party scripts) require a privacy-review finding before the guard passes. The pack supplies the review checklist; the judgment comes from the reviewer, as with semantic review today.
- **Accessibility:** propose browser accessibility checks where the project has a browser test runner, mapped to requirements like other checks.
- **Content:** optional checks for configured locales (for example Norwegian and English) so pages do not ship half-translated.

**Done when:** a fixture change that adds a personal-data form field is blocked until a privacy finding is imported, and is not blocked after.

## Phase 5 — Feedback loop: `project-init learn`

Failed checks and rejected review findings are the most valuable signal a harness gets, and today they are not reused.

- `project-init learn` reads recent failed checks and review findings from the local audit records and proposes rule or checklist additions to the relevant pack.
- Proposals are written as a reviewable diff to the pack; nothing is applied without `--apply`, and an applied change bumps the pack version and therefore invalidates the baseline like any other pack change.

**Done when:** a recorded failure produces a proposed rule diff, and applying it changes the pack hash and the baseline status.

## Phase 6 — Read-only state for external orchestrators

Agent-company orchestrators (for example Paperclip) assign work and show its progress. They need to read Project Init's state without Project Init taking on orchestration.

- `project-init status --json` as a stable, versioned schema: feature, baseline state, check results, review coverage, guard result, blockers.
- Optional append-only export of the existing JSONL audit events for a local reader.
- No write API, no daemon, no network listener in Project Init. An external system that wants to *start* work invokes the agents through its own adapters; Project Init then gates the result as usual.

**Done when:** the JSON schema is documented and covered by tests, and a stale baseline or failed guard is visible through it.

## Phase 7 — Model routing policy

Today every bundled Factory agent declares `model: opus`, so spec writing, building, every review round and approval all run on the most expensive tier. Cost is driven by how many tokens are spent where, not by the model alone.

- **Role tiers in Factory config:** map each role (orchestrator, spec writer, builder, code/security/UX/UI reviewer, approver) to a tier (`top`, `mid`, `fast`) instead of a hardcoded model. Suggested defaults: `top` for orchestrator, security review and approval; `mid` for building and routine review; `fast` for summaries and status. Tiers resolve to concrete models per client, so a model change is one config edit.
- **Deterministic first:** a configured check that can answer a question (lint, analyzer, tests, guard) runs before any model review of the same concern, and model reviewers receive its results instead of re-deriving them.
- **Diversity over volume:** a builder and a reviewer from different model families by default (Codex builds, Claude reviews, or the reverse). Multi-model debate is an explicit opt-in for decisions, never the default loop.
- **Data classes:** a project declares what data it handles (`public`, `internal`, `personal`, `restricted`), and each provider/model entry declares which classes it is approved for. Routing refuses a model not approved for the project's class. Approval is the maintainer's decision, recorded in config; Project Init does not judge providers' terms.
- **Usage record:** each Factory job records which tier and model each role used and, where the client reports it, token usage, so cost per job is visible.

**Done when:** role tiers replace hardcoded models with migration of existing configs, a role resolves to the configured model per client, a `restricted` project refuses an unapproved provider, and the job record shows the model used per role.

## Phase 8 — GitHub workflow pack

Project Init's own repository already follows a release policy (SemVer with `-preview.N`, `feat/*`/`fix/*`/`docs/*` branches, tag-triggered releases that check the tag against `package.json`, CI on three operating systems). Consuming projects get none of it. A `github` pack makes that policy reusable and checkable:

- **Naming:** branch pattern and Conventional Commit PR titles, enforced by a check and, where supported, a commit-message hook.
- **CI scaffold:** a least-privilege (`contents: read`) workflow proposed from discovered checks, previewed before `--apply`, never overwriting an existing workflow.
- **Releases:** a tag-triggered release workflow that requires the tag to match the package version and to be reachable from the default branch, marks `-preview`/`-rc` tags as pre-releases, and never publishes to a registry unless configured.
- **CI as evidence:** the guard can require a *successful CI run for the exact head commit*, read through the GitHub REST API, turning today's `runsVerified: false` into a verified state. Branch-protection guidance is printed as reviewable steps; Project Init still never changes branch protection itself.
- **Attribution policy:** a configurable rule for AI attribution in commits and PR descriptions (require, allow or forbid trailers such as `Co-Authored-By`), checked by the commit-message hook and at verify time.
- **Skill:** `/project-init-ship` / `$project-init-ship` walks branch → PR (using the repository's template and evidence) → CI → release tag, stopping at each human decision.

**Done when:** a fixture repository gets a previewed CI and release workflow without touching existing ones, a misnamed branch and a forbidden trailer each fail with a precise finding, and the guard blocks until a successful CI run exists for the current head commit.

## Out of scope for 2.2

- Signed attestations. The [security model](SECURITY-MODEL.md) already states local records can be rewritten; branch protection and CI remain the enforcement.
- Additional spec frameworks.
- A background service of any kind.

## Before 2.2 starts

- Promote 2.1 to a stable release per [Releases](RELEASES.md), with the maintainer's acceptance evidence recorded in the [validation report](ACCEPTANCE-REPORT.md).
