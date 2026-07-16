#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-mac2015.sh [status|deploy]

Defaults:
  ENGLISH_PILOT_REMOTE=ys-aquria@mac2015.local

Environment overrides:
  SSH_OPTS                  Extra ssh/scp options
  ENGLISH_PILOT_REMOTE      SSH target
  ENGLISH_PILOT_REMOTE_TMP  Remote tarball path
EOF
}

mode="${1:-status}"
case "$mode" in
  status|deploy) ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo "Unsupported mode: $mode" >&2
    usage >&2
    exit 2
    ;;
esac

remote="${ENGLISH_PILOT_REMOTE:-ys-aquria@mac2015.local}"
remote_artifact="${ENGLISH_PILOT_REMOTE_TMP:-/tmp/english-pilot-deploy-$$.tgz}"
local_tmp=""

quote() {
  printf '%q' "$1"
}

cleanup() {
  [ -z "$local_tmp" ] || rm -rf "$local_tmp"
}
trap cleanup EXIT

if [ "$mode" = "deploy" ]; then
  repo_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
  local_tmp="$(mktemp -d)"
  cd "$repo_root"

  npm run build
  artifact_name="$(npm pack --pack-destination "$local_tmp" --silent | tail -n 1)"
  local_artifact="$local_tmp/$artifact_name"
  [ -f "$local_artifact" ] || {
    echo "npm pack did not create the expected artifact: $local_artifact" >&2
    exit 1
  }

  echo "local_package=$(node -p 'require("./package.json").name + "@" + require("./package.json").version')"
  echo "local_artifact=$artifact_name"
  # shellcheck disable=SC2086
  scp ${SSH_OPTS:-} "$local_artifact" "$remote:$remote_artifact"
fi

# shellcheck disable=SC2086,SC2029
ssh ${SSH_OPTS:-} "$remote" \
  "EP_MODE=$(quote "$mode") EP_ARTIFACT=$(quote "$remote_artifact") sh -s" <<'REMOTE_SCRIPT'
set -eu

PACKAGE="@octopusgarage/english-pilot"
LABEL="com.octopusgarage.english-pilot"
LOCK_PATH="$HOME/.english-pilot/run/.instance.lock"
DETACHED_LOG_PATH="$HOME/.english-pilot/logs/manual-daemon.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

cleanup_remote() {
  if [ "$EP_MODE" = "deploy" ]; then
    rm -f "$EP_ARTIFACT"
  fi
}
trap cleanup_remote EXIT

print_section() {
  printf '\n--- %s ---\n' "$1"
}

find_node_tools() {
  service_node=""
  if [ -f "$PLIST" ] && [ -x /usr/libexec/PlistBuddy ]; then
    service_node="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' "$PLIST" 2>/dev/null || true)"
  fi

  if [ -n "$service_node" ] && [ -x "$service_node" ]; then
    PATH="$(dirname "$service_node"):$PATH"
    export PATH
  fi

  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  for bin in "$HOME"/.nvm/versions/node/*/bin "$HOME"/.local/share/fnm/node-versions/*/installation/bin /opt/homebrew/bin /usr/local/bin; do
    if [ -x "$bin/node" ] && [ -x "$bin/npm" ]; then
      PATH="$bin:$PATH"
      export PATH
      return 0
    fi
  done

  echo "Cannot find node and npm on remote host." >&2
  exit 127
}

load_service_env() {
  if [ -f "$HOME/.english-pilot/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$HOME/.english-pilot/.env"
    set +a
  fi
}

installed_version() {
  root="$(npm root -g)"
  node -e 'const fs=require("node:fs"); const p=process.argv[1]; try { console.log(JSON.parse(fs.readFileSync(p,"utf8")).version); } catch { console.log("not-installed"); }' "$root/$PACKAGE/package.json"
}

read_lock_pid() {
  [ -f "$LOCK_PATH" ] || return 0
  sed -n 's/.*"pid"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$LOCK_PATH" | head -n 1
}

live_daemon_pid() {
  pid="$(read_lock_pid)"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  case "$command_line" in
    *english-pilot*) printf '%s\n' "$pid" ;;
  esac
}

