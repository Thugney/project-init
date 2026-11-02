# Model routing and data classes

Factory roles get their model from **role tiers** that you configure. Each project declares a **data class**, and Factory refuses to run a role on a client that is not approved for it. This page covers configuration, what is enforced, what is recorded and what is not built.

## Configure routing

Routing lives in `.claude/skills/factory/config.json` under `routing`:

```json
"routing": {
  "roles": {
    "orchestrator": "top",
    "spec-writer": "mid",
    "builder": "mid",
    "code-reviewer": "mid",
    "security-reviewer": "top",
    "ux-reviewer": "mid",
    "ui-reviewer": "mid",
    "approver": "top"
  },
  "tiers": {
    "top":  {"claude": "", "codex": ""},
    "mid":  {"claude": "", "codex": ""},
    "fast": {"claude": "", "codex": ""}
  }
}
```

- `roles` maps each role to a tier. The shipped map is a suggestion: `top` for the orchestrator, security reviewer and approver, `mid` for everything else.
- `tiers` maps a tier to a model per client. **No model is shipped.** You choose the models. A value is an alias or full model ID the client accepts (letters, digits and `._:/@[]-`); anything else is refused.
- After changing tiers for Claude, run `project-init factory --project . --apply` so the Claude agent files carry the routed model (see below).

## What happens when a role has no model

A role whose tier has no model for the client running it behaves exactly as before routing existed:

| Where the role runs | Model used |
| --- | --- |
| Claude subagent spawned by the Claude orchestrator | The agent file's `model:` frontmatter as shipped (`opus`) |
| Headless Claude (`claude_worker.py` build, fix or `agent`) | `claude.model`; the client's own default when empty |
| Codex (`codex_worker.py`) | `codex.model`; the client's own default when empty |

Status and the job record show `not-configured` for that role.

## How the routed model is applied

- **Claude subagents (Claude orchestrator):** `project-init factory --apply` rewrites the `model:` line of `.claude/agents/factory-<role>.md` only when that role's tier has a Claude model. The install preview compares installed agents with the rendered content, so a routed install shows `unchanged` on the next preview.
- **Headless Claude:** `claude_worker.py` passes `--model <model>` for build, fix and `agent` runs. The builder role covers build and fix; `agent factory-<role>` uses that role.
- **Codex:** `codex_worker.py` passes `-m <model>` for build and fix (builder role).
- **Orchestrator:** advisory only. Project Init does not launch your orchestrator session, so `status` shows its configured tier and model for you to select yourself.

## Deprecated `claude_model`

`claude.model` is the single headless Claude setting. On `project-init factory --apply`, an existing top-level `claude_model` is moved into an empty `claude.model` and removed. If both are set and differ, `claude.model` is kept and the migration result reports the dropped value (`claudeModel.action: dropped-conflict`). Until that migration runs, the workers still read `claude_model` as a fallback.

## Data classes

`.project-init/project.json` may declare `dataClass`: `public`, `internal`, `personal` or `restricted`. When it is absent the class is `internal`.

```bash
project-init data-class --project .                              # show the class
project-init data-class --project . --set restricted             # preview a change
project-init data-class --project . --set restricted --apply     # write it and record an audit event
```

No other command writes `dataClass`.

Each client lists the classes it is approved for:

```json
"claude": { "approvedDataClasses": ["public", "internal"] },
"codex":  { "approvedDataClasses": ["public", "internal"] }
```

The shipped default approves `public` and `internal` for both clients, so default projects keep working after an upgrade. `personal` and `restricted` projects are refused until you add the class to every client in use.

**Fail closed.** A client whose `approvedDataClasses` is empty or missing is approved for nothing. Factory refuses to register a job (`board.py init`) and the orchestrators stop at preflight (`routing.py check`) when any role would run on an unapproved client: the Claude agent roles, the builder on each enabled worker (`workers.codex`/`workers.claude`), and the orchestrator. The refusal names each role and client and the config edit that allows it. An unreadable project state or Factory config also refuses the job.

## What is recorded

- **Worker receipts** (`factory/jobs/<slug>/<worker>/build|fix-rN/evidence/*/execution.json`) use `schemaVersion: 2` and add `role`, `client`, `tier`, `model` (the routed model or `not-configured`) and `passedModel` (the model actually passed, including fallbacks; `null` when the client chose). `project-init execution factory` accepts schema 1 and 2.
- **`factory/jobs/<slug>/routing.json`** lists every role run: role, client, tier, model, `passedModel`, mode, start and end time, and usage.
  - Usage is read from the client's own output: the Claude `result` event's `usage` and the summed Codex `turn.completed` `usage`. When the client printed none, the entry says `usage: not-reported`.
  - Roles you run as interactive Claude subagents are recorded by the orchestrator with `routing.py record <slug> <role>`. They carry the agent file's frontmatter model and `usage: not-reported`.

Usage figures are what the clients report. No cost in currency is calculated.

## Status

`project-init status --project .` includes `factory.routing`: `configured` or `not-configured`, each role's tier and model per client, the advisory orchestrator, the project data class, and any client in use that is not approved for it, with the next step.

## Not built

- Choosing models or providers for you.
- A generic CLI worker for other model families: `specs/015-generic-cli-worker`.
- An OpenAI-compatible endpoint adapter.
- Family diversity (builder and reviewer on different clients) and a multi-model `decide` command: deferred until a Codex reviewer path exists.
- Enforcing the orchestrator's model.

## Client reference notes (T001)

Recorded 2026-11-02 from the clients' current documentation:

- **Claude Code subagent `model` frontmatter** accepts an alias (`sonnet`, `opus`, `haiku`, `fable`), a full model ID, or `inherit`. Resolution order: per-invocation model, then the agent's frontmatter, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main conversation's model. Source: <https://code.claude.com/docs/en/sub-agents>
- **Claude Code `--model`** sets the session model with an alias or full model name and overrides the `model` setting and `ANTHROPIC_MODEL`. Source: <https://code.claude.com/docs/en/cli-reference>
- **Claude Code `--output-format stream-json`**: the last line is a `result` message with the final text, cost and session metadata; JSON output includes usage and `total_cost_usd` (client-side estimates). Factory reads `usage` only. Source: <https://code.claude.com/docs/en/headless>
- **Codex `codex exec -m/--model`** overrides the configured model for the run; `--json` prints newline-delimited JSON events; `-o/--output-last-message` writes the final message to a file. Source: <https://learn.chatgpt.com/docs/developer-commands?surface=cli> (redirected from `developers.openai.com/codex/cli/reference`)
- **Codex `--json` events** include `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*` and `error`. The documented sample shows `turn.completed` with `usage` fields `input_tokens`, `cached_input_tokens`, `output_tokens` and `reasoning_output_tokens`; the page shows them in a sample only, so Factory treats them as best effort. Source: <https://learn.chatgpt.com/docs/non-interactive-mode>
