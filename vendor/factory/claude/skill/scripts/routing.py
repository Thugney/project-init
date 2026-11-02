#!/usr/bin/env python3
"""Factory model routing and data class policy.

  routing.py resolve <role> <client>   Print the resolved tier/model as JSON
  routing.py check                     Refuse (exit 1) when a role would run on a client
                                       not approved for the project's data class
  routing.py status                    Print routing state per role as JSON
  routing.py record <slug> <role>      Record an interactive Claude subagent run in
                                       factory/jobs/<slug>/routing.json

Roles map to tiers (top, mid, fast) and tiers map to a model per client. A role
whose tier has no model for a client keeps today's behavior: agent frontmatter
for interactive Claude subagents, claude.model for headless Claude, codex.model
for Codex. The orchestrator role is advisory: it is shown, never enforced.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROLES = ["spec-writer", "builder", "code-reviewer", "security-reviewer", "ux-reviewer", "ui-reviewer", "approver"]
ADVISORY = "orchestrator"
TIERS = ["top", "mid", "fast"]
CLIENTS = ["claude", "codex"]
DATA_CLASSES = ["public", "internal", "personal", "restricted"]
DEFAULT_DATA_CLASS = "internal"
MODEL = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/@\[\]-]{0,127}")
# Roles that only exist as Claude agents; the builder runs on whichever workers are enabled.
CLAUDE_AGENT_ROLES = ["spec-writer", "code-reviewer", "security-reviewer", "ux-reviewer", "ui-reviewer", "approver"]


class PolicyError(Exception):
    pass


def git_root():
    out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
    return os.path.realpath(out or os.getcwd())


def config_path(root):
    return os.path.join(root, ".claude", "skills", "factory", "config.json")


def load_config(root):
    with open(config_path(root), encoding="utf-8") as f:
        return json.load(f)


def role_for_agent(name):
    """factory-code-reviewer -> code-reviewer; the builder agent is the builder role."""
    role = name[len("factory-"):] if name.startswith("factory-") else name
    return role if role in ROLES else None


def valid_model(value):
    return isinstance(value, str) and bool(MODEL.fullmatch(value))


def fallback_model(settings, client):
    """Today's model source for a headless client; None lets the client choose."""
    if client == "claude":
        model = (settings.get("claude") or {}).get("model") or settings.get("claude_model") or ""
    else:
        model = (settings.get("codex") or {}).get("model") or ""
    return model or None


def resolve(settings, role, client):
    if role != ADVISORY and role not in ROLES:
        raise PolicyError(f"unknown Factory role {role}")
    if client not in CLIENTS:
        raise PolicyError(f"unknown Factory client {client}")
    routing = settings.get("routing") or {}
    tier = (routing.get("roles") or {}).get(role)
    model = None
    if tier in TIERS:
        candidate = ((routing.get("tiers") or {}).get(tier) or {}).get(client) or ""
        if candidate:
            if not valid_model(candidate):
                raise PolicyError(f"invalid model identifier for tier {tier} client {client}")
            model = candidate
    else:
        tier = None
    return {
        "role": role, "client": client, "tier": tier, "model": model,
        "routing": "configured" if model else "not-configured",
        "advisory": role == ADVISORY,
    }


def invocation(settings, role, client):
    """Model passed on the command line: the routed model, else today's fallback."""
    resolved = resolve(settings, role, client)
    resolved["passedModel"] = resolved["model"] or fallback_model(settings, client)
    return resolved


def project_data_class(root):
    """Read the declared class; an unreadable or invalid project state refuses the job."""
    state_file = os.path.join(root, ".project-init", "project.json")
    try:
        with open(state_file, encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, ValueError) as error:
        raise PolicyError(f"cannot read Project Init state {state_file}: {error}")
    if not isinstance(state, dict):
        raise PolicyError(f"invalid Project Init state {state_file}")
    value = state.get("dataClass", DEFAULT_DATA_CLASS)
    if value not in DATA_CLASSES:
        raise PolicyError(f"invalid dataClass {value!r} in {state_file}")
    return value


def role_clients(settings):
    """Every (role, client) pair a job can run, including the advisory orchestrator."""
    workers = settings.get("workers") or {}
    pairs = [(role, "claude") for role in CLAUDE_AGENT_ROLES]
    for client in CLIENTS:
        if workers.get(client, True):
            pairs.append(("builder", client))
    orchestrator = settings.get("orchestrator") if settings.get("orchestrator") in CLIENTS else "claude"
    pairs.append((ADVISORY, orchestrator))
    return pairs


def approved_classes(settings, client):
    value = (settings.get(client) or {}).get("approvedDataClasses")
    # A client without a list is approved for nothing (fail closed).
    if not isinstance(value, list):
        return []
    return [item for item in value if item in DATA_CLASSES]


