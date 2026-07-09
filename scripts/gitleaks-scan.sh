#!/usr/bin/env bash
set -euo pipefail

mode="${1:-git}"
config="${GITLEAKS_CONFIG:-.gitleaks.toml}"

if ! command -v gitleaks >/dev/null 2>&1; then
  cat >&2 <<'EOF'
gitleaks is required for the secrets gate.

Install it with:
  brew install gitleaks

Or run the GitHub gitleaks workflow before merging.
EOF
  exit 127
fi

case "$mode" in
  git)
    exec gitleaks git . --config "$config" --redact --verbose
    ;;
  staged)
    exec gitleaks protect --staged --config "$config" --redact --verbose
    ;;
  *)
    echo "Usage: $0 git|staged" >&2
    exit 2
    ;;
esac
