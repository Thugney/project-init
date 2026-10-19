# Security policy

## Supported versions

| Version | Support status |
| --- | --- |
| `2.1.0-preview.2` | Community preview; best-effort security fixes, not production-supported |
| v1 architecture-first files | Compatibility reference only; no ongoing production support commitment |

## Reporting vulnerabilities

**Please do not publish exploit steps, customer data, secrets or a proof-of-concept affecting real users in a public issue.** Prefer the repository's GitHub **Security → Advisories → Report a vulnerability** feature *if enabled*. If private advisory reporting is unavailable, open a minimal public issue **without exploit details** requesting a private contact route. The maintainer has not published a dedicated security mailbox; do not invent one.

Include impact, affected commit/version, reproducibility, and a safe minimal proof-of-concept when private contact is established. Avoid attaching real credentials or production logs.

## Security model and limitations

See [Security model](docs/SECURITY-MODEL.md). A pass from `project-init guard` is local evidence readiness for human release review, not proof that the project is secure. GitHub environment/branch controls and source review are independent safeguards.
