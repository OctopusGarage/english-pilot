#!/usr/bin/env sh
set -eu

if ! command -v systemd-analyze >/dev/null 2>&1; then
  echo "systemd-analyze is not available; skipping systemd unit validation."
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
TMP="$(mktemp -d)"
TARGET="$TMP/english-pilot.service"

sed \
  -e "s#__NODE_BIN__#$(command -v node)#g" \
  -e "s#__CLI_JS__#$SCRIPT_DIR/../dist/src/bin/english-pilot.js#g" \
  -e "s#__HOME__#$HOME#g" \
  "$SCRIPT_DIR/english-pilot.service" > "$TARGET"

systemd-analyze verify "$TARGET"
echo "[verify-systemd-unit] OK: unit is valid"
rm -rf "$TMP"
