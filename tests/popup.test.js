// SPDX-License-Identifier: GPL-3.0-or-later
// Exercise the actual popup with St/Clutter adapters; this is not desktop rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadModule} from './helpers/load-module.js';
import {EmojiIndex} from '../extension/core/emoji.js';
import {History} from '../extension/core/history.js';
import {moveGridSelection} from '../extension/core/grid.js';

const data = JSON.parse(readFileSync('extension/data/emoji.json', 'utf8')).emoji;

async function fixture({count = 125, width = 1920, scale = 1, position = 'pointer',
    pointer = [500, 400], translate = message => message} = {}) {
    let focus = null;
    class Actor {
        constructor(properties = {}) {
            this.children = [];
            this.signals = new Map();
            this.pseudoClasses = new Set();
            Object.assign(this, properties);
            this.clutter_text = {line_wrap: false};
            if (properties.child) this.add_child(properties.child);
        }
        connect(signal, callback) { this.signals.set(signal, callback); }
        connectObject(...args) {
            for (let index = 0; index < args.length - 1; index += 2)
                this.connect(args[index], args[index + 1]);
        }
        disconnectObject() { this.signals.clear(); }
        emit(signal, ...args) { return this.signals.get(signal)?.(this, ...args); }
        add_child(child) { child.parent = this; this.children.push(child); }
        set_child(child) { this.children = []; this.add_child(child); }
        get_child() { return this.children[0] ?? {clutter_text: this.clutter_text}; }
        get_parent() { return this.parent; }
        get_last_child() { return this.children.at(-1); }
        get_n_children() { return this.children.length; }
        destroy_all_children() { this.children = []; }
        add_style_pseudo_class(name) { this.pseudoClasses.add(name); }
        remove_style_pseudo_class(name) { this.pseudoClasses.delete(name); }
        grab_key_focus() { focus = this; this.emit('key-focus-in'); }
        set_style(style) { this.style = style; }
        hide() { this.visible = false; }
        queue_redraw() {}
        destroy() { this.emit('destroy'); }
        has_allocation() { return Boolean(this.box); }
        get_allocation_box() { assert.ok(this.box, 'must wait for layout'); return {x1: 0, y1: 0, ...this.box}; }
        get_transformed_position() {
            const [x, y] = this.parent?.get_transformed_position() ?? [0, 0];
            return [x + (this.box?.x1 ?? 0) + (this.translation_x || 0), y + (this.box?.y1 ?? 0) + (this.translation_y || 0)];
        }
        transform_stage_point(x, y) { const origin = this.get_transformed_position(); return [true, x - origin[0], y - origin[1]]; }
        get_transformed_size() { return [390, 600]; }
        contains(actor) { return this === actor || this.children.some(child => child.contains(actor)); }
    }
    class BoxLayout extends Actor {
        get_layout_manager() { return {set_homogeneous: value => { this.homogeneous = value; }}; }
    }
    class Label extends Actor {
        constructor(properties) { super(properties); this.clutter_text = new Actor(); }
    }
    class Entry extends Label {
        constructor(properties) { super(properties); this.text = ''; }
        get_text() { return this.text; }
        set_text(text) {
            if (this.text === text)
                return;
            this.text = text;
            this.clutter_text.emit('text-changed');
        }
        grab_key_focus() { this.clutter_text.grab_key_focus(); }
    }
    class ScrollView extends Actor {
        get_vadjustment() { return adjustment; }
        get_hadjustment() { return categoryAdjustment; }
    }
    class PopupMenu {
        constructor() { this.actor = new Actor(); this.items = []; this.isOpen = false; }
        addMenuItem(item) { this.items.push(item); }
        removeAll() { this.items = []; }
        toggle() { this.isOpen = !this.isOpen; }
        close() { this.isOpen = false; }
        destroy() { this.close(); }
    }
    class PopupMenuItem extends Actor {
        constructor(label) { super({label}); }
        setOrnament(value) { this.ornament = value; }
    }
    class ModalDialog extends Actor {
        _init() {
            this.contentLayout = new Actor(); this.dialogLayout = new Actor();
            const panel = new Actor();
            panel.add_child(this.contentLayout);
            this.dialogLayout.add_child(panel);
            this.dialogLayout.box = {};
            this.dialogLayout.get_transformed_size = () => [width, 1080];
            this._monitorConstraint = {};
            this.state = 0;
        }
        setInitialKeyFocus() {}
        open() { this.state = 1; return true; }
        close() { this.closed = true; this.state = 0; this.emit('closed'); }
    }
    const adjustment = new Actor({value: 0, page_size: 150});
    const categoryAdjustment = new Actor({value: 0, page_size: 200});
    let scrollValue = 0;
    adjustment.upper = Infinity;
    Object.defineProperty(adjustment, 'value', {
        get: () => scrollValue,
        set: value => { scrollValue = Math.max(0, Math.min(value, adjustment.upper - adjustment.page_size)); },
    });
    const clutter = {ActorAlign: {CENTER: 1, FILL: 0, START: 2}, ModifierType: {CONTROL_MASK: 1, BUTTON1_MASK: 256},
        EventType: {BUTTON_PRESS: 1, KEY_PRESS: 2, MOTION: 3, BUTTON_RELEASE: 4}, EVENT_STOP: true, EVENT_PROPAGATE: false};
    for (const key of ['Escape', 'Tab', 'ISO_Left_Tab', 'f', 'F', 'Up', 'Down', 'Left', 'Right',
        'Return', 'KP_Enter', 'Delete', 'Home', 'End'])
        clutter[`KEY_${key}`] = key;
    const st = {BoxLayout, Button: Actor, Label, Entry, ScrollView, Widget: Actor, Icon: Actor,
        Side: {TOP: 0}, PolicyType: {NEVER: 0, AUTOMATIC: 1}, ThemeContext: {get_for_stage: () => ({scale_factor: scale})}};
    const calls = [];
    const stage = Object.assign(new Actor(), {get_key_focus: () => focus, get_event_actor: event => event.actor ?? null});
    const display = new Actor({focus_window: null}), windowGroup = new Actor();
    const paints = new Map(); let paintId = 0;
    stage.connect = (signal, callback) => {
        if (signal !== 'after-paint')
            return Actor.prototype.connect.call(stage, signal, callback);
        paints.set(++paintId, callback);
        return paintId;
    };
    stage.disconnect = id => paints.delete(id);
    const controller = {history: new History(), emoji: new EmojiIndex(data.slice(0, count)),
        metadata: {'version-name': '0.1.3'},
        settings: {get_boolean: () => true, get_string: () => position},
        gifs: {search: () => [{path: '/tmp/wave.gif', name: 'wave.gif'}]},
        selectGif: entry => calls.push(['gif', entry]), select: (...args) => calls.push(args),
        deleteEntry: id => calls.push(['delete', id]), pin: id => calls.push(['pin', id])};
    const module = await loadModule('extension/popup.js', {
        'gi://Clutter': {default: clutter}, 'gi://GObject': {default: {registerClass: x => x}},
        'gi://Pango': {default: {EllipsizeMode: {NONE: 0, END: 1}, WrapMode: {WORD_CHAR: 1}}},
        'gi://Gio': {default: {FileIcon: {new: file => ({file})}, File: {new_for_path: path => path}}},
        'gi://Shell': {default: {ActionMode: {POPUP: 1}}}, 'gi://St': {default: st},
        [resolve('extension/translations.js')]: {gettext: translate},
        'gi://GLib': {default: {}},
        'gi://Meta': {default: {LaterType: {BEFORE_REDRAW: 1}}},
        'resource:///org/gnome/shell/ui/popupMenu.js': {PopupMenu, PopupMenuItem,
            PopupMenuManager: class { addMenu() {} }, Ornament: {DOT: 1, NONE: 0}},
        'resource:///org/gnome/shell/ui/modalDialog.js': {ModalDialog, State: {OPENED: 1, OPENING: 2}},
        'resource:///org/gnome/shell/ui/main.js': {uiGroup: new Actor(), layoutManager: {
            focusMonitor: {x: 0, y: 0, width, height: 1080, index: 0},
            primaryMonitor: {x: 0, y: 0, width, height: 1080, index: 0},
            monitors: [{x: 0, y: 0, width, height: 1080, index: 0}],
            getWorkAreaForMonitor: () => ({x: 0, y: 24, width, height: 1056}),
        }},
    }, {stage, display, window_group: windowGroup, get_pointer: () => pointer, get_window_actors: () => []});
    const popup = new module.SuperVPopup();
    popup._init(controller);
    popup.showPanel();
    popup._setTab('emoji');
    const press = (key, ctrl = false) => popup._key({get_key_symbol: () => key,
        get_state: () => ctrl ? 1 : 0});
    const flushLayout = () => {
        const pending = [...paints.values()];
        for (const callback of pending) callback();
    };
    return {popup, controller, calls, press, adjustment, stage, display, windowGroup, pointer, Actor,
        paints, flushLayout, focus: () => focus};
}

