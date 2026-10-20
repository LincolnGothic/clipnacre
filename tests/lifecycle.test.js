// SPDX-License-Identifier: GPL-3.0-or-later
// Mocked Mutter adapters test actual extension code, not a real desktop.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadModule} from './helpers/load-module.js';
import {History} from '../extension/core/history.js';
import {EmojiIndex} from '../extension/core/emoji.js';


function clipboardFixture() {
    let changed;
    const pending = [];
    const timers = new Map();
    let counter = 0;
    const captured = [];
    const selection = {
        mimes: ['text/plain;charset=utf-8'],
        connect(name, handler) { changed = handler; return 1; },
        disconnect() { changed = null; },
        get_mimetypes() { return this.mimes; },
        transfer_async(type, mime, size, output, cancellable, callback) {
            pending.push({type, mime, size, output, cancellable, callback});
        },
        transfer_finish() { return true; },
    };
    class Cancellable { cancel() { this.cancelled = true; } }
    const gio = {Cancellable, MemoryOutputStream: {new_resizable() {
        return {data: new Uint8Array(), closed: false, close() { this.closed = true; },
            is_closed() { return this.closed; }, steal_as_bytes() { return {get_data: () => this.data}; }};
    }}};
    const glib = {PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false, get_monotonic_time: () => 1_000_000,
        ChecksumType: {SHA256: 1},
        compute_checksum_for_bytes: (_type, data) => createHash('sha256').update(data.bytes).digest('hex'),
        timeout_add(priority, time, callback) { const id = ++counter; timers.set(id, callback); return id; },
        source_remove(id) { timers.delete(id); }};
    const binary = [];
    glib.Bytes = class { constructor(bytes) { this.bytes = bytes; } };
    const clipboard = {set_content(type, mime, bytes) { binary.push({type, mime, bytes: bytes.bytes}); },
        set_text(type, text) {
        changed?.(selection, 1);
        finish(text);
    }};
    const values = {'history-enabled': true, 'excluded-apps': []};
    const settings = {get_boolean: key => values[key], get_strv: key => values[key]};
    function finish(text, index = 0) {
        const p = pending.splice(index, 1)[0];
        if (!p)
            return;
        p.output.data = (typeof text === 'string' ? new TextEncoder().encode(text) : text).slice(0, p.size);
        p.callback(selection, {});
    }
    return {selection, values, settings, captured, binary, pending, timers, finish,
        event: type => changed?.(selection, type),
        mocks: {'gi://Gio': {default: gio}, 'gi://GLib': {default: glib},
            'gi://GdkPixbuf': {default: {}},
            'gi://Meta': {default: {SelectionType: {SELECTION_CLIPBOARD: 1}}},
            'gi://St': {default: {Clipboard: {get_default: () => clipboard}, ClipboardType: {CLIPBOARD: 1}}}},
        global: {display: {get_selection: () => selection}},
    };
}
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
async function monitor(fixture, ids = () => []) {
    const module = await loadModule('extension/clipboard.js', fixture.mocks, fixture.global);
    return new module.ClipboardMonitor(fixture.settings, ids, x => fixture.captured.push(x),
        (bytes, mime) => fixture.captured.push({bytes, mime}));
}

