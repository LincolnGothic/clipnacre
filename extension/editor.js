// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import System from 'system';
import {gettext as _, initTranslations} from './translations.js';
import {format, N_} from './core/localization.js';
import {EditorDocument, annotationBounds, imageTransform, imagePoint} from './core/editor.js';
import {MAX_IMAGE_BYTES} from './core/image.js';
import {decodeImage, drawDocument, exportPng} from './editor-render.js';
import {DEFAULT_EXPORT_PATTERN, exportFilename, MAX_OCR_TEXT_BYTES, OCR_LANGUAGES} from './core/export.js';
import {OcrEngine} from './ocr.js';
import {OcrPreview} from './ocr-preview.js';
import {writePipe} from './process.js';

export const directory = Gio.File.new_for_uri(import.meta.url).get_parent();

export class ImageEditor {
    constructor(bytes, mime, application = null, onCopy = () => {}, callbacks = {}) {
        this.cancel = new Gio.Cancellable();
        const source = Gio.SettingsSchemaSource.new_from_directory(directory.get_child('schemas').get_path(),
            Gio.SettingsSchemaSource.get_default(), false);
        this.settings = new Gio.Settings({settings_schema: source.lookup('org.gnome.shell.extensions.super-v-ubuntu', true)});
        initTranslations(directory, this.settings.get_string('ui-language'));
        this.pixbuf = decodeImage(bytes, mime);
        this.document = new EditorDocument(this.pixbuf.width, this.pixbuf.height);
        this.onCopy = onCopy;
        this.onPin = callbacks.onPin ?? (() => {});
        this.onText = callbacks.onText ?? (() => {});
        this.ocr = callbacks.ocr ?? new OcrEngine();
        this.tool = 'move';
        this.pan = [0, 0];
        this.labels = [];
        this.window = new Adw.ApplicationWindow({application, default_width: 1000, default_height: 740});
        this.overlay = new Adw.ToastOverlay();
        const root = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8});
        this.overlay.set_child(root);
        this.window.set_content(this.overlay);
        const header = new Adw.HeaderBar();
        root.append(header);
        const action = (message, callback, icon = null) => {
            const button = new Gtk.Button(icon ? {icon_name: icon} : {label: _(message)});
            button.set_tooltip_text(_(message));
            button.connect('clicked', callback);
            this.labels.push({widget: button, message, icon});
            return button;
        };
        this.undoButton = action(N_('Undo'), () => { this._commitText(); this.document.undo(); this._update(); }, 'edit-undo-symbolic');
        this.redoButton = action(N_('Redo'), () => { this.document.redo(); this._update(); }, 'edit-redo-symbolic');
        header.pack_start(this.undoButton);
        header.pack_start(this.redoButton);
        this.copyButton = action(N_('Copy image'), () => this.copy());
        this.saveButton = action(N_('Save image'), () => this.save());
        this.pinButton = action(N_('Pin to screen'), () => this.pin(), 'view-pin-symbolic');
        this.ocrButton = action(N_('Copy text from image'), () => this.recognizeText());
        header.pack_end(this.pinButton);
        header.pack_end(this.ocrButton);
        this.deleteButton = action(N_('Delete annotation'), () => {
            this.document.delete(this.selected); this.selected = null; this._update();
        }, 'edit-delete-symbolic');
        header.pack_start(this.deleteButton);
        header.pack_end(this.saveButton);
        header.pack_end(this.copyButton);
        const toolbar = new Gtk.FlowBox({selection_mode: Gtk.SelectionMode.NONE,
            max_children_per_line: 5, min_children_per_line: 2, column_spacing: 4, row_spacing: 4,
            margin_start: 12, margin_end: 12});
        root.append(toolbar);
        this.toolButtons = new Map();
        for (const [tool, message] of [['move', _('Move image')], ['select', _('Select annotation')], ['crop', _('Crop')],
            ['arrow', _('Arrow')], ['rectangle', _('Rectangle')], ['text', _('Text')],
            ['highlight', _('Highlight')], ['pen', _('Pen')], ['mosaic', _('Light mosaic')], ['number', _('Numbered marker')]]) {
            const button = new Gtk.ToggleButton({label: message});
            button.connect('clicked', () => this.setTool(tool));
            toolbar.insert(button, -1);
            this.toolButtons.set(tool, button);
        }
        this.grayscaleButton = new Gtk.ToggleButton({label: _('Black and white')});
        this.grayscaleButton.connect('clicked', () => {
            if (this._commitText() !== false) this.document.toggleGrayscale();
            this._update();
        });
        header.pack_start(this.grayscaleButton);
        const options = new Gtk.Box({spacing: 8, margin_start: 12, margin_end: 12});
        root.append(options);
        this.color = new Gtk.ColorButton({use_alpha: false});
        const red = new Gdk.RGBA();
        red.parse('#e01b24');
        this.color.set_rgba(red);
        this.color.set_tooltip_text(_('Color'));
        options.append(this.color);
        this.size = Gtk.SpinButton.new_with_range(1, 72, 1);
        this.size.value = 4;
        this.size.set_tooltip_text(_('Stroke width / text size'));
        this.sizeLabel = new Gtk.Label({label: _('Stroke width / text size')});
        options.append(this.sizeLabel);
        options.append(this.size);
        this.block = Gtk.SpinButton.new_with_range(4, 64, 1);
        this.block.value = 12;
        this.block.set_tooltip_text(_('Mosaic tile size'));
        this.blockLabel = new Gtk.Label({label: _('Mosaic tile size')});
        options.append(this.blockLabel);
        options.append(this.block);
        this.text = new Gtk.Entry({max_length: 500, placeholder_text: _('Text to add'),
            halign: Gtk.Align.START, valign: Gtk.Align.START, width_chars: 12, max_width_chars: 12});
        this.text.set_tooltip_text(_('Click the image to move the text box. Press Enter to finish.'));
        this.color.connect('color-set', () => this._styleSelected());
        this.size.connect('value-changed', () => this._styleSelected());
        this.block.connect('value-changed', () => this._styleSelected());
        this.text.connect('changed', () => { this._styleSelected(); this.canvas?.queue_draw(); });
        this.text.connect('activate', () => {
            const result = this._commitText();
            if (result === false) return;
            const id = result ?? this.selected;
            this.setTool('select'); this.selected = id; this._update(); this.canvas.grab_focus();
        });
        this.zoom = Gtk.SpinButton.new_with_range(25, 400, 25);
        this.zoom.value = 100;
        this.zoom.set_tooltip_text(_('Zoom (%)'));
        this.zoom.connect('value-changed', () => { this.canvas.queue_draw(); this._placeText(); });
        options.append(this.zoom);
        this.canvas = new Gtk.DrawingArea({hexpand: true, vexpand: true,
            content_width: 300, content_height: 200, focusable: true});
        this.canvasOverlay = new Gtk.Overlay({child: this.canvas, hexpand: true, vexpand: true});
        this.canvasOverlay.add_overlay(this.text);
        root.append(this.canvasOverlay);
        this.canvas.connect('resize', () => this._placeText());
        this.textCss = new Gtk.CssProvider();
        this.text.get_style_context().add_provider(this.textCss, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        this.canvas.set_draw_func((_area, cr, width, height) => {
            if (!this.pixbuf)
                return;
            cr.setSourceRGB(0.15, 0.15, 0.15);
            cr.paint();
            const t = this._transform(width, height);
            cr.save();
            cr.translate(t.x, t.y);
            cr.scale(t.scale, t.scale);
            const editing = this.text.visible && this.tool === 'select'
                ? this.document.state.annotations.find(a => a.id === this.selected) : null;
            // The native input renders the live text and caret. Do not paint a
            // second copy underneath it; only the committed text is exported.
            drawDocument(cr, this.pixbuf, this.document.state, this.preview ?? (editing ? {...editing, text: ''} : null));
            const selected = this.preview?.id ? this.preview : this.document.state.annotations.find(a => a.id === this.selected);
            if (selected && this.tool === 'select') {
                const b = annotationBounds(selected);
                cr.setSourceRGB(0.2, 0.65, 1);
                cr.setLineWidth(2 / t.scale);
                cr.rectangle(b.x - this.document.state.crop.x, b.y - this.document.state.crop.y, b.width, b.height);
                cr.stroke();
                cr.rectangle(b.x + b.width - this.document.state.crop.x - 4 / t.scale,
                    b.y + b.height - this.document.state.crop.y - 4 / t.scale, 8 / t.scale, 8 / t.scale);
                cr.fill();
            }
            cr.restore();
        });
        const drag = new Gtk.GestureDrag({button: 1});
        drag.connect('drag-begin', (_gesture, x, y) => this._begin(x, y));
        drag.connect('drag-update', (_gesture, x, y) => this._drag(x, y));
        drag.connect('drag-end', (_gesture, x, y) => this._end(x, y));
        drag.connect('cancel', () => { this.start = null; this.preview = null; this.canvas.queue_draw(); });
        this.canvas.add_controller(drag);
        this.dimensions = new Gtk.Label({margin_bottom: 8});
        root.append(this.dimensions);
        const keys = new Gtk.EventControllerKey({propagation_phase: Gtk.PropagationPhase.CAPTURE});
        keys.connect('key-pressed', (_controller, key, _code, modifiers) => {
            const editingText = this.window.get_focus()?.is_ancestor(this.text) || this.text.has_focus;
            if (modifiers & Gdk.ModifierType.CONTROL_MASK) {
                if (!editingText && [Gdk.KEY_z, Gdk.KEY_Z].includes(key)) {
                    if (modifiers & Gdk.ModifierType.SHIFT_MASK)
                        this.document.redo();
                    else
                        this.document.undo();
                    this._update();
                    return true;
                }
                if (!editingText && [Gdk.KEY_c, Gdk.KEY_C].includes(key)) { this.copy(); return true; }
                if (!editingText && modifiers & Gdk.ModifierType.SHIFT_MASK && [Gdk.KEY_o, Gdk.KEY_O].includes(key)) {
                    this.recognizeText(); return true;
                }
                if ([Gdk.KEY_s, Gdk.KEY_S].includes(key)) { this.save(); return true; }
            }
            if (key === Gdk.KEY_Escape && this.textDraft) {
                this.textDraft = null; this.text.text = ''; this.setTool('move'); return true;
            }
            if (key === Gdk.KEY_Escape) { this.window.close(); return true; }
            if (!editingText && [Gdk.KEY_Delete, Gdk.KEY_BackSpace].includes(key) && this.selected !== null) {
                this.document.delete(this.selected); this.selected = null; this._update(); return true;
            }
            return false;
        });
        this.window.add_controller(keys);
        this._languageHandler = this.settings.connect('changed::ui-language', () => {
            initTranslations(directory, this.settings.get_string('ui-language'));
            this.retranslate();
        });
        this.window.connect('close-request', () => {
            this.cancel.cancel();
            this.settings.disconnect(this._languageHandler);
            this.dialog?.destroy();
            this.ocrCancel?.cancel();
            this.ocrPreview?.clear();
            this.ocrDialog?.destroy();
            this.pixbuf = null;
            return false;
        });
        this.retranslate();
        this.setTool('move');
    }

    retranslate() {
        this.window.title = _('Screenshot editor');
        const names = {move: _('Move image'), select: _('Select annotation'), crop: _('Crop'), arrow: _('Arrow'), rectangle: _('Rectangle'),
            text: _('Text'), highlight: _('Highlight'), pen: _('Pen'), mosaic: _('Light mosaic'), number: _('Numbered marker')};
        for (const [tool, button] of this.toolButtons)
            button.label = names[tool];
        for (const {widget, message, icon} of this.labels) {
            widget.set_tooltip_text(_(message));
            if (!icon)
                widget.label = _(message);
        }
        this.color.set_tooltip_text(_('Color'));
        this.size.set_tooltip_text(_('Stroke width / text size'));
        this.zoom.set_tooltip_text(_('Zoom (%)'));
        this.text.placeholder_text = _('Text to add');
        this.text.set_tooltip_text(_('Click the image to move the text box. Press Enter to finish.'));
        this.block.set_tooltip_text(_('Mosaic tile size'));
        this.grayscaleButton.label = _('Black and white');
        this.blockLabel.label = _('Mosaic tile size');
        this._update();
    }

    setTool(tool) {
        if (this._commitText() === false) {
            for (const [name, button] of this.toolButtons) button.active = name === this.tool;
            this.text.grab_focus_without_selecting();
            return;
        }
        const previousTool = this.tool;
        this.tool = tool;
        this.editingSelectedText = false;
        this.start = this.preview = null;
        this.selected = null;
        for (const [name, button] of this.toolButtons)
            button.active = name === tool;
        this.text.visible = tool === 'text';
        this.block.visible = tool === 'mosaic';
        this.blockLabel.visible = this.block.visible;
        this.color.visible = tool !== 'mosaic';
        this.size.set_range(1, tool === 'mosaic' ? 256 : 72);
        this.size.set_tooltip_text(tool === 'mosaic' ? _('Mosaic brush thickness') : _('Stroke width / text size'));
        this.sizeLabel.label = this.size.get_tooltip_text();
        if (['text', 'number'].includes(tool) && (this.size.value < 8 || previousTool === 'mosaic'))
            this.size.value = 24;
        else if (tool === 'mosaic')
            this.size.value = 48;
        else if (!['text', 'number', 'select'].includes(tool) && this.size.value > 16)
            this.size.value = 4;
        if (tool === 'text') {
            const c = this.document.state.crop;
            this.textDraft = {x: c.x + c.width / 4, y: c.y + c.height / 4};
            this.text.text = '';
            this._placeText(); this.text.grab_focus();
        }
        this.canvas.set_cursor_from_name(tool === 'text' ? 'text' : ['move', 'select'].includes(tool) ? 'default' : 'crosshair');
        this._update();
    }

    _textPreview() {
        if (!this.textDraft || !this.text.text.trim()) return null;
        const {x, y} = this.textDraft;
        return {type: 'text', x, y, x2: x, y2: y, text: this.text.text,
            color: this._color(), width: this.size.value, points: []};
    }

    _commitText() {
        if (!this.textDraft) return null;
        const preview = this._textPreview();
        let id = null;
        if (preview) {
            try { id = this.document.add(preview); }
            catch { this.toast(_('Annotation limit reached. Undo a mark before adding another.')); return false; }
        }
        this.textDraft = null;
        this.text.visible = false;
        this.text.text = '';
        return id;
    }

    _color() {
        const rgba = this.color.get_rgba();
        return '#' + [rgba.red, rgba.green, rgba.blue].map(v =>
            Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    }

    _placeText() {
        if (!this.canvas || !this.text.visible) return;
        const mark = this.textDraft ?? this.document.state.annotations.find(a => a.id === this.selected);
        if (!mark || mark.type && mark.type !== 'text') return;
        const c = this.document.state.crop, t = this._transform();
        const fontSize = Math.max(12, Math.min(48, this.size.value * t.scale));
        this.text.margin_start = Math.max(0, Math.min(Math.round(t.x + (mark.x - c.x) * t.scale),
            this.canvas.get_width() - fontSize * 8 - 24));
        this.text.margin_top = Math.max(0, Math.min(Math.round(t.y + (mark.y - c.y) * t.scale),
            this.canvas.get_height() - fontSize * 1.8));
        const rgba = this.color.get_rgba();
        const background = 0.2126 * rgba.red + 0.7152 * rgba.green + 0.0722 * rgba.blue > 0.6 ? '#202124' : '#ffffff';
        const css = `entry { font-size: ${fontSize}px; color: ${this._color()}; border: 2px solid #3584e4; background-color: ${background}; padding: 4px 6px; }`;
        if (this._textCss !== css) {
            if (this.textCss.load_from_string) this.textCss.load_from_string(css);
            else this.textCss.load_from_data(css, -1);
            this._textCss = css;
        }
    }

    _transform(width = this.canvas.get_width(), height = this.canvas.get_height()) {
        return imageTransform(this.document.state.crop, width, height, this.zoom.value / 100, this.pan);
    }

    _begin(x, y) {
        if (this.tool !== 'text') this.canvas.grab_focus();
        this.origin = [x, y];
        this.oldPan = [...this.pan];
        const point = imagePoint(this.document.state.crop, this._transform(), x, y);
        const c = this.document.state.crop;
        if (point[0] < c.x || point[0] > c.x + c.width || point[1] < c.y || point[1] > c.y + c.height) {
            this.start = null;
            return;
        }
        this.start = point;
        this.points = [point];
        if (this.tool === 'text') {
            this.textDraft = {x: point[0], y: point[1]};
            this.text.visible = true;
            this._placeText(); this.text.grab_focus_without_selecting();
            this.start = null;
            return;
        }
        if (this.tool === 'select') {
            const selected = this.document.state.annotations.find(a => a.id === this.selected);
            const bounds = selected && annotationBounds(selected);
            this.resizing = bounds && Math.hypot(point[0] - bounds.x - bounds.width,
                point[1] - bounds.y - bounds.height) < 10 / this._transform().scale;
            if (!this.resizing) this.selected = this.document.hit(...point, 6 / this._transform().scale);
            this.editingSelectedText = !this.resizing;
            this._loadSelected();
            this._update();
            if (this.text.visible) this.text.grab_focus();
        }
    }

    _drag(dx, dy) {
        if (!this.start)
            return;
        if (this.tool === 'select') {
            this.preview = this.document.transformed(this.selected, dx / this._transform().scale,
                dy / this._transform().scale, this.resizing);
        } else if (this.tool === 'move') {
            this.pan = [this.oldPan[0] + dx, this.oldPan[1] + dy];
        } else {
            const end = this.document.point(...imagePoint(this.document.state.crop, this._transform(),
                this.origin[0] + dx, this.origin[1] + dy));
            if (['pen', 'mosaic'].includes(this.tool) && this.points.length < 1024)
                this.points.push(end);
            const rgba = this.color.get_rgba();
            const color = '#' + [rgba.red, rgba.green, rgba.blue].map(v =>
                Math.round(v * 255).toString(16).padStart(2, '0')).join('');
            this.preview = {type: this.tool, x: this.start[0], y: this.start[1], x2: end[0], y2: end[1],
                width: this.size.value, color, text: this.text.text, points: this.points, block: this.block.value,
                number: Math.max(0, ...this.document.state.annotations.filter(a => a.type === 'number').map(a => a.number)) + 1};
        }
        this.canvas.queue_draw();
    }

    _end(dx, dy) {
        this._drag(dx, dy);
        try {
            if (this.preview) {
                if (this.tool === 'select') {
                    if (dx || dy) this.document.update(this.selected, this.preview);
                } else if (this.tool === 'crop') {
                    this.document.crop(this.start, [this.preview.x2, this.preview.y2]);
                    this.pan = [0, 0];
                    this.zoom.value = 100;
                } else if (this.tool !== 'text' || this.text.text.trim()) {
                    this.document.add(this.preview);
                }
            }
        } catch {
            this.toast(_('Annotation limit reached. Undo a mark before adding another.'));
        }
        this.start = this.preview = null;
        this._update();
    }

    _update() {
        if (!this.document.state.annotations.some(a => a.id === this.selected)) this.selected = null;
        if (this.tool === 'select') this._loadSelected();
        this.deleteButton.sensitive = this.selected !== null;
        this.undoButton.sensitive = this.document.past.length > 0;
        this.redoButton.sensitive = this.document.future.length > 0;
        this.grayscaleButton.active = this.document.state.grayscale;
        const c = this.document.state.crop;
        this.dimensions.label = format(_('Image · %d × %d'), c.width, c.height);
        this.canvas.queue_draw();
        this._placeText();
    }

    _loadSelected() {
        const a = this.document.state.annotations.find(mark => mark.id === this.selected);
        this.loadingStyle = true;
        if (a) {
            const rgba = new Gdk.RGBA(); rgba.parse(a.color); this.color.set_rgba(rgba);
            this.size.set_range(1, a.type === 'mosaic' ? 256 : 72);
            this.size.value = a.width; this.text.text = a.text; this.block.value = a.block;
        }
        this.text.visible = a?.type === 'text' && this.editingSelectedText;
        this.block.visible = a?.type === 'mosaic';
        this.blockLabel.visible = this.block.visible;
        this.color.visible = a?.type !== 'mosaic';
        this.sizeLabel.label = a?.type === 'mosaic' ? _('Mosaic brush thickness') : _('Stroke width / text size');
        this.loadingStyle = false;
    }

    _styleSelected() {
        this._placeText();
        if (this.loadingStyle || this.tool !== 'select' || this.selected === null) return;
        const rgba = this.color.get_rgba();
        const color = '#' + [rgba.red, rgba.green, rgba.blue].map(v =>
            Math.round(v * 255).toString(16).padStart(2, '0')).join('');
        this.document.update(this.selected, {color, width: this.size.value, text: this.text.text, block: this.block.value});
        this._update();
    }

    toast(message) { this.overlay.add_toast(new Adw.Toast({title: message})); }

    async copy() {
        if (!this.copyButton.sensitive)
            return;
        this.copyButton.sensitive = false;
        try {
            if (this._commitText() === false) return;
            await this.onCopy(exportPng(this.pixbuf, this.document.state));
            if (!this.cancel.is_cancelled())
                this.toast(_('Edited image copied. Paste it into your application.'));
        } catch {
            if (!this.cancel.is_cancelled())
                this.toast(_('Could not export the image. Crop it to reduce its size.'));
        } finally {
            this.copyButton.sensitive = true;
        }
    }

    async pin() {
        if (!this.pinButton.sensitive) return;
        this.pinButton.sensitive = false;
        try { if (this._commitText() === false) return; await this.onPin(exportPng(this.pixbuf, this.document.state)); }
        catch { if (!this.cancel.is_cancelled()) this.toast(_('Could not pin this image.')); }
        finally { this.pinButton.sensitive = true; }
    }

    async recognizeText() {
        if (this.cancel.is_cancelled()) return;
        if (this.ocrDialog) { this.ocrDialog.present(); return; }
        if (!this.ocr.program) { this.toast(_('Install Tesseract OCR to recognize text.')); return; }
        if (this._commitText() === false) return;
        let snapshot, previewImage;
        try {
            snapshot = exportPng(this.pixbuf, this.document.state);
            previewImage = decodeImage(snapshot, 'image/png');
        } catch {
            this.toast(_('Could not export the image. Crop it to reduce its size.')); return;
        }
        const dialog = new Adw.Window({transient_for: this.window, modal: true, default_width: 720,
            default_height: 640, title: _('Copy text from image')});
        this.ocrDialog = dialog;
        this.ocrCancel = new Gio.Cancellable();
        const root = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8,
            margin_start: 12, margin_end: 12, margin_bottom: 12});
        root.append(new Adw.HeaderBar()); dialog.set_content(root);
        const controls = new Gtk.Box({spacing: 8}); root.append(controls);
        const language = new Gtk.DropDown({hexpand: true, tooltip_text: _('OCR language')});
        controls.append(language);
        const run = new Gtk.Button({label: _('Recognize text'), sensitive: false}); controls.append(run);
        const copy = new Gtk.Button({label: _('Copy text'), sensitive: false}); controls.append(copy);
        const all = new Gtk.Button({label: _('Select all text'), sensitive: false}); controls.append(all);
        const status = new Gtk.Label({label: _('Loading OCR languages…'), wrap: true}); root.append(status);
        const hint = new Gtk.Label({label: _('Click or drag over the image to select text. Edit the result before copying.'),
            wrap: true, xalign: 0}); root.append(hint);
        const spinner = new Gtk.Spinner({spinning: true}); root.append(spinner);
        const view = new Gtk.TextView({wrap_mode: Gtk.WrapMode.WORD_CHAR, left_margin: 8, right_margin: 8,
            top_margin: 8, bottom_margin: 8});
        const preview = new OcrPreview(previewImage, text => {
            view.buffer.set_text(text, -1);
            if (!spinner.spinning) status.label = _('Review the recognized text before copying.');
        });
        this.ocrPreview = preview;
        const panes = new Gtk.Paned({orientation: Gtk.Orientation.VERTICAL, hexpand: true, vexpand: true,
            position: 240, wide_handle: true});
        panes.set_start_child(preview.area);
        const scroll = new Gtk.ScrolledWindow({hexpand: true, vexpand: true, min_content_height: 100});
        scroll.set_child(view); panes.set_end_child(scroll); root.append(panes);
        all.connect('clicked', () => preview.selectAll());
        this.ocrBuffer = view.buffer;
        this.ocrCopy = copy; this.ocrRun = run; this.ocrLanguage = language; this.ocrStatus = status;
        this.ocrSelectAll = all;
        view.buffer.connect('changed', () => {
            const [start, end] = view.buffer.get_bounds();
            const text = view.buffer.get_text(start, end, false);
            copy.sensitive = !spinner.spinning && !!text && new TextEncoder().encode(text).length <= MAX_OCR_TEXT_BYTES;
        });
        let installed = [];
        const alive = () => this.ocrDialog === dialog && !this.ocrCancel.is_cancelled();
        const copyText = async selection => {
            if (!copy.sensitive || !alive()) return;
            const bounds = selection ? view.buffer.get_selection_bounds() : [];
            const [start, end] = bounds[0] ? bounds.slice(1) : view.buffer.get_bounds();
            const text = view.buffer.get_text(start, end, false);
            if (!text || new TextEncoder().encode(text).length > MAX_OCR_TEXT_BYTES) {
                status.label = _('Text is empty or exceeds the copy limit.'); return;
            }
            try { await this.onText(text); if (alive()) status.label = _('Text copied. Paste it into your application.'); }
            catch { if (alive()) status.label = _('Could not copy the text.'); }
        };
        copy.connect('clicked', () => copyText(true));
        const keys = new Gtk.EventControllerKey({propagation_phase: Gtk.PropagationPhase.CAPTURE});
        keys.connect('key-pressed', (_controller, key, _code, modifiers) => {
            if (modifiers & Gdk.ModifierType.CONTROL_MASK && [Gdk.KEY_c, Gdk.KEY_C].includes(key)) {
                copyText(true); return true;
            }
            if (key === Gdk.KEY_Escape) { dialog.close(); return true; }
            return false;
        });
        dialog.add_controller(keys);
        const recognize = async () => {
            if (!installed.length || !alive()) return;
            this.ocrCancel.cancel(); this.ocrCancel = new Gio.Cancellable();
            const cancel = this.ocrCancel;
            spinner.spinning = true;
            run.sensitive = false; copy.sensitive = false; language.sensitive = false; all.sensitive = false;
            preview.area.sensitive = false; view.editable = false;
            preview.setResult({words: []});
            status.label = _('Recognizing text…');
            try {
                const selected = installed[language.selected];
                this.settings.set_string('ocr-language', selected);
                const result = await this.ocr.recognizeDetailed(snapshot, selected, installed, cancel);
                if (cancel.is_cancelled() || this.ocrDialog !== dialog) return;
                preview.setResult(result);
                all.sensitive = !!result.words.length;
                status.label = result.text ? _('Review the recognized text before copying.') : _('No text was recognized.');
            } catch {
                if (!cancel.is_cancelled() && this.ocrDialog === dialog)
                    status.label = _('OCR failed. Check the language packs or crop a smaller area.');
            } finally {
                if (!cancel.is_cancelled() && this.ocrDialog === dialog) {
                    spinner.spinning = false;
                    run.sensitive = true; language.sensitive = true; preview.area.sensitive = true; view.editable = true;
                    view.buffer.emit('changed');
                }
            }
        };
        run.connect('clicked', recognize);
        dialog.connect('close-request', () => {
            this.ocrCancel.cancel(); view.buffer.set_text('', -1);
            preview.clear();
            this.ocrPreview = this.ocrSelectAll = null;
            this.ocrDialog = this.ocrBuffer = this.ocrCopy = this.ocrRun = this.ocrLanguage = this.ocrStatus = null;
            return false;
        });
        dialog.present();
        try {
            installed = await this.ocr.languages(this.ocrCancel);
            if (this.ocrDialog !== dialog || this.ocrCancel.is_cancelled()) return;
            if (!installed.length) { spinner.spinning = false; status.label = _('No OCR language packs are installed.'); return; }
            language.model = Gtk.StringList.new(installed.map(id => OCR_LANGUAGES.find(option => option.id === id)?.label ?? id));
            const choice = this.settings.get_string('ocr-language');
            language.selected = Math.max(0, installed.indexOf(choice));
            await recognize();
        } catch {
            if (this.ocrDialog === dialog) { spinner.spinning = false; status.label = _('Could not load OCR language packs.'); }
        }
    }

    save() {
        if (this.dialog)
            return;
        const dialog = new Gtk.FileChooserNative({title: _('Save image'), transient_for: this.window,
            action: Gtk.FileChooserAction.SAVE, modal: true});
        const now = GLib.DateTime.new_now_local();
        const c = this.document.state.crop;
        let filename;
        try { filename = exportFilename(this.settings.get_string('export-pattern'), {
            date: now.format('%Y-%m-%d'), time: now.format('%H-%M-%S'), width: c.width, height: c.height}); }
        catch { filename = exportFilename(DEFAULT_EXPORT_PATTERN, {
            date: now.format('%Y-%m-%d'), time: now.format('%H-%M-%S'), width: c.width, height: c.height}); }
        dialog.set_current_name(filename);
        const folder = this.settings.get_string('export-folder');
        if (folder) {
            try { dialog.set_current_folder(Gio.File.new_for_uri(folder)); } catch { /* Ask for a new location. */ }
        }
        const filter = new Gtk.FileFilter();
        filter.add_mime_type('image/png');
        filter.name = 'PNG';
        dialog.add_filter(filter);
        this.dialog = dialog;
        dialog.connect('response', (_dialog, response) => {
            const file = response === Gtk.ResponseType.ACCEPT ? dialog.get_file() : null;
            dialog.destroy();
            this.dialog = null;
            if (!file)
                return;
            try {
                this.saveTo(file).then(() => {
                    if (!this.cancel.is_cancelled()) this.toast(_('Image saved.'));
                }).catch(() => {
                    if (!this.cancel.is_cancelled()) this.toast(_('Could not save the image.'));
                });
            } catch {
                this.toast(_('Could not export the image. Crop it to reduce its size.'));
            }
        });
        dialog.show();
    }

    saveTo(file) {
        if (this._commitText() === false) return Promise.reject(new Error('Annotation limit reached'));
        const bytes = new GLib.Bytes(exportPng(this.pixbuf, this.document.state));
        return new Promise((resolve, reject) => {
            file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.PRIVATE,
                this.cancel, (f, result) => {
                    try {
                        f.replace_contents_finish(result);
                        this.settings.set_string('export-folder', f.get_parent().get_uri());
                        resolve();
                    } catch (error) { reject(error); }
                });
        });
    }
}

