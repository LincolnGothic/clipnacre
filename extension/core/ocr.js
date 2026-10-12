// SPDX-License-Identifier: GPL-3.0-or-later
import {MAX_OCR_TEXT_BYTES} from './export.js';

export const MAX_OCR_TSV_BYTES = 512 * 1024;
export const MAX_OCR_WORDS = 4096;
const HEADER = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

export function textFromWords(words) {
    let text = '', previous = null;
    for (const word of words) {
        if (previous) {
            if (previous.paragraph !== word.paragraph) text += '\n\n';
            else if (previous.line !== word.line) text += '\n';
            else if (!(CJK.test(previous.text.at(-1)) && CJK.test(word.text[0]))) text += ' ';
        }
        text += word.text;
        previous = word;
    }
    return text;
}

// TSV is untrusted subprocess output. Bound both its size and drawable geometry.
export function parseOcrTsv(tsv, width, height) {
    if (typeof tsv !== 'string' || new TextEncoder().encode(tsv).length > MAX_OCR_TSV_BYTES)
        throw new Error('OCR output limit reached');
    const rows = tsv.replace(/^\uFEFF/u, '').split(/\r?\n/u);
    if (rows.shift() !== HEADER) throw new Error('Invalid OCR output');
    const words = [];
    for (const row of rows) {
        if (!row) continue;
        const cells = row.split('\t');
        if (cells.length !== 12 || cells.slice(0, 11).some(cell => !cell.trim())) throw new Error('Invalid OCR row');
        const numbers = cells.slice(0, 11).map(Number);
        if (!numbers.every(Number.isFinite)) throw new Error('Invalid OCR geometry');
        if (numbers[0] !== 5) continue;
        const [level, page, block, paragraph, line, word, x, y, w, h, confidence] = numbers;
        if (![level, page, block, paragraph, line, word, x, y, w, h].every(Number.isSafeInteger) ||
            page !== 1 || block < 1 || paragraph < 1 || line < 1 || word < 1 ||
            x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > width || y + h > height ||
            confidence < 0 || confidence > 100)
            throw new Error('Invalid OCR word');
        const text = cells[11].replace(/[\u0000-\u001f\u007f]/gu, '').trim();
        if (!text) continue;
        if (words.length >= MAX_OCR_WORDS) throw new Error('OCR word limit reached');
        words.push({text, x, y, width: w, height: h, confidence,
            paragraph: `${page}:${block}:${paragraph}`, line: `${page}:${block}:${paragraph}:${line}`});
    }
    const text = textFromWords(words);
    if (new TextEncoder().encode(text).length > MAX_OCR_TEXT_BYTES) throw new Error('OCR text limit reached');
    return {text, words};
}

export function wordsInArea(words, start, end) {
    const left = Math.min(start[0], end[0]), right = Math.max(start[0], end[0]);
    const top = Math.min(start[1], end[1]), bottom = Math.max(start[1], end[1]);
    const click = right - left < 3 && bottom - top < 3;
    return words.filter(word => click
        ? left >= word.x && left <= word.x + word.width && top >= word.y && top <= word.y + word.height
        : word.x < right && word.x + word.width > left && word.y < bottom && word.y + word.height > top);
}
