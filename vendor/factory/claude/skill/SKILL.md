---
name: factory
description: Software factory orchestrator. Takes a feature idea, a backlog item or a Spec Kit folder through spec -> backend (Codex) -> frontend (Claude) -> 4 parallel reviews -> fix rounds -> approval -> PR or human escalation. Use when the user runs /factory or asks to put a feature through the factory.
argument-hint: "<idea> | next | spec <specs/NNN-x> | review <slug> | approve <slug> | rework <slug> <feedback> | status"
---

# /factory — orchestrator

The session that runs this skill is the **orchestrator**. It runs the loop, spawns every agent, calls every script, and is the only writer of `factory/board.json` (always through `board.py`, never by hand).

## Context budget (the most important rules)

You coordinate; you do not read the work. Your context must stay small across the whole job.

1. **Never read** spec.md, diffs, source files, review files or Codex logs yourself. Agents and scripts read them.
2. Get facts only from **one-line outputs**: `board.py collect|risk|decision|status` and the bridge's single status line.
3. Every agent you spawn must **end with at most 3 lines**. Ask for that in each prompt.
4. Spawn prompts are **short pointers to files**, never pasted content: "Job 004-rate-limit. Spec at factory/jobs/004-rate-limit/spec.md. Write round-1/review-security.md."
5. Resume the same builder with **SendMessage** each round instead of spawning a new one (it keeps its context; you don't pay to re-brief it).
6. Do not narrate between steps. One short user update per stage change.

Shortcuts used below:
- `B` = `python3 .claude/skills/factory/scripts/board.py`
- `CX` = `bash .claude/skills/factory/scripts/codex_backend.sh`
- `J` = `factory/jobs/<slug>`
- Config: `.claude/skills/factory/config.json` (read it once at start; it's small).

## Commands

| Command | Does |
|---|---|
| `/factory <idea>` | New job from an idea, full loop |
| `/factory next` | `B next` → run that backlog item as a new job; `B check <slug>` when merged or escalated |
| `/factory spec <specs/NNN-x>` | New job from a Spec Kit feature folder (spec-writer converts it) |
| `/factory review <slug>` | Skip build; run the review loop on an existing `factory/<slug>` branch |
| `/factory approve <slug>` | Human approval for a `needs-human` job → merge per config |
| `/factory rework <slug> <feedback>` | Write feedback to `J/rework-<n>.md`, route to builders, then review loop |
| `/factory status` | `B status`, print as-is |

## The loop

### 0. Preflight (once per job)
- `git status --porcelain` must be clean (ignore `factory/`). If dirty, stop and tell the user.
- `git checkout <base_branch> && git pull --ff-only` (skip pull if no remote).
- `factory/` exists? If not, tell the user to run `project-init factory --project . --apply`, then stop.

### 1. Spec — `factory-spec-writer`
- `slug=$(B init "<title>" --source idea|speckit:<dir>)`
- `git checkout -b factory/<slug>`
- Spawn **factory-spec-writer**: "Job <slug>. Idea: <one paragraph max> | Spec Kit folder: <dir>. Write J/spec.md. End with: has_backend=<true|false> has_frontend=<true|false> risk=<LOW|HIGH>."
- From its 1-line answer: `B note <slug> has_backend <v>`, `B note <slug> has_frontend <v>`.

### 2. Backend — Codex first
Skip if `has_backend=false`. Otherwise `B stage <slug> backend`, then run `CX build <slug>` (Bash, timeout 600000 ms; if it runs longer, run it in the background and poll its exit).

| Bridge line | Action |
|---|---|
| `CODEX DONE ...` | continue |
| `CODEX BLOCKED ... CONTRACT_ISSUE` | spawn spec-writer to fix only the API Contract section, then rerun `CX build` (once) |
| `CODEX BLOCKED ...` (other) / `CODEX FAILED ...` | retry once. After `codex.fallback_to_claude_after_failures` failures → **Claude fallback**: send the backend tasks to the builder (step 3 prompt with `scope=BACKEND`) and `B note <slug> backend_engine claude-fallback` |
| `CODEX MISSING` | Claude fallback immediately, and tell the user Codex isn't on PATH |

### 3. Frontend — `factory-builder`
Skip if `has_frontend=false`. `B stage <slug> frontend`.
Spawn **factory-builder** with a name: `builder-<slug>`. Prompt: "Job <slug>, scope=FRONTEND. Spec J/spec.md. Backend is already on this branch (report: J/codex/build/report.md). Implement all [FRONTEND] tasks against the API Contract. Commit. End with ≤3 lines."
Keep the agent id; this same builder handles every later Claude-side fix.

### 4. Review round — 4 reviewers in parallel
- `B round <slug>` → prints `round=N dir=... reviewers=...`
- In **one message**, spawn each listed reviewer (`factory-security-reviewer`, `factory-code-reviewer`, `factory-ux-reviewer`, `factory-ui-reviewer`). Prompt each: "Job <slug>, round N. Review `git diff <base>...factory/<slug>` against J/spec.md. Write J/round-N/review-<name>.md. End with your VERDICT line only."
- **WAIT FOR ALL.** Then `B collect <slug>`.
  - `INCOMPLETE ... missing=x` → re-spawn only the missing reviewer(s), collect again. Never start fixes mid-round.
  - `ALL_PASS` → step 6.
  - `CHANGES` → step 5.

### 5. Fix round (max `max_fix_rounds`)
If `round > max_fix_rounds` → skip fixes, go to step 6 (approver will escalate).
`B stage <slug> fixing`, then in parallel where possible:
- `backend_fixes>0` → `CX fix <slug> <N>` (same failure handling as step 2; fallback sends the [BACKEND] findings to the builder).
- `frontend_fixes>0` → **SendMessage** to `builder-<slug>`: "Round N reviews in J/round-N/. Fix every [FRONTEND] finding. Commit. ≤3 lines."
- A CHANGES verdict with zero tagged findings → SendMessage the builder to address the untagged findings.
Then back to step 4.

### 6. Decision — `factory-approver`
- `B stage <slug> decision`, then `B risk <slug>` (deterministic: config path globs + spec tier).
- Spawn **factory-approver**: "Job <slug>. Rounds in J/round-*/. Risk line: <paste the RISK line>. Write J/decision.md. End with APPROVE or ESCALATE."
- `B decision <slug>`. The approver never merges; you do.

### 7. Ship
Merge happens **only** when ALL of: decision=APPROVE, RISK=LOW, last round ALL_PASS. Otherwise → `B stage <slug> needs-human` and tell the user why in one line + `/factory approve <slug>`.

Ship per `merge_mode`:
- `pr` (default): `git push -u origin factory/<slug>` then `gh pr create --base <base> --head factory/<slug> --title "<title>" --body-file J/decision.md`. If `auto_merge_low_risk` is true: `gh pr merge --auto --squash`. `B note <slug> pr_url <url>`.
- `local`: `git checkout <base> && git merge --no-ff factory/<slug>`.
- No remote or no `gh`: leave the branch, say so.
Then `B stage <slug> merged`, `B check <slug>`, `git checkout <base>`.

### `/factory approve <slug>`
Human gate. Show the user `B status` line + first 15 lines of J/decision.md, ask for explicit yes, then ship as in step 7 regardless of risk.

## Hard rules
- Agents get context from files, not from this conversation. Each writes only its own file.
- Review files start with `VERDICT: PASS` or `VERDICT: CHANGES`. Decision starts with `APPROVE` or `ESCALATE`.
- Findings are tagged `- [BACKEND]` or `- [FRONTEND]` so fixes route without you reading them.
- Never force-push, never push to the base branch, never delete branches, never edit `.github/` or CI settings to get a pass.
- If something unexpected happens (merge conflict, tests can't run, repo dirty), stop, `B stage <slug> failed`, tell the user in one line.
- If ECC (everything-claude-code) is installed, our agents are prefixed `factory-` so its own `security-reviewer`/`code-reviewer` don't collide; reviewers may use ECC's checklists/skills.
