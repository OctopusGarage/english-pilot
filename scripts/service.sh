#!/usr/bin/env sh
set -eu

ACTION="${1:-status}"
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
LABEL="com.octopusgarage.english-pilot"

runtime_home() {
  printf '%s\n' "${ENGLISH_PILOT_HOME:-$HOME/.english-pilot}"
}

read_lock_pid() {
  lock_path="$(runtime_home)/run/.instance.lock"
  [ -f "$lock_path" ] || return 0
  sed -n 's/.*"pid"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$lock_path" | head -n 1
}

is_english_pilot_process() {
  pid="$1"
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  case "$command" in
    *english-pilot*) return 0 ;;
    *) return 1 ;;
  esac
}

wait_for_pid_exit() {
  pid="$1"
  attempts="${2:-10}"
  index=0
  while [ "$index" -lt "$attempts" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 1
    index=$((index + 1))
  done
  return 1
}

stop_existing_daemon_from_lock() {
  pid="$(read_lock_pid)"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  if ! is_english_pilot_process "$pid"; then
    echo "EnglishPilot lock pid $pid is not an EnglishPilot process; leaving it untouched." >&2
    return 0
  fi

  echo "Stopping existing EnglishPilot daemon pid $pid."
  kill -TERM "$pid" 2>/dev/null || true
  if wait_for_pid_exit "$pid" 10; then
    return 0
  fi

  echo "Existing EnglishPilot daemon pid $pid did not stop after 10s; sending SIGKILL." >&2
  kill -KILL "$pid" 2>/dev/null || true
  wait_for_pid_exit "$pid" 5 || true
}

case "$ACTION" in
  install)
    sh "$SCRIPT_DIR/install-service.sh"
    ;;
  install-dev)
    sh "$SCRIPT_DIR/install-service.sh" --dev
    ;;
  uninstall)
    sh "$SCRIPT_DIR/uninstall-service.sh"
    ;;
  status)
    if [ "$(uname -s)" = "Darwin" ]; then
      launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 && {
        echo "EnglishPilot launchd service is loaded."
        exit 0
      }
      echo "EnglishPilot launchd service is not loaded."
      exit 1
    fi
    systemctl --user status english-pilot
    ;;
  restart)
    if [ "$(uname -s)" = "Darwin" ]; then
      stop_existing_daemon_from_lock
      launchctl kickstart -k "gui/$(id -u)/$LABEL"
    else
      systemctl --user restart english-pilot
    fi
    ;;
  pause)
    if [ "$(uname -s)" = "Darwin" ]; then
      launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.octopusgarage.english-pilot.plist" 2>/dev/null || true
    else
      systemctl --user stop english-pilot
    fi
    ;;
  resume)
    if [ "$(uname -s)" = "Darwin" ]; then
      launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.octopusgarage.english-pilot.plist"
      launchctl kickstart "gui/$(id -u)/com.octopusgarage.english-pilot"
    else
      systemctl --user start english-pilot
    fi
    ;;
  logs)
    if [ "$(uname -s)" = "Darwin" ]; then
      mkdir -p "$HOME/.english-pilot/logs"
      tail -n 200 -f "$HOME/.english-pilot/logs/launchd.out.log" "$HOME/.english-pilot/logs/launchd.err.log"
    else
      journalctl --user -u english-pilot -f
    fi
    ;;
  *)
    echo "Usage: service.sh install|install-dev|uninstall|status|restart|pause|resume|logs" >&2
    exit 2
    ;;
esac