test('loaded version is visible and all five tabs can be reached by keyboard', async () => {
    const {popup, press} = await fixture();
    assert.equal(popup._title.text, 'ClipNacre 0.1.3');
    for (const name of ['kaomoji', 'symbols', 'gifs', 'clipboard', 'emoji']) {
        press('Tab', true);
        assert.equal(popup.tab, name);
    }
    press('ISO_Left_Tab', true);
    assert.equal(popup.tab, 'clipboard');
});

test('kaomoji and symbols use glyph-only grids and the character insertion path', async () => {
    const {popup, press, calls} = await fixture();
    popup._setTab('kaomoji');
    assert.equal(popup.list.get_child().get_n_children(), 3);
    assert.equal(popup._toneButton.visible, false);
    press('Down');
    assert.equal(popup.selected, 3);
    press('Return');
    assert.equal(calls[0][1], true);
    popup._setTab('symbols');
    popup.search.set_text('plus minus');
    assert.equal(popup._rows[0].get_child().text, '±');
    press('Return');
    assert.equal(calls[1][0].text, '±');
});

test('GIF favorites render previews and dispatch binary insertion', async () => {
    const {popup, press, calls} = await fixture();
    popup._setTab('gifs');
    assert.equal(popup._rows[0].get_child().gicon.file, '/tmp/wave.gif');
    assert.equal(popup._manageGifs.visible, true);
    assert.equal(popup._emojiControls.visible, false);
    press('Return');
    assert.equal(calls[0][0], 'gif');
    assert.equal(calls[0][1].path, '/tmp/wave.gif');
});

