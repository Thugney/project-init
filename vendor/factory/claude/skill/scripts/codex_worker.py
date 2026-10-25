#!/usr/bin/env python3
"""Run Codex as a generic Factory worker inside its isolated worktree.

  codex_worker.py build <slug>
  codex_worker.py fix <slug> <round>

The job spec assigns tasks to [CODEX] or [CLAUDE] dynamically. These tags are
worker assignments, not frontend/backend ownership.
"""
import json
import os
import shutil
import subprocess
import sys
import time
import platform

ROOT = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True
).stdout.strip()
if not ROOT:
    print("CODEX ERROR not a git repository")
    sys.exit(6)

CFG = os.path.join(ROOT, ".claude", "skills", "factory", "config.json")
WT = os.path.join(ROOT, ".claude", "skills", "factory", "scripts", "worktree.py")


def cfg():
    with open(CFG, encoding="utf-8") as f:
        return json.load(f)


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


def npm_global_root():
    npm = shutil.which("npm.cmd") if os.name == "nt" else shutil.which("npm")
    npm = npm or shutil.which("npm")
    if not npm:
        return None
    r = run_process([npm, "root", "-g"], capture_output=True, text=True)
    if r.returncode:
        return None
    value = (r.stdout or "").strip().splitlines()
    return value[-1] if value else None


def resolve_codex(settings):
    explicit = (settings.get("codex") or {}).get("executable")
    if explicit:
        candidate = os.path.abspath(os.path.expanduser(explicit))
        if os.path.isfile(candidate):
            return candidate

    if os.name == "nt":
        native = shutil.which("codex.exe")
        if native:
            return native

        root = npm_global_root()
        machine = platform.machine().lower()
        if root:
            if machine in ("amd64", "x86_64"):
                package_name, triple = "codex-win32-x64", "x86_64-pc-windows-msvc"
            elif machine in ("arm64", "aarch64"):
                package_name, triple = "codex-win32-arm64", "aarch64-pc-windows-msvc"
            else:
                package_name = triple = None
            if package_name:
                candidates = [
                    os.path.join(root, "@openai", "codex", "node_modules", "@openai", package_name, "vendor", triple, "bin", "codex.exe"),
                    os.path.join(root, "@openai", package_name, "vendor", triple, "bin", "codex.exe"),
                ]
                for candidate in candidates:
                    if os.path.isfile(candidate):
                        return candidate

    return shutil.which("codex")


def worktree_path(slug):
    r = run([sys.executable, WT, "path", slug, "codex"])
    if r.returncode:
        print((r.stdout or r.stderr).strip())
        sys.exit(r.returncode)
    return r.stdout.strip()


