# Project Init 2.1 architecture

![High-level Project Init ownership and execution](architecture.svg)

See [ADR 0001](adr/0001-single-source-of-truth.md), [security model](SECURITY-MODEL.md) and [release policy](RELEASES.md).

## Ownership: one owner per artifact

| Artifact / capability | Sole authority |
|---|---|
| Discovery, recommendation, framework pin, installation safety | Project Init |
| PRD, architecture decisions, native specifications, implementation task status | Chosen framework: OpenSpec, Spec Kit, BMAD, or deliberate `none` |
| Approved high-fidelity screens, states, visual reference PNGs, reviewer baseline hashes | Project Init visual-review capability, linked from native specs |
| Actual code changes | Codex or Claude Code (depending on operator) |
| Native framework review | Selected framework (follow its installed version's actual workflow) |
| Deterministic build/test results, source fingerprints, bounded Codex receipts, screenshot diffs, requirement-level evidence gate | Project Init |
| Human design and release approval | User |
| Context/report rendering | Bundled Lean Kit (no separate install) |

## The execution graph, without duplicate work

```text
New / existing project
  -> discover real source, existing tests, required UI and framework footprints
  -> rank OpenSpec / Spec Kit / BMAD / none; human chooses
  -> install selected framework only after dry-run, pinned version and consent
  -> framework owns specs, architecture decisions and task definitions
  -> Project Init presents high-fidelity mockup and recorded design review
  -> human accepts approved spec, mockup and screenshot reference baseline
  -> Codex/Claude executes one scoped native-framework implementation task
  -> build, tests and browser behavior checks actually run
  -> native framework review + independent requirement/source review
  -> screenshot capture + viewport, theme, state comparison
  -> Project Init guard checks current baseline, approved source, actual tests,
     bounded implementation evidence, reviewed requirement mapping and visual cases
  -> failure: return defect to bounded coding or user for changed requirements
  -> pass: release candidate available for human decision (NOT automatic release)
```

All execution happens **only when an external process is actually invoked**. Framework and skill files alone do not launch Codex or Claude. The current runner uses the authenticated Codex CLI in foreground; Claude skills guide its interactive tool process. No background dispatcher, cross-agent daemon, or automatic full-product coder exists in this preview.

## Visual design

Project Init's review UX replaces the confusing default interconnected-numbered arrow graph. `render` uses explicitly authored `ui-design.json` with real labels, components and screen states. Synthetic examples are labelled as such. Responsive and theme variants are reviewable. The PNG comparison is strict, per configured case; any changed approved reference invalidates the recorded design baseline. It checks pixels, not click functionality, ARIA, performance or end-to-end behavior; those must be separate browser tests mapped to requirements.

## Implementation evidence and failure model

- Spec/UI/check config/reference PNG hashes are covered by the versioned baseline; changes invalidate human approval.
- Source snapshot and source-review reconciliation prevent old evidence being reused after changed code.
- Test receipt captures the actual argv command, exit status, log path, source hash and baseline fingerprint.
- Semantic evidence import requires every mapped ID and hashed code evidence; local attestations **are not signed** or self-proving.
- Visual evidence captures actual/reference/diff hashes and cross-checks minimum screen/viewport/theme/state coverage.
- `guard` fails closed; `status` rechecks key evidence inputs so a stale cached PASS is not accepted if screenshots or source change.
- All `run` invocations are bounded and logged; Git scope detects out-of-scope changes; no automatic rollback or production deployment.
- The controls don't secure against a hostile local administrator who modifies all records. Require repository branch protection, CI checks, trusted reviewers and independent evidence for production use.

## Backwards compatibility

Version 1 PowerShell architecture review files are retained unchanged under `legacy/v1/`. Their existing `planning/architecture/` approvals are *not* silently upgraded or treated as approved in v2. The old destructive/global `setup.ps1` and scaffolding script are retired and not in the active installation path.
