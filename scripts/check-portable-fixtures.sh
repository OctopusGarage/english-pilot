#!/usr/bin/env sh
set -eu

PATTERN='(/Users/kingsonwu|~/programming|OctopusGarage/telegram-bridge|ActopusGarage|/tmp/english-pilot-smoke)'

if command -v rg >/dev/null 2>&1; then
  if rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    --glob '!coverage/**' \
    --glob '!reports/**' \
    --glob '!badges/**' \
    --glob '!.git/**' \
    --glob '!scripts/check-portable-fixtures.sh' \
    "$PATTERN" .; then
    echo "check-portable-fixtures: found local-machine-specific paths or personal fixture names" >&2
    exit 1
  fi
elif git grep -n -E "$PATTERN" -- \
  ':!node_modules/**' \
  ':!dist/**' \
  ':!coverage/**' \
  ':!reports/**' \
  ':!badges/**' \
  ':!scripts/check-portable-fixtures.sh'; then
  echo "check-portable-fixtures: found local-machine-specific paths or personal fixture names" >&2
  exit 1
fi
