# Implementation plan: Evals

**Spec:** `specs/006-evals/spec.md`

## Design

- `lib/evals.mjs`: `loadEvalSet`, `evalPlan`, `runEval` (`--execute`), `compareRuns`, `trend`.
- Worktrees: reuse the Factory worktree tooling where possible; otherwise `git worktree add --detach <tmp> <sha>` from a local clone, cleaned up after the run (kept on failure with a path in results, for inspection).
- Execution: invoke the Factory job flow non-interactively where supported; for a single-worker mode, invoke the configured builder client directly with the task prompt, then run checks and the guard in that worktree.
- Reporting: produce Markdown/JSON for the bundled Lean Kit renderer (`project-init lean`).
- Configuration snapshot: store the routing configuration used, and its hash, inside each run.

## Changes

| File | Change |
| --- | --- |
| `lib/evals.mjs` | new |
| `bin/project-init.mjs` | `eval`, `eval compare`, `eval trend` |
| `examples/evals/` | two small synthetic tasks with fake repositories built during tests |
| `docs/EVALS.md`, `docs/COMMANDS.md` | how to build an eval set from real work, cost warning, honesty rules |
| `package.json` | add `lib/evals.mjs` to `check` |

## Risks

- **Cost of runs.** Mitigation: plan by default, explicit `--execute`, invocation estimate shown.
- **Flaky tasks.** Mitigation: fixed base commits, time limits, `error` and `timeout` distinct from `failed`.

## Rollback

Self-contained; reverting removes the commands. Recorded results remain readable JSON.
