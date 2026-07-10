#!/usr/bin/env sh
set -eu

usage() {
  cat <<'EOF'
Usage:
  scripts/update-remote-install.sh <user@host> [version]

Examples:
  scripts/update-remote-install.sh ys-aquria@mac2015.local 0.1.1
  SSH_OPTS="-i $HOME/.ssh/id_rsa -o IdentitiesOnly=yes" scripts/update-remote-install.sh user@host latest

Updates a remote npm-installed EnglishPilot, restarts the managed service, and
prints lightweight health checks. Runtime data under ~/.english-pilot is kept.
EOF
}

REMOTE="${1:-}"
VERSION="${2:-latest}"
PACKAGE="@octopusgarage/english-pilot"

if [ -z "$REMOTE" ] || [ "$REMOTE" = "-h" ] || [ "$REMOTE" = "--help" ]; then
  usage
  exit 0
fi

case "$VERSION" in
  *[!A-Za-z0-9._@~-]*)
    echo "version contains unsupported characters: $VERSION" >&2
    exit 2
    ;;
esac

# shellcheck disable=SC2086
ssh ${SSH_OPTS:-} "$REMOTE" "ENGLISH_PILOT_PACKAGE='$PACKAGE' ENGLISH_PILOT_VERSION='$VERSION' sh -s" <<'REMOTE_SCRIPT'
set -eu

find_node_tools() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  for bin in \
    "$HOME"/.nvm/versions/node/*/bin \
    "$HOME"/.local/share/fnm/node-versions/*/installation/bin \
    /opt/homebrew/bin \
    /usr/local/bin; do
    if [ -x "$bin/node" ] && [ -x "$bin/npm" ]; then
      PATH="$bin:$PATH"
      export PATH
      return 0
    fi
  done

  echo "Cannot find node and npm on remote host." >&2
  exit 127
}

print_section() {
  printf '\n--- %s ---\n' "$1"
}

load_service_env() {
  if [ -f "$HOME/.english-pilot/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$HOME/.english-pilot/.env"
    set +a
  fi
}

find_node_tools

print_section "remote"
hostname
whoami
node -v
npm -v

print_section "before"
npm list -g --depth=0 2>/dev/null | grep -i '@octopusgarage/english-pilot' || true

print_section "install"
npm install -g "${ENGLISH_PILOT_PACKAGE}@${ENGLISH_PILOT_VERSION}"

print_section "after"
npm list -g --depth=0 2>/dev/null | grep -i '@octopusgarage/english-pilot' || true
node -e 'console.log(require("@octopusgarage/english-pilot/package.json").version)' 2>/dev/null ||
  english-pilot status --json 2>/dev/null | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1

print_section "service restart"
english-pilot service restart
sleep 3

print_section "service status"
english-pilot service status

print_section "process"
ps -axo user,pid,lstart,command | grep -i '@octopusgarage/english-pilot/dist/src/bin/english-pilot.js run' | grep -v grep || true

print_section "wechat doctor"
english-pilot wechat doctor --json 2>/dev/null | head -c 2000 || true
printf '\n'

print_section "voice preflight"
load_service_env
english-pilot voice preflight --provider local-whisper --json 2>/dev/null || true
REMOTE_SCRIPT
