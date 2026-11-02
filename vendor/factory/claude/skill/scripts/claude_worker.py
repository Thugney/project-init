#!/usr/bin/env python3
"""Run Claude Code headless as a Factory worker or Factory agent.

  claude_worker.py build <slug>
  claude_worker.py fix <slug> <round>
  claude_worker.py agent <slug> <factory-agent> [round]

Used when Codex is the configured orchestrator (config.json "orchestrator": "codex").
build/fix run in the isolated Claude worktree and leave the same process receipt
shape as codex_worker.py, so integration evidence treats both workers alike.
agent runs one bundled .claude/agents/factory-*.md agent (spec writer, reviewer,
approver) from the orchestration root; that agent writes its own job file.

The job spec assigns tasks to [CODEX] or [CLAUDE] dynamically. These tags are
worker assignments, not frontend/backend ownership. The prompt is sent on stdin,
so multi-line instructions survive Windows command shims.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import routing  # noqa: E402

ROOT = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True
).stdout.strip()
if not ROOT:
    print("CLAUDE ERROR not a git repository")
    sys.exit(6)

CFG = os.path.join(ROOT, ".claude", "skills", "factory", "config.json")
WT = os.path.join(ROOT, ".claude", "skills", "factory", "scripts", "worktree.py")
AGENTS = os.path.join(ROOT, ".claude", "agents")
SLUG = re.compile(r"\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*")


def cfg():
    with open(CFG, encoding="utf-8") as f:
        return json.load(f)


def registered(slug):
    if not SLUG.fullmatch(slug):
        print("CLAUDE ERROR invalid Factory job slug")
        return False
    try:
        with open(os.path.join(ROOT, "factory", "board.json"), encoding="utf-8") as f:
            board = json.load(f)
        if not any(job.get("id") == slug for job in board.get("jobs", [])):
            raise ValueError("job is not registered in this checkout")
        return True
    except (OSError, ValueError, TypeError, AttributeError) as error:
        print(f"CLAUDE ERROR cannot begin registered Factory work: {error}")
        return False


def begin_attempt(slug):
    """Invalidate an earlier success before any preflight that can fail."""
    if not registered(slug):
        return False
    try:
        directory = os.path.join(ROOT, "factory", "jobs", slug, "claude")
        os.makedirs(directory, exist_ok=True)
        pointer = os.path.join(directory, "latest-execution.json")
        temporary = pointer + "." + str(uuid.uuid4()) + ".tmp"
        with open(temporary, "x", encoding="utf-8") as f:
            json.dump({"path": None, "status": "preflight", "processStarted": False,
                       "startedAt": datetime.now(timezone.utc).isoformat()}, f)
        os.replace(temporary, pointer)
        return True
    except OSError as error:
        print(f"CLAUDE ERROR cannot begin registered Factory work: {error}")
        return False


def run_process(cmd, cwd=None, timeout=None, **kwargs):
    args = list(cmd)
    if os.name == "nt" and args and str(args[0]).lower().endswith((".cmd", ".bat")):
        command_line = subprocess.list2cmdline(args)
        args = [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/v:off", "/s", "/c", command_line]
    return subprocess.run(
        args, cwd=cwd or ROOT, timeout=timeout,
        encoding="utf-8", errors="replace", **kwargs
    )


def run(cmd, cwd=None, timeout=None):
    return run_process(cmd, cwd=cwd, timeout=timeout, capture_output=True, text=True)


def resolve_claude(settings):
    explicit = (settings.get("claude") or {}).get("executable")
    if explicit:
        candidate = os.path.abspath(os.path.expanduser(explicit))
        if os.path.isfile(candidate):
            return candidate
    if os.name == "nt":
        for name in ("claude.exe", "claude.cmd"):
            found = shutil.which(name)
            if found:
                return found
    return shutil.which("claude")


def claude_args(settings, executable, route):
    claude = settings.get("claude") or {}
    args = [executable, "-p", "--output-format", "stream-json", "--verbose"]
    if route["passedModel"]:
        args += ["--model", route["passedModel"]]
    return args + list(claude.get("args", ["--permission-mode", "acceptEdits"]))


def route_for(settings, role):
    try:
        return routing.invocation(settings, role, "claude")
    except routing.PolicyError as error:
        print(f"CLAUDE ERROR model routing: {error}")
        return None


def record_route(slug, route, started, events, mode):
    routing.record(ROOT, slug, {
        "role": route["role"], "client": "claude", "tier": route["tier"],
        "model": route["model"] or "not-configured", "routing": route["routing"],
        "passedModel": route["passedModel"], "mode": mode,
        "startedAt": started, "finishedAt": datetime.now(timezone.utc).isoformat(),
        "usage": routing.usage_from_claude(events),
    })


def worktree_path(slug, name):
    r = run([sys.executable, WT, "path", slug, name])
    if r.returncode:
        print((r.stdout or r.stderr).strip())
        sys.exit(r.returncode)
    return r.stdout.strip()


def sync_context(slug, worktree, round_no=None):
    job = os.path.join(ROOT, "factory", "jobs", slug)
    spec = os.path.join(job, "spec.md")
    if not os.path.isfile(spec):
        print(f"CLAUDE ERROR missing {spec}")
        sys.exit(6)
    dest = os.path.join(worktree, ".factory-context", slug)
    os.makedirs(dest, exist_ok=True)
    shutil.copy2(spec, os.path.join(dest, "spec.md"))
    if round_no:
        src = os.path.join(job, f"round-{round_no}")
        out = os.path.join(dest, f"round-{round_no}")
        if not os.path.isdir(src):
            print(f"CLAUDE ERROR missing {src}")
            sys.exit(6)
        if os.path.exists(out):
            shutil.rmtree(out)
        shutil.copytree(src, out)
    exclude = run(["git", "-C", worktree, "rev-parse", "--git-path", "info/exclude"])
    if exclude.returncode == 0:
        p = exclude.stdout.strip()
        try:
            current = open(p, encoding="utf-8").read() if os.path.exists(p) else ""
            if ".factory-context/" not in current.splitlines():
                with open(p, "a", encoding="utf-8") as f:
                    if current and not current.endswith("\n"):
                        f.write("\n")
                    f.write(".factory-context/\n")
        except OSError:
            pass
    return dest


def commit_changes(worktree, slug, tag):
    status = run(["git", "-C", worktree, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".",
                  ":(exclude).factory-context", ":(exclude).project-init"])
    if status.returncode:
        print(f"CLAUDE ERROR git status failed: {(status.stderr or status.stdout).strip()[:300]}")
        sys.exit(7)
    rows = iter(status.stdout.split("\0"))
    files = []
    for row in rows:
        if not row:
            continue
        files.append(row[3:])
        if "R" in row[:2] or "C" in row[:2]:
            previous = next(rows, "")
            if previous:
                files.append(previous)
    files = list(dict.fromkeys(files))
    if not files:
        return "none", 0
    add = run(["git", "-C", worktree, "add", "-A", "--", *files])
    if add.returncode:
        print(f"CLAUDE ERROR git add failed: {(add.stderr or add.stdout).strip()[:300]}")
        sys.exit(7)
    commit = run(["git", "-C", worktree, "commit", "-m", f"factory({slug}): claude {tag}"])
    if commit.returncode:
        print(f"CLAUDE ERROR git commit failed: {(commit.stderr or commit.stdout).strip()[:300]}")
        sys.exit(7)
    head = run(["git", "-C", worktree, "rev-parse", "--short", "HEAD"])
    return head.stdout.strip() or "unknown", len(files)


def extract_result(events, last):
    """Keep Claude's final result text as the worker's last message."""
    result = ""
    try:
        with open(events, encoding="utf-8", errors="replace") as f:
            for line in f:
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                if isinstance(event, dict) and event.get("type") == "result" and isinstance(event.get("result"), str):
                    result = event["result"]
    except OSError:
        pass
    with open(last, "w", encoding="utf-8") as f:
        f.write(result)
    return next((line.strip() for line in result.splitlines() if line.strip()), "")


def record_execution(slug, worktree, output, started, before, exit_code, status, paths, prompt, route):
    """Capture observed process/Git facts, never infer success from a prior summary."""
    immutable = os.path.join(output, "evidence", str(uuid.uuid4()))
    os.makedirs(immutable)
    logs = []
    for filename in paths:
        if not os.path.exists(filename):
            with open(filename, "w", encoding="utf-8"):
                pass
        retained = os.path.join(immutable, os.path.basename(filename))
        shutil.copyfile(filename, retained)
        with open(retained, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        logs.append({"path": os.path.relpath(retained, ROOT).replace(os.sep, "/"), "sha256": digest})
    head = run(["git", "-C", worktree, "rev-parse", "HEAD"])
    receipt = {
        "schemaVersion": 2, "job": slug, "worker": "claude", "cwd": worktree,
        "startedAt": started, "finishedAt": datetime.now(timezone.utc).isoformat(),
        "beforeRevision": before, "afterRevision": head.stdout.strip(),
        "exitCode": exit_code, "status": status, "logs": logs,
        "command": "claude -p --output-format stream-json --verbose"
                   + (f" --model {route['passedModel']}" if route["passedModel"] else "")
                   + " <stdin prompt> (cwd=<isolated-worktree>)",
        "promptHash": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        "role": route["role"], "client": "claude", "tier": route["tier"],
        "model": route["model"] or "not-configured", "passedModel": route["passedModel"],
    }
    filename = os.path.join(immutable, "execution.json")
    with open(filename, "x", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2)
        f.write("\n")
    pointer = os.path.join(ROOT, "factory", "jobs", slug, "claude", "latest-execution.json")
    with open(pointer + ".tmp", "w", encoding="utf-8") as f:
        json.dump({"path": os.path.relpath(filename, ROOT).replace(os.sep, "/")}, f)
    os.replace(pointer + ".tmp", pointer)


def launch(args, cwd, prompt, events, stderr, timeout_min):
    with open(events, "w", encoding="utf-8") as ef, open(stderr, "w", encoding="utf-8") as sf:
        return run_process(args, cwd=cwd, input=prompt, stdout=ef, stderr=sf, text=True, timeout=timeout_min * 60)


def work(mode, slug, round_no, settings, claude):
    route = route_for(settings, "builder")
    if not route:
        return 6
    wt = worktree_path(slug, "claude")
    sync_context(slug, wt, round_no)
    out = os.path.join(ROOT, "factory", "jobs", slug, "claude", "build" if mode == "build" else f"fix-r{round_no}")
    os.makedirs(out, exist_ok=True)
    last = os.path.join(out, "last-message.md")
    events = os.path.join(out, "events.jsonl")
    stderr = os.path.join(out, "stderr.log")

    tests = settings.get("test_command") or "Use the repository's established relevant test commands."
    task_rule = (
        "Implement every unfinished task tagged [CLAUDE] in .factory-context/{0}/spec.md. "
        "Do not implement tasks tagged [CODEX]."
    ).format(slug)
    if mode == "fix":
        task_rule = (
            f"Read .factory-context/{slug}/round-{round_no}/review-*.md and fix only findings tagged [CLAUDE]. "
            f"Re-read .factory-context/{slug}/spec.md for scope and contract."
        )

    prompt = f"""You are the Claude worker for Factory job {slug}.
