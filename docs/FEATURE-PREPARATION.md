# Prepare existing work without replacing its specification

Project Init separates **installed tooling**, **prepared feature configuration**, **recorded approval**, and **verified implementation**. Installing Spec Kit and Factory does not establish that a particular feature has passed these gates.

## Normal entry points

Use the existing `/project-init`, `/project-init-plan`, `/project-init-build`, and `/project-init-verify` skills in Claude, or their `$project-init-*` equivalents in Codex. Their instructions now call the built-in preparation lifecycle and carry the selected native feature into the next phase.

`project-init init --project .` is a read-only bootstrap preview, including for a new directory. `init --apply` installs or resumes the selected tooling, updates the project-local Project Init skills with reviewed backups when needed, and prepares any unambiguous existing feature. Its `TOOLING READY` result is followed by the separate feature status. It never manufactures a feature, review, approval, test result, or background worker.

The preparation command is also available directly:

```powershell
project-init prepare --project .
project-init prepare --project . --apply
```

Preview discovers real inputs without changing them or executing package scripts. Apply writes only preparation state/configuration and, when complete, the baseline. It does not edit the native specification or implement application code.

## How existing work is selected

Preparation uses an explicit selection first and preserves a recorded selection on the same branch. It then considers the native feature environment/current branch, an existing registered baseline, or a single native candidate. A conflicting or ambiguous native feature environment remains a blocker. Multiple candidates remain an explicit selection problem; Project Init does not choose by newest filename or highest number.

```powershell
project-init prepare --project . --feature specs/001-example
project-init prepare --project . --feature specs/001-example --apply
```

For an existing authoritative document outside the conventional native feature folder, register its actual path:

```powershell
project-init prepare --project . --spec docs/existing-feature-contract.md --apply
```

Repeated preparation preserves an explicitly selected file set. It does not add a plan that was deliberately excluded or drop an additional contract. Spec Kit feature discovery selects `spec.md` and an existing `plan.md`; it reads `tasks.md` for task IDs and progress but does not automatically hash changing task checkboxes into the design baseline. An explicitly supplied `--spec tasks.md` remains an authoritative hashed input and changing it invalidates that baseline.

OpenSpec changes are discovered through their existing proposal/design/spec documents. BMAD v6 stories are discovered from the installed `_bmad/` configuration: ready or in-progress stories become feature candidates, their story is the task path, and their configured PRD, architecture and epic are supporting spec paths. One eligible story is selected automatically; multiple stories require `--feature` or `--spec`. BMAD v7 is unsupported. Deliberately framework-free projects can select authoritative files with `--spec`. No adapter generates a second PRD or task board.

## Checks and requirement mappings

Preparation discovers supported real package scripts and their package working directories. Existing custom check names, arguments and additional fields are preserved. See [check discovery](CHECK-DISCOVERY.md) for the supported package managers, aggregate detection and limits.

Stable requirement IDs are read from native definitions such as `- **FR-001**: ...`. Explicit `checks: <configured-name>` or `visualCases: <case-id>` references in the requirement or a task containing that exact ID can populate a mapping. A check for `FR-10` is not evidence for `FR-1`.

Project Init does not assign every test to every requirement or equate a test filename with semantic coverage. If the native artifacts do not make the mapping explicit, the coding/review agent must inspect the actual tests and supply the mapping as part of preparation. This is agent work, not a requirement that the user manually author JSON.

The machine-readable input is an existing project-local file, for example `.project-init/mapping-input.json`:

```json
{
  "schemaVersion": 1,
  "checks": [
    {"name": "backend:test", "argv": ["npm", "run", "test"], "cwd": "backend"}
  ],
  "requirements": [
    {
      "id": "FR-001",
      "specPath": "specs/001-example/spec.md",
      "checks": ["backend:test"],
      "visualCases": []
    }
  ]
}
```

```powershell
project-init prepare --project . --mapping .project-init/mapping-input.json --apply
```