wait_for_stop() {
  deadline=$((SECONDS + 20))
  while [ "$SECONDS" -lt "$deadline" ]; do
    kill -0 "$1" 2>/dev/null || return 0
    sleep 1
  done
  return 1
}

stop_daemon() {
  pid="$(live_daemon_pid)"
  if [ -z "$pid" ]; then
    echo "stopped_pid=none"
    return 0
  fi
  kill -TERM "$pid"
  if ! wait_for_stop "$pid"; then
    kill -KILL "$pid" 2>/dev/null || true
    wait_for_stop "$pid" || true
  fi
  echo "stopped_pid=$pid"
}

gui_service_available() {
  launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1
}

wait_for_daemon() {
  deadline=$((SECONDS + 90))
  while [ "$SECONDS" -lt "$deadline" ]; do
    pid="$(live_daemon_pid)"
    if [ -n "$pid" ]; then
      printf '%s\n' "$pid"
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for the EnglishPilot daemon." >&2
  tail -n 80 "$DETACHED_LOG_PATH" >&2 2>/dev/null || true
  return 1
}

print_diagnostics() {
  print_section runtime
  pid="$(live_daemon_pid)"
  echo "daemon_pid=${pid:-none}"
  if gui_service_available; then
    echo "launchd_service=available"
  else
    echo "launchd_service=unavailable"
  fi
  english-pilot status --json 2>/dev/null | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      try {
        const value = JSON.parse(input);
        console.log(`status_name=${value.name || "unknown"}`);
        console.log(`status_version=${value.version || "unknown"}`);
      } catch {
        console.log("status_summary=unavailable");
      }
    });
  ' || true

  print_section wechat-doctor
  english-pilot wechat doctor --json 2>/dev/null | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      try {
        const value = JSON.parse(input);
        const config = value.config || {};
        console.log(`wechat_ok=${value.ok === true}`);
        console.log(`wechat_missing=${Array.isArray(value.missing) ? value.missing.join(",") : "unknown"}`);
        console.log(`wechat_accounts=${Array.isArray(config.accounts) ? config.accounts.length : 0}`);
      } catch {
        console.log("wechat_summary=unavailable");
      }
    });
  ' || true

  print_section voice-preflight
  load_service_env
  english-pilot voice preflight --provider local-whisper --json 2>/dev/null | head -c 3000 || true
  printf '\n'
}

find_node_tools

print_section remote
echo "remote_host=$(hostname)"
echo "remote_user=$(whoami)"
echo "node_version=$(node -v)"
echo "npm_version=$(npm -v)"

print_section installed
echo "installed_version=$(installed_version)"
echo "cli_path=$(command -v english-pilot || echo missing)"

if [ "$EP_MODE" = "status" ]; then
  print_diagnostics
  exit 0
fi

[ -f "$EP_ARTIFACT" ] || {
  echo "Remote artifact is missing: $EP_ARTIFACT" >&2
  exit 1
}

before_version="$(installed_version)"
print_section install
npm install -g "$EP_ARTIFACT"
after_version="$(installed_version)"
echo "version_before=$before_version"
echo "version_after=$after_version"

print_section restart
stop_daemon
if gui_service_available; then
  deployment_mode="launchd"
  english-pilot service restart
else
  deployment_mode="detached"
  mkdir -p "$(dirname "$DETACHED_LOG_PATH")"
  load_service_env
  nohup english-pilot run </dev/null >>"$DETACHED_LOG_PATH" 2>&1 &
fi

verified_pid="$(wait_for_daemon)"
echo "deployment_mode=$deployment_mode"
echo "verified_pid=$verified_pid"
if [ "$deployment_mode" = "detached" ]; then
  echo "detached_log_path=$DETACHED_LOG_PATH"
  echo "Warning: detached lifecycle has no reboot or crash auto-restart."
fi

print_diagnostics
REMOTE_SCRIPT
