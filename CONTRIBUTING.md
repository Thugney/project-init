# Contributing

Thanks for considering improving Project Init. This project welcomes rigorous engineering feedback and reproducible evidence. Its source is currently a **preview pending an explicit open-source license**, so the legal terms for accepting external code contributions must be finalized before contribution merges.

## Ways to help now

- Report a bug with OS, Node version, the selected framework and **redacted** CLI output.
- Confirm actual Codex/Claude skill discovery and real vendor installation on a disposable project.
- Suggest accessible, readable UI review designs with clear screenshot references.
- Review security boundaries and supply chain assumptions in [the threat model](docs/SECURITY-MODEL.md).

## Engineering expectations for pull requests

1. Open or link an issue for nontrivial work. Keep changes bounded; don't redesign unrelated features.
2. Run `npm ci`, `npm run test:all` and `npm run smoke`. Record exact failures if a platform is unavailable.
3. Provide tests for bug fixes; include tests that demonstrate required failure/rollback behavior when changing guards or authorization.
4. Never add credentials, tenant exports, private device identifiers or real customer screenshots.
5. Explain scope, security impact, validation, compatibility and rollback. A report or skill markdown file is **not** proof that a task was coded.
6. Preserve existing Project Init v1 compatibility artifacts unless migration has been explicitly designed and accepted.
7. Do not assume an automated AI code review is independent security evidence.

Maintainers will review diffs before merge. There is no promise of immediate response or a vulnerability SLA. See [Security policy](SECURITY.md) for private reports.
