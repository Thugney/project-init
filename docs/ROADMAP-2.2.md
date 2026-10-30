# Roadmap — Project Init 2.2: domain packs

**Status:** proposed. Nothing in this document is implemented. Items move to the [changelog](../CHANGELOG.md) only when they ship with tests. Phases are listed in priority order.

## Scope

Project Init is a **personal development harness**: the layer around Claude Code and Codex that makes their output dependable for one maintainer's own work. It covers:

- **Software development:** applications and tools in the maintainer's repositories.
- **Scripting and automation:** PowerShell and Microsoft Graph automation for Microsoft 365, Intune, Entra, Defender and Conditional Access.
- **Later, tenant configuration as code:** planning, reviewing and applying Microsoft 365 security configuration through the same gate (Phase 14).

It is not an agent orchestrator, a business-operations system or a background service. The aim is the best output the available models can produce, at a cost the maintainer controls.

## Harness layers

A harness is everything around the model that shapes its output. This roadmap fills the layers 2.1 leaves thin:

| Layer | In 2.1 | Added by |
| --- | --- | --- |
| Rules | Managed `AGENTS.md`/`CLAUDE.md` block | Pack rule fragments (1) |
| Planning method | Spec Kit in guided setup and Factory; OpenSpec and BMAD selectable only | First-class BMAD (2) |
| Skills | Seven workflow skills per agent | Domain skills in packs (3), ship skill (8) |
| Checks (enforcement) | npm-discovered checks, guard | PowerShell checks (3), supply chain (9), CI as evidence (8) |
| Hooks | None | Pack-declared hooks (4), pre-push (7) |
| Context and tools (MCP) | Native specs and handoffs | Pack-recommended MCP servers (3) |
| Sub-agents and models | Factory workers, all on one top-tier model | Role tiers, multiple model families, opt-in debate (5) |
| Measurement | Evidence per change | Evals across model configurations (6) |
| Feedback | None | `learn` turns failures into rules (10) |
| Interface | Factory dashboard, Lean Kit reports | Eval comparison reports (6) |

## Domain packs

2.1 knows nothing about the *kind* of work in a repository. A PowerShell automation repository and a web application get the same checks, which for PowerShell means none, because check discovery only reads `package.json`. 2.2 keeps the core general and adds **domain packs**: versioned bundles of rules, checks, hooks and skills that a project opts into.

| Pack | For | Carries |
| --- | --- | --- |
| `core` (built in) | Every repository | What 2.1 does today |
| `m365-powershell` | Microsoft 365 / Intune / Defender / Entra automation in PowerShell | Script standards, Pester and PSScriptAnalyzer checks, Graph least-privilege checks, admin-automation skills |
| `github` | Repositories hosted on GitHub | Naming, CI and release workflows, CI as evidence, attribution policy |
| `web-gdpr` | Web applications that handle personal data | Privacy-review gate, accessibility and content checks |
| `m365-config` (later) | Tenant configuration as code | Desired-state baselines, plan and apply flow, safety rules |

## Principles

1. **The core stays general.** Domain knowledge lives in packs, not in `lib/core.mjs`.
2. **Packs carry knowledge, never data.** No tenant IDs, customer records, credentials or exports in a pack, an example or a test fixture. A pack must be safe to publish.
3. **A pack is part of the baseline.** Its pinned version and hash are recorded like specs and check configuration; changing a pack invalidates approval.
4. **Enforcement beats instruction.** A rule that matters becomes a check the guard can fail on. Prompt rules and hooks give early feedback; checks are the gate.
5. **Deterministic before model.** Anything a check can decide is not spent on model tokens.
6. **Project Init gates; it does not orchestrate.** It does not schedule work, run as a service or listen on the network.
7. **Same honesty rules.** Every capability documents what it proves and what it does not, as the rest of the docs do.

## Phase 1 — Pack mechanism

A pack is a folder with a manifest:

```text
packs/<name>/
  pack.json            name, version, applies-to detection, provided items
  rules/               fragments merged into the managed AGENTS.md / CLAUDE.md block
  skills/              extra Claude and Codex skills
  checks/              check-discovery adapters and check definitions
  hooks/               client hook definitions (Phase 4)
  review/              per-domain review checklists for source/semantic review
  mcp.json             recommended MCP servers (suggested, never installed silently)
```

- `project-init pack list | add <name|path|git-url@ref> | remove <name>`, dry-run by default, `--apply` to change.
- `inspect`/`recommend` suggest packs from what the repository contains (for example `*.ps1`/`*.psd1` → `m365-powershell`). The user decides.
- Pack sources may be local paths or pinned Git refs, so a pack can live in a private repository.
- Rule fragments only touch the existing marked managed block; user-written instructions are preserved, as `wire --scope user` already guarantees.

