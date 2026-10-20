#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
from pathlib import Path
import subprocess
import sys
import tarfile
import io
import json

deb = Path(sys.argv[1])
archive = subprocess.check_output(['dpkg-deb', '--fsys-tarfile', str(deb)])
prefix = './usr/share/gnome-shell/extensions/super-v-ubuntu@super-v-ubuntu.local/'
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    files = {x.name: x for x in tar.getmembers() if x.isfile()}
    for relative in ['extension.js', 'prefs.js', 'metadata.json', 'stylesheet.css', 'shell-compat.js',
                     'core/history.js', 'core/catalog.js', 'core/placement.js', 'core/gif.js',
                     'editor.js', 'editor-render.js', 'editor-bridge.js', 'core/editor.js',
                     'pins.js', 'ocr.js', 'ocr-preview.js', 'core/ocr.js', 'process.js', 'core/frames.js', 'core/pins.js', 'core/export.js',
                     'gifs.js', 'images.js', 'clipboard-image.js', 'core/image.js', 'data/emoji.json', 'data/LICENSE.txt',
                     'schemas/org.gnome.shell.extensions.super-v-ubuntu.gschema.xml',
                     'schemas/gschemas.compiled']:
        assert prefix + relative in files, f'Missing {relative}'
    assert all(name.startswith('./usr/share/') for name in files), 'Unexpected installation path'
    assert not any('history.json' in name or 'node_modules' in name for name in files)
    metadata = json.load(tar.extractfile(prefix + 'metadata.json'))
    assert metadata['shell-version'] == ['46', '48', '50'], 'Incorrect Shell compatibility'
    assert metadata['version-name'] == '0.1.16' and metadata['version'] == 17
    assert metadata['gettext-domain'] == 'super-v-ubuntu'
    for locale in ['zh_CN', 'zh_TW', 'ja', 'es', 'fr', 'ko']:
        name = prefix + f'locale/{locale}/messages.json'
        assert name in files, f'Missing explicit-language messages for {locale}'
        messages = json.load(tar.extractfile(name))
        assert len(messages) >= 346 and messages['Language'] and messages['Follow system']
        assert messages['Screenshot'] and messages['Clear history on shutdown']
        assert messages['Pin to screen'] and messages['Copy text from image'] and messages['Numbered marker']
        assert messages['Screenshot editor'] and messages['Edit after taking a screenshot']
    for locale in ['zh', 'zh_CN', 'zh_SG', 'zh_TW', 'zh_HK', 'zh_MO', 'zh_Hans', 'zh_Hant',
                   'ja', 'es', 'fr', 'ko']:
        assert prefix + f'locale/{locale}/LC_MESSAGES/super-v-ubuntu.mo' in files, f'Missing {locale} gettext catalog'
    for locale in ['zh', 'zh_Hant', 'ja', 'es', 'fr', 'ko']:
        name = prefix + f'data/emoji-locales/{locale}.json'
        assert name in files, f'Missing emoji locale {locale}'
        data = json.load(tar.extractfile(name))
        assert data['locale'] == locale and len(data['annotations']) > 3800
    for entry in files.values():
        assert entry.uid == 0 and entry.gid == 0, 'Incorrect package ownership'
        assert not entry.mode & 0o022, 'Group/world writable file'
control = subprocess.check_output(['dpkg-deb', '-f', str(deb), 'Architecture', 'Version'], text=True)
assert 'all' in control and '0.1.16' in control
dependencies = subprocess.check_output(['dpkg-deb', '-f', str(deb), 'Depends'], text=True)
target = sys.argv[2] if len(sys.argv) > 2 else 'universal'
ranges = {'ubuntu24.04': ('46', '47'), 'debian13': ('48', '49'), 'ubuntu26.04': ('50', '51')}
if target == 'universal':
    for version, maximum in ranges.values():
        assert f'gnome-shell (>= {version}~)' in dependencies
        assert f'gnome-shell (<< {maximum}~)' in dependencies
else:
    version, maximum = ranges[target]
    assert f'gnome-shell (>= {version}~), gnome-shell (<< {maximum}~)' in dependencies
for name in ['tesseract-ocr', 'tesseract-ocr-eng']:
    assert name in dependencies
print('PASS: package files, translations, modes, architecture, version and target dependencies')
