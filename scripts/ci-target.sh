#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail
task_target=$1
task_arch=$2
test "$(dpkg --print-architecture)" = "$task_arch"
printf 'Native target: %s / %s / %s\n' "$task_target" "$task_arch" "$(uname -m)"
gnome-shell --version
tesseract --version
make package
task_version=$(node -p "JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version")
task_deb="../super-v-ubuntu_${task_version}_all.deb"
lintian --fail-on error,warning "$task_deb"
python3 scripts/audit-package.py "$task_deb"
python3 scripts/package-target.py "$task_deb" "$task_target"
lintian --fail-on error,warning "artifacts/clipnacre_${task_version}_${task_target}_all.deb"
if [ "$task_target" = ubuntu24.04 ] && [ "$task_arch" = amd64 ]; then
    cp "$task_deb" "artifacts/clipnacre_${task_version}_linux_all.deb"
fi
make translations
glib-compile-schemas --strict extension/schemas
./scripts/test-shell.sh | tee "shell-${task_target}-${task_arch}.log"
SUPER_V_TEST_LANGUAGES=en SUPER_V_TEST_PLACEMENT=1 SUPER_V_TEST_MONITOR=1280x720 \
    ./scripts/test-shell.sh | tee "shell-placement-${task_target}-${task_arch}.log"
