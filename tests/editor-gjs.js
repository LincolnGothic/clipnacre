// SPDX-License-Identifier: GPL-3.0-or-later
// Runs only in the disposable Wayland test session.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gdk from 'gi://Gdk?version=4.0';
import Cairo from 'cairo';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import {runProcess} from '../extension/process.js';
import {EditorDocument} from '../extension/core/editor.js';
import {LineFrames} from '../extension/core/frames.js';
import System from 'system';
import {ImageEditor} from '../extension/editor.js';
import {decodeImage, exportPng} from '../extension/editor-render.js';
import {gettext as _} from '../extension/translations.js';
Adw.init();
const base = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const fixtures = JSON.parse(new TextDecoder().decode(base.get_child('tests').get_child('fixtures')
    .get_child('images.json').load_contents(null)[1]));
let checks = 0;
function check(condition, message) {
    if (!condition)
        throw new Error(message);
    checks++;
}
function pixel(pixbuf, x, y) {
    const bytes = pixbuf.get_pixels();
    const offset = y * pixbuf.rowstride + x * pixbuf.n_channels;
    return [...bytes.slice(offset, offset + 3)];
}
function ocrSample(text, language) {
    // Keep OCR fixture pixels independent of the interface locale's fallback font.
    const families = {chi_sim: 'SC', chi_tra: 'TC', jpn: 'JP', kor: 'KR', spa: 'JP', fra: 'JP'};
    const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 640, 140);
    const cr = new Cairo.Context(surface);
    try {
        cr.setSourceRGB(1, 1, 1); cr.paint(); cr.setSourceRGB(0, 0, 0);
        const layout = PangoCairo.create_layout(cr);
        const locales = {chi_sim: 'zh-CN', chi_tra: 'zh-TW', jpn: 'ja', kor: 'ko', spa: 'es', fra: 'fr'};
        layout.get_context().set_language(Pango.Language.from_string(locales[language]));
        const font = Pango.FontDescription.from_string(`Noto Sans CJK ${families[language]}`);
        font.set_absolute_size(48 * Pango.SCALE); layout.set_font_description(font);
        layout.set_text(text, -1); cr.moveTo(20, 60); PangoCairo.show_layout(cr, layout);
        return Gdk.pixbuf_get_from_surface(surface, 0, 0, 640, 140).save_to_bufferv('png', [], [])[1];
    } finally { cr.$dispose(); surface.finish(); }
}
const loop = new GLib.MainLoop(null, false);
let status = 0;
const editor = new ImageEditor(GLib.base64_decode(fixtures.png), 'image/png', null, bytes => {
    const output = decodeImage(bytes, 'image/png');
    check(output.width === 40 && output.height === 30, 'Copy did not export the crop');
});
editor.window.present();
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
    (async () => {
        editor.setTool('text');
        const probe = Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/text-probe.json`);
        const done = Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/text-probe-done`);
        await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            resolve(); return GLib.SOURCE_REMOVE;
        }));
        const [valid, bounds] = editor.canvas.compute_bounds(editor.window);
        check(valid, 'Canvas coordinates are unavailable for physical text input');
        const pt = editor._transform();
        const request = {x: bounds.origin.x + pt.x + 8 * pt.scale,
            y: bounds.origin.y + pt.y + 32 * pt.scale};
        probe.replace_contents(JSON.stringify(request), null, false, Gio.FileCreateFlags.PRIVATE, null);
        await new Promise((resolve, reject) => {
            let ticks = 0;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                if (done.query_exists(null)) { resolve(); return GLib.SOURCE_REMOVE; }
                if (++ticks > 100) { reject(new Error('Physical text input timed out')); return GLib.SOURCE_REMOVE; }
                return GLib.SOURCE_CONTINUE;
            });
        });
        check(editor.text.text === 'abcd' && editor.text.get_position() === 4,
            `Native typing/caret failed after repositioning: ${editor.text.text}`);
        check(Math.abs(editor.textDraft.x - 8) < 1 && Math.abs(editor.textDraft.y - 32) < 1,
            'Physical click did not move the input box');
        probe.delete(null); done.delete(null); editor.setTool('move');
        check(editor.window.title === _('Screenshot editor'), 'Editor is not localized');
        check(editor.canvas.get_width() > 200 && editor.canvas.get_height() > 200, 'Editor canvas did not render');
        for (const type of ['arrow', 'rectangle', 'highlight', 'pen', 'text']) {
            editor.document.add({type, x: 2, y: 2, x2: 20, y2: 18, color: '#ff0000', width: 4,
                text: '你好 日本語 한국어', points: [[3, 4], [6, 8]]});
            check(exportPng(editor.pixbuf, editor.document.state).length > 0, `${type} did not render`);
        }
        const original = pixel(editor.pixbuf, 0, 0);
        const mosaicDoc = new EditorDocument(64, 48);
        mosaicDoc.add({type: 'mosaic', x: 10, y: 10, x2: 30, y2: 30, width: 16, block: 4,
            color: '#000000', points: [[30, 10], [30, 30]]});
        const mosaic = decodeImage(exportPng(editor.pixbuf, mosaicDoc.state), 'image/png');
        check(pixel(mosaic, 20, 10).every(v => v >= 224), 'Mosaic is not light gray and white');
        check(pixel(mosaic, 20, 10).every(v => v === pixel(mosaic, 20, 10)[0]), 'Mosaic palette is colored');
        check(new Set([12, 16, 20, 24].map(x => pixel(mosaic, x, 10)[0])).size > 1, 'Mosaic has no visible square tiles');
        check(JSON.stringify(pixel(mosaic, 0, 0)) === JSON.stringify(original), 'Mosaic changed pixels outside the brush');
        const red = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 64, 48);
        red.fill(0xe02040ff); mosaicDoc.toggleGrayscale();
        const gray = decodeImage(exportPng(red, mosaicDoc.state), 'image/png');
        check(pixel(gray, 0, 0).every(v => v === pixel(gray, 0, 0)[0]), 'Black and white filter did not remove color');
        mosaicDoc.undo();
        const restored = decodeImage(exportPng(red, mosaicDoc.state), 'image/png');
        check(pixel(restored, 0, 0)[0] === 224 && pixel(restored, 0, 0)[1] === 32, 'Filter undo lost original colors');
        editor.setTool('text');
        check(editor.text.visible && (editor.text.has_focus || editor.window.get_focus()?.is_ancestor(editor.text)),
            'Text tool did not immediately show and focus its input box');
        editor.text.text = 'Typing 你好';
        const textBefore = {...editor.textDraft};
        const textTransform = editor._transform();
        editor._begin(textTransform.x + 10 * textTransform.scale, textTransform.y + 12 * textTransform.scale);
        editor._end(0, 0);
        check(editor.textDraft.x !== textBefore.x && Math.abs(editor.textDraft.x - 10) < 0.000001 &&
            Math.abs(editor.textDraft.y - 12) < 0.000001,
            'Clicking the image did not reposition the input box');
        check(editor.text.text === 'Typing 你好' && editor._textPreview().text === editor.text.text,
            'Moving the text input lost typed text or its preview');
        const textCount = editor.document.state.annotations.length;
        editor.text.emit('activate');
        check(editor.document.state.annotations.length === textCount + 1 &&
            editor.document.state.annotations.at(-1).text === 'Typing 你好' && !editor.text.visible,
            'Enter did not commit the text and dismiss its input box');
        editor.setTool('mosaic'); editor.size.value = 128; editor.block.value = 24;
        const mt = editor._transform();
        editor._begin(mt.x + 10 * mt.scale, mt.y + 10 * mt.scale);
        editor._drag(5 * mt.scale, 6 * mt.scale); editor._end(15 * mt.scale, 20 * mt.scale);
        const stroke = editor.document.state.annotations.at(-1);
        check(stroke.type === 'mosaic' && stroke.width === 128 && stroke.block === 24 && stroke.points.length >= 3,
            'Mosaic gesture lost its freehand path or adjustable thickness/tile size');
        editor.setTool('text');
        check(editor.size.value === 24, 'Text inherited the large mosaic brush thickness');
        editor.text.text = 'Pending text';
        editor._commitText();
        check(editor.document.state.annotations.at(-1).text === 'Pending text' && !editor.text.visible,
            'Finishing an export text draft left a stale input box');
        editor.grayscaleButton.emit('clicked');
        check(editor.document.state.grayscale && editor.grayscaleButton.active, 'Native filter button did not turn on grayscale');
        editor.undoButton.emit('clicked');
        check(!editor.document.state.grayscale && !editor.grayscaleButton.active, 'Undo did not update the native filter button');
        editor.document.add({type: 'redact', x: 5, y: 5, x2: 25, y2: 25, color: '#ffffff', width: 4});
        const covered = decodeImage(exportPng(editor.pixbuf, editor.document.state), 'image/png');
        check(pixel(covered, 10, 10).every(value => value === 0), 'Redaction was not opaque black');
        editor.document.crop([0, 0], [40, 30]);
        editor._update();
        await editor.copy();
        const destination = Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/explicit-export.png`);
        await editor.saveTo(destination);
        const saved = decodeImage(destination.load_contents(null)[1], 'image/png');
        check(saved.width === 40 && saved.height === 30 && pixel(saved, 10, 10).every(value => value === 0), 'Saved PNG lost crop/redaction');
        check(destination.query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode') % 512 === 384, 'Saved export is not private');
        destination.delete(null);
        check(editor.undoButton.sensitive, 'Undo action is unavailable');
        editor.undoButton.emit('clicked');
        check(editor.document.state.crop.width === 64 && editor.redoButton.sensitive, 'Undo failed');
        editor.redoButton.emit('clicked');
        check(editor.document.state.crop.width === 40, 'Redo failed');
        for (const tool of editor.toolButtons.keys()) {
            editor.toolButtons.get(tool).emit('clicked');
            check(editor.tool === tool && editor.toolButtons.get(tool).active, 'Toolbar selection failed');
        }
        editor.document = new EditorDocument(64, 48);
        const first = editor.document.add({type: 'rectangle', x: 5, y: 5, x2: 18, y2: 16, color: '#ff0000', width: 2});
        const later = editor.document.add({type: 'number', x: 40, y: 30, x2: 40, y2: 30, color: '#e01b24', width: 12});
        editor.setTool('select');
        const t = editor._transform();
        editor._begin(t.x + 10 * t.scale, t.y + 10 * t.scale);
        editor._end(5 * t.scale, 3 * t.scale);
        check(editor.selected === first && editor.document.state.annotations[0].x === 10,
            'Select gesture did not move its mark');
        check(editor.document.state.annotations[1].id === later && editor.document.state.annotations[1].x === 40,
            'Moving a mark changed a later annotation');
        editor._begin(t.x + 23 * t.scale, t.y + 19 * t.scale);
        editor._end(4 * t.scale, 4 * t.scale);
        check(editor.document.state.annotations[0].x2 === 27, 'Resize handle did not resize');
        editor.deleteButton.emit('clicked');
        check(editor.document.state.annotations.length === 1 && editor.document.state.annotations[0].number === 1,
            'Deleting a selected mark removed another mark');
        editor.undoButton.emit('clicked');
        check(editor.document.state.annotations.length === 2, 'Annotation delete was not undoable');
        const marker = decodeImage(exportPng(editor.pixbuf, editor.document.state), 'image/png');
        check(pixel(marker, 40, 25).some(value => value > 0), 'Numbered marker was not rendered');
        let pinned;
        editor.onPin = bytes => { pinned = decodeImage(bytes, 'image/png'); };
        await editor.pin();
        check(pinned?.width === 64, 'Pin action did not export annotations');
        const frames = new LineFrames(100);
        check(frames.push(new Uint8Array([0xe4])).length === 0 &&
            frames.push(new Uint8Array([0xbd, 0xa0, 10]))[0] === '你', 'Native Unicode framing failed');
        const input = new Uint8Array(32768).map((_, i) => i % 251);
        const echoed = await runProcess(['/usr/bin/cat'], input);
        check(echoed.length === input.length && echoed.every((v, i) => v === input[i]), 'Native pipe transfer corrupted bytes');
        for (const options of [{timeoutMs: 20}, {cancel: new Gio.Cancellable()}]) {
            if (options.cancel) GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => { options.cancel.cancel(); return GLib.SOURCE_REMOVE; });
            let rejected = false;
            try { await runProcess(['/usr/bin/sleep', '2'], null, options); } catch { rejected = true; }
            check(rejected, 'OCR subprocess did not stop on timeout/cancel');
        }
        let bounded = false;
        try { await runProcess(['/usr/bin/head', '-c', '2000', '/dev/zero'], null, {outputLimit: 100}); } catch { bounded = true; }
        check(bounded, 'OCR output limit did not stop the subprocess');
        const white = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 640, 140);
        white.fill(0xffffffff);
        const textDocument = new EditorDocument(640, 140);
        textDocument.add({type: 'text', x: 20, y: 75, x2: 20, y2: 75, color: '#000000', width: 38,
            text: 'SUPER V LOCAL OCR'});
        let copiedText = '';
        const ocrEditor = new ImageEditor(exportPng(white, textDocument.state), 'image/png', null, () => {},
            {onText: text => { copiedText = text; }});
        try {
            ocrEditor.window.present();
            check((await ocrEditor.ocr.languages(null)).includes('eng'), 'English OCR pack is missing');
            await ocrEditor.recognizeText();
            check(ocrEditor.ocrCopy.sensitive, `Local OCR failed: ${ocrEditor.ocrStatus.label}`);
            ocrEditor.ocrCopy.emit('clicked');
            check(copiedText.includes('SUPER V LOCAL OCR'), 'OCR did not recognize and copy synthetic text');
            const preview = ocrEditor.ocrPreview;
            check(preview.words.length >= 4, 'OCR word geometry is missing');
            for (const action of ['click', 'drag']) {
                await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    resolve(); return GLib.SOURCE_REMOVE;
                }));
                const [valid, bounds] = preview.area.compute_bounds(ocrEditor.ocrDialog);
                check(valid && preview.area.get_width() > 200, 'OCR preview is not visible');
                const t = preview.transform();
                const first = preview.words[0], second = preview.words[1];
                const point = (x, y) => [bounds.origin.x + t.x + x * t.scale, bounds.origin.y + t.y + y * t.scale];
                const start = action === 'click' ? point(first.x + first.width / 2, first.y + first.height / 2)
                    : point(first.x - 2, first.y - 2);
                const end = action === 'click' ? start : point(second.x + second.width + 2,
                    Math.max(first.y + first.height, second.y + second.height) + 2);
                const request = Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/ocr-${action}-probe.json`);
                const done = Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/ocr-${action}-done`);
                request.replace_contents(JSON.stringify({start, end}), null, false, Gio.FileCreateFlags.PRIVATE, null);
                await new Promise((resolve, reject) => {
                    let ticks = 0;
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                        if (done.query_exists(null)) { resolve(); return GLib.SOURCE_REMOVE; }
                        if (++ticks > 100) { reject(new Error('OCR pointer selection timed out')); return GLib.SOURCE_REMOVE; }
                        return GLib.SOURCE_CONTINUE;
                    });
                });
                check(preview.selected.length === (action === 'click' ? 1 : 2), `Physical OCR ${action} selected the wrong words`);
                ocrEditor.ocrCopy.emit('clicked');
                check(copiedText === (action === 'click' ? first.text : `${first.text} ${second.text}`),
                    'Copy did not use the selected OCR words');
                request.delete(null); done.delete(null);
            }
            ocrEditor.ocrSelectAll.emit('clicked');
            check(preview.selected.length === preview.words.length, 'Select all did not restore the full result');
            ocrEditor.ocrBuffer.set_text('Edited 你好 👩🏽‍🔬', -1);
            ocrEditor.ocrCopy.emit('clicked');
            check(copiedText === 'Edited 你好 👩🏽‍🔬', 'Copy ignored editable OCR text');
            ocrEditor.ocrBuffer.select_range(ocrEditor.ocrBuffer.get_iter_at_offset(7), ocrEditor.ocrBuffer.get_iter_at_offset(9));
            ocrEditor.ocrCopy.emit('clicked');
            check(copiedText === '你好', 'Copy ignored the Unicode text selection');
            ocrEditor.ocrBuffer.set_text('', -1);
            check(!ocrEditor.ocrCopy.sensitive, 'Empty OCR text enabled copying');
            ocrEditor.ocrBuffer.set_text('x'.repeat(65537), -1);
            check(!ocrEditor.ocrCopy.sensitive, 'Oversized edited OCR text enabled copying');
            const installed = await ocrEditor.ocr.languages(null);
            for (const [language, text, expected] of [
                ['chi_sim', '简体中文 文字识别', '简体中文'], ['chi_tra', '繁體中文 文字辨識', '繁體中文'],
                ['jpn', '日本語 テキスト', '日本語'], ['kor', '한국어 텍스트', '한국어'],
                ['spa', 'Texto español', 'español'], ['fra', 'Texte français', 'français'],
            ]) {
                if (!installed.includes(language)) continue;
                const result = await ocrEditor.ocr.recognizeDetailed(ocrSample(text, language), language, installed, null);
                check(result.text.replace(/\s/gu, '').includes(expected), `${language}: synthetic recognition failed (${result.text})`);
                check(result.words.length > 0, `${language}: synthetic word geometry is missing`);
            }
            ocrEditor.ocrDialog.close();
            check(!ocrEditor.ocrDialog && ocrEditor.ocrCancel.is_cancelled(), 'Closing OCR did not cancel work');
            check(!preview.pixbuf && !preview.words.length, 'Closing OCR retained its image or text geometry');
            let pendingResolve, pendingCancel;
            const realEngine = ocrEditor.ocr;
            ocrEditor.ocr = {program: true, languages: async () => ['eng'],
                recognizeDetailed: (_bytes, _language, _installed, cancel) => {
                    pendingCancel = cancel;
                    return new Promise(resolve => { pendingResolve = resolve; });
                }};
            const pending = ocrEditor.recognizeText();
            await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
                resolve(); return GLib.SOURCE_REMOVE;
            }));
            check(!ocrEditor.ocrCopy.sensitive && !ocrEditor.ocrRun.sensitive, 'OCR controls stayed active during recognition');
            const stalePreview = ocrEditor.ocrPreview;
            ocrEditor.ocrDialog.close();
            check(pendingCancel.is_cancelled(), 'Closing during recognition did not cancel the request');
            pendingResolve({text: 'Late result', words: preview.words});
            await pending;
            check(!ocrEditor.ocrDialog && !stalePreview.pixbuf && copiedText === '你好', 'Late OCR result escaped a closed dialog');
            ocrEditor.ocr = realEngine;
        } finally { ocrEditor.window.close(); }
        const jpeg = decodeImage(GLib.base64_decode(fixtures.jpeg), 'image/jpeg');
        check(jpeg.width === 64 && jpeg.height === 48, 'JPEG input failed');
        editor.document = new EditorDocument(64, 48);
        for (let i = 0; i < 128; i++) editor.document.add({type: 'rectangle', x: 1, y: 1, x2: 5, y2: 5,
            color: '#000000', width: 1});
        editor.setTool('text'); editor.text.text = 'Keep this draft';
        check(editor._commitText() === false && editor.text.visible && editor.text.text === 'Keep this draft' && editor.textDraft,
            'Reaching the annotation limit erased the active text draft');
        editor.textDraft = null; editor.setTool('move');
        const dialog = new Gtk.FileChooserNative({transient_for: editor.window, action: Gtk.FileChooserAction.SAVE});
        dialog.destroy();
        check(!base.get_child('extension').get_child('editor.png').query_exists(null), 'Editor created a scratch image');
        print(`EDITOR CHECKS COMPLETE: ${checks} checks, ${GLib.getenv('LANGUAGE')}`);
    })().catch(error => { printerr(error.message, error.stack); status = 1; }).finally(() => {
        editor.window.close();
        loop.quit();
    });
    return GLib.SOURCE_REMOVE;
});
loop.run();
System.exit(status);
