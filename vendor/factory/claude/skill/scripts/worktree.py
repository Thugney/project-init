#!/usr/bin/env python3
"""Factory worktree helper.

Creates and manages one integration worktree plus one isolated worktree per worker.

  worktree.py init <slug>                 create/reuse integration, codex and claude worktrees
  worktree.py path <slug> <worker>        print absolute worktree path (integration|codex|claude)
  worktree.py sync <slug> <worker>        merge current integration branch into worker branch
  worktree.py integrate <slug> <worker>   merge worker branch into integration branch
  worktree.py status <slug>               print compact branch/path state

The caller remains responsible for review/approval. This helper never pushes or deletes branches.
"""
import json
import hashlib
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone

ROOT = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    capture_output=True, text=True
).stdout.strip()
if not ROOT:
    print("ERROR not a git repository")
    sys.exit(2)

STATE_ROOT = os.path.join(ROOT, ".project-init", "worktrees")
META_ROOT = os.path.join(ROOT, ".project-init", "factory-worktrees")
WORKERS = ("codex", "claude")


def run(args, cwd=ROOT, check=False):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if check and r.returncode:
        msg = (r.stderr or r.stdout).strip().replace("\n", " ")[:500]
        print(f"ERROR git {' '.join(args)}: {msg}")
        sys.exit(r.returncode or 1)
    return r


def safe_slug(slug):
    if not slug or any(x in slug for x in ("..", "/", "\\", ":")):
        print("ERROR invalid slug")
        sys.exit(2)
    return slug


def meta_path(slug):
    return os.path.join(META_ROOT, f"{safe_slug(slug)}.json")


def load(slug):
    p = meta_path(slug)
    if not os.path.exists(p):
        print(f"ERROR worktrees not initialized for {slug}")
        sys.exit(2)
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(slug, data):
    os.makedirs(META_ROOT, exist_ok=True)
    p = meta_path(slug)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, p)


def branch_exists(branch):
    return run(["show-ref", "--verify", "--quiet", f"refs/heads/{branch}"]).returncode == 0


def execution_context(slug):
    """Bind evidence before dispatch. Standalone legacy worktrees stay usable but unverified."""
    def optional(relative):
        filename = os.path.join(ROOT, relative)
        if not os.path.isfile(filename):
            return {}
        with open(filename, encoding="utf-8") as f:
            return json.load(f)
    baseline = optional(".project-init/baseline.json")
    review = optional(".project-init/review.json")
    approval = optional(".project-init/approval.json")
    preparation = optional(".project-init/preparation.json")
    board = optional("factory/board.json")
    job = next((job for job in board.get("jobs", []) if job.get("id") == slug), {})
    spec = os.path.join(ROOT, "factory", "jobs", slug, "spec.md")
    contract_hash = None
    if os.path.isfile(spec):
        with open(spec, encoding="utf-8", newline="") as f:
            content = f.read().replace("\r\n", "\n")
        content = re.sub(r"^(\s*- )\[[ xX]\]( T\d+ \[(?:CODEX|CLAUDE)\])", r"\1[ ]\2", content, flags=re.M)
        contract_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    approved = (baseline.get("hash") and review.get("verdict") == "pass"
                and review.get("baselineHash") == baseline["hash"]
                and approval.get("baselineHash") == baseline["hash"])
    return {"baselineHash": baseline.get("hash") if approved else None,
            "specPaths": baseline.get("specPaths", []), "feature": preparation.get("feature"),
            "jobSource": job.get("source"), "jobContractHash": contract_hash}


def ensure_worktree(path, branch, base):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        current = run(["-C", path, "rev-parse", "--abbrev-ref", "HEAD"])
        if current.returncode == 0 and current.stdout.strip() == branch:
            return "reused"
        print(f"ERROR worktree path already occupied: {path}")
        sys.exit(3)
    args = ["worktree", "add"]
    if branch_exists(branch):
        args += [path, branch]
    else:
        args += ["-b", branch, path, base]
    run(args, check=True)
    return "created"


