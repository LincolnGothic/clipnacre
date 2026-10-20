// SPDX-License-Identifier: GPL-3.0-or-later
// A disposable Wayland paste destination used only by the isolated Shell test.
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import System from 'system';

Gtk.init();
const loop = new GLib.MainLoop(null, false);
const window = new Gtk.Window({title: 'ClipNacre image receiver', default_width: 320, default_height: 240});
const input = new Gtk.TextView();
input.buffer.text = 'Synthetic clipboard image paste test';
window.set_child(input);
const keys = new Gtk.EventControllerKey();
keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
let status = 1;
keys.connect('key-pressed', (_controller, key, _code, modifiers) => {
    if (key !== Gdk.KEY_v || !(modifiers & Gdk.ModifierType.CONTROL_MASK))
        return false;
    const clipboard = Gdk.Display.get_default().get_clipboard();
    clipboard.read_texture_async(null, (source, result) => {
        try {
            const texture = source.read_texture_finish(result);
            if (!texture || texture.get_width() !== 64 || texture.get_height() !== 48)
                throw new Error('Wrong pasted image');
            print('IMAGE PASTE RECEIVED: 64 x 48');
            status = 0;
        } catch (error) {
            printerr(error.message);
        }
        window.close();
        loop.quit();
    });
    return true;
});
window.add_controller(keys);
window.present();
input.grab_focus();
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
    if (status)
        printerr('No image paste received before timeout');
    window.close();
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
System.exit(status);
