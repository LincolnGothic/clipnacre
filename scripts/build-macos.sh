#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$task_root"
task_arch=${1:?Usage: scripts/build-macos.sh arm64|x86_64}
case "$task_arch" in arm64|x86_64) ;; *) exit 2;; esac
task_version=$(node -p "JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version")
swift test --package-path macos --arch "$task_arch"
swift build --package-path macos -c release --arch "$task_arch"
task_bin=$(swift build --package-path macos -c release --arch "$task_arch" --show-bin-path)
task_stage="$task_root/artifacts/macos-$task_arch"
task_app="$task_stage/ClipNacre.app"
mkdir -p "$task_app/Contents/MacOS" "$task_app/Contents/Resources"
install -m 755 "$task_bin/ClipNacre" "$task_app/Contents/MacOS/ClipNacre"
node macos/prepare-resources.mjs "$task_app/Contents/Resources"
python3 - "$task_app" "$task_version" <<'PY'
from pathlib import Path
import plistlib
import sys
app = Path(sys.argv[1])
version = sys.argv[2]
info = dict(CFBundleName='ClipNacre', CFBundleDisplayName='ClipNacre',
            CFBundleIdentifier='io.github.lincolngothic.clipnacre', CFBundleExecutable='ClipNacre',
            CFBundlePackageType='APPL', CFBundleShortVersionString=version, CFBundleVersion=version,
            LSMinimumSystemVersion='13.0', LSUIElement=True, NSHighResolutionCapable=True,
            NSPrincipalClass='NSApplication',
            NSScreenCaptureUsageDescription='Capture a screenshot you select for local editing and text recognition.')
with (app / 'Contents/Info.plist').open('wb') as stream:
    plistlib.dump(info, stream)
PY
codesign --force --deep --sign - --timestamp=none "$task_app"
codesign --verify --deep --strict --verbose=2 "$task_app"
test "$(lipo -archs "$task_app/Contents/MacOS/ClipNacre")" = "$task_arch"
"$task_app/Contents/MacOS/ClipNacre" --self-test --preview "$task_root/artifacts/clipnacre-macos-$task_arch.png"
task_prefix="$task_root/artifacts/clipnacre_${task_version}_macos_${task_arch}"
ditto -c -k --keepParent "$task_app" "${task_prefix}.zip"
mkdir -p "$task_stage/dmg"
ditto "$task_app" "$task_stage/dmg/ClipNacre.app"
ln -s /Applications "$task_stage/dmg/Applications"
hdiutil create -volname ClipNacre -srcfolder "$task_stage/dmg" -format UDZO "${task_prefix}.dmg"
hdiutil verify "${task_prefix}.dmg"
verify_packaged_app() {
    codesign --verify --deep --strict --verbose=2 "$1"
    test "$(lipo -archs "$1/Contents/MacOS/ClipNacre")" = "$task_arch"
    test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$1/Contents/Info.plist")" = "$task_version"
}
unzip -t -q "${task_prefix}.zip"
mkdir -p "$task_stage/zip-verify"
ditto -x -k "${task_prefix}.zip" "$task_stage/zip-verify"
verify_packaged_app "$task_stage/zip-verify/ClipNacre.app"
task_mount="$task_stage/dmg-verify"
mkdir -p "$task_mount"
hdiutil attach -readonly -nobrowse -mountpoint "$task_mount" "${task_prefix}.dmg"
trap 'hdiutil detach "$task_mount"' EXIT
verify_packaged_app "$task_mount/ClipNacre.app"
test "$(readlink "$task_mount/Applications")" = /Applications
hdiutil detach "$task_mount"
trap - EXIT
printf '%s\n' "PASS: native tests, app smoke/export/OCR, signature, $task_arch architecture, ZIP and DMG"
