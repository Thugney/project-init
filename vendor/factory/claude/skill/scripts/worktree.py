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
import os
import subprocess
import sys

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
    r = run(["-C", path, "status", "--porcelain"], check=True)
    return not r.stdout.strip()


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
    r = run(["-C", integration_path, "merge", "--no-ff", "--no-edit", branch])
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