def data_class_problems(root, settings):
    data_class = project_data_class(root)
    problems = []
    for role, client in role_clients(settings):
        if data_class not in approved_classes(settings, client):
            problems.append({"role": role, "client": client})
    return data_class, problems


def refusal(data_class, problems):
    names = ", ".join(f"{p['role']} on {p['client']}" for p in problems)
    clients = sorted({p["client"] for p in problems})
    edits = "; ".join(f'add "{data_class}" to {c}.approvedDataClasses' for c in clients)
    return (f"data class {data_class} is not approved for: {names}. "
            f"To allow it, edit .claude/skills/factory/config.json: {edits}")


def check(root, settings):
    data_class, problems = data_class_problems(root, settings)
    if problems:
        raise PolicyError(refusal(data_class, problems))
    return data_class


def status(root, settings):
    roles = {}
    for role in [ADVISORY] + ROLES:
        entry = {"tier": resolve(settings, role, "claude")["tier"]}
        for client in CLIENTS:
            entry[client] = resolve(settings, role, client)["model"] or "not-configured"
        if role == ADVISORY:
            entry["advisory"] = True
        roles[role] = entry
    try:
        data_class, problems = data_class_problems(root, settings)
        error = None
    except PolicyError as exc:
        data_class, problems, error = None, [], str(exc)
    result = {"roles": roles, "dataClass": data_class, "unapproved": problems}
    if error:
        result["error"] = error
    return result


def now():
    return datetime.now(timezone.utc).isoformat()


def record(root, slug, entry):
    """Append one role run to the job's routing.json (atomic replace)."""
    directory = os.path.join(root, "factory", "jobs", slug)
    os.makedirs(directory, exist_ok=True)
    target = os.path.join(directory, "routing.json")
    current = {"schemaVersion": 1, "job": slug, "roles": []}
    if os.path.exists(target):
        try:
            with open(target, encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict) and isinstance(loaded.get("roles"), list):
                current = loaded
        except (OSError, ValueError):
            pass
    current["roles"].append(entry)
    fd, temporary = tempfile.mkstemp(prefix="routing.json.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
            f.write("\n")
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return target


def _events(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                if isinstance(event, dict):
                    yield event
    except OSError:
        return


def usage_from_claude(events):
    """Token usage from the stream-json `result` event, when Claude printed one."""
    usage = None
    for event in _events(events):
        if event.get("type") == "result" and isinstance(event.get("usage"), dict):
            usage = event["usage"]
    if not usage:
        return "not-reported"
    keys = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]
    picked = {k: usage[k] for k in keys if isinstance(usage.get(k), int)}
    return picked or "not-reported"


def usage_from_codex(events):
    """Summed token usage from `codex exec --json` turn.completed events."""
    keys = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"]
    total, seen = {k: 0 for k in keys}, False
    for event in _events(events):
        usage = event.get("usage")
        if event.get("type") == "turn.completed" and isinstance(usage, dict):
            for k in keys:
                if isinstance(usage.get(k), int):
                    total[k] += usage[k]
                    seen = True
    return total if seen else "not-reported"


def frontmatter_model(root, role):
    name = "factory-" + role + ".md"
    try:
        with open(os.path.join(root, ".claude", "agents", name), encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    match = re.search(r"^model:\s*(\S+)\s*$", text[:end if end != -1 else len(text)], re.M)
    return match.group(1) if match else None


def main(argv):
    if not argv or argv[0] not in ("resolve", "check", "status", "record"):
        print(__doc__)
        return 1
    root = git_root()
    try:
        settings = load_config(root)
    except (OSError, ValueError) as error:
        print(f"ROUTING ERROR cannot read Factory config: {error}")
        return 1
    try:
        if argv[0] == "resolve":
            if len(argv) != 3:
                print("ROUTING USAGE resolve <role> <client>")
                return 1
            print(json.dumps(invocation(settings, argv[1], argv[2])))
        elif argv[0] == "check":
            print(f"ROUTING OK dataClass={check(root, settings)}")
        elif argv[0] == "status":
            print(json.dumps(status(root, settings), indent=2))
        else:
            if len(argv) != 3 or not re.fullmatch(r"\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*", argv[1]):
                print("ROUTING USAGE record <slug> <role>")
                return 1
            role = argv[2]
            resolved = resolve(settings, role, "claude")
            entry = {"role": role, "client": "claude", "tier": resolved["tier"],
                     "model": frontmatter_model(root, role) or "not-configured",
                     "routing": resolved["routing"], "mode": "interactive-subagent",
                     "recordedAt": now(), "usage": "not-reported"}
            print(f"ROUTING RECORDED {record(root, argv[1], entry)}")
    except PolicyError as error:
        print(f"ROUTING REFUSED {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