test('clipboard only reads clipboard selections and caps transferred bytes', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    f.event(0);
    assert.equal(f.pending.length, 0);
    f.event(1);
    assert.equal(f.pending[0].size, 16385);
    f.finish('A');
    await settle();
    assert.deepEqual(f.captured, ['A']);
    assert.equal(f.timers.size, 0);
    m.destroy();
});
test('oversized clipboard is dropped, never silently truncated into history', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    f.event(1);
    f.finish('x'.repeat(20000));
    await settle();
    assert.deepEqual(f.captured, []);
    m.destroy();
});
test('new owner invalidates stale asynchronous read', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    f.event(1);
    const old = f.pending[0];
    f.event(1);
    assert.equal(old.cancellable.cancelled, true);
    f.finish('old');
    f.finish('new');
    await settle();
    assert.deepEqual(f.captured, ['new']);
    m.destroy();
});
for (const hint of ['x-kde-passwordManagerHint', 'application/x-keepassxc', 'x-gtk-password']) {
    test(`password MIME hint skips capture ${hint}`, async () => {
        const f = clipboardFixture();
        const m = await monitor(f);
        f.selection.mimes.push(hint);
        f.event(1);
        await settle();
        assert.equal(f.pending.length, 0);
        m.destroy();
    });
}
test('focused excluded application skips capture', async () => {
    const f = clipboardFixture();
    f.values['excluded-apps'] = ['KeePassXC'];
    const m = await monitor(f, () => ['keepassxc']);
    f.event(1);
    assert.equal(f.pending.length, 0);
    m.destroy();
});
test('privacy change invalidates in-flight clipboard read', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    f.event(1);
    f.values['history-enabled'] = false;
    m.invalidate();
    f.finish('private');
    await settle();
    assert.deepEqual(f.captured, []);
    m.destroy();
});
test('own emoji/restore writes do not pollute history', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    m.write('😀');
    await settle();
    m.write('saved');
    await settle();
    assert.deepEqual(f.captured, []);
    m.destroy();
});
test('GIF clipboard writes use image/gif bytes and reject non-GIF data', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    const bytes = new Uint8Array(Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'));
    m.writeGif(bytes);
    assert.deepEqual(f.binary, [{type: 1, mime: 'image/gif', bytes}]);
    assert.throws(() => m.writeGif(new Uint8Array([1, 2, 3])));
    f.selection.mimes = ['image/gif'];
    f.event(1);
    await settle();
    assert.equal(f.pending.length, 0);
    assert.deepEqual(f.captured, []);
    m.destroy();
});
test('disable cancels pending reads and callbacks cannot capture', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    f.event(1);
    const p = f.pending[0];
    m.destroy();
    assert.equal(p.cancellable.cancelled, true);
    f.finish('after-disable');
    await settle();
    assert.deepEqual(f.captured, []);
    assert.equal(f.timers.size, 0);
});

test('lock suspension blocks collection and unlock resumes it', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    m.setSuspended(true);
    f.event(1);
    assert.equal(f.pending.length, 0);
    m.setSuspended(false);
    f.event(1);
    f.finish('public');
    await settle();
    assert.deepEqual(f.captured, ['public']);
    m.destroy();
});

