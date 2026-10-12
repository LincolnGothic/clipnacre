// SPDX-License-Identifier: GPL-3.0-or-later
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import {textFromWords, wordsInArea} from './core/ocr.js';

// This preview owns only OCR selection. It never changes the exported screenshot.
export class OcrPreview {
    constructor(pixbuf, onSelect) {
        this.pixbuf = pixbuf;
        this.onSelect = onSelect;
        this.words = [];
        this.selected = [];
        this.area = new Gtk.DrawingArea({hexpand: true, vexpand: true, content_width: 280, content_height: 200});
        this.area.set_cursor_from_name('text');
        this.area.set_draw_func((_area, cr, width, height) => {
            if (!this.pixbuf) return;
            cr.setSourceRGB(0.12, 0.12, 0.12); cr.paint();
            const t = this.transform(width, height);
            cr.save(); cr.translate(t.x, t.y); cr.scale(t.scale, t.scale);
            Gdk.cairo_set_source_pixbuf(cr, this.pixbuf, 0, 0); cr.paint();
            const selected = new Set(this.selected);
            for (const word of this.words) {
                cr.rectangle(word.x, word.y, word.width, word.height);
                cr.setSourceRGBA(0.1, 0.5, 1, selected.has(word) ? 0.3 : 0.07);
                cr.fillPreserve(); cr.setSourceRGBA(0.1, 0.5, 1, 0.8);
                cr.setLineWidth(1 / t.scale); cr.stroke();
            }
            if (this.dragStart && this.dragEnd) {
                cr.setSourceRGBA(0.1, 0.5, 1, 0.8); cr.setLineWidth(1 / t.scale);
                cr.rectangle(this.dragStart[0], this.dragStart[1], this.dragEnd[0] - this.dragStart[0],
                    this.dragEnd[1] - this.dragStart[1]); cr.stroke();
            }
            cr.restore();
        });
        const drag = new Gtk.GestureDrag({button: 1});
        drag.connect('drag-begin', (_gesture, x, y) => { this.dragStart = this.point(x, y); });
        drag.connect('drag-update', (_gesture, x, y) => {
            if (!this.dragStart) return;
            const scale = this.transform().scale;
            this.dragEnd = [this.dragStart[0] + x / scale, this.dragStart[1] + y / scale];
            this.selectArea(this.dragStart, this.dragEnd);
        });
        drag.connect('drag-end', (_gesture, x, y) => {
            if (!this.dragStart) return;
            const scale = this.transform().scale;
            this.selectArea(this.dragStart, [this.dragStart[0] + x / scale, this.dragStart[1] + y / scale]);
            this.dragStart = this.dragEnd = null; this.area.queue_draw();
        });
        drag.connect('cancel', () => { this.dragStart = this.dragEnd = null; this.area.queue_draw(); });
        this.area.add_controller(drag);
    }
    transform(width = this.area.get_width(), height = this.area.get_height()) {
        const scale = Math.max(0.001, Math.min(width / this.pixbuf.width, height / this.pixbuf.height));
        return {scale, x: (width - this.pixbuf.width * scale) / 2, y: (height - this.pixbuf.height * scale) / 2};
    }
    point(x, y) {
        const t = this.transform();
        return [(x - t.x) / t.scale, (y - t.y) / t.scale];
    }
    setResult(result) { this.words = result.words; this.selectAll(); }
    selectAll() { this.selected = this.words; this._changed(); }
    selectArea(start, end) { this.selected = wordsInArea(this.words, start, end); this._changed(); }
    _changed() { this.onSelect(textFromWords(this.selected)); this.area.queue_draw(); }
    clear() { this.dragStart = this.dragEnd = null; this.words = this.selected = []; this.pixbuf = null; this.onSelect = () => {}; }
}
