#!/usr/bin/env sh
set -eu

LABEL="com.octopusgarage.english-pilot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
CLI_JS="$ROOT/dist/src/bin/english-pilot.js"

if [ ! -f "$CLI_JS" ]; then
  echo "Build EnglishPilot before installing the service: npm run build" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.english-pilot/logs"
sed \
  -e "s#__NODE_BIN__#$NODE_BIN#g" \
  -e "s#__CLI_JS__#$CLI_JS#g" \
  -e "s#__HOME__#$HOME#g" \
  "$ROOT/scripts/english-pilot.plist" > "$PLIST"

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart "gui/$(id -u)/$LABEL"
echo "Installed EnglishPilot launchd service: $PLIST"