const pngBytes = new Uint8Array(Buffer.from(JSON.parse(readFileSync('tests/fixtures/images.json', 'utf8')).png, 'base64'));
test('PNG capture takes precedence over accompanying text and preserves bytes', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    f.selection.mimes = ['text/plain', 'image/png'];
    f.event(1);
    assert.equal(f.pending[0].mime, 'image/png');
    assert.equal(f.pending[0].size, 8 * 1024 * 1024 + 1);
    f.finish(pngBytes);
    await settle();
    assert.deepEqual(f.captured, [{bytes: pngBytes, mime: 'image/png'}]);
    m.destroy();
});
for (const mime of ['image/x-png', 'image/jpg', 'image/pjpeg']) {
    test(`clipboard image MIME alias is normalized: ${mime}`, async () => {
        const f = clipboardFixture(); const m = await monitor(f);
        f.selection.mimes = [mime]; f.event(1); f.finish(pngBytes);
        await settle();
        assert.deepEqual(f.captured, [{bytes: pngBytes, mime: 'image/png'}]);
        m.destroy();
    });
}
test('clipboard tries JPEG when the advertised PNG transfer is empty', async () => {
    const f = clipboardFixture(); const m = await monitor(f);
    f.selection.mimes = ['image/png', 'image/jpeg']; f.event(1);
    f.finish(new Uint8Array()); await settle();
    assert.equal(f.pending[0].mime, 'image/jpeg');
    f.finish(pngBytes); await settle();
    assert.deepEqual(f.captured, [{bytes: pngBytes, mime: 'image/png'}]); m.destroy();
});
test('a failed image read cannot start a text read for a newer clipboard owner', async () => {
    const f = clipboardFixture(); const m = await monitor(f);
    f.selection.mimes = ['image/png', 'text/plain']; f.event(1);
    const old = f.pending[0];
    f.selection.mimes = ['text/plain']; f.event(1);
    f.finish(new Uint8Array()); await settle();
    assert.equal(old.cancellable.cancelled, true);
    assert.equal(f.pending.length, 1);
    f.finish('new'); await settle();
    assert.deepEqual(f.captured, ['new']); m.destroy();
});
for (const change of ['new owner', 'paused', 'lock', 'disable', 'excluded app']) {
    test(`image read is discarded after ${change}`, async () => {
        const f = clipboardFixture();
        const m = await monitor(f, () => ['test.app']);
        f.selection.mimes = ['image/png'];
        f.event(1);
        if (change === 'new owner') f.event(1);
        if (change === 'paused') f.values['history-enabled'] = false;
        if (change === 'lock') m.setSuspended(true);
        if (change === 'disable') m.destroy();
        if (change === 'excluded app') f.values['excluded-apps'] = ['test.app'];
        f.finish(pngBytes);
        await settle();
        assert.deepEqual(f.captured, []);
        if (change !== 'disable') m.destroy();
    });
}
test('password hints and unsupported image formats are ignored', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    for (const mimes of [['image/png', 'application/x-keepassxc'], ['image/svg+xml'], ['image/gif']]) {
        f.selection.mimes = mimes;
        f.event(1);
        await settle();
        assert.equal(f.pending.length, 0);
    }
    m.destroy();
});
test('history image writes use the original MIME and suppress their own capture', async () => {
    const f = clipboardFixture();
    const m = await monitor(f);
    m.writeImage(pngBytes, 'image/png');
    assert.deepEqual(f.binary, [{type: 1, mime: 'image/png', bytes: pngBytes}]);
    f.selection.mimes = ['image/png'];
    f.event(1);
    f.finish(pngBytes);
    await settle();
    assert.deepEqual(f.captured, []);
    m.destroy();
});