test('near-pointer placement clamps at screen edges and center mode uses the work area', async () => {
    const {popup, controller} = await fixture({pointer: [1910, 1070]});
    popup._panel.box = {};
    popup.positionPanel();
    assert.equal(popup._panel.translation_x, 1518);
    assert.equal(popup._panel.translation_y, 458);
    controller.settings.get_string = () => 'center';
    popup.positionPanel();
    assert.deepEqual(popup._panel.get_transformed_position(), [765, 252]);
});

test('placement accounts for the panel allocation and parent origin after reopening', async () => {
    const {popup, pointer, flushLayout} = await fixture();
    popup.dialogLayout.box = {x1: 100, y1: 50};
    popup._panel.box = {x1: 400, y1: 240};
    flushLayout();
    assert.deepEqual(popup._panel.get_transformed_position(), [512, 412]);
    popup.positionPanel();
    assert.deepEqual(popup._panel.get_transformed_position(), [512, 412]);
    popup.close();
    pointer.splice(0, 2, 900, 100);
    popup.showPanel();
    popup._panel.box = {x1: 420, y1: 260};
    assert.equal(popup._panel.opacity, 0);
    flushLayout();
    assert.deepEqual(popup._panel.get_transformed_position(), [912, 112]);
    assert.equal(popup._panel.opacity, 255);
});

test('closing or destroying a popup cancels its pending layout callback', async () => {
    const {popup, paints, display, Actor} = await fixture();
    const window = new Actor();
    display.emit('window-created', window);
    assert.equal(paints.size, 1);
    popup.close();
    assert.equal(paints.size, 0);
    popup._panel.emit('notify::allocation');
    assert.equal(paints.size, 0);
    popup.showPanel();
    assert.equal(paints.size, 1);
    popup.destroy();
    assert.equal(paints.size, 0);
    assert.equal(popup._inputWindows.size, 0);
    assert.equal(window.signals.size, 0);
});

test('fitting retries after the next paint with a fresh allocation', async () => {
    const {popup, flushLayout, paints} = await fixture();
    popup._panel.box = {x1: 400, y1: 240};
    let height = 1200;
    popup._panel.get_transformed_size = () => [390, height];
    flushLayout();
    const fittedHeight = popup._scrollHeight;
    assert.ok(fittedHeight > 0 && fittedHeight < 330);
    assert.equal(popup._panel.opacity, 0);
    assert.equal(paints.size, 1);
    height = 1020;
    popup._panel.emit('notify::allocation');
    flushLayout();
    const [x, y] = popup._panel.get_transformed_position();
    assert.equal(popup._panel.opacity, 255);
    assert.ok(x >= 0 && y >= 24 && y + height <= 1080);
});

