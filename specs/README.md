# Project Init 2.2 feature specs

These are the native Spec Kit features for the [2.2 roadmap](../docs/ROADMAP-2.2.md). Each folder has `spec.md` (what and why), `plan.md` (how) and `tasks.md` (ordered tasks). Build them in this order, one feature per branch and pull request, unless the maintainer says otherwise.

| # | Feature | Issue | Depends on | Status |
| --- | --- | --- | --- | --- |
| 001 | [Pack mechanism](001-pack-mechanism/spec.md) | #47 | — | ready to build |
| 002 | [First-class BMAD](002-first-class-bmad/spec.md) | #61 | — | ready to build |
| 003 | [`m365-powershell` pack](003-m365-powershell-pack/spec.md) | #48 | 001 | drafted ahead; re-check first |
| 004 | [Pack-declared hooks](004-pack-hooks/spec.md) | #49 | 001 | drafted ahead; re-check first |
| 005 | [Model routing](005-model-routing/spec.md) | #53 | — | ready to build |
| 006 | [Evals](006-evals/spec.md) | #55 | 005 | drafted ahead; re-check first |
| 007 | [Local-first checks and CI cost](007-local-first-ci/spec.md) | #56 | 004 | drafted ahead; re-check first |
| 008 | [`github` pack](008-github-pack/spec.md) | #54 | 001, 004, 007 | drafted ahead; re-check first |
| 009 | [Supply chain in CI](009-supply-chain-ci/spec.md) | #57 | 008 | drafted ahead; re-check first |
| 010 | [`learn` feedback loop](010-learn-feedback-loop/spec.md) | #51 | 001, 005 | drafted ahead; re-check first |
| 011 | [`web-gdpr` pack](011-web-gdpr-pack/spec.md) | #50 | 001 | drafted ahead; re-check first |
| 012 | [Gated deployment](012-gated-deployment/spec.md) | #58 | 008, 009 | drafted ahead; re-check first |
| 013 | [Work intake from issues](013-issue-intake/spec.md) | #59 | 008, 009 | drafted ahead; re-check first |
| 014 | [`m365-config` pack](014-m365-config-pack/spec.md) | #60 | 003, 008, 013 | drafted ahead; build last |
| 015 | [Generic CLI worker](015-generic-cli-worker/spec.md) | — | 005 | drafted ahead; re-check first (split out of 005) |

**Drafted ahead** means the spec was written before the features it depends on exist. Its first task is to re-read it against the code as built and report any mismatch to the maintainer before coding. The maintainer then approves the corrected spec.

## Handing a feature to an agent

Codex:

```text
$project-init-build Build specs/001-pack-mechanism following AGENTS.md. Work through tasks.md in order, one branch and one pull request for this feature.
```

Claude Code:

```text
/project-init-build Build specs/001-pack-mechanism following AGENTS.md. Work through tasks.md in order, one branch and one pull request for this feature.
```

For parallel work on a larger feature, use Factory: `/factory spec specs/001-pack-mechanism`.

Approval: merging the pull request that adds or changes a spec is the maintainer's approval of that spec. Approval of each build is the maintainer's review of its pull request.
