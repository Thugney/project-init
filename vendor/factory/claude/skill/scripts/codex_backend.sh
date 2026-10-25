#!/usr/bin/env bash
# Codex bridge: runs Codex CLI headless for the [BACKEND] part of a factory job.
#
#   codex_backend.sh build <slug>            implement all [BACKEND] tasks in the spec
#   codex_backend.sh fix   <slug> <round>    fix [BACKEND] findings from that review round
#
# All Codex output goes to files under factory/jobs/<slug>/codex/. This script prints
# exactly ONE status line, so the calling Claude session spends ~50 tokens, not thousands.
#
# Exit codes: 0 done | 2 codex not installed | 3 codex failed/timeout | 4 codex reported BLOCKED
#             5 wrong branch | 6 bad usage
set -uo pipefail

MODE="${1:-}"; SLUG="${2:-}"; ROUND="${3:-0}"
[[ -z "$MODE" || -z "$SLUG" ]] && { echo "CODEX USAGE build|fix <slug> [round]"; exit 6; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "CODEX ERROR not a git repo"; exit 6; }
cd "$ROOT" || exit 6
CFG=".claude/skills/factory/config.json"
JOB="factory/jobs/$SLUG"
[[ -f "$JOB/spec.md" ]] || { echo "CODEX ERROR missing $JOB/spec.md"; exit 6; }

cfg() { python3 -c "import json,sys;c=json.load(open('$CFG'));v=c$1;print(' '.join(v) if isinstance(v,list) else v)"; }
BRANCH="$(cfg "['branch_prefix']")$SLUG"
BASE="$(cfg "['base_branch']")"
MODEL="$(cfg "['codex']['model']")"
ARGS="$(cfg "['codex']['args']")"
TIMEOUT_MIN="$(cfg "['codex']['timeout_minutes']")"
TEST_CMD="$(cfg "['test_command']")"

command -v codex >/dev/null 2>&1 || { echo "CODEX MISSING codex CLI not on PATH -> use Claude fallback"; exit 2; }

CUR="$(git rev-parse --abbrev-ref HEAD)"
[[ "$CUR" == "$BRANCH" ]] || { echo "CODEX ERROR on branch $CUR, expected $BRANCH"; exit 5; }

TAG="build"; [[ "$MODE" == "fix" ]] && TAG="fix-r$ROUND"
OUT="$JOB/codex/$TAG"
mkdir -p "$OUT"

CONSTITUTION=""
[[ -f ".specify/memory/constitution.md" ]] && CONSTITUTION="Obey the project constitution in .specify/memory/constitution.md."
TESTS="Run the backend tests that cover your change."
[[ -n "$TEST_CMD" ]] && TESTS="Run the backend tests with: $TEST_CMD"

RULES="Rules:
- The 'API Contract' section of $JOB/spec.md is binding. Match every route, method, request/response JSON field, type and status code exactly. Never change the contract. If it is wrong or impossible, stop and report CONTRACT_ISSUE.
- Touch only backend code (server, API routes, DB schema/migrations, auth, webhooks, jobs, backend tests). Do not edit frontend/UI files.
- Never hard-code secrets; read them from environment/config. Validate all input. Enforce auth/permission checks on every new route.
- $CONSTITUTION
- $TESTS
- Do not run git commit, push, merge or checkout. Do not edit anything under factory/ except $OUT/report.md.
- Write a short report to $OUT/report.md: tasks done (IDs), files changed, tests run and result, contract issues.
- Your FINAL message must start with exactly one of: 'BACKEND: DONE' or 'BACKEND: BLOCKED <one-line reason>'. Then at most 10 short bullet lines."

if [[ "$MODE" == "build" ]]; then
  PROMPT="You are the backend engine for software-factory job '$SLUG'. If you have a backend skill for this kind of work, use it.
Read $JOB/spec.md. Implement ALL tasks tagged [BACKEND] and nothing tagged [FRONTEND]. Mark each finished [BACKEND] task as [X] in $JOB/spec.md (only the checkbox).
$RULES"
elif [[ "$MODE" == "fix" ]]; then
  RDIR="$JOB/round-$ROUND"
  [[ -d "$RDIR" ]] || { echo "CODEX ERROR missing $RDIR"; exit 6; }
  PROMPT="You are the backend engine for software-factory job '$SLUG'. Reviewers requested changes.
Read the review files in $RDIR/ (review-*.md). Fix ONLY findings on lines tagged [BACKEND]. Ignore [FRONTEND] findings. Re-read $JOB/spec.md for the contract.
$RULES"
else
  echo "CODEX USAGE build|fix <slug> [round]"; exit 6
fi

CMD=(codex exec)
[[ -n "$MODEL" ]] && CMD+=(-m "$MODEL")
# shellcheck disable=SC2206
[[ -n "$ARGS" ]] && CMD+=($ARGS)
CMD+=(--cd "$ROOT" --json -o "$OUT/last-message.md")

# Resume the same Codex session on fix rounds so it keeps its own context (cheaper, smarter).
SESSION_FILE="$JOB/codex/session-id"
if [[ "$MODE" == "fix" && -s "$SESSION_FILE" ]]; then
  CMD+=(resume "$(cat "$SESSION_FILE")" "$PROMPT")
else
  CMD+=("$PROMPT")
fi

START=$(date +%s)
if command -v timeout >/dev/null 2>&1; then
  timeout "$((TIMEOUT_MIN * 60))" "${CMD[@]}" >"$OUT/events.jsonl" 2>"$OUT/stderr.log" </dev/null
else
  "${CMD[@]}" >"$OUT/events.jsonl" 2>"$OUT/stderr.log" </dev/null
fi
RC=$?
SECS=$(( $(date +%s) - START ))

# Save session id for later resume (field name differs between Codex versions).
SID="$(grep -oE '"(thread_id|session_id|conversation_id)"[[:space:]]*:[[:space:]]*"[^"]+"' "$OUT/events.jsonl" 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)"$/\1/')"
[[ -n "$SID" ]] && echo "$SID" > "$SESSION_FILE"

if [[ $RC -ne 0 ]]; then
  [[ $RC -eq 124 ]] && REASON="timeout after ${TIMEOUT_MIN}m" || REASON="exit $RC: $(tail -c 300 "$OUT/stderr.log" | tr '\n' ' ' | cut -c1-160)"
  echo "CODEX FAILED $TAG $REASON logs=$OUT"
  exit 3
fi

HEAD_LINE="$(grep -m1 -v '^[[:space:]]*$' "$OUT/last-message.md" 2>/dev/null || true)"

# Commit outside the Codex sandbox, so Codex never needs write access to .git.
CHANGED=$(git status --porcelain -- . ':(exclude)factory/' | wc -l | tr -d ' ')
COMMIT="none"
if [[ "$CHANGED" -gt 0 ]]; then
  git add -A -- . ':(exclude)factory/' >/dev/null
  git commit -q -m "factory($SLUG): backend $TAG via codex" && COMMIT="$(git rev-parse --short HEAD)"
fi
DIFFSTAT="$(git diff --shortstat "$BASE...HEAD" | sed 's/^ //')"

if [[ "$HEAD_LINE" == BACKEND:\ BLOCKED* ]]; then
  echo "CODEX BLOCKED $TAG ${HEAD_LINE#BACKEND: BLOCKED } commit=$COMMIT report=$OUT/report.md"
  exit 4
fi
echo "CODEX DONE $TAG ${SECS}s files_changed=$CHANGED commit=$COMMIT branch_total='${DIFFSTAT:-no diff}' report=$OUT/report.md"
exit 0
