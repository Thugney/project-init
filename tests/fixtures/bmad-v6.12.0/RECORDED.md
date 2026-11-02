# BMAD v6.12.0 fixture provenance

Recorded 2026-10-31 from the exact `bmad-method@6.12.0` npm package.

Command used in a disposable directory:

```powershell
npx --yes bmad-method@6.12.0 install --directory . --modules bmm --tools claude-code,codex --output-folder _bmad-output --user-name "Fixture Maintainer" --communication-language English --document-output-language English --yes
```

The installer created `_bmad/_config/manifest.yaml`, `_bmad/bmm/config.yaml`, and `_bmad-output/`. Its BMM configuration sets `planning_artifacts` to `{project-root}/_bmad-output/planning-artifacts` and `implementation_artifacts` to `{project-root}/_bmad-output/implementation-artifacts`. BMAD v6's sprint workflow uses `sprint-status.yaml` in the implementation-artifacts directory. The v6 story format is `Story N.M: title`, a `Status:` line, and checkbox tasks; the output folder and filenames below use the installer configuration and the v6 story template conventions.

The installer reported that `uv` was not on PATH. The Python-backed BMAD authoring workflows were therefore not run. The PRD, architecture, epic, two stories, and sprint status are synthetic minimal examples written in the generated v6 format, with no real project or maintainer data.

The installer also reported that `6.12.4` was available. This fixture records the exact `6.12.0` pin required by this feature's current project decision; it does not assert that `6.12.0` is the latest stable patch.
