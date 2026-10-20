// SPDX-License-Identifier: GPL-3.0-or-later
import {gettext as _} from './translations.js';
import {format, groupLabels, toneLabels} from './core/localization.js';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {getEventActor, verticalBoxProperties, horizontalBoxProperties} from './shell-compat.js';
import {moveGridSelection} from './core/grid.js';
import {CatalogIndex, kaomoji, symbols} from './core/catalog.js';
import {clampPanelPosition, placeNearPointer, pointInRect, rememberWindowClick, resolveWindowClick} from './core/placement.js';

const categoryIcons = {All: '⊞', Recent: '🕘', 'Smileys & Emotion': '🙂',
    'People & Body': '👋', 'Animals & Nature': '🐾', 'Food & Drink': '🍔',
    'Travel & Places': '🚗', Activities: '⚽', Objects: '💡', Symbols: '🔣', Flags: '🏁'};
const toneIcons = {all: '✋', default: '✋', light: '✋🏻', 'medium-light': '✋🏼',
    medium: '✋🏽', 'medium-dark': '✋🏾', dark: '✋🏿'};

function button(label, action, style = 'button') {
    const actor = new St.Button({label, style_class: style,
        can_focus: true, reactive: true, accessible_name: label});
    const text = actor.get_child().clutter_text ?? actor.get_child();
    text.line_wrap = true;
    text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    text.ellipsize = Pango.EllipsizeMode.NONE;
    actor.connect('clicked', action);
    return actor;
}

