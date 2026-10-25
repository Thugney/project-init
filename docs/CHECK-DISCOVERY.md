# Check and CI discovery

Feature preparation can discover verification command proposals without running package managers, tests, installers or CI.

## Supported project inputs

The discovery adapter reads `package.json` at the project root and in explicitly declared workspaces. It also checks conventional `backend`, `frontend`, `apps/*`, `packages/*` and `services/*` locations. Workspace patterns support literal directories and single `*` segments, within a bounded scan. Independent Git checkouts and worktrees, dependencies, generated directories and `work/` are excluded. Prepare a separate worktree from its own root.

Real scripts named `test`, `build`, `typecheck`, `type-check`, `lint`, `check`, `verify`, `validate`, `smoke` and their colon-separated variants become proposals. Watch commands, development servers, empty/placeholder scripts and obvious failure masking are excluded. A script's existence is not proof that its tooling or dependencies are correctly configured; only an executed check can establish its result.

Each proposal contains a stable name, an argv array and a repository-relative working directory. Root names match their script name; a child check is named, for example, `backend:test`. Existing custom check names and mappings remain owned by the preparation workflow and are not rewritten by discovery.

`packageManager` and lockfiles select npm, pnpm or Yarn. Conflicting signals block automatic selection. Without either signal, the proposal uses the npm convention for `package.json` and includes an explicit warning to confirm the intended manager and lockfile. Unsupported runtimes require explicit check configuration; a Python project is not assigned invented pytest commands.

Literal script dependencies are deduplicated. For example, a root `build` that calls `build:backend`, which runs `cd backend && npm run build`, covers that child build for scheduling purposes. It does not prove requirement coverage. Supported npm workspace targeting is resolved from actual package paths/names. Dynamic, wrapped or unsupported recursive routing and script cycles are reported for explicit selection rather than silently treated as complete coverage.

## CI is reported separately

The adapter identifies configuration files for GitHub Actions and several conventional alternative CI locations. `configured` means files are present and readable; it does not claim that their syntax, branch filters, check execution or required-check enforcement have been verified. In particular, a workflow restricted to a default branch may not run for a PR targeting another feature branch.

The result retains `configurationVerified: false`, `runsVerified: false` and `enforcementVerified: false`. Project Init's own passing CI does not establish application CI readiness. Discovery does not create workflows, alter branch protection or invoke external services.

## Verification and operations

The regression suite covers command discovery, monorepo deduplication, manager conflicts, excluded worktrees, unsupported inputs and truthful CI states. It uses temporary synthetic manifests and never launches the discovered project commands.

Discovery is read-only and requires no rollback. Applying proposals is a separate explicit operation. Preserve the project's custom checks and actual CI configuration; use their versioned changes for review and rollback.
