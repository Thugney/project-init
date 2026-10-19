# Codex Lean Kit

Reusable, dependency-free (Node.js 20+) report/diagram/triage-board renderer plus an on-demand Codex skill. The model writes short Markdown or JSON; this stable renderer creates the HTML and interaction code.

## Install in Codex on Windows

Unzip this package, then run from its parent directory in PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Copy-Item -Recurse -Force ".\codex-lean-kit" "$env:USERPROFILE\.codex\skills\codex-lean-kit"
```

Start a new Codex session to discover the installed skill. To use for only one repo instead, place the folder under `<repo>/.agents/skills/codex-lean-kit/` and commit it, or follow your installed Codex version's supported repo skill location. The skill can be invoked explicitly with `$codex-lean-kit`. No MCP server or API key required.

## Render examples

From inside the extracted `codex-lean-kit/` directory:

```powershell
node .\scripts\render.mjs .\examples\status.md --out .\dist\status.html
node .\scripts\render.mjs .\examples\architecture.json --out .\dist\architecture.html
node .\scripts\render.mjs .\examples\board.json --out .\dist\board.html
node --test .\tests\render.test.mjs
```

Open the `dist` HTML files in a browser; they are offline/self-contained. The board supports pointer drag-and-drop, keyboard-accessible ticket move dropdowns and JSON export. Browser moves may be preserved by browser storage, but browser storage for `file://` pages is browser-dependent; always export to save board changes as a source file.

## Source contracts

- `.md`: headings, paragraphs, strong/emphasis, links, fenced code, tables, numbered/bullet/task lists. This is intentionally a small Markdown subset, not a full CommonMark parser. Mermaid source in a code fence is shown as code, not rendered; use `kind: "diagram"` for offline SVG visualization.
- `kind: "diagram"` JSON: `title`, `nodes` with unique `id`, short `label`, 0–10 integer `layer`, and `edges` with `from` / `to` referencing nodes. Designed for small left-to-right diagrams, not arbitrary graph auto-layout.
- `kind: "board"` JSON: `boardId`, `title`, `columns` of `id` / `title`, and `tickets` of `id`, `title`, `column`, optionally `owner`, `priority`, `notes`. Ticket IDs and columns must be unique; use a stable `boardId`.

HTML special characters in sources are escaped. Markdown links are restricted to safe URLs. Generated pages load no remote dependencies. Board item text is inserted with `textContent` rather than as executable HTML. Avoid embedding sensitive tenant information in portable HTML output.

## Audit, validation and operations

Every render writes a structured JSONL audit event to `.codex-lean-kit/audit.jsonl` in the working directory by default; override it with `--audit <path>`. Events include input/output paths and hashes, format, changed flag and success/error. No document contents are logged. A second identical render leaves the generated HTML unchanged. The process exits nonzero on validation, rendering, file-write or audit-write failure.

Add these to the consuming repository's `.gitignore` if applicable:

```gitignore
.codex-lean-kit/
dist/
```

Use `node --test tests/render.test.mjs` after changing the kit. Verify major UI changes in a real browser. The included tests check deterministic outputs, source escaping, input schema validation, and audit logging; these are not a substitute for production browser/assistive-technology testing.

To roll back, stop invoking `$codex-lean-kit`, remove the installed folder and generated HTML, and continue using the original Markdown/JSON sources. The renderer does not mutate its source. `localStorage` state is not removed by deleting files; it can be cleared through browser site storage if desired.

## Token-economy rules

- Codex edits only `.md` or `.json` to produce recurring output.
- Codex should run the tool instead of pasting generated HTML, CSS or SVG into responses or plans.
- `AGENTS.md` carries only a short rule (see `AGENTS-snippet.md`). Detailed mechanics stay in `SKILL.md`, and stable layout/interaction code stays in scripts/assets.
- Codex may still need to read source, run tests and inspect failures. Measure savings against identical prompts using Codex's actual usage reporting; file size is not the same as token usage.
- Do not use the renderer as a substitute for your application framework or as a general-purpose HTML browser sanitizer.

## Compare actual Codex token usage

Use the same Codex model, effort, task and clean repository in both variants. Repeat at least three runs per variant and compare median usage and correctness. In a scratch project, run distinct prompts such as:

```powershell
codex exec --json 'Build a self-contained polished HTML triage board with three columns and an export button.' > baseline.jsonl
codex exec --json 'Use $codex-lean-kit to build the same triage board using JSON source and the installed renderer.' > kit.jsonl
node .\scripts\usage-summary.mjs .\baseline.jsonl .\kit.jsonl
```

Do **not** run the above Codex commands in your production repository: they ask Codex to create files. Use separate fresh scratch worktrees or folders for each run, and test functional equivalence. This local script only summarizes recorded `turn.completed` usage events; it does not launch Codex, capture costs, or infer subscription credit use from token counts. Cached input is included in the input-token total; reasoning output is already included in output-token totals when reported.