async function pasteFixture(modern = false) {
    const timers = new Map();
    const keys = [];
    let counter = 0;
    let fallbacks = 0;
    const target = {get_compositor_private: () => ({})};
    const state = {display: {focus_window: target}, stage: {get_key_focus: () => null},
        held: 0, get_pointer() { return [0, 0, this.held]; }};
    const device = {notify_keyval(time, key, pressed) { keys.push([key, pressed]); }};
    const clutter = {get_default_backend: () => ({get_default_seat: () => ({create_virtual_device: () => device})}),
        InputDeviceType: {KEYBOARD_DEVICE: 1}, KeyState: {PRESSED: 1, RELEASED: 0},
        KEY_Control_L: 1, KEY_Shift_L: 2, KEY_v: 3, KEY_Insert: 4,
        ModifierType: {CONTROL_MASK: 1, SHIFT_MASK: 2, MOD1_MASK: 4, MOD4_MASK: 8, SUPER_MASK: 16}};
    if (modern) {
        state.stage.context = {get_backend: clutter.get_default_backend};
        delete clutter.get_default_backend;
    }
    const glib = {PRIORITY_DEFAULT: 0, SOURCE_CONTINUE: true, SOURCE_REMOVE: false,
        get_monotonic_time: () => 1, source_remove(id) { timers.delete(id); },
        timeout_add(priority, time, callback) { timers.set(++counter, callback); return counter; }};
    const main = {sessionMode: {isLocked: false, isGreeter: false}, activateWindow() {}};
    const settings = {get_boolean: () => true, get_strv: () => ['terminal'], get_string: () => '{}'};
    const module = await loadModule('extension/paste.js', {'gi://Clutter': {default: clutter},
        'gi://GLib': {default: glib}, 'resource:///org/gnome/shell/ui/main.js': main}, state);
    const backend = new module.PasteBackend(settings, () => ['terminal'], () => fallbacks++);
    function tick() {
        for (const [id, callback] of [...timers]) {
            if (!callback())
                timers.delete(id);
        }
    }
    return {backend, target, state, main, settings, timers, keys, device, tick, fallback: () => fallbacks};
}
test('paste adapter uses terminal shortcut and releases keys in reverse order', async () => {
    const f = await pasteFixture();
    f.backend.paste(f.target);
    f.tick();
    assert.deepEqual(f.keys, [[1, 1], [2, 1], [3, 1], [3, 0], [2, 0], [1, 0]]);
    assert.equal(f.timers.size, 0);
    f.backend.destroy();
});
test('GNOME 50 paste obtains the virtual keyboard through the stage context', async () => {
    const f = await pasteFixture(true);
    f.backend.paste(f.target);
    f.tick();
    assert.deepEqual(f.keys, [[1, 1], [2, 1], [3, 1], [3, 0], [2, 0], [1, 0]]);
    assert.equal(f.fallback(), 0);
    f.backend.destroy();
});
test('GNOME 46 stage-as-focus does not prevent application paste', async () => {
    const f = await pasteFixture();
    f.state.stage.get_key_focus = () => f.state.stage;
    f.backend.paste(f.target);
    f.tick();
    assert.equal(f.keys.length, 6);
    assert.equal(f.fallback(), 0);
    f.backend.destroy();
});
test('paste adapter aborts on a different focus instead of injecting keys', async () => {
    const f = await pasteFixture();
    f.backend.paste(f.target);
    f.state.display.focus_window = {};
    f.tick();
    assert.deepEqual(f.keys, []);
    assert.equal(f.fallback(), 1);
});
test('paste adapter waits for physical modifiers, then safely times out', async () => {
    const f = await pasteFixture();
    f.state.held = 16;
    f.backend.paste(f.target);
    for (let i = 0; i < 25; i++)
        f.tick();
    assert.deepEqual(f.keys, []);
    assert.equal(f.fallback(), 1);
    assert.equal(f.timers.size, 0);
});
test('paste adapter disable cancels scheduled input', async () => {
    const f = await pasteFixture();
    f.backend.paste(f.target);
    f.backend.destroy();
    f.tick();
    assert.deepEqual(f.keys, []);
    assert.equal(f.timers.size, 0);
});
test('paste adapter attempts remaining releases after a release failure', async () => {
    const f = await pasteFixture();
    f.device.notify_keyval = (time, key, pressed) => {
        f.keys.push([key, pressed]);
        if (key === 3 && !pressed)
            throw new Error('Injected failure');
    };
    f.backend.paste(f.target);
    f.tick();
    assert.deepEqual(f.keys.slice(-3), [[3, 0], [2, 0], [1, 0]]);
    assert.equal(f.fallback(), 1);
});

