// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const metadata = JSON.parse(readFileSync('extension/metadata.json', 'utf8'));
assert.equal(metadata.uuid, 'super-v-ubuntu@super-v-ubuntu.local');
assert.deepEqual(metadata['shell-version'], ['46', '48', '50']);
assert.equal(metadata['settings-schema'], 'org.gnome.shell.extensions.super-v-ubuntu');
assert.deepEqual(metadata['session-modes'], ['user']);
assert.equal(metadata['version-name'], '0.2.0');
assert.equal(metadata.version, 18);
assert.equal(metadata['gettext-domain'], 'super-v-ubuntu');
assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, metadata['version-name']);
for (const directory of ['extension', 'tests', 'scripts']) {
    const files = readdirSync(directory, {recursive: true})
        .filter(x => x.endsWith('.js')).map(x => `${directory}/${x}`);
    for (const file of files) {
        const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
    }
}
const result = spawnSync('glib-compile-schemas', ['--strict', '--dry-run', 'extension/schemas'],
    {encoding: 'utf8'});
assert.equal(result.status, 0, result.stderr || result.error?.message);
console.log('PASS: metadata, JavaScript syntax, GSettings schema');