**Done when:** a synthetic pack can be added, pinned, hashed into the baseline, removed cleanly, and a pack change makes `status` report a stale baseline. Regression tests cover conflicts and removal.

## Phase 2 — First-class BMAD

Project Init already ranks, pins and installs BMAD, and its handoffs describe BMAD's planning, UX, story and review workflows. Three things stop BMAD projects from using the full harness:

- Guided `init` accepts only `--framework spec-kit`.
- Factory starts jobs only from Spec Kit's `specs/NNN-x/` folders, so BMAD stories cannot be dispatched to parallel Codex and Claude workers.
- Feature preparation discovers Spec Kit and OpenSpec features automatically, but BMAD features must be pointed out with `--spec`.

Scope:

- **Guided setup:** `init --framework bmad` runs the same reviewed bootstrap (BMAD at a pinned version, ECC, Factory) as the Spec Kit path. The BMAD installer is interactive, so the plan says so and the step is supervised.
- **Factory from BMAD stories:** Factory can start a job from a BMAD story or epic, translating its acceptance criteria and tasks into the execution contract the same way it does for a Spec Kit feature, without copying them into a second specification. Story status remains BMAD's.
- **Preparation:** discover BMAD epics, stories and their task IDs in the installed version's output location, read from the installed BMAD files rather than assumed.
- **Choice per project:** the recommender keeps choosing per project (BMAD for new products, large scope and UI-heavy discovery; Spec Kit for scripts, tools and Microsoft 365 automation). One methodology per project still holds, and evals (Phase 6) show whether BMAD's heavier process pays for itself on real work.

**Done when:** guided `init --framework bmad --apply` completes on a fixture, a BMAD story starts a Factory job whose integration evidence passes `execution factory`, preparation finds the fixture's stories without `--spec`, and a project with Spec Kit already initialized refuses BMAD instead of creating a second spec owner.

## Phase 3 — `m365-powershell` pack

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

**Skills:** app-only Graph authentication, Intune remediation scripts, Defender/ASR rollout in audit-then-block stages, Conditional Access changes in report-only first, Power Automate flows that call Graph. Recommended MCP: Microsoft Learn, so guidance comes from current documentation.

**Done when:** a fixture repository with deliberate violations fails each rule with a precise finding, a clean fixture passes, and the Graph check passes a correctly declared script and fails an over- and an under-declared one. Windows CI runs the PowerShell checks.

## Phase 4 — Hooks

Rules in `AGENTS.md` and `CLAUDE.md` are suggestions to the agent. Hooks act immediately:

- After an edit: run the fast checks for the touched file (lint, analyzer).
- Before a write: block secrets and the identifiers a pack forbids.
- Before a shell command: block commands a pack marks as production-affecting unless an explicit flag is present.

Packs declare hooks once; Project Init renders them for each client that supports them, through the same reviewed `wire` flow. Where a client has no equivalent hook, the docs say so and the same rule still runs as a check at verify time, so the gate does not depend on hook support.

**Done when:** generated hook configuration is covered by regression tests, existing user hooks are preserved, and a blocked write is demonstrated in a disposable project.

## Phase 5 — Model routing policy

Today every bundled Factory agent declares `model: opus`, so spec writing, building, every review round and approval all run on the most expensive tier. Cost is driven by how many tokens are spent where, not by the model alone.

- **Role tiers in Factory config:** map each role (orchestrator, spec writer, builder, code/security/UX/UI reviewer, approver) to a tier (`top`, `mid`, `fast`) instead of a hardcoded model. Suggested defaults: `top` for orchestrator, security review and approval; `mid` for building and routine review; `fast` for summaries and status. Tiers resolve to concrete models per client, so a model change is one config edit.
- **Deterministic first:** a configured check that can answer a question (lint, analyzer, tests, guard) runs before any model review of the same concern, and model reviewers receive its results instead of re-deriving them.
- **Combine models, don't multiply them:** a builder and a reviewer from different model families by default (Codex builds, Claude reviews, or the reverse). Multi-model debate or parallel planning is an explicit opt-in for decisions, never the default loop, because it multiplies usage.
- **Providers through one adapter, not one per vendor:** the `mid` and `fast` tiers may point at other model families (for example Gemini, DeepSeek, Kimi or Grok). Rather than integrating each vendor, Factory gains one generic worker adapter: either a command-line agent that takes a prompt and works in the assigned worktree (for example a multi-provider agent such as Hermes), or an OpenAI-compatible endpoint configured by base URL and model name. Keys come from the environment or a secret store, never from config files or logs. These providers are pay-per-token, so they are off by default.
- **Data classes:** a project declares what data it handles (`public`, `internal`, `personal`, `restricted`), and each provider/model entry declares which classes it is approved for. Routing refuses a model not approved for the project's class. Approval is the maintainer's decision, recorded in config; Project Init does not judge providers' terms.
- **Usage record:** each Factory job records which tier and model each role used and, where the client reports it, token usage, so cost per job is visible.

