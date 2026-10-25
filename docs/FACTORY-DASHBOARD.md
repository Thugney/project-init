# Factory dashboard and local state

The dashboard reads `factory/board.json` from the same checkout that serves
`factory/dashboard.html`. It displays registered Factory jobs. It does not
discover GitHub PRs, Spec Kit tasks or ordinary Claude/Codex sessions, and a
recorded `building` stage is not proof that a worker process is still alive.

## Installation and viewing

An explicit Factory installation/apply creates an empty board only when the
board is absent. It does not invent a job. A preview and `/factory status` are
read-only. Factory status and the installation result show the absolute board
path and the orchestration checkout so another worktree is not mistaken for
the active board.

For local viewing, open a terminal in that checkout's `factory` directory:

```text
python3 -m http.server 8765 --bind 127.0.0.1
```

On Windows, use `python` if that is the installed Python command. Open
`http://127.0.0.1:8765/dashboard.html`. Stop the viewing server with Ctrl+C;
this does not stop Factory workers or change job state.

## Interpreting the dashboard

| State | Meaning and action |
|---|---|
| Empty board | Setup completed and this board contains zero registered jobs. Start only the approved work through the installed Factory workflow. |
| Missing board / HTTP 404 | The server responded but this checkout has no board file. Check `/factory status` in the orchestration checkout before applying setup or choosing another directory. |
| Invalid JSON or jobs schema | Existing state cannot be interpreted safely. Preserve the file and inspect or restore it; installation will not replace it with an empty board. |
| HTTP 401/403 | The server denied access. Check the served directory and file access. |
| Other HTTP error | The server could not return the board. This is not a verified empty board. |
| Connection failure | Check that the local server is running and that the dashboard was opened through its HTTP URL. |

The dashboard retries every three seconds. Failed refreshes clear old cards so
stale jobs are not displayed as current evidence. A successful refresh restores
the visible jobs. A missing favicon does not affect the board.

## Upgrade and rollback

Factory apply preserves existing `board.json` bytes and job history, including
unknown fields. Initial creation publishes a complete empty board without
overwriting a board created concurrently by an orchestrator. A malformed or
unreadable existing board blocks apply; there is no automatic reset or repair.

Before a tooling rollback, preserve `factory/board.json`, `factory/jobs/` and
the checkout's Project Init state. Restore the prior tooling version without
deleting runtime state. If a board is lost, inspect the original orchestration
worktree or an actual backup; creating a dummy job cannot recover past work.
