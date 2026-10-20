# Windows seven-skill and review-workspace test — 2026-10-20

**Result: all seven installed skills were invoked successfully; functional and renderer checks passed. The guarded UI lifecycle is NOT accepted.** No human design approval, approved baseline or bounded implementation receipt was fabricated to turn the result green. The README has not been upgraded to claim a passing seven-skill UI lifecycle.

This extends the separate [passing non-UI PR #8 test](WINDOWS-ACCEPTANCE-2026-10-20.md). It tests the repaired local candidate, including runtime changes beyond PR #8; it does not claim the original PR #8 renderer passed these checks unchanged.

## Environment and invocation

Windows x64 build 26200.9168, DisplayVersion 25H2; PowerShell 7.6.5; Node 24.12.0; npm 11.12.1; Project Init 2.1.0-preview.2. Native Codex 0.163.0-alpha.10.2 used the existing signed-in account. Browser automation used the existing bundled Playwright installation and Microsoft Edge 155.0.4283.62. No new dependency or account credential was required. Other OSs, Claude and external planning frameworks were not exercised live.

Each skill was passed as an explicit skill input to native Codex's app-server, with the disposable project as its working directory. A completed turn proves that invocation completed, not that its acceptance gates passed. See [seven native-turn summaries and local raw-log hashes](verification/2026-10-20-seven-skills/native-turns.json).

| Installed skill | Observed result |
| --- | --- |
| Start | Initialized the disposable browser project and presented framework selection. |
| Plan | Following actual scope/framework approval, wrote the authoritative counter specification using framework `none`. |
| Design | Authored the review data and reference; initial incomplete/poor design was rejected. Subsequent repairs added source-backed tabs, authored previews and connected flow diagrams. Human acceptance remains absent. |
| Build | Native Codex created real `src/` files under the user's instruction to produce a working disposable prototype. This was direct implementation, explicitly **not** a guarded `project-init run` with an accepted design. |
| Verify | Ran the configured browser command directly after guarded verification refused the missing approved baseline; recorded comparisons and failing guard truthfully. |
| Status | Reported actual missing gates and false readiness. |
| Report | Bundled Lean Kit generated HTML, exit 0; inspected output structure/content and checked its SHA-256. The report artifact does not approve a release. |

## What was fixed and tested

The renderer now accepts a source-backed review projection, displays its specification paths, and hashes that projection into acceptance. It supports a sandboxed authored HTML preview instead of imposing dashboard navigation on a one-screen tool. Missing review sections are explicitly unavailable. User journeys, component/data handoffs and security boundaries render as connected, labeled flows. Dark fallback states inherit their preview theme. Component edges reject unknown IDs and missing labels. Preview HTML changes invalidate the registered baseline.

| Check | Method and scope | Result |
| --- | --- | --- |
| Syntax and default regressions | `npm run test:all` | 39 Project Init + 8 Lean Kit = **47 passed**, no failures/skips. |
| CLI | `npm run smoke` | Help/version exit 0. |
| Whole renderer regression | `node tests/manual-review-browser.mjs`, isolated synthetic workspace served only on loopback | All five panes at widths **375/768/1024/1440**: navigation, one visible pane, current-tab indication, no horizontal overflow, source labels and connected journey/system/security diagrams. |
| Preview controls and isolation | Same synthetic browser fixture | Light/dark, Default/Empty and mobile/desktop controls reach the authored frame; keyboard activation works; frame fills capture viewport; parent-document access and external fetch blocked; no page runtime errors. Unlinked sections remain disabled. |
| Actual counter implementation | Fixed `node tests/browser.cjs`, independently rerun | **5 cases passed**: desktop 1440×900 and mobile 375×812 in both themes, plus desktop-light Empty. Four Default cases exercise behavior. |
| Counter behavior | Same four functional variants | 0→1→2→3, Reset at positive/zero, Enter/Space on both buttons, Tab/visible focus, reload clears count, polite live-region markup, 44px minimum targets, Empty state, no external requests/errors/overflow. |
| Theme and reflow | Query override removed before asserting system-theme emulation; change and restoration asserted | Passed. 200% **CSS-zoom reflow proxy** passed; native browser-menu zoom and actual OS-settings changes untested. |
| Pixel comparison | Five reference/actual zero-state PNG pairs | **0 changed pixels** in every pair. Overall acceptance remains false because the references are not human approved. |
| Independent review | Separate reviewer inspected source, fixed tests, native logs and synthetic workspace screenshots | No blocking implementation/renderer defect found; full UI acceptance remains uncertain. |
| Existing file-page inspection | Direct in-app browser control of the user's `file://.../review.html` | **Blocked by browser policy.** The synthetic renderer test is separate; it is not evidence of manually clicking through that file page. The running HTTP counter was directly exercised in the in-app browser. |

The original review file was regenerated locally. Its authored counter preview also gained simulated Increment/Reset interactions; these are design-prototype code, separate from `src/`. Its script was unit-executed with DOM doubles; direct browser inspection of that restricted file was not performed. The screenshot reference remains a design reference, not a behavioral oracle.

## Acceptance outcome and artifacts

`project-init verify --execute` refused the missing approved baseline. `project-init guard` exited **1**, with `readyForHumanReleaseReview:false` and `releaseApproved:false`. Required evidence includes actual design acceptance, registered specification/design baseline, source reconciliation, current guarded test/semantic/visual receipts, and a real bounded implementation run. A successful prototype and seven completed invocations do not substitute for those records.

Archived [browser results](verification/2026-10-20-seven-skills/counter-browser-results.json), [renderer results](verification/2026-10-20-seven-skills/renderer-browser-results.json), [independent review](verification/2026-10-20-seven-skills/independent-ui-review.json), [guard result](verification/2026-10-20-seven-skills/guard-result.json), [Lean receipt](verification/2026-10-20-seven-skills/lean-receipt.json), [generated report](verification/2026-10-20-seven-skills/lean-report.html), and [tested fixture source](verification/2026-10-20-seven-skills/fixture/specs/counter.md) distinguish passing checks from blocked acceptance. Exported turn summaries omit raw conversation/session logs and credentials.

The optional renderer test uses existing Playwright/browser paths; set `PROJECT_INIT_PLAYWRIGHT_MODULE` and `PROJECT_INIT_BROWSER` when those differ from this workstation. It creates a fresh synthetic fixture, tests it, then removes only that temporary fixture. It never loads the user's existing review file. The archived counter test contains the exact workstation paths used in this run; copy it to a disposable directory and supply equivalent installed paths before reproducing elsewhere.

Screen-reader speech, native browser zoom, production deployment, real framework integration and cross-agent parity remain outside these results. Installation still adds seven named Project Init skills, preserves unrelated skills, and refuses same-name overwrites unless explicit conflict backups are selected.