export const SuperVPopup = GObject.registerClass(
class SuperVPopup extends ModalDialog.ModalDialog {
    _init(controller) {
        super._init({styleClass: 'modal-dialog super-v-popup',
            shellReactive: true, actionMode: Shell.ActionMode.POPUP,
            shouldFadeIn: false, shouldFadeOut: false, destroyOnClose: false});
        this.controller = controller;
        // Dialog.Dialog wraps the styled panel in a monitor-sized event actor.
        // Position and hit-test the visible panel, not that outer wrapper.
        this._panel = this.contentLayout.get_parent();
        this.tab = 'clipboard';
        this.group = 'All';
        this.tone = 'all';
        this.selected = 0;
        this.pageSize = 60;
        this._emojiColumns = 6;
        this._visibleCount = this.pageSize;
        this.catalogs = {kaomoji: new CatalogIndex(kaomoji, _), symbols: new CatalogIndex(symbols, _)};
        const horizontal = horizontalBoxProperties(St.BoxLayout, Clutter);
        const header = this._header = new St.BoxLayout({...horizontal, style_class: 'super-v-header', x_expand: true, reactive: true});
        this._title = new St.Label({text: `ClipNacre ${controller.metadata?.['version-name'] ?? ''}`.trim(),
            style_class: 'super-v-title',
            x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        header.add_child(this._title);
        this._screenshotButton = new St.Button({style_class: 'button super-v-icon',
            can_focus: true, reactive: true, accessible_name: _('Screenshot'),
            child: new St.Icon({icon_name: 'camera-photo-symbolic', icon_size: 18})});
        this._screenshotButton.connect('clicked', () => controller.takeScreenshot());
        header.add_child(this._screenshotButton);
        this._settingsButton = button(_('Settings'), () => {
            this.close();
            controller.openPreferences();
        });
        header.add_child(this._settingsButton);
        header.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
            const source = getEventActor(global.stage, event);
            if (source && [this._screenshotButton, this._settingsButton].some(control => control.contains(source)))
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = this._panel.get_transformed_position();
            this._drag = {start: event.get_coords(), x, y};
            this._hideTooltip();
            return Clutter.EVENT_STOP;
        });
        this.contentLayout.add_child(header);
        const tabs = new St.BoxLayout({...horizontal, style_class: 'super-v-tabs'});
        this._clipboardTab = button(_('Clipboard'), () => this._setTab('clipboard'));
        this._emojiTab = button(_('Emoji'), () => this._setTab('emoji'));
        this._tabs = new Map([['clipboard', this._clipboardTab], ['emoji', this._emojiTab]]);
        for (const [name, label, accessible] of [['kaomoji', ';-)', _('Kaomoji and text emoticons')],
            ['symbols', 'Ω', _('Symbols')], ['gifs', 'GIF', _('GIF favorites')]]) {
            const actor = button(label, () => this._setTab(name));
            actor.accessible_name = accessible;
            this._tabs.set(name, actor);
        }
        for (const actor of this._tabs.values())
            tabs.add_child(actor);
        this.contentLayout.add_child(tabs);
        this.search = new St.Entry({hint_text: _('Search clipboard'), can_focus: true,
            x_expand: true, style_class: 'search-entry', accessible_name: _('Search')});
        this.search.clutter_text.connect('text-changed', () => {
            this.selected = 0;
            this._visibleCount = this.pageSize;
            this.refresh();
        });
        this.contentLayout.add_child(this.search);
        const vertical = verticalBoxProperties(St.BoxLayout, Clutter);
        this._tooltip = new St.Label({style_class: 'dash-label', visible: false, reactive: false});
        Main.uiGroup.add_child(this._tooltip);
        this._bindTooltip(this._screenshotButton);
        this._emojiControls = new St.BoxLayout({...horizontal, style_class: 'super-v-categories'});
        this._categoryBack = button('‹', () => this._scrollCategories(-140), 'button super-v-category-arrow');
        this._categoryForward = button('›', () => this._scrollCategories(140), 'button super-v-category-arrow');
        this._categoryScroll = new St.ScrollView({style_class: 'super-v-category-scroll', x_expand: true,
            hscrollbar_policy: St.PolicyType.AUTOMATIC, vscrollbar_policy: St.PolicyType.NEVER,
            overlay_scrollbars: true});
        this._categoryBar = new St.BoxLayout({...horizontal, style_class: 'super-v-category-bar'});
        this._categoryScroll.set_child(this._categoryBar);
        this._categoryButtons = new Map();
        this._categoryScroll.get_hadjustment().connectObject(
            'notify::upper', () => this._ensureCategoryVisible(this._categoryButtons.get(this.group)),
            'notify::page-size', () => this._ensureCategoryVisible(this._categoryButtons.get(this.group)), this);
        this._toneButton = button('✋ ▾', () => {
            this._hideTooltip();
            this._toneMenu.toggle();
        }, 'button super-v-tone');
        this._toneMenu = new PopupMenu.PopupMenu(this._toneButton, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(this._toneMenu.actor);
        this._toneMenu.actor.hide();
        this._toneMenuManager = new PopupMenu.PopupMenuManager(this);
        this._toneMenuManager.addMenu(this._toneMenu);
        this._buildToneMenu();
        this._bindTooltip(this._toneButton);
        this._emojiControls.add_child(this._categoryBack);
        this._emojiControls.add_child(this._categoryScroll);
        this._emojiControls.add_child(this._categoryForward);
        this._emojiControls.add_child(this._toneButton);
        this.contentLayout.add_child(this._emojiControls);
        this.scroll = new St.ScrollView({style_class: 'super-v-scroll', x_expand: true,
            overlay_scrollbars: true, hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC});
        this.list = new St.BoxLayout({...vertical, x_expand: true,
            style_class: 'super-v-list'});
        this.scroll.set_child(this.list);
        this.scroll.get_vadjustment().connectObject(
            'notify::upper', () => this._scrollToSelection(),
            'notify::page-size', () => this._scrollToSelection(), this);
        this.contentLayout.add_child(this.scroll);
        const footer = new St.BoxLayout({...horizontal, style_class: 'super-v-footer'});
        this._clear = button(_('Clear unpinned'), () => controller.clear(false));
        this._restore = button(_('Restore clipboard'), () => controller.restoreClipboard());
        footer.add_child(this._clear);
        footer.add_child(this._restore);
        this._manageGifs = button(_('Add / manage GIFs'), () => {
            this.close();
            controller.openPreferences();
        });
        footer.add_child(this._manageGifs);
        this.contentLayout.add_child(footer);
        this._hint = new St.Label({text: _('↑↓ Select · Enter Paste · Esc Close · Ctrl+Tab Switch'),
            style_class: 'super-v-hint'});
        this._hint.clutter_text.line_wrap = true;
        this.contentLayout.add_child(this._hint);
        this.setInitialKeyFocus(this.search.clutter_text);
        this.connect('captured-event', (_actor, event) => {
            if (this._dragEvent(event)) return Clutter.EVENT_STOP;
            if (event.type() === Clutter.EventType.KEY_PRESS)
                return this._key(event);
            // A modal grab can start event propagation at this actor, skipping
            // the stage. Coordinates still identify clicks outside the panel.
            return this._outsideEvent(event);
        });
        // Cover events delivered through the stage as well as the grab root.
        global.stage.connectObject('captured-event', (_stage, event) => {
            if (this._dragEvent(event)) return Clutter.EVENT_STOP;
            return this._outsideEvent(event);
        }, this);
        // Mutter consumes native client events before Clutter's stage handlers.
        // Window interaction timestamps still notify us while a click is down.
        this._inputWindows = new Set();
        global.display.connectObject('window-created', (_display, window) => this._watchInputWindow(window), this);
        for (const actor of global.get_window_actors()) this._watchInputWindow(actor.meta_window);
        this.connect('opened', () => this._queuePosition());
        this._panel.connect('notify::allocation', () => this._queuePosition());
        this.connect('closed', () => {
            this._drag = null;
            this._cancelPosition();
            this._toneMenu.close();
            this._hideTooltip();
        });
        this.connect('destroy', () => {
            this._cancelPosition();
            for (const window of this._inputWindows) window.disconnectObject(this);
            this._inputWindows.clear();
            this._clickAnchor = null;
            this._hideTooltip();
            this._tooltip.destroy();
            this._toneMenu.destroy();
        });
    }

    retranslate() {
        this.catalogs = {kaomoji: new CatalogIndex(kaomoji, _), symbols: new CatalogIndex(symbols, _)};
        for (const [actor, label] of [[this._settingsButton, _('Settings')],
            [this._clipboardTab, _('Clipboard')], [this._emojiTab, _('Emoji')],
            [this._clear, _('Clear unpinned')], [this._restore, _('Restore clipboard')],
            [this._manageGifs, _('Add / manage GIFs')]]) {
            actor.label = label;
            actor.accessible_name = label;
        }
        this._tabs.get('kaomoji').accessible_name = _('Kaomoji and text emoticons');
        this._tabs.get('symbols').accessible_name = _('Symbols');
        this._tabs.get('gifs').accessible_name = _('GIF favorites');
        this.search.accessible_name = _('Search');
        this._screenshotButton.accessible_name = _('Screenshot');
        this._buildToneMenu();
        this._categoryTab = null;
        this.refresh();
    }

    _buildToneMenu() {
        this._toneMenu.close();
        this._toneMenu.removeAll();
        this._toneItems = new Map();
        for (const [tone, label] of Object.entries(toneLabels)) {
            const item = new PopupMenu.PopupMenuItem(`${toneIcons[tone]}  ${_(label)}`);
            item.connect('activate', () => {
                this.tone = tone;
                this.selected = 0;
                this._visibleCount = this.pageSize;
                this.refresh();
                this.search.grab_key_focus();
            });
            this._toneMenu.addMenuItem(item);
            this._toneItems.set(tone, item);
        }
    }

    _buildCategories() {
        this._hideTooltip();
        this._categoryBar.destroy_all_children();
        this._categoryButtons.clear();
        this._categoryTab = this.tab;
        const groups = this.tab === 'emoji' ? ['All', 'Recent', ...this.controller.emoji.groups]
            : ['All', ...this.catalogs[this.tab].groups];
        for (const group of groups) {
            const label = _(groupLabels[group] ?? group);
            const actor = button(this.tab === 'emoji' ? categoryIcons[group] : label,
                () => this._setGroup(group), `button super-v-category${this.tab === 'emoji' ? ' super-v-category-emoji' : ''}`);
            actor.accessible_name = label;
            const text = actor.get_child().clutter_text ?? actor.get_child();
            text.line_wrap = false;
            this._bindTooltip(actor);
            actor.connect('key-focus-in', () => this._ensureCategoryVisible(actor));
            actor.connect('notify::allocation', () => {
                if (global.stage.get_key_focus() === actor)
                    this._ensureCategoryVisible(actor);
            });
            this._categoryBar.add_child(actor);
            this._categoryButtons.set(group, actor);
        }
        this._categoryScroll.get_hadjustment().value = 0;
    }

    _setGroup(group) {
        this.group = group;
        this.selected = 0;
        this._visibleCount = this.pageSize;
        this.refresh();
        this._ensureCategoryVisible(this._categoryButtons.get(group));
    }

    _scrollCategories(distance) {
        this._hideTooltip();
        const adjustment = this._categoryScroll.get_hadjustment();
        adjustment.value += distance;
    }

    _ensureCategoryVisible(actor) {
        if (!actor?.has_allocation())
            return;
        const box = actor.get_allocation_box();
        const adjustment = this._categoryScroll.get_hadjustment();
        if (box.x1 < adjustment.value)
            adjustment.value = box.x1;
        else if (box.x2 > adjustment.value + adjustment.page_size)
            adjustment.value = box.x2 - adjustment.page_size;
    }

    _bindTooltip(actor) {
        actor.track_hover = true;
        actor.connect('notify::hover', () => {
            this._hideTooltip();
            if (actor.hover) {
                this._tooltipSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                    this._tooltipSource = 0;
                    this._showTooltip(actor);
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
        actor.connect('key-focus-in', () => this._showTooltip(actor));
        actor.connect('key-focus-out', () => this._hideTooltip());
    }

    _showTooltip(actor) {
        if (!actor.has_allocation() || !this._monitor)
            return;
        this._tooltip.text = actor.accessible_name;
        this._tooltip.visible = true;
        const [, width] = this._tooltip.get_preferred_width(-1);
        const [, height] = this._tooltip.get_preferred_height(width);
        const [x, y] = actor.get_transformed_position();
        const [actorWidth] = actor.get_transformed_size();
        const area = Main.layoutManager.getWorkAreaForMonitor(this._monitor.index);
        this._tooltip.set_position(Math.max(area.x, Math.min(x + (actorWidth - width) / 2,
            area.x + area.width - width)), Math.max(area.y, y - height - 6));
    }

    _hideTooltip() {
        if (this._tooltipSource)
            GLib.source_remove(this._tooltipSource);
        this._tooltipSource = 0;
        this._tooltip.visible = false;
    }

    showPanel() {
        this.tab = 'clipboard';
        this.selected = 0;
        this._visibleCount = this.pageSize;
        this.search.set_text('');
        this._manualPosition = null;
        this._drag = null;
        this._panel.opacity = 0;
        const window = global.display?.focus_window;
        this._anchor = resolveWindowClick(this._clickAnchor, window, window?.get_frame_rect(), global.get_pointer());
        this._positionMode = this.controller.settings.get_string('popup-position');
        const monitor = this._positionMode === 'center'
            ? Main.layoutManager.focusMonitor ?? Main.layoutManager.primaryMonitor
            : Main.layoutManager.monitors.find(m => pointInRect(this._anchor, [m.x, m.y], [m.width, m.height]))
                ?? Main.layoutManager.primaryMonitor;
        this._monitor = monitor;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const area = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        this._scrollHeight = Math.max(0, Math.min(330, area.height / scale - 360));
        this._panelWidth = Math.max(1, Math.min(390, area.width / scale - 60));
        const width = this._panelWidth;
        // Leave room for popup padding and keep tiles usable on narrow monitors.
        this._emojiColumns = Math.max(1, Math.min(6, Math.floor((width - 36) / 54)));
        this.scroll.set_style(`height: ${this._scrollHeight}px; min-height: 0;`);
        this._panel.set_style(`width: ${width}px;`);
        this.refresh();
        const opened = this.open();
        if (opened) {
            this._monitorConstraint.index = monitor.index;
            this._queuePosition();
            this.search.grab_key_focus();
        }
        return opened;
    }

    positionPanel() {
        if (!this._monitor || !this._panel.has_allocation() || !this.dialogLayout.has_allocation())
            return false;
        const centered = this.controller.settings.get_string('popup-position') === 'center';
        const area = Main.layoutManager.getWorkAreaForMonitor(this._monitor.index);
        const size = this._panel.get_transformed_size();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const gap = 12 * scale;
        const overflowWidth = size[0] - Math.max(1, area.width - 2 * gap);
        const overflowHeight = size[1] - Math.max(1, area.height - 2 * gap);
        if (overflowWidth > 0.5 && this._panelWidth > 1 || overflowHeight > 0.5 && this._scrollHeight > 0) {
            this._panel.opacity = 0;
            this._panelWidth = Math.max(1, this._panelWidth - Math.max(0, overflowWidth) / scale);
            this._scrollHeight = Math.max(0, this._scrollHeight - Math.max(0, overflowHeight) / scale);
            this._emojiColumns = Math.max(1, Math.min(6, Math.floor((this._panelWidth - 36) / 54)));
            this._panel.set_style(`width: ${this._panelWidth}px;`);
            this.scroll.set_style(`height: ${this._scrollHeight}px; min-height: 0;`);
            this.refresh();
            return false;
        }
        const position = this._manualPosition
            ? clampPanelPosition(this._manualPosition, area, size, gap)
            : centered ? clampPanelPosition([area.x + (area.width - size[0]) / 2,
                area.y + (area.height - size[1]) / 2], area, size, gap)
                : placeNearPointer(this._anchor, area, size, gap);
        // The panel has its own allocation inside GNOME's centered wrapper.
        // Convert the desired screen point to the parent's coordinates and
        // subtract that allocation, including after reopening or a tab resize.
        const [valid, x, y] = this._panel.get_parent().transform_stage_point(position.x, position.y);
        if (!valid) return false;
        const box = this._panel.get_allocation_box();
        if (Math.abs((this._panel.translation_x || 0) - (x - box.x1)) > 0.01)
            this._panel.translation_x = x - box.x1;
        if (Math.abs((this._panel.translation_y || 0) - (y - box.y1)) > 0.01)
            this._panel.translation_y = y - box.y1;
        if (this._panel.opacity !== 255)
            this._panel.opacity = 255;
        return true;
    }

    _queuePosition() {
        if (this._positionPaint || !this._monitor ||
            ![ModalDialog.State.OPENED, ModalDialog.State.OPENING].includes(this.state)) return;
        // BEFORE_REDRAW runs before Clutter finishes allocation. Reopening at
        // the same size may emit no allocation notification, leaving an invisible
        // modal forever. Paint completion guarantees a fresh layout each frame.
        this._positionPaint = global.stage.connect('after-paint', () => {
            this._cancelPosition();
            if (!this.positionPanel())
                this._queuePosition();
        });
        this.dialogLayout.queue_redraw();
    }

    _cancelPosition() {
        if (this._positionPaint) global.stage.disconnect(this._positionPaint);
        this._positionPaint = 0;
    }

    _watchInputWindow(window) {
        if (this._inputWindows.has(window)) return;
        this._inputWindows.add(window);
        window.connectObject('notify::user-time', () => this._rememberWindowInput(window),
            'unmanaged', () => {
                window.disconnectObject(this);
                this._inputWindows.delete(window);
                if (this._clickAnchor?.window === window) this._clickAnchor = null;
            }, this);
    }

    _rememberWindowInput(window) {
        if ([ModalDialog.State.OPENED, ModalDialog.State.OPENING].includes(this.state) || !window.has_pointer()) return;
        const [x, y, modifiers] = global.get_pointer();
        if (!(modifiers & Clutter.ModifierType.BUTTON1_MASK)) return;
        this._clickAnchor = rememberWindowClick(window, window.get_frame_rect(), [x, y]);
    }

    _dragEvent(event) {
        if (!this._drag) return false;
        if (event.type() === Clutter.EventType.MOTION) {
            const [x, y] = event.get_coords();
            this._manualPosition = [this._drag.x + x - this._drag.start[0], this._drag.y + y - this._drag.start[1]];
            this.positionPanel();
            return true;
        }
        if (event.type() === Clutter.EventType.BUTTON_RELEASE && event.get_button() === 1) {
            this._drag = null;
            return true;
        }
        return false;
    }

    _outsideEvent(event) {
        if (![ModalDialog.State.OPENED, ModalDialog.State.OPENING].includes(this.state) ||
            event.type() !== Clutter.EventType.BUTTON_PRESS)
            return Clutter.EVENT_PROPAGATE;
        if (this._toneMenu.isOpen && pointInRect(event.get_coords(),
            this._toneMenu.actor.get_transformed_position(), this._toneMenu.actor.get_transformed_size()))
            return Clutter.EVENT_PROPAGATE;
        const inside = this._panel.has_allocation()
            ? pointInRect(event.get_coords(), this._panel.get_transformed_position(),
                this._panel.get_transformed_size())
            : Boolean(getEventActor(global.stage, event) &&
                this._panel.contains(getEventActor(global.stage, event)));
        if (inside)
            return Clutter.EVENT_PROPAGATE;
        this.close();
        return Clutter.EVENT_STOP;
    }

    _setTab(tab) {
        this._toneMenu.close();
        this.tab = tab;
        this.group = 'All';
        this.selected = 0;
        this._visibleCount = this.pageSize;
        this.search.set_text('');
        this.refresh();
        this.search.grab_key_focus();
    }

    refresh() {
        this.list.destroy_all_children();
        const clipboard = this.tab === 'clipboard';
        const gif = this.tab === 'gifs';
        const emoji = this.tab === 'emoji';
        const columns = this.tab === 'kaomoji' ? Math.min(3, this._emojiColumns)
            : gif ? Math.min(3, this._emojiColumns) : this._emojiColumns;
        this._emojiControls.visible = !clipboard && !gif;
        this._toneButton.visible = emoji;
        this._clear.visible = clipboard;
        this._manageGifs.visible = gif;
        this._restore.visible = Boolean(this.controller.pendingRestore);
        if (!clipboard && !gif && this._categoryTab !== this.tab)
            this._buildCategories();
        for (const [group, actor] of this._categoryButtons) {
            if (group === this.group)
                actor.add_style_pseudo_class('checked');
            else
                actor.remove_style_pseudo_class('checked');
        }
        this._categoryBack.accessible_name = _('Previous categories');
        this._categoryForward.accessible_name = _('Next categories');
        this._toneButton.label = `${toneIcons[this.tone]} ▾`;
        this._toneButton.accessible_name = format(_('Tone: %s'), _(toneLabels[this.tone]));
        for (const [tone, item] of this._toneItems)
            item.setOrnament(tone === this.tone ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        this.search.hint_text = clipboard ? _('Search clipboard') : gif ? _('Search GIF filenames')
            : emoji ? _('Search emoji') : this.tab === 'kaomoji' ? _('Search kaomoji') : _('Search symbols');
        this._hint.text = clipboard ? _('↑↓ Select · Enter Paste · Esc Close · Ctrl+Tab Switch')
            : _('↑↓←→ Select · Enter Paste · Ctrl+F Search · Esc Close');
        for (const [name, actor] of this._tabs) {
            const active = name === this.tab;
            if (active)
                actor.add_style_pseudo_class('checked');
            else
                actor.remove_style_pseudo_class('checked');
        }
        const query = this.search.get_text();
        this.results = clipboard ? this.controller.history.search(query, _('Image'))
            : gif ? this.controller.gifs.search(query)
                : emoji ? this.controller.emoji.search(query, this.group, this.tone)
                    : this.catalogs[this.tab].search(query, this.group);
        this.selected = Math.max(0, Math.min(this.selected, this.results.length - 1));
        this._rows = [];
        if (!this.results.length) {
            const message = query ? _('No matching items.') : clipboard
                ? this.controller.settings.get_boolean('history-enabled')
                    ? _('Copy text or an image to start your history.') : _('History is paused. Enable it in Settings.')
                : gif ? _('Add GIF files in Settings. GIF insertion requires an app that accepts images.')
                    : this.group === 'Recent' ? _('Your recently used emoji will appear here.') : _('No items in this filter.');
            const label = new St.Label({text: message, style_class: 'super-v-empty'});
            label.clutter_text.line_wrap = true;
            this.list.add_child(label);
        }
        let row;
        for (const [index, entry] of this.results.slice(0, this._visibleCount).entries()) {
            if (clipboard || index % columns === 0) {
                row = new St.BoxLayout({...horizontalBoxProperties(St.BoxLayout, Clutter),
                    style_class: clipboard ? 'super-v-row' : 'super-v-emoji-row',
                    x_expand: true});
                if (!clipboard)
                    row.get_layout_manager().set_homogeneous(true);
                // Newly rendered rows have no allocation until the next layout pass.
                row.connect('notify::allocation', actor => {
                    if (actor === this._rows[this.selected]?.get_parent())
                        this._scrollToSelection();
                });
                this.list.add_child(row);
            }
            const select = button('', () => this._activate(index),
                clipboard ? 'button super-v-item' : gif ? 'button super-v-gif'
                    : this.tab === 'kaomoji' ? 'button super-v-kaomoji' : 'button super-v-emoji');
            select.x_expand = true;
            const text = entry.text ?? '';
            const image = clipboard && entry.kind === 'image';
            const imageLabel = image ? format(_('Image · %d × %d'), entry.width, entry.height) : '';
            const name = image ? imageLabel : text.slice(0, 500);
            select.accessible_name = clipboard ? (entry.pinned ? format(_('Pinned: %s'), name) : name) : entry.name;
            const preview = Array.from(text).slice(0, 240).join('')
                .replace(/[\r\n]+/gu, ' ↵ ').replace(/[\x01-\x1f\x7f]/gu, ' ');
            const label = gif ? new St.Icon({gicon: Gio.FileIcon.new(Gio.File.new_for_path(entry.path)),
                icon_size: 84}) : new St.Label({text: image ? imageLabel : clipboard ? preview : text, x_expand: clipboard,
                x_align: clipboard ? Clutter.ActorAlign.FILL : Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER});
            if (!gif)
                label.clutter_text.ellipsize = clipboard ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE;
            if (image) {
                const content = new St.BoxLayout({...horizontalBoxProperties(St.BoxLayout, Clutter),
                    style_class: 'super-v-image-preview', x_expand: true});
                content.add_child(new St.Icon({gicon: this.controller.images.get(entry).gicon,
                    icon_size: 112, x_align: Clutter.ActorAlign.START}));
                content.add_child(label);
                select.set_child(content);
            } else {
                select.set_child(label);
            }
            select.connect('key-focus-in', () => {
                this.selected = index;
                this._highlight();
            });
            row.add_child(select);
            if (clipboard) {
                if (image) {
                    const edit = button('✎', () => this.controller.editImage(entry), 'button super-v-icon');
                    edit.accessible_name = _('Edit image');
                    this._bindTooltip(edit);
                    row.add_child(edit);
                }
                row.add_child(button(entry.pinned ? '★' : '☆', () => {
                    this.controller.pin(entry.id);
                }, 'button super-v-icon'));
                const pin = row.get_last_child();
                pin.accessible_name = entry.pinned ? _('Unpin entry') : _('Pin entry');
                row.add_child(button('×', () => this.controller.deleteEntry(entry.id), 'button super-v-icon'));
                row.get_last_child().accessible_name = _('Delete entry');
            }
            this._rows.push(select);
        }
        // Preserve column widths in a partially filled last row without adding focus targets.
        if (!clipboard && row) {
            while (row.get_n_children() < columns)
                row.add_child(new St.Widget({x_expand: true}));
        }
        if (this.results.length > this._visibleCount) {
            this.list.add_child(button(format(_('Show more (%d)'), this.results.length - this._visibleCount), () => {
                this._visibleCount += this.pageSize;
                this.refresh();
            }));
        }
        this._highlight();
    }

    _highlight() {
        for (const [index, actor] of this._rows.entries()) {
            if (index === this.selected)
                actor.add_style_pseudo_class('focus');
            else
                actor.remove_style_pseudo_class('focus');
        }
        this._scrollToSelection();
    }

    _scrollToSelection() {
        const row = this._rows?.[this.selected]?.get_parent();
        if (row?.has_allocation()) {
            const adjustment = this.scroll.get_vadjustment();
            const box = row.get_allocation_box();
            if (box.y1 < adjustment.value)
                adjustment.value = box.y1;
            else if (box.y2 > adjustment.value + adjustment.page_size)
                adjustment.value = box.y2 - adjustment.page_size;
        }
    }

    _activate(index) {
        const entry = this.results[index];
        if (entry) {
            if (this.tab === 'gifs')
                this.controller.selectGif(entry);
            else
                this.controller.select(entry, this.tab !== 'clipboard');
        }
    }

    _key(event) {
        const key = event.get_key_symbol();
        const ctrl = event.get_state() & Clutter.ModifierType.CONTROL_MASK;
        if (ctrl && [Clutter.KEY_e, Clutter.KEY_E].includes(key) && this.tab === 'clipboard' &&
            this.results[this.selected]?.kind === 'image') {
            this.controller.editImage(this.results[this.selected]);
            return Clutter.EVENT_STOP;
        }
        if (this._toneMenu.isOpen) {
            if (key === Clutter.KEY_Escape) {
                this._toneMenu.close();
                this._toneButton.grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }
        if (key === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        if (ctrl && [Clutter.KEY_Tab, Clutter.KEY_ISO_Left_Tab].includes(key)) {
            const names = [...this._tabs.keys()];
            const step = key === Clutter.KEY_ISO_Left_Tab ? names.length - 1 : 1;
            this._setTab(names[(names.indexOf(this.tab) + step) % names.length]);
            return Clutter.EVENT_STOP;
        }
        if (ctrl && [Clutter.KEY_f, Clutter.KEY_F].includes(key)) {
            this.search.grab_key_focus();
            return Clutter.EVENT_STOP;
        }
        const focus = global.stage.get_key_focus();
        const categories = [...this._categoryButtons.values()];
        const categoryIndex = categories.indexOf(focus);
        if (categoryIndex >= 0) {
            if ([Clutter.KEY_Left, Clutter.KEY_Right, Clutter.KEY_Home, Clutter.KEY_End].includes(key)) {
                const index = key === Clutter.KEY_Home ? 0 : key === Clutter.KEY_End ? categories.length - 1
                    : Math.max(0, Math.min(categories.length - 1, categoryIndex + (key === Clutter.KEY_Left ? -1 : 1)));
                categories[index].grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Down) {
                this._rows[0]?.grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }
        const itemFocused = this._rows.includes(focus);
        const emoji = this.tab !== 'clipboard';
        // Left/Right keep editing the query until focus has moved into the grid.
        const horizontal = emoji && itemFocused && [Clutter.KEY_Left, Clutter.KEY_Right].includes(key);
        if ((itemFocused || focus === this.search.clutter_text) &&
            ([Clutter.KEY_Up, Clutter.KEY_Down].includes(key) || horizontal)) {
            const direction = key === Clutter.KEY_Up ? 'up' : key === Clutter.KEY_Down ? 'down'
                : key === Clutter.KEY_Left ? 'left' : 'right';
            this.selected = moveGridSelection(this.selected, this.results.length,
                emoji ? ['kaomoji', 'gifs'].includes(this.tab) ? Math.min(3, this._emojiColumns)
                    : this._emojiColumns : 1, direction);
            if (this.selected >= this._visibleCount) {
                this._visibleCount += this.pageSize;
                this.refresh();
            }
            if (emoji || itemFocused)
                this._rows[this.selected]?.grab_key_focus();
            this._highlight();
            return Clutter.EVENT_STOP;
        }
        if ([Clutter.KEY_Return, Clutter.KEY_KP_Enter].includes(key) &&
            (global.stage.get_key_focus() === this.search.clutter_text ||
             this._rows.some(x => x === global.stage.get_key_focus()))) {
            this._activate(this.selected);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Delete && this.tab === 'clipboard') {
            const entry = this.results[this.selected];
            if (entry)
                this.controller.deleteEntry(entry.id);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
});