async function controller() {
    const emoji = JSON.parse(readFileSync('extension/data/emoji.json', 'utf8'));
    const mockPath = name => resolve(`extension/${name}`);
    const sources = new Map();
    const signals = new Map();
    let signalId = 0;
    const texture = {get_width: () => 16384, get_height: () => 16384};
    const content = {get_texture: () => texture};
    const main = {texture, content, selectors: [], notify() {}, sessionMode: {isLocked: false, isGreeter: false},
        overview: {hide() { main.overviewHidden = true; }},
        screenshotUI: {connect(name, handler) { signals.set(++signalId, {name, handler}); return signalId; },
            disconnect(id) { signals.delete(id); },
            emit(name) { for (const signal of [...signals.values()]) if (signal.name === name) signal.handler(); },
            open: async () => { main.opened = (main.opened ?? 0) + 1; }}};
    const mocks = {
        'gettext': {dgettext: (_domain, message) => message},
        'gi://GLib': {default: {get_language_names: () => ['en'], PRIORITY_DEFAULT_IDLE: 0, PRIORITY_DEFAULT: 0,
            ChecksumType: {SHA256: 1}, Bytes: class {constructor(value) { this.value = value; }},
            compute_checksum_for_bytes: (_type, bytes) => createHash('sha256').update(bytes.value).digest('hex'),
            timeout_add(_priority, _time, callback) { const id = ++signalId + 1000; sources.set(id, callback); return id; },
            idle_add(_priority, callback) { const id = sources.size + 1; sources.set(id, callback); return id; },
            source_remove: id => sources.delete(id)}},
        'gi://Gio': {default: {MemoryOutputStream: {new_resizable: () => ({closed: false,
            close() { this.closed = true; }, is_closed() { return this.closed; },
            get_data_size: () => pngBytes.length, steal_as_bytes: () => ({get_data: () => pngBytes})})}}},
        'gi://Meta': {default: {}}, 'gi://Shell': {default: {Screenshot: class {
            async screenshot_stage_to_content() {
                main.frozen = true; await main.freezePromise; return [content, main.scale ?? 1];
            }
            static async composite_to_stream(...args) {
                main.composite = args; main.area = args.slice(1, 5); await main.capturePromise;
            }
        }}},
        'resource:///org/gnome/shell/ui/screenshot.js': {SelectArea: class {
            constructor() { main.selectors.push(this); this._grabHelper = {ungrab: () => this.finish(null)}; }
            set_content(value) { this.content = value; }
            hide() { this.hidden = true; }
            selectAsync() { main.opened = (main.opened ?? 0) + 1;
                return new Promise(resolve => { this.finish = resolve; }); }
        }},
        'resource:///org/gnome/shell/ui/main.js': main,
        'resource:///org/gnome/shell/ui/modalDialog.js': {State: {OPENED: 1, OPENING: 2}},
        'resource:///org/gnome/shell/extensions/extension.js': {Extension: class {}, gettext: message => message},
        [mockPath('storage.js')]: {StateStore: class {}},
        [mockPath('clipboard.js')]: {ClipboardMonitor: class {}},
        [mockPath('paste.js')]: {PasteBackend: class {}},
        [mockPath('popup.js')]: {SuperVPopup: class {}},
        [mockPath('gifs.js')]: {GifLibrary: class {}},
        [mockPath('images.js')]: {ImageLibrary: class {}},
        [mockPath('pins.js')]: {ScreenPins: class {}},
    };
    const module = await loadModule('extension/extension.js', mocks);
    const c = new module.default();
    c._active = true;
    c._epoch = 1;
    c._selectionEpoch = 0;
    c._stateRevision = 0;
    c._languageRevision = 0;
    c._ready = true;
    c._target = {};
    c.history = new History();
    c.emoji = new EmojiIndex(emoji.emoji);
    c.settings = {get_boolean: key => key !== 'clear-on-shutdown'};
    c.store = {save() {}, erase() {}};
    c.popup = {close() {}, refresh() {}};
    const writes = [];
    const pastes = [];
    c.clipboard = {invalidate() {}, generation: 1, readText: async () => 'old', write: x => writes.push(x),
        writeGif: x => writes.push(x), writeImage: (bytes, mime) => writes.push({bytes, mime})};
    c.images = {add: () => ({digest: 'a'.repeat(64), mime: 'image/png', bytes: pngBytes.length, width: 64, height: 48}),
        retain() {}, snapshot: () => new Map()};
    c.gifs = {read: async () => new Uint8Array([1, 2, 3])};
    c.pasteBackend = {paste: x => pastes.push(x), cancel() {}};
    const editors = [];
    c.editor = {open: (bytes, mime) => editors.push({bytes, mime}), close() {}};
    c.clipboard.readImage = async () => ({bytes: pngBytes, mime: 'image/png'});
    const tick = () => { for (const [id, callback] of [...sources]) { sources.delete(id); callback(); } };
    return {c, writes, pastes, main, sources, tick, editors};
}

