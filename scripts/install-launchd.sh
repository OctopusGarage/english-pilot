#!/usr/bin/env sh
set -eu

LABEL="com.octopusgarage.english-pilot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
WRAPPER="launchd-wrapper.sh"
BASE_SERVICE_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

prepend_path_dir() {
  dir="$1"
  [ -n "$dir" ] || return 0
  case ":$SERVICE_PATH:" in
    *":$dir:"*) ;;
    *) SERVICE_PATH="$dir:$SERVICE_PATH" ;;
  esac
}

SERVICE_PATH="$BASE_SERVICE_PATH"
NODE_COMMAND="$(command -v node 2>/dev/null || true)"
NPM_COMMAND="$(command -v npm 2>/dev/null || true)"
prepend_path_dir "${NODE_COMMAND%/*}"
prepend_path_dir "${NPM_COMMAND%/*}"

if [ "${1:-}" = "--dev" ]; then
  WRAPPER="dev-launchd-wrapper.sh"
  echo "Installing EnglishPilot launchd service in dev mode from $ROOT"
fi

if [ ! -f "$ROOT/scripts/$WRAPPER" ]; then
  echo "Missing launchd wrapper: $ROOT/scripts/$WRAPPER" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.english-pilot/logs"
sed \
  -e "s#__PROJECT_DIR__#$ROOT#g" \
  -e "s#__WRAPPER__#$WRAPPER#g" \
  -e "s#__HOME__#$HOME#g" \
  -e "s#__SERVICE_PATH__#$SERVICE_PATH#g" \
  "$ROOT/scripts/english-pilot.plist" > "$PLIST"

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart "gui/$(id -u)/$LABEL"
echo "Installed EnglishPilot launchd service: $PLIST"
