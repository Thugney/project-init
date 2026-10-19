# Contributing

Thanks for considering improving Project Init. This project welcomes rigorous engineering feedback and reproducible evidence. Its source is published under the [Apache License 2.0](LICENSE). Contributions should be original or properly attributed and compatible with that license; by submitting a contribution you agree it is licensed under Apache-2.0 unless explicitly agreed otherwise with the maintainer. Preview status still means there are unverified integration and acceptance requirements.

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
