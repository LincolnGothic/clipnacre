// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadModule} from './helpers/load-module.js';
import {parseOcrTsv, textFromWords, wordsInArea, MAX_OCR_TSV_BYTES, MAX_OCR_WORDS} from '../extension/core/ocr.js';
const png = new Uint8Array(Buffer.from(JSON.parse(readFileSync('tests/fixtures/images.json')).png, 'base64'));
async function fixture(outputs, times = [0, 0, 10000000]) {
    const calls = [];
    const {OcrEngine} = await loadModule('extension/ocr.js', {
        'gi://GLib': {default: {find_program_in_path: () => '/usr/bin/tesseract', get_monotonic_time: () => times.shift()}},
        './process.js': {runProcess: async (argv, input, options) => {
            calls.push({argv, input, options}); return new TextEncoder().encode(outputs.shift());
        }},
    });
    return {engine: new OcrEngine(), calls};
}
test('empty automatic OCR retries a text block within the same deadline', async () => {
    const f = await fixture(['', '한국어']);
    const cancel = {};
    assert.equal(await f.engine.recognize(png, 'kor', ['kor', 'eng'], cancel), '한국어');
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].options.timeoutMs, 30000);
    assert.equal(f.calls[1].options.timeoutMs, 20000);
    assert.equal(f.calls[1].options.cancel, cancel);
    assert.ok(f.calls.every(call => call.argv.includes('kor+eng') && call.input === png));
});
test('recognition with text does not retry or launch an expired fallback', async () => {
    const f = await fixture(['Hello']);
    assert.equal(await f.engine.recognize(png, 'eng', ['eng'], null), 'Hello');
    assert.equal(f.calls.length, 1);
    const expired = await fixture([''], [0, 0, 30001000]);
    await assert.rejects(expired.engine.recognize(png, 'eng', ['eng'], null));
    assert.equal(expired.calls.length, 1);
});
test('only installed language IDs reach the OCR executable', async () => {
    const f = await fixture(['List of available languages (4):\neng\nosd\nchi_sim\n../../evil\n']);
    assert.deepEqual(Array.from(await f.engine.languages(null)), ['eng', 'chi_sim']);
    await assert.rejects(f.engine.recognize(png, '-l evil', ['-l evil'], null));
    assert.equal(f.calls.length, 1);
});

const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
const row = (text, {x = 1, y = 2, w = 12, h = 10, line = 1, paragraph = 1, word = 1} = {}) =>
    `5\t1\t1\t${paragraph}\t${line}\t${word}\t${x}\t${y}\t${w}\t${h}\t95.5\t${text}\n`;

test('TSV preserves reading order, paragraphs and multilingual text', () => {
    const result = parseOcrTsv(header + row('Hello') + row('world', {x: 20, word: 2}) +
        row('你好', {y: 20, line: 2}) + row('世界', {x: 20, y: 20, line: 2, word: 2}) +
        row('👩🏽‍🔬', {y: 35, paragraph: 2}), 64, 48);
    assert.equal(result.text, 'Hello world\n你好世界\n\n👩🏽‍🔬');
    assert.equal(result.words.length, 5);
    assert.equal(result.words[0].confidence, 95.5);
    assert.equal(textFromWords(result.words.slice(2, 4)), '你好世界');
});

test('click and reversed area selections return only intersected words in reading order', () => {
    const {words} = parseOcrTsv(header + row('Hello') + row('world', {x: 20, word: 2}) +
        row('second', {y: 25, line: 2}), 64, 48);
    assert.equal(textFromWords(wordsInArea(words, [21, 3], [21, 3])), 'world');
    assert.equal(textFromWords(wordsInArea(words, [35, 16], [0, 0])), 'Hello world');
    assert.equal(textFromWords(wordsInArea(words, [50, 40], [60, 45])), '');
    assert.equal(textFromWords(wordsInArea(words, [0, 0], [64, 48])), 'Hello world\nsecond');
});

test('TSV rejects malformed output, impossible geometry and oversized results', () => {
    for (const value of ['invalid', header + '5\t1\n', header + row('oops', {x: -1}),
        header + row('oops', {w: 100}), header + row('oops', {x: 1.5}),
        header + row('oops').replace('95.5', 'NaN'), header + row('oops').replace('95.5', '101'),
        header + row('a'.repeat(65537)), header + row('x').repeat(MAX_OCR_WORDS + 1),
        header + 'x'.repeat(MAX_OCR_TSV_BYTES)])
        assert.throws(() => parseOcrTsv(value, 64, 48));
    assert.deepEqual(parseOcrTsv(header, 64, 48), {text: '', words: []});
});

test('detailed recognition retries header-only TSV within one deadline and mixes installed English', async () => {
    const f = await fixture([header, header + row('你好')]);
    const result = await f.engine.recognizeDetailed(png, 'chi_sim', ['chi_sim', 'eng'], null);
    assert.equal(result.text, '你好');
    assert.equal(result.words.length, 1);
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(call => call.argv.at(-1) === 'tsv' && call.argv.includes('chi_sim+eng')));
    assert.equal(f.calls[1].options.timeoutMs, 20000);
    assert.equal(f.calls[0].options.outputLimit, MAX_OCR_TSV_BYTES);
    const empty = await fixture([header, header]);
    assert.equal((await empty.engine.recognizeDetailed(png, 'eng', ['eng'], null)).words.length, 0);
});
