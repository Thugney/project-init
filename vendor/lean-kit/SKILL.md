---
name: codex-lean-kit
description: Create repeatable, human-readable status reports, architecture diagrams, or interactive triage boards with minimal generated tokens by writing Markdown or JSON and using a local renderer. Use for recurring visual deliverables, not production application UIs.
---

## Decide the output

- Agent-to-agent implementation plans, specs, tickets and documentation: write concise Markdown. Do not render unless a person needs an HTML page.
- Human-readable report: author a Markdown source, then render it.
- Architecture visual: author a short JSON source with `kind: "diagram"`, nodes (`id`, `label`, integer `layer`) and edges (`from`, `to`). Renderer computes SVG geometry.
- Interactive triage board: author a JSON source with `kind: "board"`, stable `boardId`, `title`, `columns`, and `tickets`. Renderer supplies drag/drop, accessible move dropdowns, counters and export.
- Actual React/TypeScript apps: use the project's existing UI components; do not replace them with this kit.

## Execution

1. Inspect only the appropriate small example in `examples/` for the required format.
2. Write or update the **source file only**. Do not write CSS, SVG coordinates, HTML or JS unless explicitly modifying the kit.
3. Run `node <skill-folder>/scripts/render.mjs <source.md|source.json> --out <output.html>` (Node 20+). The script resolves its assets relative to itself and does not require an npm install.
4. Validate by running `node --test <skill-folder>/tests/render.test.mjs` for kit changes, and opening the generated page for important visual deliverables. Browser behavior needs real-browser verification.
5. Report the source file, generated path, and success/failure. Do not paste full HTML into the conversation or re-read the whole output without a specific reason.

## Guardrails

- Never put secrets, tenant tokens, privileged links or sensitive user/device records into HTML artifacts.
- Preserve source as the version-controlled system of record. Browser board moves are local state until exported to JSON.
- Treat failures as failures; no fabricated pass claims. Do not modify shared kit assets to satisfy one ordinary report.
- This is a renderer, not a telemetry or security collector. It has no cloud API permissions and makes no network calls.
