# Browser counter — authoritative specification

Status: planned; design approval pending. Framework: none.
Source of scope: ../brief.md and the human scope/framework approval relayed in this planning request. That approval does not approve a UI design or implementation.

This document alone owns the app requirements, architecture and task sequence. Do not create a separate PRD or duplicate backlog. Project Init owns workflow state, approvals and evidence.

## Scope and boundaries

One offline browser Counter screen, using plain HTML, CSS and JavaScript. All eventual application source belongs under src/. No persistence, accounts, database, API, external assets, vendor integrations, dependencies or installs. No remote actions or commits. Parent-owned immutable tests must remain unchanged. This stage creates only the plan; no application implementation or approval records.

## Requirements and bounded acceptance

### REQ-COUNT — counter behavior

- Every fresh page load displays count 0; reload starts at 0 without stored state.
- From 0, three Increment activations display 1, 2, then 3. Each activation changes the count by exactly 1.
- Reset after incrementing displays 0. Reset at 0 keeps 0. Increment after Reset displays 1.
- Both controls work with pointer clicks and, when focused through normal Tab navigation, native Enter and Space activation. A single activation causes a single action.
- State exists only in page memory. No persistence or extra counter operations.

### REQ-UI — one accessible responsive screen

- One screen contains the Counter title, a visible Count label and numeric metric, concise usage instructions, and controls named Increment and Reset.
- At count 0, show an explicit Empty state explaining that no increments have occurred; the metric still shows 0 and Increment remains available. Positive counts leave the Empty state; Reset restores it.
- Use real native buttons, logical heading structure, readable labels, visible keyboard focus and a politely announced count update. Do not rely on color alone to convey state.
- Match the rendered Project Init mockup after actual human approval, including layout, typography, colors, control states and Empty state. The design phase must resolve these details rather than this plan inventing them.
- Verify at 375 x 812 mobile and 1440 x 900 desktop in both light and dark system preferences, with zero and positive counts. Content and controls stay visible and usable without horizontal overflow, clipping or overlap. At 200% browser zoom, content can reflow and scroll vertically without losing access to controls.
- Initial load, repeated Increment and Reset, keyboard operation and theme changes produce no browser console errors and no external network requests. Loading the local document and its local assets is permitted.

## Architecture

Use src/index.html for semantic markup, src/styles.css for responsive layout and light/dark styling, and src/app.js for in-memory state and event handlers. No build pipeline or runtime libraries are needed. A single numeric count starts at 0; native button click handlers increment or reset it. One render function updates the metric, its accessible announcement and Empty state together. Use local relative assets only; no fetches, remote fonts or storage. Prefer CSS media queries for viewport and system color preference. Native controls provide pointer and keyboard activation without custom key handlers that could double-trigger actions.

## Ordered tasks and dependencies

1. Design (depends on this plan): use the installed project-init-design skill in its own native turn to produce the rendered Counter mockup and Project Init design artifact. Cover mobile/desktop, light/dark, Empty and positive states, focus and controls. Obtain actual human design approval in the parent chat; stop at that gate.
2. Build (depends on approved design and the parent's immutable browser tests): use the installed project-init-build skill in its own native turn to implement only src/ against REQ-COUNT and REQ-UI. Reconcile source with the approved design. Do not alter tests or add dependencies.
3. Verify (depends on implementation): use the installed project-init-verify skill in its own native turn. Run the parent's actual browser tests and collect per-requirement functional, accessibility, console, network and viewport/theme evidence. Run the required visual comparison, semantic evidence, executed verification and drift guard through Project Init. Record real commands, results and limitations; never infer a pass from screenshots alone.
4. Status (depends on verification evidence): use the installed project-init-status skill in its own native turn to report actual readiness and any remaining acceptance blockers.
5. Report (depends on actual status/evidence): use the installed project-init-report skill in its own native turn and bundled Lean Kit to render the final honest acceptance report. Return its actual artifact and evidence status for human review.

This is the only task list. Start has already established this fixture; this Plan turn and the five subsequent skill turns provide the requested seven-skill workflow. Do not claim any unexecuted stage passed.

## Workflow acceptance, separate from app requirements

REQ-REPORT in brief.md describes workflow acceptance: render the final report with bundled Lean Kit using `project-init lean --input SOURCE --out .project-init/lean/REPORT.html --execute`. It is not an app feature, screen, counter control or runtime dependency. Report only actual receipts for the seven installed skill turns and applicable evidence gates. Release readiness remains subject to Project Init checks and actual human review; design approval does not authorize deployment.

## Current gate and handoff

Planning commands: framework selection, status and planning handoff were executed successfully. Framework none is ready; no baseline, current review, design approval, implementation or test evidence was reported by status. The existing UI design artifact is draft with no screens. No application source or tests existed at planning inspection.

Next gate: rendered design review followed by explicit human design approval in the parent chat. No implementation may begin before that gate and the parent's immutable tests are available. No approvals have been recorded by this planning stage.

Rollback: remove this newly created specification if the plan is rejected; framework selection remains none as explicitly requested. Preserve AGENTS.md, brief.md, parent test fixtures and existing Project Init records.
