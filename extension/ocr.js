// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import {imageInfo} from './core/image.js';
import {MAX_OCR_TEXT_BYTES, ocrLanguageArgs} from './core/export.js';
import {runProcess} from './process.js';
import {parseOcrTsv, MAX_OCR_TSV_BYTES} from './core/ocr.js';

export class OcrEngine {
    constructor() { this.program = GLib.find_program_in_path('tesseract'); }
    async languages(cancel) {
        if (!this.program) throw new Error('OCR unavailable');
        const bytes = await runProcess([this.program, '--list-langs'], null, {cancel, outputLimit: 4096, timeoutMs: 5000});
        return new TextDecoder('utf-8', {fatal: true}).decode(bytes).split(/\r?\n/u)
            .filter(line => /^[a-zA-Z0-9_]{1,32}$/u.test(line) && line !== 'osd').slice(0, 100);
    }
    async recognize(bytes, language, installed, cancel) {
        return this._recognize(bytes, language, installed, cancel, false);
    }
    async recognizeDetailed(bytes, language, installed, cancel) {
        return this._recognize(bytes, language, installed, cancel, true);
    }
    async _recognize(bytes, language, installed, cancel, detailed) {
        if (!this.program) throw new Error('OCR unavailable');
        const {width, height} = imageInfo(bytes, 'image/png');
        const selected = ocrLanguageArgs(language, installed);
        const deadline = GLib.get_monotonic_time() + 30000000;
        for (const layout of ['3', '6']) {
            const remaining = Math.floor((deadline - GLib.get_monotonic_time()) / 1000);
            if (remaining <= 0) throw new Error('OCR deadline reached');
            const argv = [this.program, 'stdin', 'stdout', '-l', selected, '--psm', layout];
            if (detailed) argv.push('tsv');
            const output = await runProcess(argv, bytes,
                {cancel, outputLimit: detailed ? MAX_OCR_TSV_BYTES : MAX_OCR_TEXT_BYTES, timeoutMs: remaining});
            const text = new TextDecoder('utf-8', {fatal: true}).decode(output);
            // Retain the empty trailing text column in header-only TSV output.
            const result = detailed ? parseOcrTsv(text, width, height) : text.replace(/\0/gu, '').trim();
            if (detailed ? result.text : result) return result;
            // Automatic page segmentation can overlook a short text block.
            // Retry that layout within the original total time budget.
        }
        return detailed ? {text: '', words: []} : '';
    }
}
