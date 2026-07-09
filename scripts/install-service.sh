#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
MODE="${1:-}"

case "$(uname -s)" in
  Darwin)
    sh "$SCRIPT_DIR/install-launchd.sh" "$MODE"
    ;;
  Linux)
    if [ "$MODE" = "--dev" ]; then
      echo "EnglishPilot dev service mode is currently implemented for launchd/macOS only." >&2
      exit 1
    fi
    sh "$SCRIPT_DIR/install-systemd.sh"
    ;;
  *)
    echo "Unsupported OS for EnglishPilot service install: $(uname -s)" >&2
    exit 1
    ;;
esac
