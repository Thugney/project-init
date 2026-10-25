#!/usr/bin/env python3
"""Factory state helper. The orchestrator is the only board.json writer.

Commands print compact lines:
  board.py init <title> [--source idea|speckit:<dir>]
  board.py stage <slug> <stage>
  board.py round <slug>
  board.py collect <slug>
  board.py risk <slug>
  board.py decision <slug>
  board.py note <slug> <key> <value>
  board.py get <slug> <key>
  board.py status
  board.py next
  board.py check <slug>
"""
import fnmatch
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or os.getcwd()
FACTORY = os.path.join(ROOT, "factory")
JOBS = os.path.join(FACTORY, "jobs")
BOARD = os.path.join(FACTORY, "board.json")
BACKLOG = os.path.join(FACTORY, "backlog.md")
CONFIG = os.path.join(ROOT, ".claude", "skills", "factory", "config.json")

STAGES = ["spec", "building", "integrating", "review", "fixing", "decision", "merged", "needs-human", "failed"]


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_config():
    with open(CONFIG, encoding="utf-8") as f:
        return json.load(f)


def validate_board(board):
    if not isinstance(board, dict) or not isinstance(board.get("jobs"), list):
        return False
    if "updated" in board and not isinstance(board["updated"], str):
        return False

    def reviews(value):
        return isinstance(value, dict) and all(
            re.fullmatch(r"[a-zA-Z0-9_-]+", key)
            and verdict in ("pending", "PASS", "CHANGES")
            for key, verdict in value.items()
        )

    ids = set()
    for item in board["jobs"]:
        if not isinstance(item, dict):
            return False
        slug = item.get("id")
        if (not isinstance(slug, str) or not re.fullmatch(r"\d+-[a-z0-9]+(?:-[a-z0-9]+)*", slug)
                or slug in ids or not isinstance(item.get("title"), str)
                or item.get("stage") not in STAGES
                or type(item.get("round")) is not int or item["round"] < 0
                or not reviews(item.get("reviews")) or not isinstance(item.get("rounds"), list)):
            return False
        if any(not isinstance(rec, dict) or type(rec.get("round")) is not int
               or rec["round"] < 0 or not reviews(rec.get("reviews")) for rec in item["rounds"]):
            return False
        ids.add(slug)
    return True


def assert_runtime_paths():
    for target in (FACTORY, BOARD):
        if os.path.islink(target) or (hasattr(os.path, "isjunction") and os.path.isjunction(target)):
            die(f"Factory runtime link refused: {target}; existing state was preserved")


def load():
    assert_runtime_paths()
    if not os.path.exists(BOARD):
        return {"updated": now(), "jobs": []}
    try:
        with open(BOARD, encoding="utf-8") as f:
            board = json.load(f)
    except (OSError, ValueError) as error:
        die(f"Cannot read Factory board {BOARD}: {error}; existing state was preserved")
    if not validate_board(board):
        die(f"Invalid Factory board jobs schema: {BOARD}; preserve the file and inspect the orchestration checkout")
    return board


def save(board):
    assert_runtime_paths()
    if not validate_board(board):
        die(f"Refused invalid Factory board update: {BOARD}; existing state was preserved")
    board["updated"] = now()
    os.makedirs(FACTORY, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="board.json.", suffix=".tmp", dir=FACTORY)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(board, f, indent=2)
            f.write("\n")
        os.replace(tmp, BOARD)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def job(board, slug):
    for j in board["jobs"]:
        if j["id"] == slug:
            return j
    die(f"unknown job {slug}")


def die(msg, code=1):
    print(f"ERROR {msg}")
    sys.exit(code)


