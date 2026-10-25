#!/usr/bin/env python3
"""Factory state helper. The orchestrator is the ONLY caller and board.json's ONLY writer.

Every command prints one short line so the orchestrator's context stays small.

  board.py init <title> [--source idea|speckit:<dir>]   -> prints slug
  board.py stage <slug> <stage>                           spec|backend|frontend|review|fixing|decision|merged|needs-human|failed
  board.py round <slug>                                   start next review round, prints round dir
  board.py collect <slug>                                 read round verdicts -> one-line summary
  board.py risk <slug>                                    deterministic risk tier from the diff
  board.py decision <slug>                                read decision.md first line
  board.py note <slug> <key> <value>                      store a small fact (codex_session, pr_url, ...)
  board.py get <slug> <key>
  board.py status                                         compact table of all jobs
  board.py next                                           first unchecked backlog item
  board.py check <slug>                                   tick the backlog item that created this job
"""
import fnmatch
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or os.getcwd()
FACTORY = os.path.join(ROOT, "factory")
JOBS = os.path.join(FACTORY, "jobs")
BOARD = os.path.join(FACTORY, "board.json")
BACKLOG = os.path.join(FACTORY, "backlog.md")
CONFIG = os.path.join(ROOT, ".claude", "skills", "factory", "config.json")

STAGES = ["spec", "backend", "frontend", "review", "fixing", "decision", "merged", "needs-human", "failed"]


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_config():
    with open(CONFIG, encoding="utf-8") as f:
        return json.load(f)


def load():
    if not os.path.exists(BOARD):
        return {"updated": now(), "jobs": []}
    with open(BOARD, encoding="utf-8") as f:
        return json.load(f)


def save(board):
    board["updated"] = now()
    os.makedirs(FACTORY, exist_ok=True)
    tmp = BOARD + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(board, f, indent=2)
    os.replace(tmp, BOARD)


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
    title = args[0]
    source = "idea"
    if "--source" in args:
        source = args[args.index("--source") + 1]
    board = load()
    n = max([int(j["id"].split("-")[0]) for j in board["jobs"]] + [0]) + 1
    slug = f"{n:03d}-{slugify(title)}"
    cfg = load_config()
    os.makedirs(os.path.join(JOBS, slug), exist_ok=True)
    board["jobs"].append({
        "id": slug, "title": title, "source": source,
        "branch": cfg["branch_prefix"] + slug, "stage": "spec", "round": 0,
        "risk": None, "risk_files": [], "reviews": {}, "rounds": [],
        "backend_engine": cfg.get("backend_engine", "codex"),
        "notes": {}, "created": now(), "updated": now(),
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
    if cfg.get("skip_ui_reviewers_when_no_frontend") and j["notes"].get("has_frontend") == "false":
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
    missing, parts, fixes = [], [], {"BACKEND": 0, "FRONTEND": 0}
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
                t = re.match(r"^\s*-\s*\[(BACKEND|FRONTEND)\]", line)
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
    print(f"{state} round={j['round']} {' '.join(parts)} backend_fixes={fixes['BACKEND']} frontend_fixes={fixes['FRONTEND']}{extra}")


def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True, cwd=ROOT)


def match_any(path, globs):
    for g in globs:
        if fnmatch.fnmatch(path, g) or fnmatch.fnmatch("/" + path, "/" + g) or fnmatch.fnmatch(path, g.replace("**/", "")):
            return True
    return False


def cmd_risk(args):
    slug = args[0]
    board = load()
    j = job(board, slug)
    cfg = load_config()
    res = git("diff", "--name-only", f"{cfg['base_branch']}...{j['branch']}")
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
    print(f"RISK={tier} changed={len(files)} high_risk_files={len(hits)} spec_tier={spec_tier or 'none'}"
          + (f" e.g.={','.join(hits[:3])}" if hits else ""))


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
        return
    for j in board["jobs"][-15:]:
        rv = " ".join(f"{k}:{v}" for k, v in j["reviews"].items()) or "-"
        print(f"{j['id']:<36} {j['stage']:<12} r{j['round']} risk={j['risk'] or '-':<4} {rv}")


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
    "init": cmd_init, "stage": cmd_stage, "round": cmd_round, "collect": cmd_collect,
    "risk": cmd_risk, "decision": cmd_decision, "note": cmd_note, "get": cmd_get,
    "status": cmd_status, "next": cmd_next, "check": cmd_check,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    COMMANDS[sys.argv[1]](sys.argv[2:])
