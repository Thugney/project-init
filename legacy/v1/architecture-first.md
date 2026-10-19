# Architecture model and execution contract

Use this same contract for new and existing projects. EriStay is only an example; do not copy its scope, vendors or business decisions into other projects.

## Review workspace

`brief.md` records product intent; `design.json` is the diagram source; `context/` contains the six context roles; `review.html` is a generated read-only visual review; `feedback.json` and `history/` preserve iterations. `review.json` records independent review. `approval.json` records the actual user's acceptance of the exact bundle. None authorizes external actions by itself.

New initialization deliberately creates no app source, dependencies or Git repository. Existing initialization creates only the named review directory and leaves original source/instructions untouched. Init refuses an existing review directory; resume it using Status and Feedback. Merge approved context routing into the actual project instructions as a separate bounded documentation change when authorized.

## JSON schema v1

Top-level fields:

| Field | Shape / requirement |
|---|---|
| `schemaVersion`, `project`, `mode`, `projectPath` | `1`, agreed name, `New` or `Existing`, selected source path |
| `baseline` | `commit` (or explicit `revisionNote` for non-Git/new), `environment`, `description`; describe date and any included local changes |
| `components` | Array of `{id,label,responsibility,evidenceStatus,sources:[string],column?,row?}`. Status is observed/proposed/not_applicable; each source identifies inspected evidence or the product decision |
| `edges` | `{from,to,label}` using component IDs; label the request/data/event and important trust boundary |
| `journeys` | `{id,label,nodes:[{id,label}],edges:[{from,to,label}],failurePaths:[string]}`; branches use explicit labelled edges |
| `entities` | `{id,label,owner,fields:[string]}`; name the real entity and important keys/lifecycle fields |
| `relationships` | `{from,to,label}` using entity IDs; describe ownership/cardinality |
| `permissions` | `{role,scope,enforcedAt}`; separate identity from authority |
| `requirements` | `{id,description,actor,owner,data,permission,tests:[testId],journeyIds:[journeyId]}`; owner is a component ID |
| `tests` | `{id,scenario,status}`; status not_run/pass/fail/blocked. Merely defining an acceptance scenario leaves it not_run |
| `tasks` | `{id,label,dependsOn:[taskId]}`; valid acyclic dependency order |
| `questions` | `{id,question,blocking,status}`; status open/resolved; record actual answers in context and decisions rather than silently changing status |

Arrays use stable unique IDs. For a category that does not apply, write an explicit not-applicable item with rationale instead of inventing a database, login service, or external dependency. The structural checker detects missing coverage and unresolved IDs; independent review decides whether a not-applicable explanation is credible.

The renderer supports optional component `column`/`row` coordinates for a legible layout. Coordinates are presentation only. Changes to model data still change the reviewed bundle.

## Six roles, one authority per subject

- project-overview: problem, users, goals, full journey, in/out scope and success evidence.
- architecture: source baseline, responsibilities, interactions, data, auth, operations and invariants; refer to the rendered model.
- code-standards: actual chosen language/framework conventions and boundary validation. Do not transplant sample TypeScript/Clerk/Prisma choices.
- ai-workflow-rules: unit scope, declared inputs/outputs, verification, feedback and human decisions; inherited permission constraints remain.
- ui-context: existing or agreed tokens/layouts, responsive/keyboard/language/state requirements. A diagram review is not a new product redesign.
- progress-tracker: current phase, completed evidence, open questions, feedback applied, current review/approval hash and next task.

Preserve existing document ownership and history. Add links or concise summaries rather than duplicate detailed backlogs. The five design roles and model are hashed; the progress tracker is deliberately excluded so recording review status does not invalidate the design. It must not introduce new design decisions outside hashed documents.

## Execution nodes

1. Gather selected intent/source evidence with the architecture-gatherer contract.
2. Produce one design.json using the architecture-producer contract.
3. Fill context roles in separately owned document passes from design/evidence; one artifact per node.
4. Validate and render deterministically.
5. Verify the source/intent/model/context/visible diagram with fresh context.
6. Present the diagrams. Record feedback, snapshot, revise, render and reverify until the user accepts.
7. Record explicit acceptance of the reviewed bundle; prepare the bounded implementation handoff.

