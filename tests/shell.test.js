// SPDX-License-Identifier: GPL-3.0-or-later
// Run only inside GNOME Shell's headless automation session, never under Node.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Pango from 'gi://Pango';
import {bindtextdomain} from 'gettext';
import {gettext as _, initTranslations} from '../extension/translations.js';
import {annotationLocale, emojiLocale} from '../extension/core/localization.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {SuperVPopup} from '../extension/popup.js';
import {EmojiIndex} from '../extension/core/emoji.js';
import {History} from '../extension/core/history.js';
import {GifLibrary} from '../extension/gifs.js';
import {ImageLibrary} from '../extension/images.js';
import {getDefaultSeat} from '../extension/shell-compat.js';
import SuperVExtension from '../extension/extension.js';
import {EditorBridge} from '../extension/editor-bridge.js';
import {placeNearPointer} from '../extension/core/placement.js';

export const METRICS = {};
export function init() {
    print('SHELL TEST INITIALIZED');
    const background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    background.set_string('picture-options', 'none');
    // GNOME 50 can finish startup while awaiting the automation module import,
    // before main.js connects its startup-complete handler. Resume the official
    // scripting runner only when that signal has already happened.
    if (!Main.layoutManager._startingUp) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            print('SHELL TEST: startup already complete; starting automation');
            Scripting.runPerfScript({run, METRICS}, GLib.getenv('SHELL_PERF_OUTPUT'));
            return GLib.SOURCE_REMOVE;
        });
    }
    new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}).set_boolean('enable-animations', false);
    // Match first-install setup in this memory-backed, isolated session.
    new Gio.Settings({schema_id: 'org.gnome.shell.keybindings'}).set_strv('toggle-message-tray', ['<Super>m']);
}

function check(name, condition) {
    if (!condition)
        throw new Error(name);
    print(`SHELL PASS: ${name}`);
}

function rectangle(actor) {
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    return {x, y, width, height};
}