This example is a configuration shape, not evidence that a real feature or test exists. The optional `checks` field supplies actual commands when discovery cannot establish them. Existing IDs and check commands are not silently replaced. Unknown check names, missing coverage, conflicting package-manager inputs, mismatched feature scope and missing visual references remain blockers. Repeating apply cannot turn an unresolved discovery conflict into success merely because partial configuration was written previously.

Explicitly selected, mapped alternative commands can resolve unsupported aggregate-script routing. Preparation records which commands were automatic proposals so a later resume cannot silently reinterpret them as deliberate selections. A conflicting command with an existing check name requires explicit reconciliation; a package-manager or lockfile conflict remains a blocker even when custom checks exist.

## Baseline and approval order

Preparation writes the check configuration and requirement mapping **before** registering the baseline, because both are hashed inputs. For UI work it also requires the applicable authored design, screenshot matrix and reference files. Missing design evidence remains explicit rather than being replaced with placeholders.

The resulting progression is:

1. `feature-required`: select or finish the native feature.
2. `preparation-required`: resolve the listed check, mapping or design gaps.
3. `baseline-required`: apply the completed preparation.
4. `review-required`: obtain an actual independent review.
5. `approval-required`: record the human's actual acceptance of that exact baseline.
6. `prepared`: configuration, baseline, review and approval match. Execution and acceptance evidence are still separate.

The existing `review` and `approve` commands record real actor/evidence references. Preparation never calls them on the user's behalf. Repeated preparation with unchanged inputs preserves the existing approval and avoids unnecessary rewrites. Changed specifications, mappings, checks or visual references invalidate approval as before.

## Worktrees and session handoff

Each worktree owns its source fingerprint, preparation state and evidence. Status and handoff identify the project root, branch, other registered worktrees, native feature/task paths and Factory board location. A linked worktree with native feature files can create its own preparation state during explicit apply. Local native ownership takes precedence over another worktree's methodology, and another worktree's approval/results are never inherited by this path.

The Factory integration bridge has a separate, stricter process for copying the exact reviewed baseline with provenance; see [Factory evidence](FACTORY-EVIDENCE.md).

For a Factory checkout, a recorded UTF-8 native Markdown/text LF/CRLF conversion can preserve the original approved digest without modifying the specification or approval. This requires the bridge's baseline-bound representation evidence; ordinary baseline checks do not broadly normalize files. Actual source fingerprints remain byte-exact.

A new agent session should resume the same native feature and remaining task IDs, carrying the actual worktree and branch, configured checks, remaining gates and real Factory slug if applicable. A follow-up card or an open PR is not a Factory execution receipt.

Registered nested worktrees and Factory runtime records are excluded from the parent source fingerprint. Ordinary nested repositories and Git-tracked vendored application source remain covered. Check working directories cannot cross into another nested Git checkout; verify that checkout separately.

## Verification and CI

`verify --execute` runs the configured commands in their recorded working directories. Every launch failure replaces any old passing result with a failure; a check that changes fingerprinted source cannot claim passing evidence for the resulting source. Feature readiness also detects a recognized native requirement omitted from `requirements.json`.

Project Init's own CI runs its regression suites across Linux, Windows and macOS with Node 22/24 and Python 3.12. The suites include synthetic installer/worker fixtures, real Git worktrees and actual local check processes. They do not establish live authenticated Claude/Codex behavior on a user's machine.

Application CI is reported separately. A workflow file establishes configuration presence; it does not establish trigger coverage, successful runs, or required-check enforcement. Preparation does not overwrite existing CI or silently introduce a CI provider. The dashboard's empty-state behavior is documented in [Factory dashboard](FACTORY-DASHBOARD.md).

## Upgrade and rollback

Install the reviewed Project Init version, preview `init` in the existing checkout, then apply the displayed changes. No deletion of `.project-init`, native `specs`, Factory jobs or application worktrees is required. Existing skill conflicts use the displayed backup plan; existing Factory board data is preserved.

For rollback, reinstall the previous reviewed CLI revision and restore only the managed skill/tool files from their reviewed backup or version-control diff. Preserve runtime/job history and the native feature artifacts. Older guards may reject the new Factory/existing-code receipt modes; they must not be described as equivalent to an older Codex execution receipt. No automatic merge, release, deployment or destructive reset occurs.
