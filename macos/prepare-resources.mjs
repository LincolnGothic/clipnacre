// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {kaomoji, symbols} from '../extension/core/catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(process.argv[2]);
mkdirSync(destination, {recursive: true});
const emoji = JSON.parse(readFileSync(join(root, 'extension/data/emoji.json'), 'utf8')).emoji;
assert.equal(emoji.length, 3944);
writeFileSync(join(destination, 'characters.json'), JSON.stringify({emoji, kaomoji, symbols}));
copyFileSync(join(root, 'LICENSE'), join(destination, 'LICENSE-GPL.txt'));
copyFileSync(join(root, 'vendor/unicode/LICENSE.txt'), join(destination, 'LICENSE-Unicode.txt'));

function parseCatalog(path) {
    const result = {};
    let id = '', value = '', field = '';
    const finish = () => { if (id && value) result[id] = value; };
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
        if (line.startsWith('msgid ')) { finish(); id = JSON.parse(line.slice(6)); value = ''; field = 'id'; }
        else if (line.startsWith('msgstr ')) { value = JSON.parse(line.slice(7)); field = 'value'; }
        else if (line.startsWith('"')) { if (field === 'id') id += JSON.parse(line); else if (field === 'value') value += JSON.parse(line); }
    }
    finish(); return result;
}

const extrasPath = join(root, 'macos/localization.json');
const extras = existsSync(extrasPath) ? JSON.parse(readFileSync(extrasPath, 'utf8')) : {};
for (const language of ['en', 'zh_CN', 'zh_TW', 'ja', 'es', 'fr', 'ko']) {
    const messages = language === 'en' ? {} : {...parseCatalog(join(root, `po/${language}.po`)), ...extras[language]};
    writeFileSync(join(destination, `messages-${language}.json`), JSON.stringify(messages));
    const locale = {zh_CN: 'zh', zh_TW: 'zh_Hant'}[language] ?? language;
    const path = join(root, `extension/data/emoji-locales/${locale}.json`);
    const annotations = language !== 'en' && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).annotations : {};
    writeFileSync(join(destination, `annotations-${language}.json`), JSON.stringify(annotations));
}
console.log(`PASS: ${emoji.length} emoji, ${kaomoji.length} kaomoji, ${symbols.length} symbols, seven local catalogs`);