test('reopening becomes visible even when an unchanged allocation emits no notification', async () => {
    const {popup, flushLayout, paints} = await fixture();
    popup._panel.box = {x1: 400, y1: 240};
    flushLayout();
    popup.close();
    popup.showPanel();
    popup._panel.box = null;
    flushLayout();
    assert.equal(popup._panel.opacity, 0);
    assert.equal(paints.size, 1);
    popup._panel.box = {x1: 400, y1: 240};
    flushLayout();
    assert.equal(popup._panel.opacity, 255);
    assert.equal(paints.size, 0);
});

test('only primary application clicks update the remembered input anchor', async () => {
    const {popup, display, Actor, pointer} = await fixture();
    const window = new Actor({has_pointer: () => true,
        get_frame_rect: () => ({x: 100, y: 100, width: 800, height: 600})});
    display.focus_window = window;
    display.emit('window-created', window);
    display.emit('window-created', window);
    assert.equal(popup._inputWindows.size, 1);
    popup.close();
    pointer.splice(0, 3, 200, 500, 256);
    window.emit('notify::user-time');
    const anchor = popup._clickAnchor;
    assert.equal(anchor.window, window);
    pointer.splice(0, 3, 400, 300, 1);
    window.emit('notify::user-time');
    pointer[2] = 512;
    window.emit('notify::user-time');
    pointer[2] = 256;
    window.has_pointer = () => false;
    window.emit('notify::user-time');
    assert.equal(popup._clickAnchor, anchor);
    pointer.splice(0, 3, 1800, 100, 0);
    popup.showPanel();
    assert.deepEqual([...popup._anchor], [200, 500]);
    pointer.splice(0, 3, 300, 300, 256);
    window.has_pointer = () => true;
    window.emit('notify::user-time');
    assert.equal(popup._clickAnchor, anchor);
    window.emit('unmanaged');
    assert.equal(popup._clickAnchor, null);
    assert.equal(popup._inputWindows.size, 0);
    assert.equal(window.signals.size, 0);
});

test('title drag clamps the popup and header controls do not begin a drag', async () => {
    const {popup, stage, flushLayout} = await fixture();
    popup._panel.box = {x1: 400, y1: 240};
    flushLayout();
    const press = actor => ({actor, get_button: () => 1, get_coords: () => [550, 430]});
    for (const control of [popup._screenshotButton, popup._screenshotButton.get_child(), popup._settingsButton]) {
        assert.equal(popup._header.emit('button-press-event', press(control)), false);
        assert.equal(popup._drag, null);
    }
    assert.equal(popup._header.emit('button-press-event', press(popup._title)), true);
    stage.emit('captured-event', {type: () => 3, get_coords: () => [-2000, -2000]});
    assert.deepEqual(popup._panel.get_transformed_position(), [12, 36]);
    assert.equal(stage.emit('captured-event', {type: () => 4, get_button: () => 1}), true);
    assert.equal(popup._drag, null);
    popup.close();
    popup.showPanel();
    flushLayout();
    assert.deepEqual(popup._panel.get_transformed_position(), [512, 412]);
});

test('outside clicks dismiss through the stage or modal grab root; inside and closed clicks propagate', async () => {
    const {popup, stage} = await fixture();
    popup._panel.box = {};
    popup.positionPanel();
    const [x, y] = popup._panel.get_transformed_position();
    const click = coords => ({type: () => 1, get_button: () => 1, get_coords: () => coords});
    assert.equal(stage.emit('captured-event', click([x + 20, y + 20])), false);
    assert.equal(popup.closed, undefined);
    assert.equal(stage.emit('captured-event', click([0, 0])), true);
    assert.equal(popup.closed, true);
    assert.equal(stage.emit('captured-event', click([0, 0])), false);
    popup.showPanel();
    popup.closed = false;
    assert.equal(popup.emit('captured-event', click([x + 20, y + 20])), false);
    assert.equal(popup.closed, false);
    assert.equal(popup.emit('captured-event', click([0, 0])), true);
    assert.equal(popup.closed, true);
});