test('image history choice copies original binary data and preserves its paste target', async () => {
    const {c, writes, pastes} = await controller();
    const entry = c.history.addImage({kind: 'image', mime: 'image/png', digest: 'a'.repeat(64),
        bytes: pngBytes.length, width: 64, height: 48});
    c.images = {get: () => ({bytes: pngBytes}), retain() {}, snapshot: () => new Map()};
    c.pendingRestore = {previous: 'old', emoji: '😀'};
    await c.select(entry, false);
    assert.deepEqual(writes, [{bytes: pngBytes, mime: 'image/png'}]);
    assert.deepEqual(pastes, [c._target]);
    assert.equal(c.pendingRestore, null);
    assert.equal(c.history.entries[0], entry);
});
test('screenshot freezes pixels after closing the picker and before opening controls', async () => {
    const {c, main} = await controller();
    c.popup.close = () => { assert.equal(main.frozen, undefined); };
    c.screenPins = {releaseInput() { assert.equal(main.frozen, true); }};
    c.takeScreenshot();
    assert.equal(main.frozen, true);
    assert.equal(main.opened, undefined);
    await settle();
    assert.equal(main.opened, 1);
    assert.equal(main.selectors[0].content, main.content);
});
test('locking while freezing prevents native controls from opening', async () => {
    const {c, main} = await controller();
    c.takeScreenshot();
    main.sessionMode.isLocked = true;
    await settle();
    assert.equal(main.opened, undefined);
});
test('shutdown privacy overrides persistence without discarding current memory', async () => {
    const {c} = await controller();
    c.history.add('keep during this session');
    c.settings.get_boolean = () => true;
    let erased = 0;
    c.store.erase = () => { erased++; };
    c._settingsChanged('clear-on-shutdown');
    assert.equal(c.store.persist, false);
    assert.equal(erased, 1);
    assert.equal(c.history.entries[0].text, 'keep during this session');
    c.settings.get_boolean = key => key !== 'clear-on-shutdown';
    c._settingsChanged('clear-on-shutdown');
    assert.equal(c.store.persist, true);
});

