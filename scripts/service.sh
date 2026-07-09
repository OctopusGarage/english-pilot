#!/usr/bin/env sh
set -eu

ACTION="${1:-status}"
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"

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
      launchctl print "gui/$(id -u)/com.octopusgarage.english-pilot" >/dev/null 2>&1 && {
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
      launchctl kickstart -k "gui/$(id -u)/com.octopusgarage.english-pilot"
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
