#!/usr/bin/env sh
set -eu

LABEL="com.octopusgarage.english-pilot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
echo "Uninstalled EnglishPilot launchd service."
