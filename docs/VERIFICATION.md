# Evidence and acceptance semantics — 2.1 preview

## Source-backed review workspace

The design skill can create `.project-init/review-context.json` to summarize the selected framework's authoritative specifications for the review tabs. This is a presentation projection, not another PRD. It requires `schemaVersion: 1` and nonempty `specPaths`; every referenced file must exist inside the project and be included in `baseline --spec`. Optional arrays are `journeys` (`label`, `nodes` with `label`, `failurePaths`), `components` (`id`, `label`, `responsibility`, `evidenceStatus`), `edges` (`from`, `to`, `label`), `permissions` (`role`, `scope`, `enforcedAt`) and `questions` (`question`, `status`). Summaries must state only what those sources support. The renderer displays source paths and embeds their current SHA-256 values. Changing the context or registered source invalidates the baseline. Existing legacy architecture remains a fallback; unavailable sections are labeled Not linked rather than implying a completed review.

Journeys and security boundaries use connected flow nodes; system edges use labeled, directional handoffs and component names. Components require unique nonempty IDs and labels. Edges require existing component IDs and nonempty handoff labels. Diagrams summarize the declared model; they do not discover or verify application architecture automatically.

An optional `referenceMockup` in `ui-design.json` may point to a standalone HTML file inside `.project-init/`, distinct from the review output. The review workspace previews that authored design in a sandboxed frame instead of forcing a generic dashboard layout. The file is hashed into the UI approval baseline. Keep it offline and use the root `data-screen`, `data-theme="light|dark"` and `data-state` presentation attributes for variants. A `project-init-preview` event with those values in `detail` fires after initialization; authored scripts can listen for it when they need to update screen content. Frame scripts cannot access the parent document or make network requests; rendering a mockup does not establish application behavior.

## Deterministic local coverage

The package includes Node regression tests for: source discovery and preservation; version-pinned vendor installer dry-run; approved spec/UI baseline hashing; review and approval invalidation; local filesystem safety; synthetic Codex/Git bounded execution; configured tests with actual process exit status; bundled Lean Kit rendering and audited output; Codex/Claude skill descriptions and no-overwrite behavior; strict PNG CRC/dimension/pixel diff checking; visual screen/theme/viewport/state coverage; stale screenshot invalidation; per-requirement semantic evidence; and positive/negative synthetic release-candidate readiness. A successful synthetic Codex is *not* real authenticated Codex acceptance.

Run:

```powershell
npm run check
node --test vendor/lean-kit/tests/render.test.mjs
```

## Independent gates

1. **Baseline:** exact hashes of authoritative native spec documents, UI design JSON, check configuration, visual case manifest and approved reference PNGs.
2. **Design review:** local reviewer and human approver records for the current baseline. These are user-supplied names/evidence, not cryptographic signatures.
3. **Execution receipt:** a bounded actual `codex exec` completed with Git-scoped source changes; out-of-scope changes block further acceptance. Claude work must supply real evidence through a separately reviewed process; it is not automatically equivalent.
4. **Tests:** configured real commands exit successfully on the *current* source and approved baseline. No configured checks means blocked.
5. **Semantic evidence:** each mapped requirement references a native spec, configured test(s) or visual evidence, current code files and a full independent review finding of `pass`. Actual semantic correctness is not guaranteed simply because the finding JSON says `pass`.
6. **Visual fidelity:** actual/reference PNGs at matching pixel sizes, both themes and viewports for each approved screen, plus defined states. The diff must stay within per-case allowed thresholds. Screenshot pixels do not verify application semantics, accessibility or interactions.
7. **Guard:** collates evidence; fails on stale, absent or failed inputs; `status` will invalidate cached gate status after source/screenshot change.

A passing `guard` returns `readyForHumanReleaseReview:true` and **`releaseApproved:false`**. A separate human release decision, protected branches and required CI checks remain necessary for production.

## Gaps requiring acceptance on user workstation

- Native live OpenSpec/Spec Kit/BMAD installation and native task workflows with the chosen exact upstream releases.
- Claude Code command discovery and actual interactive behavior (the static skill generation is regression-tested). Native Windows Codex acceptance has scoped live evidence: [non-UI lifecycle](WINDOWS-ACCEPTANCE-2026-10-20.md) and [seven-skill/UI test with blocked acceptance](WINDOWS-SEVEN-SKILLS-2026-10-20.md).
- Native CLI capture across integrations and platforms. Local Windows Edge app tests and an isolated renderer browser test passed; this does not establish full graphical lifecycle acceptance.
- Real project behavior verification by project-specific unit/integration/e2e tests; visual pixel match is not enough.
- v1 PowerShell/Pester regression on Windows; the build container has no PowerShell.
- Remote CI branch protection, authenticated approvers, externally immutable audit storage, long-running unattended process supervision and cross-agent execution parity.

## Operational diagnosis

- `project-init status --project <root>` for current gates.
- `.project-init/audit.jsonl`, `.project-init/runs/`, `.project-init/evidence/latest-run.json`, `latest-checks.json`, `semantic-review.json`, `latest-visual.json`, `latest-guard.json` for receipts.
- `.project-init/evidence/visual-review.html` for side-by-side reference/actual/diff images.
- `.project-init/lean/audit.jsonl` for Lean renderer invocation.
- `git status` / `git diff` before any manual rollback; no destructive reset is performed.
