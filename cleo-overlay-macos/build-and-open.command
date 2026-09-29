#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
project_root=${script_dir:h}
app_path="$script_dir/.build/Cleo Overlay.app"
codex_path=$(command -v codex || true)
if [[ -z "$codex_path" ]]; then
  codex_path="$HOME/.local/bin/codex"
fi
mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources"
cp "$script_dir/Resources/analysis.schema.json" "$app_path/Contents/Resources/analysis.schema.json"

cat > "$app_path/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.thetrader.cleooverlay</string>
  <key>CFBundleName</key><string>Cleo Overlay</string>
  <key>CFBundleExecutable</key><string>CleoOverlay</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

python3 - "$project_root" "$codex_path" "$app_path/Contents/Resources/config.json" <<'PY'
import json, sys
from pathlib import Path
Path(sys.argv[3]).write_text(json.dumps({"projectRoot": sys.argv[1], "codexPath": sys.argv[2]}))
PY

swiftc -parse-as-library -O "$script_dir/Sources/main.swift" -o "$app_path/Contents/MacOS/CleoOverlay"
codesign --force --sign - --identifier com.thetrader.cleooverlay "$app_path"
open "$app_path"
echo "$app_path"