test('emoji form six-column rows and the partial row keeps empty, unfocusable cells', async () => {
    const {popup} = await fixture({count: 8});
    assert.equal(popup.list.children.length, 2);
    assert.equal(popup._rows.length, 8);
    const [first, last] = popup.list.children;
    assert.equal(first.get_n_children(), 6);
    assert.equal(last.get_n_children(), 6);
    assert.equal(first.homogeneous, true);
    assert.equal(last.children.filter(x => x.can_focus).length, 2);
    for (const [index, tile] of popup._rows.entries()) {
        assert.equal(tile.get_child().text, data[index].text);
        assert.equal(tile.accessible_name, data[index].name);
        assert.equal(tile.get_child().clutter_text.ellipsize, 0);
    }
});

test('narrow monitors reduce columns and normal HiDPI monitors retain six', async () => {
    const narrow = await fixture({width: 300});
    assert.equal(narrow.popup._emojiColumns, 3);
    narrow.press('Down');
    assert.equal(narrow.popup.selected, 3);
    const hidpi = await fixture({width: 1920, scale: 2});
    assert.equal(hidpi.popup._emojiColumns, 6);
});

test('grid arrows move by row and cell, focus follows selection, and Enter selects that emoji', async () => {
    const {popup, press, focus, calls} = await fixture();
    press('Down');
    assert.equal(popup.selected, 6);
    assert.equal(focus(), popup._rows[6]);
    press('Right');
    assert.equal(popup.selected, 7);
    press('Up');
    assert.equal(popup.selected, 1);
    press('Left');
    assert.equal(popup.selected, 0);
    press('Return');
    assert.deepEqual(calls, [[data[0], true]]);
});

test('navigation stops at top/bottom and reaches a short final row without phantom cells', () => {
    assert.equal(moveGridSelection(4, 8, 6, 'up'), 4);
    assert.equal(moveGridSelection(5, 8, 6, 'down'), 7);
    assert.equal(moveGridSelection(6, 8, 6, 'down'), 6);
    assert.equal(moveGridSelection(7, 8, 6, 'right'), 7);
    assert.equal(moveGridSelection(0, 8, 6, 'left'), 0);
    assert.equal(moveGridSelection(5, 8, 6, 'right'), 6);
    assert.equal(moveGridSelection(6, 8, 6, 'left'), 5);
    assert.equal(moveGridSelection(0, 0, 6, 'down'), 0);
});

test('query Left/Right remain text editing keys, including after returning from the grid', async () => {
    const {popup, press, focus} = await fixture();
    popup.search.set_text('face');
    assert.equal(press('Left'), false);
    assert.equal(press('Right'), false);
    assert.equal(popup.selected, 0);
    press('Down');
    assert.equal(focus(), popup._rows[6]);
    press('f', true);
    assert.equal(focus(), popup.search.clutter_text);
    assert.equal(press('Left'), false);
});

test('keyboard pagination keeps focus and waits for row allocation before scrolling', async () => {
    const {popup, press, focus, adjustment} = await fixture();
    popup._rows[59].grab_key_focus();
    press('Right');
    assert.equal(popup.selected, 60);
    assert.equal(popup._rows.length, 120);
    assert.equal(focus(), popup._rows[60]);
    assert.equal(adjustment.value, 0);
    const row = popup._rows[60].get_parent();
    adjustment.upper = 300;
    row.box = {y1: 530, y2: 580};
    row.emit('notify::allocation');
    assert.equal(adjustment.value, 150);
    // St updates the scroll range after allocating the new children.
    adjustment.upper = 1000;
    adjustment.emit('notify::upper');
    assert.equal(adjustment.value, 430);
    const first = popup._rows[0].get_parent();
    first.box = {y1: 0, y2: 50};
    popup._rows[0].grab_key_focus();
    assert.equal(adjustment.value, 0);
});

test('Show more appends results in grid order and mouse activation uses the clicked tile', async () => {
    const {popup, calls} = await fixture();
    popup.list.get_last_child().emit('clicked');
    assert.equal(popup._rows.length, 120);
    popup._rows[75].emit('clicked');
    assert.deepEqual(calls, [[data[75], true]]);
});