async function readInput() {
    const stream = new GioUnix.InputStream({fd: 0, close_fd: false});
    const chunks = [];
    let size = 0;
    while (true) {
        const bytes = await new Promise((resolve, reject) => stream.read_bytes_async(65536,
            GLib.PRIORITY_DEFAULT, null, (s, r) => {
                try { resolve(s.read_bytes_finish(r).get_data()); } catch (error) { reject(error); }
            }));
        if (!bytes.length)
            break;
        size += bytes.length;
        if (size > MAX_IMAGE_BYTES)
            throw new Error('Input too large');
        chunks.push(bytes.slice());
    }
    const input = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
    return input;
}

if (ARGV[0] === '--pipe') {
    const application = new Adw.Application({application_id: 'org.gnome.Shell.Extensions.SuperV.Editor',
        flags: Gio.ApplicationFlags.NON_UNIQUE});
    let activeEditor = null;
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, 15, () => {
        activeEditor?.window.close();
        application.quit();
        return GLib.SOURCE_REMOVE;
    });
    application.connect('activate', () => {
        application.hold();
        readInput().then(bytes => {
            const output = new GioUnix.OutputStream({fd: 1, close_fd: false});
            let pending = Promise.resolve();
            const send = payload => {
                const frame = new TextEncoder().encode(JSON.stringify(payload) + '\n');
                const result = pending.then(() => writePipe(output, frame, editor.cancel));
                pending = result.catch(() => {}); return result;
            };
            const editor = new ImageEditor(bytes, ARGV[1], application,
                png => send({action: 'copy-image', png: GLib.base64_encode(png)}), {
                    onPin: png => send({action: 'pin', png: GLib.base64_encode(png)}),
                    onText: text => send({action: 'copy-text', text}),
                });
            activeEditor = editor;
            editor.window.present();
            application.release();
        }).catch(() => System.exit(1));
    });
    application.run([]);
}
