# Tasks: Generic CLI worker

**Spec:** `specs/015-generic-cli-worker/spec.md` · **Plan:** `specs/015-generic-cli-worker/plan.md`

- [ ] T000 Re-read `spec.md`, `plan.md` and these tasks against the code as built after 005; report any mismatch to the maintainer before coding.
- [ ] T001 Worker registry replacing hardcoded `codex`/`claude` pairs in `worktree.py`, `board.py`, `lib/execution.mjs`, `lib/factory.mjs`; existing tests pass unchanged. (FR-002, SC-004)
- [ ] T002 Generic worker config entries and validation, `approvedDataClasses` fail closed; tests. (FR-001, FR-006, SC-003)
- [ ] T003 `generic_worker.py` with argument template, Windows batch rules, filtered environment and receipt; tests with a fake executable. (FR-003, FR-004, FR-005)
- [ ] T004 Tests proving no environment variable value appears in receipts, logs or job files. (FR-005, SC-002)
- [ ] T005 `execution factory` accepts generic worker receipts and merges; tests. (FR-004, SC-001)
- [ ] T006 Spec-writer, reviewer and orchestrator skill updates for worker tags. (FR-002)
- [ ] T007 [P] Docs and changelog.
- [ ] T008 Run `npm run test:all` and `npm run smoke`; report exact results.