You are running in your own isolated Git worktree. Another worker may be working in parallel in a different worktree.
{task_rule}

Rules:
- [CODEX] and [CLAUDE] are dynamic worker assignments, NOT backend/frontend roles. You may implement frontend, backend, tests, docs, or full-stack work when assigned.
- The API Contract in .factory-context/{slug}/spec.md is binding. Never rewrite it.
- Stay within the assigned task/file boundaries. Do not edit .claude/, .agents/, .project-init/, factory/, .github/, or .factory-context/ unless the assigned task explicitly requires a normally protected path and the spec marks it HIGH risk.
- Do not run git commit, push, pull, merge, rebase, checkout, switch, or worktree commands. The Factory bridge owns Git integration.
- Add/update tests for the assigned acceptance criteria. Test instruction: {tests}
- Never hard-code secrets or weaken/delete tests to get green.
- If another worker's output is required but not yet present, rely on the binding contract and keep your changes independently integratable.
- Final first line must be exactly WORKER: DONE or WORKER: BLOCKED <reason>. At most 10 short lines total.
"""
    timeout_min = int((settings.get("claude") or {}).get("timeout_minutes", 45))
    before = run(["git", "-C", wt, "rev-parse", "HEAD"]).stdout.strip()
    started = datetime.now(timezone.utc).isoformat()
    if os.path.exists(last):
        os.remove(last)

    def receipt(code, state):
        record_execution(slug, wt, out, started, before, code, state, [events, stderr, last], prompt, route)

    start = time.time()
    try:
        r = launch(claude_args(settings, claude, route), wt, prompt, events, stderr, timeout_min)
    except subprocess.TimeoutExpired:
        receipt(124, "failed")
        print(f"CLAUDE FAILED timeout after {timeout_min}m worktree={wt}")
        return 3
    except OSError as error:
        receipt(127, "failed")
        print(f"CLAUDE FAILED could not launch process: {error}")
        return 3
    secs = int(time.time() - start)
    first = extract_result(events, last)
    record_route(slug, route, started, events, "headless-" + ("build" if mode == "build" else "fix"))
    if r.returncode:
        receipt(r.returncode, "failed")
        tail = ""
        try:
            tail = open(stderr, encoding="utf-8", errors="replace").read()[-300:].replace("\n", " ")
        except OSError:
            pass
        print(f"CLAUDE FAILED exit={r.returncode} {tail[:180]} worktree={wt}")
        return 3
    if first.startswith("WORKER: BLOCKED"):
        receipt(4, "blocked")
        print(f"CLAUDE BLOCKED {first[len('WORKER: BLOCKED'):].strip()} worktree={wt}")
        return 4
    if first != "WORKER: DONE":
        receipt(5, "failed")
        print(f"CLAUDE FAILED missing WORKER: DONE result worktree={wt}")
        return 5

    tag = "build" if mode == "build" else f"fix-r{round_no}"
    try:
        commit, changed = commit_changes(wt, slug, tag)
    except SystemExit as error:
        receipt(int(error.code or 7), "failed")
        return int(error.code or 7)
    receipt(0, "done")
    report = os.path.join(out, "report.md")
    with open(report, "w", encoding="utf-8") as f:
        f.write(f"# Claude worker report\n\n- mode: {tag}\n- worktree: {wt}\n- commit: {commit}\n- files changed: {changed}\n- duration: {secs}s\n")
        f.write("\n## Worker final message\n\n")
        f.write(open(last, encoding="utf-8", errors="replace").read()[:4000])
    print(f"CLAUDE DONE mode={tag} commit={commit} files_changed={changed} worktree={wt} report={report}")
    return 0


def agent(slug, name, round_no, settings, claude):
    if not re.fullmatch(r"factory-[a-z]+(?:-[a-z]+)*", name):
        print("CLAUDE USAGE agent <slug> factory-<agent> [round]")
        return 6
    definition = os.path.join(AGENTS, name + ".md")
    if not os.path.isfile(definition):
        print(f"CLAUDE ERROR missing agent definition {definition}")
        return 6
    body = open(definition, encoding="utf-8").read()
    if body.startswith("---"):
        end = body.find("\n---", 3)
        body = body[end + 4:] if end != -1 else body
    job = os.path.join(ROOT, "factory", "jobs", slug)
    try:
        integration = worktree_path(slug, "integration")
    except SystemExit:
        integration = "(not created yet)"
    out = os.path.join(job, "claude", "agents", name + (f"-r{round_no}" if round_no else ""))
    os.makedirs(out, exist_ok=True)
    last = os.path.join(out, "last-message.md")
    events = os.path.join(out, "events.jsonl")
    stderr = os.path.join(out, "stderr.log")
    round_line = f"Review round: {round_no}. Round directory: {os.path.join(job, f'round-{round_no}')}\n" if round_no else ""
    checks = os.path.join(integration, ".project-init", "evidence", "latest-checks.json")
    checks_line = f"Deterministic check results: {checks}\n" if os.path.isfile(checks) else ""
    prompt = f"""You are the Factory agent {name}, run headless by the Codex orchestrator for Factory job {slug}.