def cmd_init(args):
    if len(args) != 1:
        print("ERROR usage: init <slug>")
        sys.exit(2)
    slug = safe_slug(args[0])
    existing = meta_path(slug)
    if os.path.exists(existing):
        data = load(slug)
        print(
            f"WORKTREES READY slug={slug} base={data['base_short']} "
            f"integration={data['paths']['integration']} codex={data['paths']['codex']} claude={data['paths']['claude']}"
        )
        return

    base = run(["rev-parse", "HEAD"], check=True).stdout.strip()
    base_short = base[:12]
    base_branch = run(["rev-parse", "--abbrev-ref", "HEAD"], check=True).stdout.strip()
    root = os.path.join(STATE_ROOT, slug)
    branches = {
        "integration": f"factory/{slug}/integration",
        "codex": f"factory/{slug}/codex",
        "claude": f"factory/{slug}/claude",
    }
    paths = {name: os.path.abspath(os.path.join(root, name)) for name in branches}
    actions = {}
    for name in ("integration", "codex", "claude"):
        actions[name] = ensure_worktree(paths[name], branches[name], base)
    data = {
        "schemaVersion": 1,
        "slug": slug,
        "base": base,
        "base_short": base_short,
        "base_branch": base_branch,
        "branches": branches,
        "paths": paths,
        "executionContext": execution_context(slug),
    }
    save(slug, data)
    print(
        f"WORKTREES READY slug={slug} base={base_short} "
        f"integration={paths['integration']} codex={paths['codex']} claude={paths['claude']}"
    )


def cmd_path(args):
    if len(args) != 2 or args[1] not in ("integration", *WORKERS):
        print("ERROR usage: path <slug> integration|codex|claude")
        sys.exit(2)
    print(load(args[0])["paths"][args[1]])


def clean(path):
    r = run(["-C", path, "status", "--porcelain", "--", ".",
             ":(exclude).project-init", ":(exclude).factory-context"], check=True)
    return not r.stdout.strip()


def observed(path):
    with open(path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    return {"path": os.path.relpath(path, ROOT).replace(os.sep, "/"), "sha256": digest}


def integration_receipt(slug, data, worker, before, worker_head, outcome, started, worker_evidence=None):
    """Record the actual Git command, including failures; do not claim an agent ran."""
    directory = os.path.join(ROOT, "factory", "jobs", slug, "integration")
    os.makedirs(directory, exist_ok=True)
    identifier = str(uuid.uuid4())
    log = os.path.join(directory, identifier + ".log")
    with open(log, "w", encoding="utf-8") as f:
        f.write("stdout:\n" + (outcome.stdout or "") + "\nstderr:\n" + (outcome.stderr or ""))
    receipt = {
        "schemaVersion": 1, "job": slug, "worker": worker,
        "command": ["git", "merge", "--no-ff", "--no-edit", data["branches"][worker]],
        "cwd": data["paths"]["integration"], "beforeRevision": before,
        "afterRevision": run(["-C", data["paths"]["integration"], "rev-parse", "HEAD"], check=True).stdout.strip(),
        "workerRevision": worker_head, "exitCode": outcome.returncode,
        "startedAt": started, "finishedAt": datetime.now(timezone.utc).isoformat(),
        "log": observed(log),
        "workerEvidenceKind": f"{worker}-process" if worker_evidence else "interactive-commit",
    }
    if worker_evidence:
        receipt["workerEvidence"] = worker_evidence
    filename = os.path.join(directory, identifier + ".json")
    with open(filename, "x", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2)
        f.write("\n")
    relative = os.path.relpath(filename, ROOT).replace(os.sep, "/")
    data.setdefault("integrationAttempts", []).append(relative)
    data["latestIntegration"] = relative
    if outcome.returncode == 0:
        data.setdefault("integrations", []).append(relative)
    save(slug, data)


def successful_process(slug, worker, worker_head):
    directory = os.path.abspath(os.path.join(ROOT, "factory", "jobs", slug, worker))
    with open(os.path.join(directory, "latest-execution.json"), encoding="utf-8") as f:
        pointer = json.load(f)
    filename = os.path.abspath(os.path.join(ROOT, pointer["path"]))
    normalized_directory = os.path.normcase(directory)
    normalized_filename = os.path.normcase(filename)
    if os.path.commonpath([normalized_filename, normalized_directory]) != normalized_directory:
        raise ValueError("receipt outside job")
    with open(filename, encoding="utf-8") as f:
        receipt = json.load(f)
    if (receipt.get("job") != slug or receipt.get("worker") != worker
            or receipt.get("status") != "done" or receipt.get("exitCode") != 0
            or receipt.get("afterRevision") != worker_head):
        raise ValueError("failed, blocked or stale worker result")
    return observed(filename)


def successful_codex(slug, worker_head):
    try:
        return successful_process(slug, "codex", worker_head)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"ERROR successful Codex process evidence required before integration: {error}")
        sys.exit(4)


