#!/usr/bin/env sh
set -eu

systemctl --user disable --now english-pilot >/dev/null 2>&1 || true
rm -f "$HOME/.config/systemd/user/english-pilot.service"
systemctl --user daemon-reload
echo "Uninstalled EnglishPilot systemd user service."
