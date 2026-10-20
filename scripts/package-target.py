#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Restrict an architecture-independent installer to one tested GNOME target."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile

source = Path(sys.argv[1]).resolve()
target = sys.argv[2]
ranges = {'ubuntu24.04': (46, 47), 'debian13': (48, 49), 'ubuntu26.04': (50, 51)}
minimum, maximum = ranges[target]
version = subprocess.check_output(['dpkg-deb', '-f', str(source), 'Version'], text=True).strip()
assert subprocess.check_output(['dpkg-deb', '-f', str(source), 'Architecture'], text=True).strip() == 'all'
destination = Path('artifacts') / f'clipnacre_{version}_{target}_all.deb'
destination.parent.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='super-v-package-') as temporary:
    root = Path(temporary) / 'package'
    subprocess.run(['dpkg-deb', '-R', str(source), str(root)], check=True)
    control = root / 'DEBIAN/control'
    text = control.read_text()
    match = re.search(r'^Depends: (.+)$', text, re.M)
    dependencies = [part.strip() for part in match[1].split(',') if 'gnome-shell' not in part]
    dependencies += [f'gnome-shell (>= {minimum}~)', f'gnome-shell (<< {maximum}~)']
    text = text[:match.start()] + 'Depends: ' + ', '.join(dependencies) + text[match.end():]
    control.write_text(text)
    subprocess.run(['dpkg-deb', '--root-owner-group', '-Zxz', '-z6', '--build', str(root), str(destination)], check=True)
subprocess.run([sys.executable, 'scripts/audit-package.py', str(destination), target], check=True)
print(destination)
