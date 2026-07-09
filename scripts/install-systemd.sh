#!/usr/bin/env sh
set -eu

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
CLI_JS="$ROOT/dist/src/bin/english-pilot.js"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/english-pilot.service"

if [ ! -f "$CLI_JS" ]; then
  echo "Build EnglishPilot before installing the service: npm run build" >&2
  exit 1
fi

mkdir -p "$UNIT_DIR" "$HOME/.english-pilot/logs"
sed \
  -e "s#__NODE_BIN__#$NODE_BIN#g" \
  -e "s#__CLI_JS__#$CLI_JS#g" \
  -e "s#__HOME__#$HOME#g" \
  "$ROOT/scripts/english-pilot.service" > "$UNIT"

systemctl --user daemon-reload
systemctl --user enable --now english-pilot
loginctl enable-linger "$(id -un)" >/dev/null 2>&1 || true
echo "Installed EnglishPilot systemd user service: $UNIT"