**Done when:** role tiers replace hardcoded models with migration of existing configs, a role resolves to the configured model per client, a generic worker produces a receipt and Git integration like Codex and Claude workers, a `restricted` project refuses an unapproved provider, and the job record shows the model used per role.

## Phase 6 — Evals

Model routing is guesswork without measurement. Public benchmarks do not say whether a cheaper tier is good enough for *this* maintainer's work.

- **Eval set:** a small, versioned set of real tasks from the maintainer's own repositories (for example a PowerShell script, a bug fix, a UI change), each with a fixed starting commit and known-good acceptance: configured checks plus requirement findings.
- **`project-init eval`:** runs the set in disposable worktrees with a given routing configuration and records, per task, checks passed, guard result, review findings, tokens or usage where the client reports it, and wall time.
- **Comparison:** a Lean Kit report comparing two configurations (for example all-`top` against the proposed tiers), so routing changes are decided on recorded results.
- **Success measures** tracked over time: share of changes accepted without rework, usage per accepted change, time from task to green guard.
- Runs are explicit and never automatic, because every run spends model usage.

**Done when:** an eval set with at least two fixture tasks runs end to end under two configurations and produces a comparison report, and a task whose checks fail is reported as failed rather than averaged away.

## Phase 7 — Local-first checks and CI cost

CI should confirm, not be the first place a problem is found, and documentation-only changes should not run the full matrix.

- **Local first:** a pre-push hook (through the Phase 4 hook flow) runs the same fast checks CI runs, so agents and the maintainer get feedback before pushing.
- **Agents do not wait on CI.** Workers finish on local checks; the guard reads the CI result for the head commit (Phase 8) when the work reaches human review, and only a red run sends work back.
- **CI scaffold defaults:** path filters so documentation-only changes run one quick job, dependency caching, and `concurrency` cancellation of superseded runs.
- **Self-hosted runners:** documented as an option for private repositories only, with a warning never to use them for public repositories that accept outside pull requests.

**Done when:** the scaffolded workflow skips the full matrix for a docs-only change in a fixture, and the pre-push hook blocks a push whose fast checks fail.

## Phase 8 — `github` pack

Project Init's own repository already follows a release policy (SemVer with `-preview.N`, `feat/*`/`fix/*`/`docs/*` branches, tag-triggered releases that check the tag against `package.json`, CI on three operating systems). Consuming projects get none of it. A `github` pack makes that policy reusable and checkable:

