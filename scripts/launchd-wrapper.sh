#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="$(command -v node)"
CLI_JS="$ROOT/dist/src/bin/english-pilot.js"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export ENGLISH_PILOT_HOME="${ENGLISH_PILOT_HOME:-$HOME/.english-pilot}"

ENV_FILE="$ENGLISH_PILOT_HOME/env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ ! -f "$CLI_JS" ]; then
  echo "launchd-wrapper: missing $CLI_JS; run npm run build or use service install-dev" >&2
  exit 1
fi

cd "$ROOT"
exec "$NODE_BIN" "$CLI_JS" run
