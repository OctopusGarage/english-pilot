#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
CLI_JS="$ROOT/dist/src/bin/english-pilot.js"

for bin in \
  "$HOME"/.nvm/versions/node/*/bin \
  "$HOME"/.local/share/fnm/node-versions/*/installation/bin \
  "$HOME"/.local/bin \
  /opt/homebrew/bin \
  /usr/local/bin; do
  if [ -x "$bin/node" ] || [ -x "$bin/tcb" ]; then
    PATH="$bin:$PATH"
  fi
done

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export ENGLISH_PILOT_HOME="${ENGLISH_PILOT_HOME:-$HOME/.english-pilot}"
NODE_BIN="$(command -v node)"

ENV_FILE="$ENGLISH_PILOT_HOME/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ ! -f "$CLI_JS" ]; then
  echo "feishu-daily-review-launchd-wrapper: missing $CLI_JS; run npm run build before installing the schedule" >&2
  exit 1
fi

cd "$ROOT"
exec "$NODE_BIN" "$CLI_JS" integrations deliver --target feishu --json
