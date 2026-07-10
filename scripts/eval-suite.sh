#!/usr/bin/env sh
set -eu

BACKEND="both"
REAL_AGENT="0"

usage() {
  cat <<'EOF'
Usage:
  scripts/eval-suite.sh [--backend claude|codex|both] [--real-agent]

Runs the deterministic smoke eval plus AI-agent evals.
By default, agent evals are dry-runs and do not invoke real Claude/Codex.
Use --real-agent only on a machine with the selected local agent logged in.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --backend)
      BACKEND="${2:-}"
      shift 2
      ;;
    --real-agent)
      REAL_AGENT="1"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$BACKEND" in
  claude | codex | both) ;;
  *)
    echo "--backend must be one of: claude, codex, both" >&2
    exit 1
    ;;
esac

EVAL_HOME=""
cleanup() {
  if [ -n "$EVAL_HOME" ]; then
    rm -rf "$EVAL_HOME"
  fi
}
trap cleanup EXIT

if [ "$REAL_AGENT" != "1" ]; then
  EVAL_HOME="$(mktemp -d "${TMPDIR:-/tmp}/english-pilot-eval-suite.XXXXXX")"
  export ENGLISH_PILOT_HOME="$EVAL_HOME"
fi

run_agent_eval() {
  backend="$1"
  for case_id in channel-weather history-lesson; do
    if [ "$REAL_AGENT" = "1" ]; then
      node dist/src/bin/english-pilot.js eval agent --backend "$backend" --case "$case_id" --json
    else
      node dist/src/bin/english-pilot.js eval agent --backend "$backend" --case "$case_id" --cwd . --dry-run --json
    fi
  done
}

npm run build
node dist/src/bin/english-pilot.js eval smoke --json
node scripts/smoke-mcp-stdio.mjs

case "$BACKEND" in
  claude)
    run_agent_eval claude
    ;;
  codex)
    run_agent_eval codex
    ;;
  both)
    run_agent_eval claude
    run_agent_eval codex
    ;;
esac