export async function run() {
    await Scripting.sleep(300);
    Main.overview.hide();
    // Shell changes its working directory at startup; resolve from this module.
    const base = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
    bindtextdomain('super-v-ubuntu', `${base}/extension/locale`);
    initTranslations(Gio.File.new_for_path(`${base}/extension`));
    const locale = emojiLocale(GLib.get_language_names());
    const annotations = locale === 'en' ? {} : JSON.parse(new TextDecoder().decode(
        Gio.File.new_for_path(`${base}/extension/data/emoji-locales/${locale}.json`).load_contents(null)[1])).annotations;
    const read = path => new TextDecoder().decode(Gio.File.new_for_path(`${base}/${path}`).load_contents(null)[1]);
    const schemaSource = Gio.SettingsSchemaSource.new_from_directory(`${base}/extension/schemas`,
        Gio.SettingsSchemaSource.get_default(), false);
    const settings = new Gio.Settings({settings_schema: schemaSource.lookup(
        'org.gnome.shell.extensions.super-v-ubuntu', true)});
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    const stylesheet = Gio.File.new_for_path(`${base}/extension/stylesheet.css`);
    theme.load_stylesheet(stylesheet);
    const waitFor = async condition => {
        for (let count = 0; count < 60; count++) {
            if (condition())
                return;
            await Scripting.sleep(50);
        }
        throw new Error('Native clipboard/screenshot wait timed out');
    };
    const calls = [];
    const controller = {settings, metadata: JSON.parse(read('extension/metadata.json')),
        history: new History(), emoji: new EmojiIndex(JSON.parse(read('extension/data/emoji.json')).emoji, [], annotations),
        gifs: new GifLibrary(settings), images: new ImageLibrary(), select: entry => calls.push(entry.text),
        selectGif() {}, editImage() {}, takeScreenshot() {}, pin() {}, deleteEntry() {}, clear() {}, restoreClipboard() {}, openPreferences() {}};
    controller.dir = Gio.File.new_for_path(`${base}/extension`);
    controller._active = true;
    controller._epoch = 1;
    controller._languageRevision = 0;
    controller._emojiRecords = JSON.parse(read('extension/data/emoji.json')).emoji;
    controller._stateCancellable = new Gio.Cancellable();
    // Exercise actual GTK/libadwaita preferences in this private Wayland session.
    const launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.STDERR_PIPE});
    launcher.setenv('GI_TYPELIB_PATH', `/usr/lib/gnome-shell/girepository-1.0:/usr/lib/gnome-shell:${GLib.getenv('GI_TYPELIB_PATH') ?? ''}`, true);
    launcher.setenv('LD_LIBRARY_PATH', `/usr/lib/gnome-shell:${GLib.getenv('LD_LIBRARY_PATH') ?? ''}`, true);
    const preferences = launcher.spawnv(['gjs', '-m', `${base}/tests/prefs-gjs.js`]);
    const output = await new Promise((resolve, reject) => {
        preferences.communicate_utf8_async(null, null, (process, result) => {
            try { resolve(process.communicate_utf8_finish(result)); } catch (error) { reject(error); }
        });
    });
    if (!preferences.get_successful())
        throw new Error(`Preferences check failed: ${output[2]}`);
    check('actual localized GTK preferences render', preferences.get_successful());
    const pointer = getDefaultSeat(global.stage, Clutter).create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    // Headless Mutter has no physical keyboard. Advertise one before clients
    // create their Wayland seat, as a normal desktop would already have.
    const keyboard = getDefaultSeat(global.stage, Clutter).create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), 900, 650);
    await Scripting.sleep(100);
    const editorDriver = launcher.spawnv(['gjs', '-m', `${base}/tests/editor-gjs.js`]);
    const editorPending = new Promise((resolve, reject) => {
        editorDriver.communicate_utf8_async(null, null, (process, result) => {
            try { resolve(process.communicate_utf8_finish(result)); } catch (error) { reject(error); }
        });
    });
    const probe = Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/text-probe.json`);
    await waitFor(() => probe.query_exists(null));
    const target = global.get_window_actors().find(actor => actor.meta_window.get_title() === _('Screenshot editor')).meta_window;
    if (GLib.getenv('SUPER_V_TEST_OVERVIEW_RACE') === '1') {
        Main.overview.show(); await Scripting.sleep(200);
    }
    print(`TEXT TEST BEFORE FOCUS: overview=${Main.overview.visible}, focus=${global.display.focus_window?.get_title()}`);
    Main.activateWindow(target);
    await waitFor(() => !Main.overview.visible && global.display.focus_window === target);
    await Scripting.sleep(100);
    const type = async keys => {
        for (const key of keys) {
            keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
            keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
            await Scripting.sleep(30);
        }
    };
    await type([Clutter.KEY_a, Clutter.KEY_b, Clutter.KEY_c]);
    const point = JSON.parse(new TextDecoder().decode(probe.load_contents(null)[1]));
    const frame = target.get_frame_rect();
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), frame.x + point.x, frame.y + point.y);
    await Scripting.sleep(80);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(100); await type([Clutter.KEY_d]);
    const textPreview = GLib.getenv('SUPER_V_TEXT_SCREENSHOT');
    if (textPreview && locale === 'en') {
        const stream = Gio.File.new_for_path(textPreview).replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
        await new Shell.Screenshot().screenshot_area(frame.x, frame.y, frame.width, frame.height, stream);
        stream.close(null);
    }
    Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/text-probe-done`).replace_contents('done', null, false,
        Gio.FileCreateFlags.PRIVATE, null);
    for (const action of ['click', 'drag']) {
        const request = Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/ocr-${action}-probe.json`);
        await waitFor(() => request.query_exists(null));
        const dialog = global.get_window_actors().find(actor => actor.meta_window.get_title() === _('Copy text from image')).meta_window;
        Main.activateWindow(dialog);
        await waitFor(() => global.display.focus_window === dialog);
        const frame = dialog.get_frame_rect();
        const {start, end} = JSON.parse(new TextDecoder().decode(request.load_contents(null)[1]));
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), frame.x + start[0], frame.y + start[1]);
        await Scripting.sleep(80);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(80);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), frame.x + end[0], frame.y + end[1]);
        await Scripting.sleep(80);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(100);
        const screenshot = GLib.getenv('SUPER_V_OCR_SCREENSHOT');
        if (screenshot && action === 'drag' && locale === 'en') {
            const stream = Gio.File.new_for_path(screenshot).replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
            await new Shell.Screenshot().screenshot_area(frame.x, frame.y, frame.width, frame.height, stream);
            stream.close(null);
        }
        Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/ocr-${action}-done`).replace_contents('done', null, false,
            Gio.FileCreateFlags.PRIVATE, null);
    }
    const editorOutput = await editorPending;
    if (!editorDriver.get_successful())
        throw new Error(`Editor check failed: ${editorOutput[2]}`);
    check('actual localized GTK screenshot editor draws and exports images', editorDriver.get_successful());
    const popup = new SuperVPopup(controller);
    controller.popup = popup;
    try {
        check('popup opens', popup.showPanel());
        await waitFor(() => popup._panel.opacity === 255);
        check('initial clipboard panel is visible after layout', popup._panel.opacity === 255);
        for (let reopen = 0; reopen < 3; reopen++) {
            popup.close();
            check('unchanged clipboard popup reopens', popup.showPanel());
            await waitFor(() => popup._panel.opacity === 255);
        }
        check('unchanged clipboard panel becomes visible on every reopen', popup._panel.opacity === 255);
        popup._setTab('emoji');
        await Scripting.sleep(300);
        check('loaded version is visible', popup._title.text === 'ClipNacre 0.1.16');
        check('six equally sized emoji per row', popup._rows.length === 60 &&
            popup.list.get_first_child().get_n_children() === 6);
        const cells = popup._rows.slice(0, 7).map(rectangle);
        print(`SHELL CELLS: ${JSON.stringify(cells)}`);
        check('real St layout places six glyphs horizontally', cells.slice(0, 6).every(cell =>
            Math.abs(cell.y - cells[0].y) < 1 && Math.abs(cell.width - cells[0].width) <= 1.01) &&
            cells[5].x > cells[0].x && cells[6].y > cells[0].y);
        check('localized settings button uses the gettext catalog',
            popup.contentLayout.get_first_child().get_last_child().label === {
                en: 'Settings', zh: '设置', zh_Hant: '設定', ja: '設定',
                es: 'Ajustes', fr: 'Paramètres', ko: '설정',
            }[locale]);
        check('localized emoji names reach accessible labels', popup._rows[0].accessible_name === controller.emoji.records[0].name);
        check('emoji labels contain only glyphs', popup._rows.every((row, index) =>
            row.get_child().text === popup.results[index].text));
        const area = Main.layoutManager.getWorkAreaForMonitor(popup._monitor.index);
        const rect = rectangle(popup._panel);
        print(`SHELL GEOMETRY: ${JSON.stringify({area: {x: area.x, y: area.y,
            width: area.width, height: area.height}, pointer: popup._anchor, panel: rect,
            translation: [popup._panel.translation_x, popup._panel.translation_y]})}`);
        check('near-pointer panel stays within its work area', rect.x >= area.x && rect.y >= area.y &&
            rect.x + rect.width <= area.x + area.width + 1 && rect.y + rect.height <= area.y + area.height + 1);
        if (GLib.getenv('SUPER_V_TEST_PLACEMENT') === '1') {
            for (const anchor of [[2, 2], [global.stage.width - 2, global.stage.height - 2],
                [800, global.stage.height - 20], [300, 100]]) {
                popup.close();
                pointer.notify_absolute_motion(GLib.get_monotonic_time(), ...anchor);
                await Scripting.sleep(100);
                popup.showPanel();
                for (const tab of ['clipboard', 'emoji', 'kaomoji', 'symbols', 'gifs']) {
                    popup._setTab(tab);
                    await Scripting.sleep(100);
                    const current = rectangle(popup._panel);
                    const expected = placeNearPointer(popup._anchor, area, [current.width, current.height], 12);
                    check(`reopened ${tab} follows its new anchor at ${anchor}`,
                        Math.abs(current.x - expected.x) < 2 && Math.abs(current.y - expected.y) < 2);
                    check(`reopened ${tab} stays in its work area at ${anchor}`,
                        current.x >= area.x && current.y >= area.y && current.x + current.width <= area.x + area.width + 1 &&
                        current.y + current.height <= area.y + area.height + 1);
                }
            }
            popup._setTab('emoji');
        }
        // Exercise a long translated category and both visible clipboard footer buttons.
        popup.group = 'Animals & Nature';
        popup.refresh();
        await Scripting.sleep(100);
        check('category translation keeps the Unicode filter ID', popup.group === 'Animals & Nature' &&
            popup._categoryButtons.get(popup.group).accessible_name === _('Animals & Nature'));
        const categoryCells = [...popup._categoryButtons.values()].map(rectangle);
        check('all emoji category buttons occupy one horizontal row', categoryCells.every(cell =>
            Math.abs(cell.y - categoryCells[0].y) < 1));
        const adjustment = popup._categoryScroll.get_hadjustment();
        popup._categoryForward.emit('clicked', 1);
        await Scripting.sleep(100);
        check('overflow categories can scroll horizontally', adjustment.value > 0);
        const flags = popup._categoryButtons.get('Flags');
        flags.grab_key_focus();
        await Scripting.sleep(100);
        const flagsRect = rectangle(flags);
        const viewport = rectangle(popup._categoryScroll);
        check('keyboard focus brings the final category into view', flagsRect.x >= viewport.x - 1 &&
            flagsRect.x + flagsRect.width <= viewport.x + viewport.width + 1);
        flags.emit('clicked', 1);
        await Scripting.sleep(100);
        check('direct category click filters emoji', popup.group === 'Flags' &&
            popup.results.every(record => record.group === 'Flags'));
        popup._setGroup('People & Body');
        popup._toneButton.emit('clicked', 1);
        await Scripting.sleep(100);
        check('skin tone dropdown opens', popup._toneMenu.isOpen);
        const darkTone = rectangle(popup._toneItems.get('dark'));
        pointer.notify_absolute_motion(GLib.get_monotonic_time(),
            darkTone.x + darkTone.width / 2, darkTone.y + darkTone.height / 2);
        await Scripting.sleep(80);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(100);
        check('skin tone menu selects directly', popup.tone === 'dark' &&
            popup._toneButton.accessible_name.includes(_('Dark')) &&
            popup.state === ModalDialog.State.OPENED && !popup._toneMenu.isOpen);
        popup.tone = 'all';
        popup._toneMenu.close();
        // Switch every language in the same Shell process, independent of its locale.
        controller.emoji.setRecent(['😀']);
        for (const language of ['en', 'zh_CN', 'zh_TW', 'ja', 'es', 'fr', 'ko']) {
            settings.set_string('ui-language', language);
            await SuperVExtension.prototype._updateLanguage.call(controller);
            await Scripting.sleep(60);
            check(`live popup language ${language}`, popup._settingsButton.label === {
                en: 'Settings', zh_CN: '设置', zh_TW: '設定', ja: '設定',
                es: 'Ajustes', fr: 'Paramètres', ko: '설정',
            }[language]);
            const faceName = language === 'en' ? controller._emojiRecords[0].name
                : JSON.parse(read(`extension/data/emoji-locales/${annotationLocale(language)}.json`)).annotations['😀'].name;
            check(`live emoji catalog ${language}`, controller.emoji.byText.get('😀').name === faceName &&
                controller.emoji.search('grinning face').some(record => record.text === '😀') &&
                controller.emoji.recent[0] === '😀');
        }
        settings.set_string('ui-language', 'system');
        await SuperVExtension.prototype._updateLanguage.call(controller);
        // A narrow content area and larger inherited text must retain a
        // single category row and keep its focused final button reachable.
        const context = St.ThemeContext.get_for_stage(global.stage);
        const originalFont = context.get_font();
        const fontAllocation = new Promise(resolve => {
            const signal = popup._panel.connect('notify::allocation', () => {
                popup._panel.disconnect(signal);
                resolve();
            });
        });
        context.set_font(Pango.FontDescription.from_string('Sans 16'));
        popup._panel.set_style('width: 270px;');
        popup._emojiColumns = 4;
        popup.refresh();
        await fontAllocation;
        await waitFor(() => {
            const bounds = rectangle(popup._panel);
            return bounds.x >= area.x && bounds.y >= area.y &&
                bounds.x + bounds.width <= area.x + area.width + 1 &&
                bounds.y + bounds.height <= area.y + area.height + 1 && popup._panel.opacity === 255;
        });
        const largeTextPanel = rectangle(popup._panel);
        check('larger text still fits the full panel in the work area',
            largeTextPanel.x >= area.x && largeTextPanel.y >= area.y &&
            largeTextPanel.x + largeTextPanel.width <= area.x + area.width + 1 &&
            largeTextPanel.y + largeTextPanel.height <= area.y + area.height + 1);
        const narrowCategories = [...popup._categoryButtons.values()].map(rectangle);
        check('larger text and narrow layout retain one category row', narrowCategories.every(cell =>
            Math.abs(cell.y - narrowCategories[0].y) < 1));
        popup._categoryButtons.get('Flags').grab_key_focus();
        await Scripting.sleep(100);
        const narrowFlag = rectangle(popup._categoryButtons.get('Flags'));
        const narrowViewport = rectangle(popup._categoryScroll);
        check('narrow category bar can reveal the final button', narrowFlag.x >= narrowViewport.x - 1 &&
            narrowFlag.x + narrowFlag.width <= narrowViewport.x + narrowViewport.width + 1);
        context.set_font(originalFont);
        popup._panel.set_style('width: 390px;');
        popup._emojiColumns = 6;
        popup.refresh();
        controller.pendingRestore = {previous: 'sample', emoji: '😀'};
        popup._setTab('clipboard');
        await Scripting.sleep(100);
        const clipboardPanel = rectangle(popup._panel);
        for (const control of [popup._clear, popup._restore]) {
            const bounds = rectangle(control);
            check('translated footer stays inside panel', bounds.x >= clipboardPanel.x &&
                bounds.x + bounds.width <= clipboardPanel.x + clipboardPanel.width + 1);
        }
        controller.pendingRestore = null;
        popup._setTab('kaomoji');
        await Scripting.sleep(100);
        check('kaomoji has three columns', popup.list.get_first_child().get_n_children() === 3);
        const kaomojiCategories = [...popup._categoryButtons.values()].map(rectangle);
        check('kaomoji categories stay on one row', kaomojiCategories.every(cell =>
            Math.abs(cell.y - kaomojiCategories[0].y) < 1));
        popup._setTab('symbols');
        popup.search.set_text('plus minus');
        await Scripting.sleep(100);
        check('symbols search renders plus-minus glyph', popup._rows[0].get_child().text === '±');
        popup._activate(0);
        check('symbol activation selects its text', calls[0] === '±');
        popup._setTab('gifs');
        check('GIF empty state offers settings', popup._manageGifs.visible && popup._rows.length === 0);
        settings.set_string('popup-position', 'center');
        popup.positionPanel();
        await waitFor(() => {
            const bounds = rectangle(popup._panel);
            return popup._panel.opacity === 255 &&
                Math.abs(bounds.x + bounds.width / 2 - area.x - area.width / 2) < 2 &&
                Math.abs(bounds.y + bounds.height / 2 - area.y - area.height / 2) < 2;
        });
        const center = rectangle(popup._panel);
        check('center setting uses the usable work area',
            Math.abs(center.x + center.width / 2 - area.x - area.width / 2) < 2 &&
            Math.abs(center.y + center.height / 2 - area.y - area.height / 2) < 2);
        const title = rectangle(popup._title);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), title.x + 30, title.y + title.height / 2);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(50);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), title.x + 170, title.y + title.height / 2 + 10);
        await Scripting.sleep(100);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(50);
        const moved = rectangle(popup._panel);
        check('physical title drag moves the popup and releases on mouse up',
            moved.x > center.x + 100 && !popup._drag && popup.state === ModalDialog.State.OPENED);
        const movedTitle = rectangle(popup._title);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), movedTitle.x + 30, movedTitle.y + movedTitle.height / 2);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(50);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), 0, 0);
        await Scripting.sleep(100);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(50);
        const clamped = rectangle(popup._panel);
        check('dragging toward the screen edge keeps the title and full popup visible',
            clamped.x >= area.x && clamped.y >= area.y &&
            clamped.x + clamped.width <= area.x + area.width + 1 &&
            clamped.y + clamped.height <= area.y + area.height + 1 && !popup._drag);
        const tabBounds = rectangle(popup._emojiTab);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), tabBounds.x + tabBounds.width / 2, tabBounds.y + tabBounds.height / 2);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(100);
        check('tab buttons still respond after dragging the popup', popup.tab === 'emoji' && !popup._drag);
        popup.close();
        popup.showPanel();
        await Scripting.sleep(100);
        check('reopening resets the drag position', !popup._manualPosition &&
            Math.abs(rectangle(popup._panel).x + rectangle(popup._panel).width / 2 - area.x - area.width / 2) < 2);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), center.x + 80, center.y + 72);
        await Scripting.sleep(100);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(100);
        check('actual inside mouse click keeps the modal open', popup.state === ModalDialog.State.OPENED);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), 5, 100);
        await Scripting.sleep(100);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(150);
        check('actual outside mouse click closes the modal', popup.state === ModalDialog.State.CLOSED);
        const screenshot = GLib.getenv('SUPER_V_SCREENSHOT');
        if (screenshot) {
            popup.showPanel();
            popup._setTab('emoji');
            await Scripting.sleep(200);
            const frame = rectangle(popup._panel);
            const output = Gio.File.new_for_path(screenshot).replace(null, false,
                Gio.FileCreateFlags.PRIVATE, null);
            await new Shell.Screenshot().screenshot_area(Math.floor(frame.x), Math.floor(frame.y),
                Math.ceil(frame.width), Math.ceil(frame.height), output);
            output.close(null);
        }
        popup.showPanel();
        await Scripting.sleep(100);
        const settingsButton = rectangle(popup._settingsButton);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), settingsButton.x + settingsButton.width / 2,
            settingsButton.y + settingsButton.height / 2);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(100);
        check('physical Settings click activates without starting a title drag',
            popup.state === ModalDialog.State.CLOSED && !popup._drag);
    } finally {
        popup.destroy();
    }
    const metadata = {...controller.metadata, dir: controller.dir, path: controller.dir.get_path()};
    const extension = new SuperVExtension(metadata);
    try {
        extension.enable();
        await waitFor(() => extension._ready);
        check('real extension registers both shortcuts', extension._binding && extension._screenshotBinding);
        // Exercise real key events: calling takeScreenshot() directly would miss
        // a binding that GNOME filters out while Show Applications is open.
        const beforeOverviewAutoEdit = extension.settings.get_boolean('edit-after-screenshot');
        extension.settings.set_boolean('edit-after-screenshot', false);
        for (const view of ['windows', 'applications', 'search']) {
            if (view === 'applications') Main.overview.showApps();
            else Main.overview.show();
            await waitFor(() => Main.overview.visible && Main.actionMode === Shell.ActionMode.OVERVIEW);
            if (view === 'search') {
                Main.overview.searchEntry.set_text('settings');
                await Scripting.sleep(150);
            }
            const count = extension.history.entries.length;
            const accelerator = view === 'search'
                ? [Clutter.KEY_Control_L, Clutter.KEY_Shift_L, Clutter.KEY_F12]
                : [Clutter.KEY_Super_L, Clutter.KEY_Shift_L, Clutter.KEY_s];
            if (view === 'search')
                extension.settings.set_strv('take-screenshot', ['<Control><Shift>F12']);
            // Mutter rebuilds accelerator grabs after the settings notification.
            await Scripting.sleep(100);
            for (const key of accelerator)
                keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
            for (const key of [...accelerator].reverse())
                keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
            await waitFor(() => extension._areaCapture?.visible);
            check(`actual screenshot shortcut opens over ${view} overview`,
                Main.overview.visible && !!extension._areaCapture.get_content());
            if (view === 'applications') {
                // Make the live scene change after freezing it. Export must use
                // the frozen application grid rather than the desktop behind it.
                const texture = extension._areaCapture.get_content().get_texture();
                const reference = Gio.MemoryOutputStream.new_resizable();
                await Shell.Screenshot.composite_to_stream(texture, 200, 200, 31, 21,
                    1, null, 0, 0, 1, reference);
                reference.close(null);
                const expected = reference.steal_as_bytes().get_data();
                Main.overview.hide();
                await Scripting.sleep(100);
                pointer.notify_absolute_motion(GLib.get_monotonic_time(), 200, 200);
                await Scripting.sleep(50);
                pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
                await Scripting.sleep(50);
                pointer.notify_absolute_motion(GLib.get_monotonic_time(), 230, 220);
                await Scripting.sleep(50);
                pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
                await waitFor(() => !extension._areaCapture && extension.history.entries.length > count);
                const captured = (await extension.clipboard.readImage())?.bytes;
                const pixels = bytes => {
                    const loader = GdkPixbuf.PixbufLoader.new_with_mime_type('image/png');
                    loader.write(bytes); loader.close();
                    const image = loader.get_pixbuf();
                    check('overview capture retains the selected dimensions',
                        image.get_width() === 31 && image.get_height() === 21);
                    // PNG encoders may attach a different creation timestamp.
                    // Row padding is not image data and may be uninitialized.
                    const data = image.get_pixels(), result = [];
                    const stride = image.get_rowstride(), rowBytes = 31 * image.get_n_channels();
                    for (let row = 0; row < 21; row++)
                        result.push(...data.slice(row * stride, row * stride + rowBytes));
                    return result;
                };
                const actualPixels = pixels(captured), expectedPixels = pixels(expected);
                check('application grid capture exports the frozen PNG pixels',
                    actualPixels.length === expectedPixels.length &&
                    actualPixels.every((byte, i) => byte === expectedPixels[i]));
                extension.deleteEntry(extension.history.entries[0].id);
            } else {
                keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
                keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
                await waitFor(() => !extension._areaCapture);
                check(`cancelling capture preserves ${view} overview and history`,
                    Main.overview.visible && extension.history.entries.length === count);
            }
            extension.settings.reset('take-screenshot');
            Main.overview.hide();
            await waitFor(() => !Main.overview.visible && Main.actionMode === Shell.ActionMode.NORMAL);
        }
        extension.settings.set_boolean('edit-after-screenshot', beforeOverviewAutoEdit);
        Main.overview.showApps();
        await waitFor(() => Main.overview.visible && Main.actionMode === Shell.ActionMode.OVERVIEW);
        await Scripting.sleep(100);
        for (const key of [Clutter.KEY_Super_L, Clutter.KEY_Shift_L, Clutter.KEY_s])
            keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
        for (const key of [Clutter.KEY_s, Clutter.KEY_Shift_L, Clutter.KEY_Super_L])
            keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
        await waitFor(() => extension._areaCapture?.visible);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), 240, 240);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(50);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), 280, 270);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await waitFor(() => !Main.overview.visible && global.get_window_actors().some(actor =>
            actor.meta_window.get_title() === _('Screenshot editor')));
        check('completed application grid capture presents the automatic editor', !!extension.editor.child);
        extension.editor.close();
        await waitFor(() => !global.get_window_actors().some(actor =>
            actor.meta_window.get_title() === _('Screenshot editor')));
        extension.deleteEntry(extension.history.entries[0].id);
        const fixtures = JSON.parse(read('tests/fixtures/images.json'));
        const clipboard = St.Clipboard.get_default();
        for (const [format, mime] of [['png', 'image/png'], ['jpeg', 'image/jpeg']]) {
            clipboard.set_content(St.ClipboardType.CLIPBOARD, mime, new GLib.Bytes(GLib.base64_decode(fixtures[format])));
            await waitFor(() => extension.history.entries.some(entry => entry.mime === mime));
            check(`Mutter ${format} image capture preserves dimensions`,
                extension.history.entries.find(entry => entry.mime === mime).width === 64);
            const receiverLauncher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE});
            const receiver = receiverLauncher.spawnv(['gjs', '-m', `${base}/tests/image-receiver-gjs.js`]);
            await waitFor(() => global.get_window_actors().some(actor => actor.meta_window.get_title() === 'ClipNacre image receiver'));
            const destination = global.get_window_actors().find(actor => actor.meta_window.get_title() === 'ClipNacre image receiver').meta_window;
            destination.activate(global.get_current_time());
            await Scripting.sleep(150);
            const inputFrame = destination.get_frame_rect();
            const inputPoint = [inputFrame.x + 40, inputFrame.y + inputFrame.height - 40];
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), ...inputPoint);
            await Scripting.sleep(50);
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
            await Scripting.sleep(50);
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
            await Scripting.sleep(50);
            check('native application click is remembered for its window', extension.popup._clickAnchor?.window === destination);
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), global.stage.width - 2, 100);
            await Scripting.sleep(50);
            for (const key of [Clutter.KEY_Super_L, Clutter.KEY_v])
                keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
            for (const key of [Clutter.KEY_v, Clutter.KEY_Super_L])
                keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
            await waitFor(() => extension.popup.state === ModalDialog.State.OPENED);
            await Scripting.sleep(100);
            check('actual Super+V retains the focused paste destination', extension._target === destination);
            check('popup follows the last input click after the pointer moves away',
                extension.popup._anchor.every((coordinate, index) => Math.abs(coordinate - inputPoint[index]) < 2));
            const imageEntry = extension.history.entries.find(entry => entry.mime === mime);
            check('clipboard image has a native thumbnail and accessible label',
                extension.popup._rows[0].get_child().get_n_children() === 2 &&
                extension.popup._rows[0].accessible_name.includes('64'));
            check('image dimension caption remains visible in a scrollable row',
                extension.popup._rows[0].get_child().get_last_child().get_height() >= 12 &&
                extension.popup._rows[0].get_child().get_last_child().text.includes('64 × 48'));
            await extension.select(imageEntry, false);
            const received = await new Promise((resolve, reject) => {
                receiver.communicate_utf8_async(null, null, (process, result) => {
                    try { resolve(process.communicate_utf8_finish(result)); } catch (error) { reject(error); }
                });
            });
            if (!receiver.get_successful())
                throw new Error(`Image receiver failed: ${received[2]}`);
            check(`actual ${format} image paste reaches the original GTK window`, received[1].includes('IMAGE PASTE RECEIVED'));
        }
        const clipboardBitmap = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 7, 5);
        clipboardBitmap.fill(0x876543ff);
        for (const [format, offered, stored] of [['jpeg', 'image/png', 'image/jpeg'],
            ['bmp', 'image/x-MS-bmp', 'image/png']]) {
            const bytes = clipboardBitmap.save_to_bufferv(format, [], [])[1];
            clipboard.set_content(St.ClipboardType.CLIPBOARD, offered, new GLib.Bytes(bytes));
            await waitFor(() => extension.history.entries.some(entry => entry.width === 7 && entry.mime === stored));
            const imported = extension.history.entries.find(entry => entry.width === 7 && entry.mime === stored);
            check(`Mutter imports ${format} clipboard pixels advertised as ${offered}`, imported.height === 5);
            extension.deleteEntry(imported.id);
        }
        const copiedFile = Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/copied image.bmp`);
        copiedFile.replace_contents(clipboardBitmap.save_to_bufferv('bmp', [], [])[1], null, false,
            Gio.FileCreateFlags.PRIVATE, null);
        for (const mime of ['text/uri-list', 'x-special/gnome-copied-files']) {
            const uri = `${mime === 'text/uri-list' ? '' : 'copy\n'}${copiedFile.get_uri()}\r\n`;
            clipboard.set_content(St.ClipboardType.CLIPBOARD, mime, new GLib.Bytes(new TextEncoder().encode(uri)));
            await waitFor(() => extension.history.entries.some(entry => entry.width === 7));
            const imported = extension.history.entries.find(entry => entry.width === 7);
            check(`Mutter captures a copied local image through ${mime}`, imported.mime === 'image/png');
            extension.deleteEntry(imported.id);
        }
        copiedFile.delete(null);
        const pinId = extension.screenPins.add(GLib.base64_decode(fixtures.png), 'image/png', 'fixture');
        const pin = extension.screenPins.items.get(pinId);
        await Scripting.sleep(100);
        check('screen pin renders a native image above application windows', pin.image.content && pin.root.visible && pin.root.width >= 240);
        const clickActor = async actor => {
            // Screenshot selection can leave its fading actor above a pin for
            // a frame. Wait until a real pointer click can reach the control.
            await waitFor(() => {
                const bounds = rectangle(actor);
                const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,
                    bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
                return picked && actor.contains(picked);
            });
            const bounds = rectangle(actor);
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            await Scripting.sleep(50);
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
            await Scripting.sleep(50);
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
            await Scripting.sleep(50);
        };
        await clickActor(pin.more);
        check('pin zoom control changes its scale', pin.zoom > 1);
        check('toolbar clicks do not start a pin drag or retain pressed buttons',
            !extension.screenPins.grab && !extension.screenPins.dragSignal && pin.controls.every(control => !control.pressed));
        await clickActor(pin.less);
        check('physical Zoom out click restores the original pin scale', pin.zoom === 1);
        await clickActor(pin.opacityButton);
        check('pin opacity changes the image while keeping controls readable', pin.image.opacity < 255 && pin.root.opacity === 255);
        for (let i = 0; i < 3; i++) await clickActor(pin.opacityButton);
        check('physical opacity clicks cycle back to fully opaque', pin.opacity === 100 && pin.image.opacity === 255);
        extension.screenPins._place(pin, 9999, 9999);
        await Scripting.sleep(50);
        const pinRect = rectangle(pin.root);
        const pinArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        check('pin allocation stays inside the monitor including its border and controls',
            pinRect.x + pinRect.width <= pinArea.x + pinArea.width &&
            pinRect.y + pinRect.height <= pinArea.y + pinArea.height);
        const oldX = pin.root.x, oldY = pin.root.y;
        const imageRect = rectangle(pin.image);
        const dragX = imageRect.x + imageRect.width / 2, dragY = imageRect.y + imageRect.height / 2;
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), dragX, dragY);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(50);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), dragX - 80, dragY - 60);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(50);
        check('physical pointer drag moves a screen pin', pin.root.x !== oldX || pin.root.y !== oldY);
        check('releasing a pin drag releases its input grab', !extension.screenPins.grab && !extension.screenPins.dragSignal);
        await clickActor(pin.copy);
        check('pin Copy preserves original PNG bytes', (await extension.clipboard.readImage())?.mime === 'image/png');
        const previousAutoEdit = extension.settings.get_boolean('edit-after-screenshot');
        extension.settings.set_boolean('edit-after-screenshot', false);
        const beforePinCapture = extension.history.entries.length;
        for (const key of [Clutter.KEY_Super_L, Clutter.KEY_Shift_L, Clutter.KEY_s])
            keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
        for (const key of [Clutter.KEY_s, Clutter.KEY_Shift_L, Clutter.KEY_Super_L])
            keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
        await waitFor(() => extension._areaCapture?.visible);
        check('screenshot shortcut works with a pinned image and focused toolbar',
            !extension._areaCapture._rubberband.visible && extension.screenPins.items.has(pinId));
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), 16, 60);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(50);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), 128, 120);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await waitFor(() => extension.history.entries.length > beforePinCapture && !extension._areaCapture);
        check('a new screenshot finishes while preserving the pinned reference',
            extension.screenPins.items.has(pinId) && (await extension.clipboard.readImage())?.mime === 'image/png');
        extension.settings.set_boolean('edit-after-screenshot', previousAutoEdit);
        await clickActor(pin.close);
        await waitFor(() => !extension.screenPins.items.has(pinId));
        check('physical Close click removes the overlay and releases its budget',
            !extension.screenPins.items.size && !extension.screenPins.budget.items.size && !extension.screenPins.grab);
        const beginPinDrag = async reference => {
            const bounds = rectangle(reference.image);
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            await Scripting.sleep(50);
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
            await waitFor(() => extension.screenPins.grab);
        };
        const pressEscape = () => {
            keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
            keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
        };
        const escapeId = extension.screenPins.add(GLib.base64_decode(fixtures.png), 'image/png');
        await Scripting.sleep(100);
        await beginPinDrag(extension.screenPins.items.get(escapeId));
        pressEscape();
        await waitFor(() => !extension.screenPins.items.has(escapeId));
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        check('Escape during a pin drag removes its overlay and releases input', !extension.screenPins.grab);
        const busyId = extension.screenPins.add(GLib.base64_decode(fixtures.png), 'image/png');
        const busyPin = extension.screenPins.items.get(busyId);
        await Scripting.sleep(100);
        await beginPinDrag(busyPin);
        extension.takeScreenshot();
        await waitFor(() => extension._areaCapture?.visible);
        check('starting capture cancels an in-progress pin drag', !extension.screenPins.grab && !extension.screenPins.dragSignal);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        pressEscape();
        await waitFor(() => !extension._areaCapture);
        await Scripting.sleep(100);
        await clickActor(busyPin.close);
        check('pin Close still responds after cancelling capture during a drag', !extension.screenPins.items.size);
        extension.screenPins.add(GLib.base64_decode(fixtures.png), 'image/png', 'fixture');
        extension.screenPins.removeSource('fixture');
        check('deleting a pin source releases its overlay and budget', !extension.screenPins.items.size && !extension.screenPins.budget.items.size);
        let unexpectedCopy = false;
        const slowBridge = new EditorBridge(Gio.File.new_for_path(`${base}/tests/fixtures/slow-editor`),
            () => { unexpectedCopy = true; }, () => { throw new Error('Slow editor failed'); },
            {onText: () => { unexpectedCopy = true; }});
        try {
            slowBridge.open(GLib.base64_decode(fixtures.png), 'image/png');
            await waitFor(() => global.get_window_actors().some(actor => actor.meta_window.get_title() === _('Screenshot editor')));
            const slowWindow = global.get_window_actors().find(actor => actor.meta_window.get_title() === _('Screenshot editor')).meta_window;
            slowWindow.activate(global.get_current_time());
            await Scripting.sleep(150);
            for (const key of [Clutter.KEY_Control_L, Clutter.KEY_Shift_L, Clutter.KEY_o])
                keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
            for (const key of [Clutter.KEY_o, Clutter.KEY_Shift_L, Clutter.KEY_Control_L])
                keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
            const pidFile = Gio.File.new_for_path(`${GLib.getenv('XDG_STATE_HOME')}/slow-ocr.pid`);
            await waitFor(() => pidFile.query_exists(null));
            const pid = new TextDecoder().decode(pidFile.load_contents(null)[1]);
            check('native OCR runs in a separate process', /^\d+$/u.test(pid));
            slowBridge.close();
            const processState = Gio.File.new_for_path(`/proc/${pid}/stat`);
            await waitFor(() => {
                try { return new TextDecoder().decode(processState.load_contents(null)[1]).includes(') Z'); }
                catch (error) {
                    // procfs can return ENOENT or ESRCH while a task exits.
                    if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) return true;
                    if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.FAILED))
                        return !processState.query_exists(null);
                    throw error;
                }
            });
            check('terminating the editor stops in-flight OCR without copying its result', !unexpectedCopy);
            await waitFor(() => !global.get_window_actors().some(actor => actor.meta_window.get_title() === _('Screenshot editor')));
        } finally { slowBridge.close(); }
        // A transient desktop element disappears during selection. Both the
        // preview and exported pixels must still come from the shortcut snapshot.
        const autoEditBeforeFreeze = extension.settings.get_boolean('edit-after-screenshot');
        extension.settings.set_boolean('edit-after-screenshot', false);
        const transient = new St.Widget({x: 200, y: 200, width: 80, height: 60,
            style: 'background-color: #123456;'});
        Main.uiGroup.add_child(transient);
        await Scripting.sleep(100);
        extension.takeScreenshot();
        await waitFor(() => extension._areaCapture?.visible);
        const frozenSelector = extension._areaCapture;
        check('native area preview displays the frozen desktop', !!frozenSelector.get_content());
        transient.destroy();
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), 210, 210);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(50);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), 230, 230);
        await Scripting.sleep(50);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await waitFor(() => extension.history.entries.some(entry => entry.width === 21 && entry.height === 21));
        const frozenEntry = extension.history.entries.find(entry => entry.width === 21 && entry.height === 21);
        const frozenLoader = GdkPixbuf.PixbufLoader.new_with_mime_type('image/png');
        frozenLoader.write(extension.images.get(frozenEntry).bytes); frozenLoader.close();
        const frozenPixel = frozenLoader.get_pixbuf().get_pixels();
        check('native exported pixels retain the transient element after it disappears',
            frozenPixel[0] === 0x12 && frozenPixel[1] === 0x34 && frozenPixel[2] === 0x56);
        extension.deleteEntry(frozenEntry.id);
        extension.settings.set_boolean('edit-after-screenshot', autoEditBeforeFreeze);
        const pictures = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
        check('native screenshot output stays in the disposable session',
            pictures.startsWith(GLib.getenv('XDG_CONFIG_HOME').replace(/\/config$/u, '/')));
        const dragArea = async () => {
            await waitFor(() => extension._areaCapture?.visible);
            check('fresh capture has a crosshair and no previous selection frame',
                !extension._areaCapture._rubberband.visible && extension._areaCapture._startX === -1);
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), 0, 0);
            await Scripting.sleep(80);
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
            await Scripting.sleep(80);
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), 640, 480);
            await Scripting.sleep(80);
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), 1279, 959);
            await Scripting.sleep(80);
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
            await waitFor(() => !extension._areaCapture);
        };
        extension.popup.showPanel();
        await Scripting.sleep(100);
        await clickActor(extension.popup._screenshotButton);
        await dragArea();
        check('Screenshot button closes picker before manual selection', extension.popup.state === ModalDialog.State.CLOSED);
        await waitFor(() => extension.history.entries.some(entry => entry.kind === 'image' && entry.width === global.stage.width));
        check('native screenshot automatically becomes an image history entry',
            extension.history.entries.some(entry => entry.kind === 'image' && entry.width === global.stage.width && entry.height === global.stage.height));
        await waitFor(() => global.get_window_actors().some(actor => actor.meta_window.get_title() === _('Screenshot editor')));
        check('ClipNacre capture opens the editor automatically', !!extension.editor.child);
        const editorWindow = global.get_window_actors().find(actor => actor.meta_window.get_title() === _('Screenshot editor')).meta_window;
        const editorScreenshot = GLib.getenv('SUPER_V_EDITOR_SCREENSHOT');
        if (editorScreenshot && locale === 'en') {
            await Scripting.sleep(4500);
            const frame = editorWindow.get_frame_rect();
            const output = Gio.File.new_for_path(editorScreenshot).replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
            await new Shell.Screenshot().screenshot_area(frame.x, frame.y, frame.width, frame.height, output);
            output.close(null);
        }
        let copied = 0;
        const copy = extension.editor.onCopy;
        extension.editor.onCopy = bytes => { copy(bytes); copied++; };
        extension.settings.set_boolean('history-enabled', false);
        const pausedCount = extension.history.entries.length;
        editorWindow.activate(global.get_current_time());
        await Scripting.sleep(200);
        for (const key of [Clutter.KEY_Control_L, Clutter.KEY_c])
            keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
        for (const key of [Clutter.KEY_c, Clutter.KEY_Control_L])
            keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
        await waitFor(() => copied === 1);
        check('editor Copy transfers a full screenshot through Shell while history is paused',
            (await extension.clipboard.readImage())?.mime === 'image/png' && extension.history.entries.length === pausedCount);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
        await waitFor(() => !extension.editor.child);
        check('closing the editor keeps the copied image available', (await extension.clipboard.readImage())?.mime === 'image/png');
        extension.settings.set_boolean('history-enabled', true);
        await waitFor(() => !global.get_window_actors().some(actor => actor.meta_window.get_title() === _('Screenshot editor')));
        const screenshotEntry = extension.history.entries.find(entry => entry.width === global.stage.width);
        extension.screenPins.add(GLib.base64_decode(fixtures.png), 'image/png', null, screenshotEntry.digest);
        extension.deleteEntry(screenshotEntry.id);
        check('deleting an automatic screenshot source closes its screen pins by digest', !extension.screenPins.items.size);
        extension.settings.set_boolean('edit-after-screenshot', false);
        extension.takeScreenshot();
        await dragArea();
        await Scripting.sleep(300);
        check('disabled automatic editor leaves native capture available', !extension.editor.child);
        extension.settings.set_boolean('edit-after-screenshot', true);
        const countBeforeCancel = extension.history.entries.length;
        extension.popup.showPanel();
        await Scripting.sleep(100);
        check('multiple image rows retain readable dimension captions', extension.popup._rows.every(row =>
            row.get_child().get_last_child().get_height() >= 12));
        extension.popup.close();
        await Scripting.sleep(300);
        for (const key of [Clutter.KEY_Super_L, Clutter.KEY_Shift_L, Clutter.KEY_s])
            keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
        for (const key of [Clutter.KEY_s, Clutter.KEY_Shift_L, Clutter.KEY_Super_L])
            keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
        await waitFor(() => extension._areaCapture?.visible);
        check('actual Super+Shift+S opens a fresh crosshair selector', !extension._areaCapture._rubberband.visible);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
        await waitFor(() => !extension._areaCapture);
        await Scripting.sleep(300);
        check('cancelling screenshot adds no history item', extension.history.entries.length === countBeforeCancel);
        const clipboardScreenshot = GLib.getenv('SUPER_V_CLIPBOARD_SCREENSHOT');
        if (clipboardScreenshot) {
            extension.history.add('Copied text and images, ready to paste.');
            extension.changed();
            extension.popup.showPanel();
            await Scripting.sleep(200);
            const frame = rectangle(extension.popup._panel);
            const output = Gio.File.new_for_path(clipboardScreenshot).replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
            await new Shell.Screenshot().screenshot_area(Math.floor(frame.x), Math.floor(frame.y),
                Math.ceil(frame.width), Math.ceil(frame.height), output);
            output.close(null);
            extension.popup.close();
        }
        const imageCount = extension.history.entries.filter(entry => entry.kind === 'image').length;
        await extension.store.save(extension.history.toJSON(), extension.images.snapshot());
        extension.history.add('Retained through an immediate extension reload.');
        extension.changed();
        extension.disable();
        extension.enable();
        await waitFor(() => extension._ready);
        check('pending text/image saves survive immediate disable and re-enable',
            extension.history.entries.some(entry => entry.text === 'Retained through an immediate extension reload.') &&
            extension.history.entries.filter(entry => entry.kind === 'image').length === imageCount);
        settings.set_boolean('clear-on-shutdown', true);
        await extension.store.erase();
        check('live shutdown setting removes saved state while retaining session entries',
            !extension.store.persist && !extension.store.file.query_exists(null) && extension.history.entries.length >= 3);
        extension.disable();
        extension.enable();
        await waitFor(() => extension._ready);
        check('a new extension session cannot restore session-only history', extension.history.entries.length === 0);
        print('SHELL CHECKS COMPLETE');
    } finally {
        extension.disable();
        theme.unload_stylesheet(stylesheet);
    }
}