def sync_context(slug, worktree, round_no=None):
    job = os.path.join(ROOT, "factory", "jobs", slug)
    spec = os.path.join(job, "spec.md")
    if not os.path.isfile(spec):
        print(f"CODEX ERROR missing {spec}")
        sys.exit(6)
    dest = os.path.join(worktree, ".factory-context", slug)
    os.makedirs(dest, exist_ok=True)
    shutil.copy2(spec, os.path.join(dest, "spec.md"))
    if round_no:
        src = os.path.join(job, f"round-{round_no}")
        out = os.path.join(dest, f"round-{round_no}")
        if not os.path.isdir(src):
            print(f"CODEX ERROR missing {src}")
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
    status = run(["git", "-C", worktree, "status", "--porcelain", "--", ".", ":(exclude).factory-context/"])
    if status.returncode:
        return "none", 0
    changed = len([x for x in status.stdout.splitlines() if x.strip()])
    if not changed:
        return "none", 0
    add = run(["git", "-C", worktree, "add", "-A", "--", ".", ":(exclude).factory-context/"])
    if add.returncode:
        print(f"CODEX ERROR git add failed: {(add.stderr or add.stdout).strip()[:300]}")
        sys.exit(7)
    commit = run(["git", "-C", worktree, "commit", "-m", f"factory({slug}): codex {tag}"])
    if commit.returncode:
        print(f"CODEX ERROR git commit failed: {(commit.stderr or commit.stdout).strip()[:300]}")
        sys.exit(7)
    head = run(["git", "-C", worktree, "rev-parse", "--short", "HEAD"])
    return head.stdout.strip() or "unknown", changed


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("build", "fix"):
        print("CODEX USAGE build <slug> | fix <slug> <round>")
        return 6
    mode, slug = sys.argv[1], sys.argv[2]
    round_no = sys.argv[3] if mode == "fix" and len(sys.argv) > 3 else None
    if mode == "fix" and not round_no:
        print("CODEX USAGE fix <slug> <round>")
        return 6
    settings = cfg()
    codex = resolve_codex(settings)
    if not codex:
        print("CODEX MISSING codex CLI runtime not found")
        return 2
    wt = worktree_path(slug)
    context = sync_context(slug, wt, round_no)
    out = os.path.join(ROOT, "factory", "jobs", slug, "codex", "build" if mode == "build" else f"fix-r{round_no}")
    os.makedirs(out, exist_ok=True)
    last = os.path.join(out, "last-message.md")
    events = os.path.join(out, "events.jsonl")
    stderr = os.path.join(out, "stderr.log")

    tests = settings.get("test_command") or "Use the repository's established relevant test commands."
    task_rule = (
        "Implement every unfinished task tagged [CODEX] in .factory-context/{0}/spec.md. "
        "Do not implement tasks tagged [CLAUDE]."
    ).format(slug)
    if mode == "fix":
        task_rule = (
            f"Read .factory-context/{slug}/round-{round_no}/review-*.md and fix only findings tagged [CODEX]. "
            f"Re-read .factory-context/{slug}/spec.md for scope and contract."
        )

    prompt = f"""You are the Codex worker for Factory job {slug}.
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
    args = [codex, "exec"]
    model = settings.get("codex", {}).get("model", "")
    if model:
        args += ["-m", model]
    args += settings.get("codex", {}).get("args", [])
    args += ["--cd", wt, "--json", "-o", last, prompt]
    timeout_min = int(settings.get("codex", {}).get("timeout_minutes", 45))
    start = time.time()
    try:
        with open(events, "w", encoding="utf-8") as ef, open(stderr, "w", encoding="utf-8") as sf:
            r = run_process(args, cwd=wt, stdout=ef, stderr=sf, text=True, timeout=timeout_min * 60)
    except subprocess.TimeoutExpired:
        print(f"CODEX FAILED timeout after {timeout_min}m worktree={wt}")
        return 3
    secs = int(time.time() - start)
    if r.returncode:
        tail = ""
        try:
            tail = open(stderr, encoding="utf-8", errors="replace").read()[-300:].replace("\n", " ")
        except OSError:
            pass
        print(f"CODEX FAILED exit={r.returncode} {tail[:180]} worktree={wt}")
        return 3

    first = ""
    if os.path.exists(last):
        with open(last, encoding="utf-8", errors="replace") as f:
            first = next((line.strip() for line in f if line.strip()), "")
    if first.startswith("WORKER: BLOCKED"):
        print(f"CODEX BLOCKED {first[len('WORKER: BLOCKED'):].strip()} worktree={wt}")
        return 4

    tag = "build" if mode == "build" else f"fix-r{round_no}"
    commit, changed = commit_changes(wt, slug, tag)
    report = os.path.join(out, "report.md")
    with open(report, "w", encoding="utf-8") as f:
        f.write(f"# Codex worker report\n\n- mode: {tag}\n- worktree: {wt}\n- commit: {commit}\n- files changed: {changed}\n- duration: {secs}s\n")
        if os.path.exists(last):
            f.write("\n## Worker final message\n\n")
            f.write(open(last, encoding="utf-8", errors="replace").read()[:4000])
    print(f"CODEX DONE mode={tag} commit={commit} files_changed={changed} worktree={wt} report={report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
