#!/usr/bin/env sh
set -eu

LABEL="com.octopusgarage.english-pilot.feishu-daily-review"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
BASE_SERVICE_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
RUNTIME_HOME="${ENGLISH_PILOT_HOME:-$HOME/.english-pilot}"

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
TCB_COMMAND="$(command -v tcb 2>/dev/null || true)"
prepend_path_dir "${NODE_COMMAND%/*}"
prepend_path_dir "${NPM_COMMAND%/*}"
prepend_path_dir "${TCB_COMMAND%/*}"

if [ ! -f "$ROOT/scripts/feishu-daily-review-launchd-wrapper.sh" ]; then
  echo "Missing launchd wrapper: $ROOT/scripts/feishu-daily-review-launchd-wrapper.sh" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$RUNTIME_HOME/logs"
sed \
  -e "s#__PROJECT_DIR__#$ROOT#g" \
  -e "s#__HOME__/.english-pilot#$RUNTIME_HOME#g" \
  -e "s#__HOME__#$HOME#g" \
  -e "s#__SERVICE_PATH__#$SERVICE_PATH#g" \
  "$ROOT/scripts/english-pilot-feishu-daily-review.plist" > "$PLIST"

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
echo "Installed EnglishPilot Feishu daily review schedule: $PLIST"
