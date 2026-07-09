#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
CLI_JS="$ROOT/dist/src/bin/english-pilot.js"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export ENGLISH_PILOT_HOME="${ENGLISH_PILOT_HOME:-$HOME/.english-pilot}"

cd "$ROOT"
"$NPM_BIN" run build
exec "$NODE_BIN" "$CLI_JS" run
