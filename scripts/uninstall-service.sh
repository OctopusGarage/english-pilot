#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"

case "$(uname -s)" in
  Darwin)
    sh "$SCRIPT_DIR/uninstall-launchd.sh"
    ;;
  Linux)
    sh "$SCRIPT_DIR/uninstall-systemd.sh"
    ;;
  *)
    echo "Unsupported OS for EnglishPilot service uninstall: $(uname -s)" >&2
    exit 1
    ;;
esac
