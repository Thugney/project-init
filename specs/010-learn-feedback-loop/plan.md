# Implementation plan: `learn` feedback loop

**Spec:** `specs/010-learn-feedback-loop/spec.md`

## Design

- `lib/learn.mjs`: `collect(root, since)` over existing evidence files and audit JSONL; `group()`; `propose()`; `apply()`; `dismiss()`.
- Proposal storage: `.project-init/learn/` with one JSON metadata file and one diff per proposal.
- Target selection: the pack whose check produced the failure if it is local/overlay; otherwise ask for `--pack <local pack>`.
- Drafting through the `summarizer` role this feature adds (routed through 005 tiers) when a model is configured for it; otherwise template only.

## Changes

| File | Change |
| --- | --- |
| `lib/learn.mjs` | new |
| `lib/packs.mjs` | version bump and lock refresh for local packs |
| `bin/project-init.mjs` | `learn`, `learn apply`, `learn dismiss` |
| `docs/LEARN.md`, `docs/COMMANDS.md` | usage and limits |

## Risks

- **Low-quality proposals.** Mitigation: threshold, evidence attached, human apply only, dismiss.
- **Accidentally editing shared packs.** Mitigation: only local/overlay packs are writable; tests.

## Rollback

Proposals are files; applied changes are pack versions that can be reverted with Git in the overlay pack's repository.