def headless_claude(slug, worker_head):
    """A Claude worker run by claude_worker.py leaves process evidence; an interactive one does not."""
    try:
        return successful_process(slug, "claude", worker_head)
    except (OSError, ValueError, KeyError, TypeError):
        return None


def cmd_sync(args):
    if len(args) != 2 or args[1] not in WORKERS:
        print("ERROR usage: sync <slug> codex|claude")
        sys.exit(2)
    slug, worker = args
    data = load(slug)
    path = data["paths"][worker]
    if not clean(path):
        print(f"ERROR {worker} worktree has uncommitted changes")
        sys.exit(4)
    integration = data["branches"]["integration"]
    r = run(["-C", path, "merge", "--no-edit", integration])
    if r.returncode:
        print(f"CONFLICT sync worker={worker} worktree={path}")
        sys.exit(5)
    print(f"SYNCED worker={worker} from={integration}")


def cmd_integrate(args):
    if len(args) != 2 or args[1] not in WORKERS:
        print("ERROR usage: integrate <slug> codex|claude")
        sys.exit(2)
    slug, worker = args
    data = load(slug)
    worker_path = data["paths"][worker]
    integration_path = data["paths"]["integration"]
    if not clean(worker_path):
        print(f"ERROR {worker} worktree has uncommitted changes")
        sys.exit(4)
    if not clean(integration_path):
        print("ERROR integration worktree has uncommitted changes")
        sys.exit(4)
    branch = data["branches"][worker]
    before = run(["-C", integration_path, "rev-parse", "HEAD"], check=True).stdout.strip()
    worker_head = run(["-C", worker_path, "rev-parse", "HEAD"], check=True).stdout.strip()
    worker_evidence = successful_codex(slug, worker_head) if worker == "codex" else headless_claude(slug, worker_head)
    started = datetime.now(timezone.utc).isoformat()
    r = run(["-C", integration_path, "merge", "--no-ff", "--no-edit", branch])
    integration_receipt(slug, data, worker, before, worker_head, r, started, worker_evidence)
    if r.returncode:
        print(f"CONFLICT integrate worker={worker} integration={integration_path}")
        sys.exit(5)
    head = run(["-C", integration_path, "rev-parse", "--short", "HEAD"], check=True).stdout.strip()
    print(f"INTEGRATED worker={worker} commit={head} branch={data['branches']['integration']}")


def cmd_status(args):
    if len(args) != 1:
        print("ERROR usage: status <slug>")
        sys.exit(2)
    data = load(args[0])
    bits = []
    for name in ("integration", "codex", "claude"):
        path = data["paths"][name]
        head = run(["-C", path, "rev-parse", "--short", "HEAD"])
        state = "clean" if clean(path) else "dirty"
        bits.append(f"{name}={head.stdout.strip()}:{state}")
    print(f"WORKTREES slug={args[0]} base={data['base_short']} " + " ".join(bits))


COMMANDS = {
    "init": cmd_init,
    "path": cmd_path,
    "sync": cmd_sync,
    "integrate": cmd_integrate,
    "status": cmd_status,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(2)
    COMMANDS[sys.argv[1]](sys.argv[2:])