test('live language updates preserve recents and reject an older catalog read', async () => {
    const {c} = await controller();
    const pending = [];
    let language = 'es';
    c._emojiRecords = JSON.parse(readFileSync('extension/data/emoji.json', 'utf8')).emoji;
    c.emoji.setRecent(['😀']);
    c.settings.get_string = () => language;
    let refreshes = 0;
    c.popup.retranslate = () => refreshes++;
    const directory = (parts = []) => ({
        get_path: () => '/test/language-race',
        get_child: name => directory([...parts, name]),
        load_contents: () => [true, new Uint8Array(readFileSync(`extension/${parts.join('/')}`))],
        load_contents_async(cancel, callback) { pending.push(() => callback(this, null)); },
        load_contents_finish: () => [true, new Uint8Array(readFileSync(`extension/${parts.join('/')}`))],
    });
    c.dir = directory();
    const spanish = c._updateLanguage();
    language = 'ja';
    const japanese = c._updateLanguage();
    pending[1]();
    await japanese;
    const name = c.emoji.byText.get('😀').name;
    assert.equal(name, JSON.parse(readFileSync('extension/data/emoji-locales/ja.json', 'utf8')).annotations['😀'].name);
    pending[0]();
    await spanish;
    assert.equal(c.emoji.byText.get('😀').name, name);
    assert.deepEqual(Array.from(c.emoji.recent), ['😀']);
    assert.equal(refreshes, 1);
    language = 'fr';
    const disabled = c._updateLanguage();
    c._active = false;
    c.settings = null;
    pending[2]();
    await disabled;
    assert.equal(refreshes, 1);
});
test('emoji retains prior text in memory and supports guarded explicit restore', async () => {
    const {c, writes} = await controller();
    await c.select({text: '😀'}, true);
    assert.equal(c.pendingRestore.previous, 'old');
    assert.deepEqual(writes, ['😀']);
    assert.equal(c.history.entries.length, 0);
    c.clipboard.readText = async () => '😀';
    await c.restoreClipboard();
    assert.deepEqual(writes, ['😀', 'old']);
    assert.equal(c.pendingRestore, null);
});
test('restore never overwrites a newer clipboard', async () => {
    const {c, writes} = await controller();
    c.pendingRestore = {previous: 'old', emoji: '😀'};
    c.clipboard.readText = async () => 'new';
    await c.restoreClipboard();
    assert.deepEqual(writes, []);
});
test('clipboard changes during emoji snapshot abort insertion', async () => {
    const {c, writes, pastes} = await controller();
    c.clipboard.readText = async () => { c.clipboard.generation++; return 'old'; };
    await c.select({text: '😀'}, true);
    assert.deepEqual(writes, []);
    assert.deepEqual(pastes, []);
});
test('reopening panel while emoji read waits aborts stale selection', async () => {
    const {c, writes} = await controller();
    c.clipboard.readText = async () => { c._selectionEpoch++; return 'old'; };
    await c.select({text: '😀'}, true);
    assert.deepEqual(writes, []);
});
test('disable during emoji snapshot aborts insertion', async () => {
    const {c, writes} = await controller();
    c.clipboard.readText = async () => { c._active = false; return 'old'; };
    await c.select({text: '😀'}, true);
    assert.deepEqual(writes, []);
});
test('history choice promotes selected entry and clears old restoration', async () => {
    const {c, writes, pastes} = await controller();
    c.history.add('A');
    c.history.add('B');
    c.pendingRestore = {previous: 'old', emoji: '😀'};
    await c.select(c.history.entries[1], false);
    assert.equal(c.history.entries[0].text, 'A');
    assert.equal(c.pendingRestore, null);
    assert.deepEqual(writes, ['A']);
    assert.equal(pastes[0], c._target);
});
test('symbol and kaomoji insertion preserves prior text without adding clipboard history', async () => {
    const {c, writes} = await controller();
    await c.select({text: '±'}, true);
    assert.deepEqual(writes, ['±']);
    assert.equal(c.pendingRestore.previous, 'old');
    assert.equal(c.emoji.recent.length, 0);
    assert.equal(c.history.entries.length, 0);
});
test('GIF selection copies binary data and uses the original paste target', async () => {
    const {c, writes, pastes} = await controller();
    c.pendingRestore = {previous: 'old', emoji: '😀'};
    await c.selectGif({path: '/tmp/wave.gif'});
    assert.deepEqual(writes, [new Uint8Array([1, 2, 3])]);
    assert.deepEqual(pastes, [c._target]);
    assert.equal(c.pendingRestore, null);
    assert.equal(c.history.entries.length, 0);
});
for (const change of ['clipboard', 'panel', 'disable']) {
    test(`GIF selection aborts when ${change} changes during its asynchronous read`, async () => {
        const {c, writes, pastes} = await controller();
        c.gifs.read = async () => {
            if (change === 'clipboard')
                c.clipboard.generation++;
            else if (change === 'panel')
                c._selectionEpoch++;
            else
                c._active = false;
            return new Uint8Array([1, 2, 3]);
        };
        await c.selectGif({path: '/tmp/wave.gif'});
        assert.deepEqual(writes, []);
        assert.deepEqual(pastes, []);
    });
}
test('unreadable GIF leaves the clipboard and paste target untouched', async () => {
    const {c, writes, pastes} = await controller();
    c.gifs.read = async () => { throw new Error('Missing file'); };
    await c.selectGif({path: '/tmp/missing.gif'});
    assert.deepEqual(writes, []);
    assert.deepEqual(pastes, []);
});