Orchestration root: {ROOT}
Job directory: {job}
Job spec: {os.path.join(job, 'spec.md')}
Integration worktree: {integration}
{round_line}{checks_line}
Follow these agent instructions exactly. Write the job file they name, using the absolute job directory above.

{body.strip()}
"""
    role = routing.role_for_agent(name)
    if role:
        route = route_for(settings, role)
        if not route:
            return 6
    else:
        route = {"role": name, "tier": None, "model": None, "routing": "not-configured",
                 "passedModel": routing.fallback_model(settings, "claude")}
    started = datetime.now(timezone.utc).isoformat()
    args = claude_args(settings, claude, route)
    if os.path.isdir(integration):
        args += ["--add-dir", integration]
    timeout_min = int((settings.get("claude") or {}).get("timeout_minutes", 45))
    try:
        r = launch(args, ROOT, prompt, events, stderr, timeout_min)
    except subprocess.TimeoutExpired:
        print(f"CLAUDE AGENT FAILED agent={name} timeout after {timeout_min}m")
        return 3
    except OSError as error:
        print(f"CLAUDE AGENT FAILED agent={name} could not launch process: {error}")
        return 3
    first = extract_result(events, last)
    record_route(slug, route, started, events, "headless-agent")
    if r.returncode:
        print(f"CLAUDE AGENT FAILED agent={name} exit={r.returncode} log={stderr}")
        return 3
    print(f"CLAUDE AGENT DONE agent={name} result={first[:160]} log={out}")
    return 0


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("build", "fix", "agent"):
        print("CLAUDE USAGE build <slug> | fix <slug> <round> | agent <slug> factory-<agent> [round]")
        return 6
    mode, slug = sys.argv[1], sys.argv[2]
    if mode == "agent":
        if len(sys.argv) < 4:
            print("CLAUDE USAGE agent <slug> factory-<agent> [round]")
            return 6
        if not registered(slug):
            return 6
        settings = cfg()
        claude = resolve_claude(settings)
        if not claude:
            print("CLAUDE MISSING claude CLI runtime not found")
            return 2
        return agent(slug, sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None, settings, claude)
    round_no = sys.argv[3] if mode == "fix" and len(sys.argv) > 3 else None
    if mode == "fix" and not round_no:
        print("CLAUDE USAGE fix <slug> <round>")
        return 6
    if not begin_attempt(slug):
        return 6
    settings = cfg()
    claude = resolve_claude(settings)
    if not claude:
        print("CLAUDE MISSING claude CLI runtime not found")
        return 2
    return work(mode, slug, round_no, settings, claude)


if __name__ == "__main__":
    sys.exit(main())