def slugify(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return "-".join(s.split("-")[:6]) or "job"


def first_line(path):
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    return line.strip()
    except FileNotFoundError:
        return None
    return ""


def cmd_init(args):
    if not args:
        die("init requires title")
    title = args[0]
    source = "idea"
    if "--source" in args:
        source = args[args.index("--source") + 1]
    board = load()
    n = max([int(j["id"].split("-")[0]) for j in board["jobs"]] + [0]) + 1
    slug = f"{n:03d}-{slugify(title)}"
    os.makedirs(os.path.join(JOBS, slug), exist_ok=True)
    board["jobs"].append({
        "id": slug,
        "title": title,
        "source": source,
        "stage": "spec",
        "round": 0,
        "risk": None,
        "risk_files": [],
        "reviews": {},
        "rounds": [],
        "workers": {
            "codex": {"state": "pending"},
            "claude": {"state": "pending"}
        },
        "notes": {},
        "created": now(),
        "updated": now(),
    })
    save(board)
    print(slug)


def cmd_stage(args):
    slug, stage = args[0], args[1]
    if stage not in STAGES:
        die(f"bad stage {stage}")
    board = load()
    j = job(board, slug)
    j["stage"], j["updated"] = stage, now()
    save(board)
    print(f"{slug} stage={stage}")


def cmd_round(args):
    slug = args[0]
    board = load()
    j = job(board, slug)
    cfg = load_config()
    j["round"] += 1
    reviewers = list(cfg["reviewers"])
    if cfg.get("skip_ui_reviewers_when_no_ui") and j["notes"].get("has_ui") == "false":
        reviewers = [r for r in reviewers if r not in ("ux", "ui")]
    j["reviews"] = {r: "pending" for r in reviewers}
    j["stage"], j["updated"] = "review", now()
    path = os.path.join(JOBS, slug, f"round-{j['round']}")
    os.makedirs(path, exist_ok=True)
    save(board)
    print(f"round={j['round']} dir=factory/jobs/{slug}/round-{j['round']} reviewers={','.join(reviewers)}")


def cmd_collect(args):
    slug = args[0]
    board = load()
    j = job(board, slug)
    rdir = os.path.join(JOBS, slug, f"round-{j['round']}")
    missing, parts = [], []
    fixes = {"CODEX": 0, "CLAUDE": 0, "INTEGRATION": 0}
    for r in j["reviews"]:
        p = os.path.join(rdir, f"review-{r}.md")
        fl = first_line(p)
        m = re.match(r"^VERDICT:\s*(PASS|CHANGES)\b", fl or "")
        if not m:
            missing.append(r)
            j["reviews"][r] = "pending"
            continue
        j["reviews"][r] = m.group(1)
        parts.append(f"{r}={m.group(1)}")
        with open(p, encoding="utf-8") as f:
            for line in f:
                t = re.match(r"^\s*-\s*\[(CODEX|CLAUDE|INTEGRATION)\]", line)
                if t:
                    fixes[t.group(1)] += 1
    complete = not missing
    if complete:
        rec = {"round": j["round"], "reviews": dict(j["reviews"]), "fixes": fixes, "at": now()}
        j["rounds"] = [x for x in j["rounds"] if x["round"] != j["round"]] + [rec]
    j["updated"] = now()
    save(board)
    all_pass = complete and all(v == "PASS" for v in j["reviews"].values())
    state = "ALL_PASS" if all_pass else ("CHANGES" if complete else "INCOMPLETE")
    extra = f" missing={','.join(missing)}" if missing else ""
    print(
        f"{state} round={j['round']} {' '.join(parts)} "
        f"codex_fixes={fixes['CODEX']} claude_fixes={fixes['CLAUDE']} "
        f"integration_fixes={fixes['INTEGRATION']}{extra}"
    )


def git(*a, cwd=ROOT):
    return subprocess.run(["git", *a], capture_output=True, text=True, cwd=cwd)


def match_any(path, globs):
    for g in globs:
        if fnmatch.fnmatch(path, g) or fnmatch.fnmatch("/" + path, "/" + g) or fnmatch.fnmatch(path, g.replace("**/", "")):
            return True
    return False


def integration_branch(slug):
    return f"factory/{slug}/integration"


def cmd_risk(args):
    slug = args[0]
    board = load()
    j = job(board, slug)
    cfg = load_config()
    base = j["notes"].get("base_commit")
    if not base:
        die("missing base_commit note; worktrees were not initialized")
    branch = integration_branch(slug)
    res = git("diff", "--name-only", f"{base}...{branch}")
    if res.returncode != 0:
        die(f"git diff failed: {res.stderr.strip()[:200]}")
    files = [f for f in res.stdout.splitlines() if f.strip() and not f.startswith("factory/")]
    hits = [f for f in files if match_any(f, cfg["high_risk_paths"])]
    spec_tier = None
    spec = os.path.join(JOBS, slug, "spec.md")
    if os.path.exists(spec):
        with open(spec, encoding="utf-8") as f:
            m = re.search(r"^Risk Tier:\s*(LOW|HIGH)", f.read(), re.M)
            spec_tier = m.group(1) if m else None
    tier = "HIGH" if hits or spec_tier == "HIGH" else "LOW"
    j["risk"], j["risk_files"], j["updated"] = tier, hits[:50], now()
    save(board)
    print(
        f"RISK={tier} changed={len(files)} high_risk_files={len(hits)} spec_tier={spec_tier or 'none'}"
        + (f" e.g.={','.join(hits[:3])}" if hits else "")
    )


def cmd_decision(args):
    slug = args[0]
    fl = first_line(os.path.join(JOBS, slug, "decision.md"))
    m = re.match(r"^(APPROVE|ESCALATE)\b", fl or "")
    print(m.group(1) if m else "MISSING")


def cmd_note(args):
    slug, key, value = args[0], args[1], " ".join(args[2:])
    board = load()
    j = job(board, slug)
    j["notes"][key] = value
    j["updated"] = now()
    save(board)
    print(f"{slug} {key} set")


def cmd_get(args):
    board = load()
    print(job(board, args[0])["notes"].get(args[1], ""))


def cmd_status(_):
    board = load()
    if not board["jobs"]:
        print("no jobs")
        state = "empty" if os.path.exists(BOARD) else "missing"
        print(f"board={BOARD} state={state} checkout={ROOT}")
        if state == "missing":
            print("No board in this checkout. Check the orchestration worktree; status does not create or recover jobs.")
        return
    print(f"board={BOARD} jobs={len(board['jobs'])} checkout={ROOT}")
    for j in board["jobs"][-15:]:
        rv = " ".join(f"{k}:{v}" for k, v in j["reviews"].items()) or "-"
        print(f"{j['id']:<36} {j['stage']:<12} r{j['round']} risk={j.get('risk') or '-':<4} {rv}")


def backlog_items():
    if not os.path.exists(BACKLOG):
        return []
    with open(BACKLOG, encoding="utf-8") as f:
        return f.read().splitlines()


def cmd_next(_):
    for line in backlog_items():
        m = re.match(r"^\s*-\s*\[ \]\s+(.+)$", line)
        if m:
            print(m.group(1).strip())
            return
    print("EMPTY")


def cmd_check(args):
    slug = args[0]
    board = load()
    title = job(board, slug)["title"]
    lines = backlog_items()
    for i, line in enumerate(lines):
        m = re.match(r"^(\s*-\s*)\[ \](\s+)(.+)$", line)
        if m and m.group(3).strip() == title:
            lines[i] = f"{m.group(1)}[x]{m.group(2)}{m.group(3)}  <!-- {slug} -->"
            with open(BACKLOG, "w", encoding="utf-8") as f:
                f.write("\n".join(lines) + "\n")
            print(f"checked {slug}")
            return
    print("not in backlog")


COMMANDS = {
    "init": cmd_init,
    "stage": cmd_stage,
    "round": cmd_round,
    "collect": cmd_collect,
    "risk": cmd_risk,
    "decision": cmd_decision,
    "note": cmd_note,
    "get": cmd_get,
    "status": cmd_status,
    "next": cmd_next,
    "check": cmd_check,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    COMMANDS[sys.argv[1]](sys.argv[2:])
