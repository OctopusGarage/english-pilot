#!/usr/bin/env bash
# Install or update EnglishPilot from the latest GitHub Release.
set -euo pipefail

REPO="${ENGLISH_PILOT_REPO:-OctopusGarage/english-pilot}"
VERSION="${ENGLISH_PILOT_VERSION:-latest}"
INSTALL_DIR="${ENGLISH_PILOT_DIR:-$HOME/.english-pilot/app}"
STATE_DIR="${ENGLISH_PILOT_HOME:-$HOME/.english-pilot}"
BIN_DIR="${ENGLISH_PILOT_BIN_DIR:-$HOME/.local/bin}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/english-pilot-install.XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

latest_tag() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" |
    node -e 'let data="";process.stdin.on("data",c=>data+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(data).tag_name));'
}

download_release() {
  local tag="$1"
  local artifact="english-pilot-${tag}.tgz"
  local url="https://github.com/${REPO}/releases/download/${tag}/${artifact}"
  curl -fL "$url" -o "$TMP_DIR/$artifact"
  mkdir -p "$TMP_DIR/package"
  tar -xzf "$TMP_DIR/$artifact" -C "$TMP_DIR/package" --strip-components=1
}

copy_tree() {
  mkdir -p "$INSTALL_DIR"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude node_modules "$TMP_DIR/package/" "$INSTALL_DIR/"
  else
    rm -rf "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    cp -R "$TMP_DIR/package/." "$INSTALL_DIR/"
  fi
}

write_launcher() {
  mkdir -p "$BIN_DIR"
  cat >"$BIN_DIR/english-pilot" <<EOF
#!/usr/bin/env bash
export ENGLISH_PILOT_HOME="\${ENGLISH_PILOT_HOME:-$STATE_DIR}"
exec node --no-warnings "$INSTALL_DIR/dist/src/bin/english-pilot.js" "\$@"
EOF
  chmod +x "$BIN_DIR/english-pilot"
}

need curl
need tar
need node
need npm

if [ "$VERSION" = "latest" ]; then
  VERSION="$(latest_tag)"
fi

echo "Installing EnglishPilot $VERSION"
download_release "$VERSION"
copy_tree

cd "$INSTALL_DIR"
HUSKY=0 npm install --omit=dev --ignore-scripts

write_launcher
"$BIN_DIR/english-pilot" setup --yes

echo
echo "Installed: $BIN_DIR/english-pilot"
echo "Next:"
echo "  english-pilot wechat setup"
echo "  english-pilot service install"
echo
echo "If '$BIN_DIR' is not in PATH, add it before running english-pilot."
