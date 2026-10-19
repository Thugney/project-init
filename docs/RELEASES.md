# Versioning and release channels

Project Init follows **Semantic Versioning** once accepted, including standard `-preview.N` pre-release identifiers. The current package and code identify themselves as **`2.1.0-preview.2`**. This number is carried from the pre-existing locally tested artifact; it is **not** a statement that a prior public v2.0/v2.1 release exists.

| Channel | Tag format | GitHub Release flag | Distribution / promise |
| --- | --- | --- | --- |
| Preview | `vX.Y.Z-preview.N` (or `-beta.N`, `-rc.N`) | **Pre-release** | Community evaluation; known acceptance gaps |
| Stable | `vX.Y.Z` | Latest full release | Only after all documented release gates pass |

**Branches:** `main` holds reviewed source and explicit preview status until a stable release is approved. Short-lived `feat/*`, `fix/*` and `docs/*` branches are proposed through PRs. An optional `next` integration branch may be added later if multiple parallel preview features justify it; it is *not* required initially. A branch by itself is not a release channel; **GitHub Releases and SemVer tags** define channels for users.

## Promotion gates

**License gate:** The release workflow requires a committed `LICENSE` file, a non-`UNLICENSED` SPDX identifier, and `private: false` in `package.json`. Until the maintainer selects a license and confirms rights for the bundled Lean Kit, no release tag should be created. The preview source on `main` is not yet a licensed open-source distribution.


1. Merge via reviewed PR after CI on Windows, Linux and macOS (Node 22/24). No force-push or bypass of protected branches.
2. Test the CLI on a clean machine and ensure skill discovery in **both actual clients**.
3. Verify vendor framework installation/handoff with real supported versions; do not silently install packages.
4. Run actual Codex, required test evidence, UI screenshot capture/review on Windows, and rollback exercise.
5. Review package contents/secrets, supply-chain threats, security policy, and the project license/Lean Kit provenance.
6. Confirm maintainer approval; only then create stable `vX.Y.Z` tag. Pre-release tags can be used earlier with limitations clearly described.

## Release automation

`.github/workflows/release.yml` runs on an **explicit matching `v*` tag**, checks the version matches `package.json`, runs both test suites, checks the npm package output, and creates a GitHub Release with the npm tarball plus automatically generated notes. Tags containing a hyphen (`-preview`, `-beta`, `-rc`) are marked **pre-release**. It does **not** publish to npm, merge branches, or silently approve a stable release.

There is currently **no GitHub release/tag published by this work** unless a separate GitHub confirmation exists. A prepared workflow is not proof that GitHub Actions ran.

## Recovery

Revert the affected PR or reinstall an earlier reviewed tag. Existing v1 scripts are retained under `legacy/v1` for reference. Local `.project-init/` state is never silently migrated from earlier versions; preserve backup before upgrades.
