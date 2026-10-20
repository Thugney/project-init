# Windows acceptance — 2026-10-20

**Result: PASS for the native Codex, framework `none`, non-UI lifecycle below. Preview remains not production-accepted.**

Tested PR [#8](https://github.com/Thugney/project-init/pull/8), exact head `3f9532dcf3c7693c2ddeefdbb3fcdab1c1945678`, cloned separately from the existing local toolkit. GitHub had already merged it as `49a038b330b48e3fd33a1cf1cd93b4642bd59484`; `git diff HEAD origin/main` showed identical trees before this documentation change. No application/runtime source was changed to obtain the pass.

## Actual environment

| Component | Observed value |
| --- | --- |
| Date/time | 2026-10-20; successful live run 16:01:43–16:02:14 UTC; guard 16:03:09 UTC (18:03 Oslo) |
| OS | Windows x64; OS build 26200.9168, DisplayVersion 25H2; registry ProductName reports `Windows 10 Pro` (reported verbatim rather than inferring marketing edition) |
| Shell | PowerShell 7.6.5 |
| Node / npm | v24.12.0 / 11.12.1 |
| Git / GitHub CLI | 2.55.0.windows.5 / 2.92.0 |
| Project Init | 2.1.0-preview.2 |
| Successful coding agent | Native `codex.exe`, 0.163.0-alpha.10.2, from the installed Codex desktop application's `bin` directory |
| Unsuccessful coding agent | npm `codex.cmd`, codex-cli 0.125.0 |
| Authentication | Existing ChatGPT login; no new API key or paid API credential |
| Process permissions | Parent test command required access outside the desktop session sandbox for existing Codex session files and network. The spawned coding agent still received `--sandbox workspace-write`. |
| Framework / UI | `none` / `no`; no vendor installer or browser involved |

No dependencies were added or installed, no global CLI/skill migration was performed, and user-wide Codex configuration was not modified. PATH was prepended with the native executable directory only in the successful test's PowerShell process.

## What passed and how

| Check | Method | Actual result |
| --- | --- | --- |
| Shipped syntax and regression suite | `npm run test:all` | 35/35 Project Init + 8/8 Lean Kit; zero failures/skips |
| Windows PR #8 regressions | Included in those 35 tests | Native EXE discovery, first-PATH-directory resolution, CMD and BAT dispatch with spaces/conflicting working-directory shims; unsafe batch arguments rejected |
| CLI entry point | `npm run smoke` | Help and version exit 0 |
| Initial functional failure | Fixed Node tests against an intentionally throwing stub | 0/3 passed, 3 failed; confirms tests detect absent implementation |
| Human specification gate | Robel explicitly approved the disposable addition specification in chat; separate verifier reviewed its design | Recorded as test-only approval, not a product/release decision |
| Real implementation | Unmodified `runCodex()` invoked real authenticated `codex exec --json --sandbox workspace-write -` | Exit 0; only `src/add.mjs` changed; no unapproved files or Git revision changes; 30.655 seconds |
| Actual behavior | CLI `verify --execute` ran `node --test tests/add.test.mjs` | 3/3: positive, negative, zero numeric sums |
| Independent source review | Separate verifier inspected implementation, immutable tests/spec, before-test log, receipt and actual Git diff/status | REQ-ADD passed; source review and semantic findings imported through the shipped CLI |
| Candidate acceptance | CLI `guard`, then `status` | Tests, semantics and execution current; no missing evidence; candidate ready; release never approved |
| Stale evidence rejection | Changed implementation from addition to subtraction without refreshing receipts | Status candidate false; guard exit 1; tests/semantics/execution stale |
| Exact restoration | Restored the original implementation bytes; CLI `guard` | Pass restored; `releaseApproved` remains false |

The successful function is `export function add(a, b) { return a + b; }`. This is a deliberately small real coding task to validate orchestration, not a claim about larger application quality. `visualCurrent: true` in the receipt means the visual gate is inapplicable because UI is disabled; no screenshot was captured.

## Restrictions and failures encountered

1. The first fixture setup used an absolute Node executable in check configuration. The existing runner allowlist rejected it. The harness was corrected to the supported `node` command; product code was unchanged.
2. The first live invocation inside the parent sandbox failed on Codex session directory permissions and network access. It produced no code changes. The authorized retry allowed those host resources; the child Codex sandbox remained enabled.
3. The npm-installed Codex 0.125.0 then failed with `The 'gpt-5.5' model is not supported when using Codex with a ChatGPT account.` This older CLI/configuration combination is **not validated**. The native 0.163.0-alpha.10.2 executable succeeded using its existing effective configuration, with no model override by the harness. The successful JSONL does not identify the effective model; no model-specific result is claimed.
4. Native startup emitted nonfatal plugin-sync/duplicate-role warnings and encountered missing optional workspace context/package files. It continued, edited the allowed file and passed the fixed tests. These host warnings are not silently counted as fully clean installation acceptance.

When multiple Codex installs exist, check `Get-Command codex -All` and executable versions. For this tested configuration, prepend the installed native EXE directory to the current process PATH. Do not assume PowerShell's selected script and Node's executable resolver select the same program. Project-level model configuration is documented in [official OpenAI configuration guidance](https://learn.chatgpt.com/docs/config-file/config-basic); this run did not change it.

## Reproduction

The two opt-in harnesses are excluded from `npm test`; they execute an authenticated agent only when explicitly invoked. The setup calls the shipped library; final checks exercise the shipped CLI. They do not install an agent or framework. The live test creates an initial commit **only inside its new disposable repository**, on `test/disposable-addition`, with an invalid fixture email. The coding agent must not commit.

1. Check out the tested PR head (or its identical squash merge). Run `npm run test:all` and `npm run smoke`.
2. Obtain an actual independent review of `specs/add.md` and the fixed test design embodied in `tests/manual-live-e2e.mjs`, plus actual human approval. Do not substitute invented names or approvals.
3. In PowerShell, select the intended installed agent and create a fresh fixture. Replace all placeholders with actual paths, reviewer identity and approval evidence:

```powershell
$env:PATH = '<installed-native-codex-directory>;' + $env:PATH
node tests/manual-live-e2e.mjs '<new-disposable-directory>' --approved-disposable-test --reviewer '<actual-reviewer>' --review-evidence '<actual-design-review-reference>' --approver '<actual-human>' --approval-evidence '<actual-approval-reference>'
```

4. A separate reviewer must inspect the generated source, fixed tests, spec, Git diff and run receipt. Only after that review passes:

```powershell
node tests/manual-live-finalize.mjs '<disposable-directory>' '<actual-independent-reviewer>' '<actual-source-review-reference>'
```

Finalization runs `source-review`, `verify --execute`, `semantic import`, `guard`, and `status`, then checks rejection after source mutation and acceptance after exact restoration. Local `.project-init/` retains raw logs. The initial harness used this session's actual reviewer/approval references; the checked-in reusable harness requires those references as arguments instead of hardcoding identities. Both harness files passed `node --check`.

## Committed evidence

All files below are in [verification/2026-10-20-windows](verification/2026-10-20-windows/). Local fixture paths in functional test output were replaced with `<fixture>`; actor references are local attestations, not authenticated signatures. Raw agent logs are retained locally rather than publishing unrelated workspace instructions.

- [Automated suite output](verification/2026-10-20-windows/regression-tests.txt)
- [Initial failing tests](verification/2026-10-20-windows/before-tests.txt), [passing tests and check receipt](verification/2026-10-20-windows/after-tests.txt)
- [Actual native run receipt](verification/2026-10-20-windows/native-run.json), [configured check receipt](verification/2026-10-20-windows/checks.json)
- [Passing, stale and restored guard receipts](verification/2026-10-20-windows/guard-lifecycle.json)
- [Implemented source](verification/2026-10-20-windows/add.mjs), [immutable functional tests](verification/2026-10-20-windows/add.test.mjs)

Not covered: live OpenSpec/Spec Kit/BMAD installation or workflows, Claude, skill menu discovery in either client, Windows browser capture, UI interactions/accessibility, legacy Pester, global installation/migration, Linux/macOS live execution, deployment or production release. The regression suite contains synthetic visual/approval/agent fixtures; those are distinct from this authenticated non-UI live test. Existing cross-platform CI is additional evidence only once its runs actually pass.
