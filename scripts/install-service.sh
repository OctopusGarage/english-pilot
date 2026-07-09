#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"

case "$(uname -s)" in
  Darwin)
    sh "$SCRIPT_DIR/install-launchd.sh"
    ;;
  Linux)
    sh "$SCRIPT_DIR/install-systemd.sh"
    ;;
  *)
    echo "Unsupported OS for EnglishPilot service install: $(uname -s)" >&2
    exit 1
    ;;
esac
