# Factory execution evidence and existing-code verification

Factory's dashboard, worker output and GitHub PR are useful records, but none alone proves that the current integrated source has passed Project Init's gates.

## A real Factory job

Prepare the existing native feature, configure actual check commands and requirement mappings, register the resulting baseline, and obtain its actual independent review and human approval before dispatch. Native specifications must be committed so the isolated worktrees receive them. The orchestration checkout stays on the recorded base.

Worktree creation binds the approved native baseline, feature, board source and job contract before dispatch. The job's `Job:` and `Source:` headers must agree with its board entry. Task completion checkboxes can change; task IDs, assignments, paths and requirements remain part of the contract hash. Another feature on the same Git base cannot borrow the job's execution evidence. A reviewed scope reassignment needs a new execution context rather than rewriting an old receipt.

The Codex bridge retains an immutable process receipt with the observed exit status, initial/final commits and hashed logs. Every new attempt invalidates the old success before preflight. It requires the worker's actual `WORKER: DONE` result; a previous final message cannot be reused. Failed or blocked Codex runs cannot be integrated. The worktree helper records each real Git merge command, its before/after commits, worker commit, exit status and output log. Failed attempts remain visible.

After integrating the assigned workers, run from the orchestration checkout:

```text
project-init execution factory --project . --job <actual-job-slug> --allow <approved-path> --execute
```

Repeat `--allow` for each approved file or directory. Without `--execute`, this command previews the integrated scope and checks; it does not create state or execute checks.

On execution the bridge:

1. Requires a real registered job and matching board, base, isolated worktree and integration receipts.
2. Validates the command history, log hashes, current integrated commit and actual changed paths against the explicit scope.
3. Copies the exact current baseline, configuration and existing approval records into the integration worktree when absent, preserving actor, time and evidence. Conflicting existing files are not overwritten. `factory-origin.json` records the source checkout; this is not a new approval.
4. Runs the configured checks in that integration worktree and writes `evidence/latest-run.json` bound to the integrated source and approved baseline.

Use the returned `integrationProject` for `status`, independent `source-review`, semantic review, visual comparisons and the final `guard`. The integration receipt does not reconcile changed source or approve release. Missing reviews remain blockers. Refresh evidence after each fix/integration round.

Claude's interactive worker is observed through its actual committed Git integration; the receipt does not claim that an unattended Claude runner executed or authenticate the commit's author. Codex process fixtures used by the automated tests are explicitly synthetic, not live authenticated client acceptance.

## An existing PR or already implemented feature

An existing implementation does not need a dummy code edit or an invented Factory job. Reuse its existing specification and PR, configure its real checks and requirements, and review its current source:

```text
project-init verify --project . --execute
project-init source-review --project . --actor <actual-independent-reviewer> --evidence <actual-review-reference>
project-init semantic import --project . --file <reviewed-findings.json> --actor <actual-reviewer> --evidence <actual-review-reference>
project-init execution existing --project . --task <existing-task> --actor <source-reviewer> --evidence <actual-review-reference> --execute
project-init guard --project .
```

An approved current baseline is still required. The existing-code command checks that the independent source review, passing configured checks and complete semantic review describe the exact current source and baseline. It records `implementationExecuted:false` and `runner:existing-code`; it does not fabricate a build process or an author identity. UI projects still need the separate current visual evidence before the guard can pass.

Changed source, baseline, review evidence or check receipts invalidates this attestation. Re-run actual checks/review as appropriate before recording it again. Legacy execution receipts without baseline/scope binding are reported as unbound; use this explicit existing-code route for previously completed work instead of pretending to replay implementation.

## Operations and rollback

Runtime receipts and existing review records are local attestations, not authenticated signatures. Preserve `factory/`, `.project-init/` and the worktree registry when upgrading. A failed evidence collection does not reset code, merge branches, push, deploy or change human approval. Check the returned reason and actual log before retrying. Configuration conflicts in an integration checkout require explicit review; they are never replaced with the coordinator's files silently.

To roll back tooling, restore the prior tracked Factory helper/skill files while preserving runtime data. Older guards do not understand the new existing-code evidence mode; do not relabel the record to force acceptance. The normal repository review and release process remains in force.