test('search and Recent rebuild the grid, reset selection and handle empty results', async () => {
    const {popup, controller, press, calls} = await fixture();
    press('Down');
    press('f', true);
    popup.search.set_text('grinning');
    assert.equal(popup.selected, 0);
    assert.ok(popup.results.length > 0);
    assert.ok(popup.results.every(x => [x.name, ...x.keywords].join(' ').includes('grinning')));
    popup.search.set_text('no-such-emoji');
    assert.equal(popup._rows.length, 0);
    press('Down');
    press('Return');
    assert.equal(calls.length, 0);
    assert.equal(popup.list.get_child().text, 'No matching items.');
    popup.search.set_text('');
    popup.group = 'Recent';
    popup.refresh();
    assert.equal(popup._rows.length, 0);
    controller.emoji.use(data[3].text);
    popup.refresh();
    assert.equal(popup._rows.length, 1);
    assert.equal(popup._rows[0].get_child().text, data[3].text);
});

test('category and skin-tone filtering still produce only matching grid tiles', async () => {
    const {popup} = await fixture({count: data.length});
    popup.group = 'People & Body';
    popup.tone = 'medium';
    popup.search.set_text('scientist');
    assert.ok(popup.results.some(x => x.text === '👩🏽‍🔬'));
    assert.ok(popup.results.every(x => x.group === 'People & Body' &&
        x.tones.every(tone => tone === 'medium')));
    assert.equal(popup._rows.length, popup.results.length);
});

test('clipboard keeps text rows, pin/delete buttons and one-item Up/Down navigation', async () => {
    const {popup, controller, press, calls} = await fixture();
    controller.history.add('first');
    controller.history.add('second');
    popup._setTab('clipboard');
    assert.equal(popup.list.children.length, 2);
    assert.ok(popup.list.children.every(x => x.children.length === 3));
    assert.equal(popup._rows[0].get_child().text, 'second');
    press('Down');
    assert.equal(popup.selected, 1);
    assert.equal(press('Right'), false);
    press('Return');
    assert.equal(calls[0][0].text, 'first');
    assert.equal(calls[0][1], false);
    const firstRow = popup.list.get_child();
    firstRow.children[1].emit('clicked');
    firstRow.children[2].emit('clicked');
    assert.deepEqual(calls.slice(1), [['pin', popup.results[0].id], ['delete', popup.results[0].id]]);
});

// Translated labels must not become filter IDs or alter keyboard navigation.
test('translated category and tone labels preserve filtering and accessibility', async () => {
    const labels = {'People & Body': '人物与身体',
        'Tone: %s': '肤色：%s', Medium: '中等', Settings: '设置', 'Pin entry': '固定条目'};
    const {popup} = await fixture({count: data.length, translate: message => labels[message] ?? message});
    popup.group = 'People & Body';
    popup.tone = 'medium';
    popup.search.set_text('scientist');
    assert.equal(popup._categoryButtons.get('People & Body').accessible_name, '人物与身体');
    assert.equal(popup._toneButton.accessible_name, '肤色：中等');
    assert.ok(popup.results.some(x => x.text === '👩🏽‍🔬'));
    assert.equal(popup.group, 'People & Body');
});

test('categories select directly and keyboard focus reaches the end of the horizontal bar', async () => {
    const {popup, press, focus} = await fixture({count: data.length});
    const animals = popup._categoryButtons.get('Animals & Nature');
    animals.emit('clicked');
    assert.equal(popup.group, 'Animals & Nature');
    assert.ok(popup.results.every(record => record.group === 'Animals & Nature'));
    assert.ok(animals.pseudoClasses.has('checked'));
    animals.grab_key_focus();
    press('End');
    assert.equal(focus(), popup._categoryButtons.get('Flags'));
    press('Left');
    assert.equal(focus(), popup._categoryButtons.get('Symbols'));
    press('Home');
    assert.equal(focus(), popup._categoryButtons.get('All'));
    press('Down');
    assert.equal(focus(), popup._rows[0]);
    popup._setTab('symbols');
    popup._categoryButtons.get('Currency').emit('clicked');
    assert.ok(popup.results.every(record => record.group === 'Currency'));
    assert.equal(popup._toneButton.visible, false);
});

test('skin tones select directly from a menu and Escape closes only that menu', async () => {
    const {popup, press} = await fixture({count: data.length});
    popup._toneButton.emit('clicked');
    assert.equal(popup._toneMenu.isOpen, true);
    popup._toneItems.get('dark').emit('activate');
    assert.equal(popup.tone, 'dark');
    assert.ok(popup._toneButton.label.includes('✋🏿'));
    assert.equal(popup._toneItems.get('dark').ornament, 1);
    press('Escape');
    assert.equal(popup._toneMenu.isOpen, false);
    assert.equal(popup.closed, undefined);
});
