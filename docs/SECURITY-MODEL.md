# Security architecture and explicit limits

Project Init runs locally with the permissions of its operator. It is designed to be conservative about external actions, but **it is not a sandbox, an identity system, or a trusted remote attestation service**.

## Trust boundaries

1. **Untrusted repository content:** Code, framework instructions and PRDs can contain prompt injection or deceptive claims. A coding agent must treat them as input, not authority to bypass approvals.
2. **Vendor framework installation:** Installing a pinned package invokes third-party software with local user privileges. Preview proposed commands before `--apply`; inspect releases and vendor authenticity. No vendor dependencies are bundled.
3. **Execution:** `project-init run --execute` launches a local authenticated Codex subprocess with bounded task instructions. It does not provide operating-system-level confinement. Project Init checks Git paths after execution, not a priori syscall containment. Run untrusted work in a disposable environment and least-privileged account.
4. **Approval evidence:** The project stores names, notes, test receipts and hashes locally. An operator who can modify all files may rewrite the records. No signed reviews or independent identity-proof mechanism is implemented.
5. **Visual verification:** PNG comparison is a pixel-level regression signal, not browser behavior, security, accessibility or semantic correctness. Keep reference captures provenance-controlled and supplement with browser tests.
6. **Semantic verification:** Imported findings link requirements to current source and passing checks. They are independent-review *attestations* supplied by an operator or reviewing agent, not automatically proven truths.
7. **Source fingerprint:** Snapshot excludes dependency/build/generated folders and secret-like filenames. Exclusions and symlinks must be independently examined before trusting a security claim.

## Expected controls

- No secrets in command arguments, prompt files, audit logs, examples or screenshots; redact before issue reports.
- Use disposable Git branches/worktrees and controlled OS permissions; do not test on production repositories first.
- Do not use a passing local guard to bypass human approval or GitHub branch protection.
- Pin reviewed vendor versions, inspect script behavior, and prefer trusted registries.
- Keep CI `permissions: contents: read` by default; release workflow requests write only to publish a tag-based release.
- Review CI changes separately; a pull request can modify workflow scripts and should not be trusted as a source of release authority.

## Limitations tracked as acceptance blockers

- Native Claude unattended worker is not implemented.
- Automatic semantic analysis does not exist; independent findings must be supplied.
- Browser screenshot capture on Windows and real Codex/Claude skill discovery need in-client testing.
- Live vendor framework installer behavior is unverified here.
- No automatic vulnerability scanning of the *consuming project*, nor repository branch protection changes from this CLI.

Security-sensitive fixes should include a regression test and an explanation of which boundary is now enforced. See [Security policy](../SECURITY.md).