for (const outcome of ['capture', 'cancel', 'disabled setting', 'clear', 'lock']) {
    test(`manual area editor respects ${outcome}`, async () => {
        const {c, main, tick, editors, writes} = await controller();
        c.takeScreenshot(); await settle(); tick();
        if (outcome === 'disabled setting') c.settings.get_boolean = key => key !== 'edit-after-screenshot';
        main.selectors[0].finish(outcome === 'cancel' ? null : {x: 5, y: 7, width: 64, height: 48});
        if (outcome === 'clear') c.clear(true);
        if (outcome === 'lock') { main.sessionMode.isLocked = true; c._cancelScreenshot(); }
        await settle(); tick(); await settle();
        assert.equal(editors.length, outcome === 'capture' ? 1 : 0);
        assert.equal(!!main.overviewHidden, outcome === 'capture');
        assert.equal(writes.length, ['capture', 'disabled setting'].includes(outcome) ? 1 : 0);
        if (outcome === 'capture') assert.deepEqual(main.area, [5, 7, 64, 48]);
    });
}
test('clear during native capture prevents clipboard and editor writes', async () => {
    const {c, main, tick, editors, writes} = await controller();
    let resolve;
    main.capturePromise = new Promise(done => { resolve = done; });
    c.takeScreenshot(); await settle(); tick();
    main.selectors[0].finish({x: 0, y: 0, width: 64, height: 48});
    await settle(); tick(); await settle();
    c.clear(true); resolve(); await settle();
    assert.equal(editors.length, 0); assert.equal(writes.length, 0);
});
test('editing a history image opens its original without pasting or replacing it', async () => {
    const {c, editors, writes, pastes} = await controller();
    const entry = c.history.addImage({kind: 'image', mime: 'image/png', digest: 'a'.repeat(64),
        bytes: pngBytes.length, width: 64, height: 48});
    c.images = {get: () => ({bytes: pngBytes})};
    c.editImage(entry);
    assert.deepEqual(editors, [{bytes: pngBytes, mime: 'image/png'}]);
    assert.deepEqual(writes, []); assert.deepEqual(pastes, []);
    assert.equal(c.history.entries[0], entry);
});

test('every capture has a new selector and cancelled selection cannot adopt later Print Screen', async () => {
    const {c, main, tick, editors} = await controller();
    c.takeScreenshot(); await settle(); tick(); const first = main.selectors[0];
    c.takeScreenshot(); await settle(); tick(); const second = main.selectors[1];
    assert.notEqual(first, second);
    first.finish({x: 0, y: 0, width: 64, height: 48});
    second.finish(null); await settle(); tick(); await settle();
    main.screenshotUI.emit('screenshot-taken');
    assert.equal(editors.length, 0);
});
test('an oversized selection is rejected before allocating its capture', async () => {
    const {c, main, tick, writes} = await controller();
    c.takeScreenshot(); await settle(); tick(); main.selectors[0].finish({x: 0, y: 0, width: 8192, height: 8192});
    await settle(); tick(); await settle();
    assert.equal(main.area, undefined); assert.equal(writes.length, 0);
});

test('a changed desktop is cropped from the original frozen texture at native scale', async () => {
    const {c, main, writes} = await controller();
    main.scale = 2;
    c.takeScreenshot(); await settle();
    const selector = main.selectors[0];
    main.content = {get_texture() { throw new Error('Live desktop must not be captured'); }};
    selector.finish({x: 5, y: 7, width: 64, height: 48}); await settle();
    assert.equal(main.composite[0], main.texture);
    assert.deepEqual(main.area, [10, 14, 128, 96]);
    assert.equal(main.composite[5], 1);
    assert.equal(selector.content, null);
    assert.equal(writes.length, 1);
});
test('clear while a snapshot is pending prevents a frozen selector from appearing', async () => {
    const {c, main, writes} = await controller();
    let finish; main.freezePromise = new Promise(resolve => { finish = resolve; });
    c.takeScreenshot(); c.clear(true); finish(); await settle();
    assert.equal(main.opened, undefined); assert.equal(writes.length, 0);
});
