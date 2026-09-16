#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "EnglishPilot Ghostty companion installation requires macOS." >&2
  exit 1
fi

if ! command -v swift >/dev/null 2>&1; then
  echo "Swift is required to build the EnglishPilot companion." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required to package the EnglishPilot companion runtime." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_PATH="$REPO_ROOT/macos/EnglishPilotCompanion"
SOURCE_ICON="$PACKAGE_PATH/Resources/EnglishPilotCompanion.icns"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
INSTALL_DIR="$HOME/Library/Application Support/EnglishPilot/EnglishPilotCompanion"
APP_BUNDLE="$HOME/Applications/EnglishPilotCompanion.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
APP_EXECUTABLE="$MACOS_DIR/EnglishPilotCompanion"
BUNDLED_CLI_DIR="$RESOURCES_DIR/dist"
BUNDLED_CLI_PATH="$BUNDLED_CLI_DIR/src/bin/english-pilot.js"
LAUNCHER_PATH="$INSTALL_DIR/run-english-pilot-companion.sh"
CODEX_BINARY_PATH="$(command -v codex || true)"

echo "Building EnglishPilot CLI..."
(cd "$REPO_ROOT" && pnpm run build)

echo "Building EnglishPilot macOS companion..."
swift build -c release --package-path "$PACKAGE_PATH"

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$INSTALL_DIR"
install -m 0755 "$PACKAGE_PATH/.build/release/EnglishPilotCompanion" "$APP_EXECUTABLE"
install -m 0644 "$SOURCE_ICON" "$RESOURCES_DIR/EnglishPilotCompanion.icns"
ditto "$REPO_ROOT/dist" "$BUNDLED_CLI_DIR"
install -m 0644 "$REPO_ROOT/package.json" "$RESOURCES_DIR/package.json"
install -m 0644 "$REPO_ROOT/pnpm-lock.yaml" "$RESOURCES_DIR/pnpm-lock.yaml"
printf '%s\n' "$CODEX_BINARY_PATH" >"$RESOURCES_DIR/codex-path.txt"
(cd "$RESOURCES_DIR" && pnpm install --prod --frozen-lockfile --ignore-scripts)
chmod 0755 "$BUNDLED_CLI_PATH"

cat >"$CONTENTS_DIR/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>EnglishPilotCompanion</string>
  <key>CFBundleIdentifier</key>
  <string>org.octopusgarage.EnglishPilotCompanion</string>
  <key>CFBundleIconFile</key>
  <string>EnglishPilotCompanion.icns</string>
  <key>CFBundleIconName</key>
  <string>EnglishPilotCompanion</string>
  <key>CFBundleIcons</key>
  <dict>
    <key>CFBundlePrimaryIcon</key>
    <dict>
      <key>CFBundleIconFiles</key>
      <array>
        <string>EnglishPilotCompanion</string>
      </array>
      <key>CFBundleIconName</key>
      <string>EnglishPilotCompanion</string>
    </dict>
  </dict>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>EnglishPilotCompanion</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSAppleEventsUsageDescription</key>
  <string>EnglishPilotCompanion uses system automation to copy selected text for translation.</string>
</dict>
</plist>
EOF

cat >"$LAUNCHER_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail

APP_BUNDLE="$APP_BUNDLE"
APP_EXECUTABLE="\$APP_BUNDLE/Contents/MacOS/EnglishPilotCompanion"

if [[ ! -x "\$APP_EXECUTABLE" ]]; then
  echo "EnglishPilot companion app is missing: \$APP_BUNDLE" >&2
  exit 1
fi

if [[ -n "\${ENGLISH_PILOT_BINARY:-}" || -n "\${ENGLISH_PILOT_TRANSLATE_AGENT:-}" || -n "\${ENGLISH_PILOT_SELECTION_FILE:-}" ]]; then
  exec "\$APP_EXECUTABLE"
fi

open -n "\$APP_BUNDLE"
EOF
chmod 0755 "$LAUNCHER_PATH"

touch "$APP_BUNDLE"
codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null
if [[ -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -f "$APP_BUNDLE" >/dev/null 2>&1 || true
fi

cat <<EOF
Installed EnglishPilot companion app:
  $APP_BUNDLE

App executable:
  $APP_EXECUTABLE

Bundled EnglishPilot CLI:
  $BUNDLED_CLI_PATH

Launcher:
  $LAUNCHER_PATH

Next steps:
  1. Start the companion:
       "$LAUNCHER_PATH"
  2. Grant Accessibility permission:
       System Settings -> Privacy & Security -> Accessibility
     Add or enable:
       $APP_BUNDLE
  3. In Ghostty, select English text and press Cmd+Shift+D.

Optional:
  ENGLISH_PILOT_TRANSLATE_AGENT=codex "$LAUNCHER_PATH"
  ENGLISH_PILOT_TRANSLATE_AGENT=claude "$LAUNCHER_PATH"

The companion also accepts ENGLISH_PILOT_SELECTION_FILE for future Ghostty
selection-file integration; clipboard capture remains the default fallback.
EOF