- **Naming:** branch pattern and Conventional Commit PR titles, enforced by a check and, where supported, a commit-message hook.
- **CI scaffold:** a least-privilege (`contents: read`) workflow proposed from discovered checks, previewed before `--apply`, never overwriting an existing workflow.
- **Releases:** a tag-triggered release workflow that requires the tag to match the package version and to be reachable from the default branch, marks `-preview`/`-rc` tags as pre-releases, and never publishes to a registry unless configured.
- **CI as evidence:** the guard can require a *successful CI run for the exact head commit*, read through the GitHub REST API, turning today's `runsVerified: false` into a verified state. Branch-protection guidance is printed as reviewable steps; Project Init still never changes branch protection itself.
- **Attribution policy:** a configurable rule for AI attribution in commits and PR descriptions (require, allow or forbid trailers such as `Co-Authored-By`), checked by the commit-message hook and at verify time.
- **Skill:** `/project-init-ship` / `$project-init-ship` walks branch → PR (using the repository's template and evidence) → CI → release tag, stopping at each human decision.

**Done when:** a fixture repository gets a previewed CI and release workflow without touching existing ones, a misnamed branch and a forbidden trailer each fail with a precise finding, and the guard blocks until a successful CI run exists for the current head commit.

## Phase 9 — Supply chain in CI

Agents add dependencies freely; the gate should notice.

- CI scaffold includes secret scanning, a dependency audit, and CodeQL where the repository qualifies.
- Third-party GitHub Actions pinned to full commit SHAs, with a check that flags tag-only references (`@v4`), including in Project Init's own workflows.
- Lockfile and dependency-manifest changes produce a required review finding before the guard passes.

**Done when:** a fixture with a tag-pinned action, a committed fake secret and an unreviewed new dependency fails with three precise findings.

## Phase 10 — Feedback loop: `project-init learn`

Failed checks and rejected review findings are the most valuable signal a harness gets, and today they are not reused.

- `project-init learn` reads recent failed checks and review findings from the local audit records and proposes rule or checklist additions to the relevant pack.
- Proposals are written as a reviewable diff to the pack; nothing is applied without `--apply`, and an applied change bumps the pack version and therefore invalidates the baseline like any other pack change.
- Start once enough failures are recorded to learn from; until then, rules are added by hand.

**Done when:** a recorded failure produces a proposed rule diff, and applying it changes the pack hash and the baseline status.

## Phase 11 — `web-gdpr` pack

For web applications in the maintainer's repositories that handle personal data.

- **Privacy gate:** requirements or source changes that introduce or change personal-data fields (forms, database columns, analytics, third-party scripts) require a privacy-review finding before the guard passes. The pack supplies the review checklist; the judgment comes from the reviewer, as with semantic review today.
- **Accessibility:** propose browser accessibility checks where the project has a browser test runner, mapped to requirements like other checks.
- **Content:** optional checks for configured locales (for example Norwegian and English) so pages do not ship half-translated.

**Done when:** a fixture change that adds a personal-data form field is blocked until a privacy finding is imported, and is not blocked after.

## Phase 12 — Gated deployment

The last mile for projects that deploy: guard passes → the maintainer approves → CI deploys.

- Deployment workflow scaffold using a protected GitHub environment with required reviewers, so approval can be given from a phone.
- Cloud credentials through OIDC federation instead of stored long-lived secrets where the target supports it.
- A documented one-command rollback to the previous release, exercised in the fixture.
- Project Init never deploys itself; it only scaffolds and checks the workflow.

**Done when:** a fixture deployment workflow waits for environment approval, uses no stored deploy secret, and a rollback restores the previous release.

## Phase 13 — Work intake from issues

Today work starts when the maintainer prompts an agent. For routine work to arrive on its own:

- GitHub issues with a configured label (and Dependabot pull requests) become proposed Factory jobs: the orchestrator drafts the native spec change and stops for approval before any build.
- Production error reports can create such issues through a documented integration.
- Issues are written from the code perspective and carry no personal data into a repository.

**Done when:** a labelled issue produces a proposed Factory job that waits for approval, and an unlabelled issue produces nothing.

## Phase 14 — `m365-config` pack: tenant configuration as code (later)

Builds on Phase 3. Production tenant changes (Conditional Access, MFA, Intune, ASR, Defender) need exactly the gate Project Init already has: a reviewed plan, human approval, evidence and rollback.

Microsoft Graph's Tenant Configuration Management APIs are generally available for **snapshots and drift monitoring** across Entra, Intune, Defender, Exchange, Purview and Teams, using JSON baselines. They do **not** deploy or remediate; Microsoft points to Microsoft365DSC for that. Their limits shape the design: monitors run every six hours, monitoring is capped per tenant per day, snapshot extraction is capped per month, and parts of the experience require a Tenant Governance licence.

1. **Desired state in Git:** policies as JSON in the same baseline format, so files stay portable.
2. **Plan:** a read-only identity takes a snapshot and diffs it against Git, producing a readable plan of what would change.
3. **Gate:** the plan goes through a pull request; pack checks run first, including:
   - every Conditional Access policy excludes the configured emergency-access accounts;
   - new Conditional Access policies start in report-only;
   - new ASR rules start in audit mode;
   - no tenant-wide block without exclusions.
   The guard then requires the maintainer's approval.
4. **Apply:** a separate write identity applies only the approved change, through Graph or Microsoft365DSC, with least privilege per resource type, idempotently, with every change logged.
5. **Drift:** a monitor's detected drift becomes an issue that re-enters the same flow (Phase 13).
6. **Rollback:** re-apply the previous approved Git version.

**Data boundary:** snapshots and baselines contain tenant configuration and object IDs. They live in the organization's own private repository, on machines and tools the organization has approved, and are never sent to AI services the organization has not approved. The pack itself — rules, checks and plan logic — contains no tenant data.

**Done when:** against a test tenant, a baseline change produces a plan, a policy missing the emergency-access exclusion is blocked, an approved plan applies idempotently (a second apply changes nothing), and re-applying the previous version restores the original state.

## Out of scope for 2.2

- Agent orchestration across a business, scheduling and background services.
- Signed attestations. The [security model](SECURITY-MODEL.md) already states local records can be rewritten; branch protection and CI remain the enforcement.
- Additional spec frameworks.

## Before 2.2 starts

- Promote 2.1 to a stable release per [Releases](RELEASES.md), with the maintainer's acceptance evidence recorded in the [validation report](ACCEPTANCE-REPORT.md).