Example recording commands (only after the described real event):

```powershell
& '<skill-root>\scripts\architecture.ps1' -Action RecordReview -ReviewDirectory '<review-dir>' -Verdict pass -Actor '<independent reviewer>' -Text '<actual review result and evidence>'
& '<skill-root>\scripts\architecture.ps1' -Action RecordApproval -ReviewDirectory '<review-dir>' -Actor '<human product owner>' -Text '<actual approval quote and conversation reference>'
```

Approval is deliberately recorded separately from independent review. These local records provide traceability, not identity authentication. Never manufacture a pass or approval to get through the workflow. A blocked question stays blocking until answered or explicitly removed from the approved scope.

## Verification and limits

Use the included tests for the scripts: New/Existing preservation, resume protection, required coverage, broken edges, cyclic dependencies, unresolved blockers, feedback snapshots and stale bundle approvals. Also test a representative new-project brief and an existing-project source read with an independent agent. Compare a bounded linear process with the graph process before claiming time/quality improvement. Record actual usage/time where available.

The reusable process can be operational without every pilot design being accepted. Do not call the entire architecture-to-app method proven until an accepted design has guided a real bounded implementation and its acceptance evidence. Do not claim that required fields or a review page prove business correctness or production readiness.

## Keep code and diagrams aligned

On every resumed session and after each completed implementation unit, run architecture.ps1 Status. Status and Render automatically check the selected source directory. Untracked, changed or unavailable source closes implementation-planning readiness and prevents recording a passing architecture review. Existing v1 reviews need a source reconciliation once; missing evidence is never treated as current.

When drift is found:

1. Run source-drift.ps1 Capture against the same ReviewDirectory. This saves a candidate containing file hashes, the design bundle hash and the declared exclusions; it grants no acceptance.
2. Have a fresh reviewer inspect the changed source, current design and relevant context. For each change, state whether it affects a component, connection, journey, data, permission or failure path. Explain a no-diagram-impact conclusion when appropriate.
3. Record actual user-requested design feedback before changing the model. Update affected diagrams/context when source evidence or approved intent requires it, then Capture again if the bundle changed. Review that exact candidate.
4. Run Reconcile with the actual reviewer and evidence reference. It refuses a candidate if source/design changed during review. RecordReview then binds its result to this source hash and design. Rerender, update progress and show the result. A changed design still needs actual user acceptance; unchanged approved product architecture does not require invented repeat approval for a reviewed internal-only change.

Commands:

```powershell
& '<skill-root>\scripts\source-drift.ps1' -Action Check -ReviewDirectory '<review-dir>'
& '<skill-root>\scripts\source-drift.ps1' -Action Capture -ReviewDirectory '<review-dir>'
# After actual independent source/design review of this exact capture:
& '<skill-root>\scripts\source-drift.ps1' -Action Reconcile -ReviewDirectory '<review-dir>' -Actor '<reviewer>' -Text '<findings and evidence reference>'
```

This checks file contents, including additions, removals, renames (as removal/addition) and uncommitted edits. It is not a Git-commit-only comparison. Dependencies, caches, designated secret files, the review directory and links are excluded; read the reported exclusions. Any meaningful source held outside this scope requires explicit evidence and cannot be called checked by the hash scan. Keep non-secret configuration contracts in versioned source; runtime secret values and live services require separate evidence.

The source scan does not infer architecture meaning, authenticate reviewers, monitor in the background or check production. The HTML reports status when generated and explicitly identifies itself as a saved snapshot. A new Status/Render check is necessary after later code changes. For a new project, create the agreed empty project directory before source Capture; it contains no application until implementation is authorized.

## Session routing

Before implementation, connect the selected project's root AGENTS.md to this review workspace with a concise pointer, preserving all existing instructions. State the path to all six context roles, progress and feedback, and require Status on resume and after a completed unit. Do not silently attach an isolated evidence checkout or override existing project rules. Include the same route in the next task's handoff. The nested review AGENTS.md alone is not assumed to govern application-root tasks.
