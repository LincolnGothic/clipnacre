# Testing and desktop acceptance

`make test` checks metadata, JS syntax, strict GSettings compilation, exact
emoji generation, ESLint, Node logic/adapter tests, and GJS/Gio filesystem
integration. Mock adapter tests exercise the actual asynchronous controller
and clipboard modules, but do not prove Mutter clipboard, shell rendering or
input delivery works on a real desktop. CI builds the `.deb` and checks it
without an interactive shell. See `verification-v0.1.14.md` for current executed results.

## Package checks

```sh
make package
lintian --fail-on error,warning ../super-v-ubuntu_0.1.14_all.deb
dpkg-deb --info ../super-v-ubuntu_0.1.14_all.deb
dpkg-deb --contents ../super-v-ubuntu_0.1.14_all.deb
python3 scripts/audit-package.py ../super-v-ubuntu_0.1.14_all.deb
```

The archive must contain runtime files and compiled schemas only beneath
`/usr/share/gnome-shell/extensions/super-v-ubuntu@super-v-ubuntu.local`, plus
documentation under `/usr/share/doc/super-v-ubuntu`. No user files or maintainer
scripts changing user settings belong in it.

## Manual GUI procedure — NOT TESTED in the build workspace

Run this matrix on Ubuntu 24.04 / GNOME 46, Ubuntu 26.04 / GNOME 50, and Debian 13 / GNOME 48,
using Wayland and preferably a disposable user account.
Install `gnome-text-editor`, `gnome-terminal` and `firefox` if absent. Remove
any user-local copy of this UUID before testing the system package, keeping
a backup if it contains local changes.

```sh
gnome-shell --version
printf '%s\n' "$XDG_SESSION_TYPE"
sudo apt install ./super-v-ubuntu_0.1.14_all.deb
```

Log out/in, then enable and inspect it as your desktop user:

```sh
gsettings set org.gnome.shell.keybindings toggle-message-tray "['<Super>m']"
gnome-extensions enable super-v-ubuntu@super-v-ubuntu.local
gnome-extensions info super-v-ubuntu@super-v-ubuntu.local
gnome-extensions prefs super-v-ubuntu@super-v-ubuntu.local
```

This reserves Super+V while leaving the notification list on Super+M.
Record any custom notification bindings first; the command replaces them.

1. Ensure capture, persistence and automatic paste are enabled. Open GNOME
   Text Editor, type separate A/B/C lines, and copy A, then B, then C with
   Ctrl+C. Press Super+V. Expect C, B, A, newest first, with immediate search
   focus. Use Up/Down and Enter to select A. Expect A inserted at the editor's
   cursor and the popup closed. Repeat with mouse selection.
2. Copy multiline Unicode text, including `你好 👩🏽‍🔬`, and verify the complete
   pasted text, original line endings and whitespace. Copy a duplicate and
   confirm one entry with refreshed recency. Test a 20 KiB copy: it should be
   ignored, not silently truncated.
3. Pin A, clear ordinary history, and verify A remains. Delete another item
   with Delete and with its mouse button. Lower the history limit, then copy
   enough entries to trigger trimming. Verify pins survive. Use preferences
   to clear all and verify pins and recents disappear.
4. Search a history term, try no-match text, press Ctrl+F, switch tabs with
   Ctrl+Tab, and press Escape. Verify click-outside closes and Tab can focus
   pin/delete/settings controls. Reopen and verify search resets. With both
   empty and populated history, open and close the clipboard tab three times
   without changing its contents; every opening must show a visible panel.
   Repeat with Ubuntu's Yaru theme and verify screenshots still work afterward.
5. Add and pin entries, disable/re-enable the extension, and verify persistence.
   Then log out/in and repeat. Turn off persistence, confirm the state file
   disappears, and log out/in: no history/recents should return. Pause capture
   and copy more text: existing history remains, new copies do not appear.
6. In Emoji, search `scientist` or `DNA`, choose categories and skin tones,
   and insert an emoji in the editor. Verify recents and no temporary emoji
   history pollution. Reopen and restore the prior clipboard after paste has
   completed. Copy a different value before restore and verify it is preserved.
   Check missing glyphs separately from insertion failures.
   Expect six equally sized emoji tiles per row at normal popup width and
   fewer columns on a narrow monitor. Check a partial final row, an empty
   Recent category and a no-match search. Up/Down should move one row,
   Left/Right one emoji, and Enter should insert the highlighted tile. Arrow
   navigation must stop at the top/bottom row and remain visible when crossing
   the first 60 results. Use Tab and Shift+Tab to reach tiles and controls,
   and verify Left/Right still edit a query after Ctrl+F. Check 100% and 200%
   scaling, hover/focus contrast and emoji names with a screen reader.
7. Repeat history and emoji insertion in GNOME Terminal, expecting
   Ctrl+Shift+V. Use harmless text such as `example` without newline. Do not
   use commands for this test. Repeat in Firefox's address bar and a normal
   editable field, expecting Ctrl+V. Test a per-app `manual` override and a
   `shift-insert` override in a suitable application.
8. Hold Super longer than 600 ms after choosing an item, close the destination
   while the panel is open, and switch focus immediately after selection.
   Confirm fallback copies without pasting into an unrelated application.
   Verify no stuck virtual Ctrl/Shift keys after repeated use/disable.
9. Test with a password manager that advertises a sensitive MIME hint and
   with an explicitly excluded app. Confirm capture does not occur. Also
   verify the documented limitation for copies whose origin cannot be known.
10. Lock/unlock with the popup open; no clipboard panel should be usable on
    the lock screen. Verify re-enable and preference changes do not show stale
    entries or cause shell exceptions. Test light/dark themes, 100%/200% scale,
    multiple monitors, long previews, scrolling beyond 60 results and keyboard
    navigation through incrementally rendered results.
11. Confirm the header reads Super V 0.1.14. With Near last click selected,
    click an input, move the pointer away, and open beside the remembered point.
    Drag the title bar to each edge, then check Settings and Screenshot clicks.
    Check work-area bounds,
    different monitor origins and 200% scale. Choose centered placement and
    verify the panel centers on the focused monitor. Outside clicks on the
    desktop, another window and Shell controls must dismiss without pasting.
12. Insert kaomoji and symbols (for example ±, β, and →), search and filter by
    category, and restore the prior text clipboard. Cycle all five tabs using
    Ctrl+Tab and Ctrl+Shift+Tab. Text emoticons should have three columns and
    symbols six at normal width, with accessible descriptive names.
13. Add a valid local GIF in Settings. Verify first-frame preview, filename
    search, copying and pasting into an image-capable app. Record whether that
    app preserves animation. Test missing, malformed, symlink and oversized
    files, remove a favorite without deleting its file, and verify that no
    image is stored in text history. Reopen or disable while a GIF read waits:
    the stale selection must not replace a newer clipboard or send a paste.

14. Copy PNG and JPEG image pixels from an image editor or browser. Verify
    thumbnails and dimensions, exact duplicate recency, pin/delete, image search
    by format/dimensions, and image paste into an accepting application. Test
    text/image order, limits, malformed images and excluded sources. Copying a
    file path is not image capture. Reload with persistence enabled and confirm
    image bytes return; missing/corrupt image files must not erase text history.
15. Open the camera button and Super+Shift+S. Drag a fresh area twice, including over the former selection;
    confirm only a crosshair is present before each drag. Use Print Screen for
    GNOME’s separate window/screen controls; the picker must not cover the capture. Escape should cancel without
    a new entry. Change and disable the screenshot shortcut in Settings. With
    history paused, Super V still copies the screenshot but no history is added.
16. Enable Clear history on shutdown with text, images, pins and emoji recents
    present. Confirm JSON and managed image files disappear and current items
    remain in memory. Copy more items and verify no files return. Restart or
    log out/in: history, pins and recents must be empty. Turning the option off
    must respect Remember after logout. GNOME’s own screenshot files stay.

17. Capture through Super V and verify the editor opens automatically. Turn off
    Edit after taking a screenshot and repeat. Open a history image with its
    pencil button and Ctrl+E. Exercise all tools, multilingual inline text and caret input, click-to-reposition before Enter, light mosaic dabs/freehand paths, tile and brush thickness,
    black-and-white filter and undo, repeated/nested crops, undo/redo, zoom/pan and PNG export.
    Paste after closing the editor; test paused history, cancelled save, file
    overwrite confirmation, lock/clear/delete/disable cleanup, HiDPI and narrow
    editor windows. Inspect the exported pixels and confirm originals are kept
    separate. No image scratch files should appear.

Check permissions and shell logs after the matrix:

```sh
stat -c '%a %n' "${XDG_STATE_HOME:-$HOME/.local/state}/super-v-ubuntu" \
    "${XDG_STATE_HOME:-$HOME/.local/state}/super-v-ubuntu/history.json"
journalctl --user -b -o cat | rg 'super-v-ubuntu|Super V|JS ERROR'
```

Expect 700 and 600 when persistence is enabled. Redact clipboard content from
any unrelated logs before sharing. Record PASS/FAIL/NOT TESTED for each action
and application, exact versions, rendering issues and shell exceptions. On
Wayland use logout/login for code reload; do not use Alt+F2 `r`. A nested shell
is optional for developer iteration, but still test actual applications and
the user's normal session before declaring desktop support.


## v0.1.8 native platform matrix

CI uses ubuntu-24.04, ubuntu-24.04-arm, ubuntu-26.04, and ubuntu-26.04-arm runners.
Debian 13 runs in native Debian containers on the amd64 and arm64 runners; it is
not QEMU emulation. Each target runs the complete build checks, package audit,
lintian, all seven interface languages in a disposable Wayland compositor,
Tesseract recognition/cancel/timeout/output limits, and apt installation/removal.
Release publication waits for every target. Architecture: all describes the shared
JavaScript payload, not absence of native CPU tests.

Additional interactive checks:

1. Open an image, draw several marks, select an earlier one, move and resize it,
   change its color/size, delete it, then undo/redo. Later marks stay unchanged.
2. Add numbered markers with clicks; exported PNG includes labels but no handles.
3. Create five screen pins. Use real mouse clicks for Zoom in/out, all opacity levels, Copy and Close; buttons must not start a drag. Drag the image and empty header space, release outside the pin, and check input is released. Press Escape during a drag. Take another screenshot with Super+Shift+S while a pin is visible, then cancel another capture and verify Close still works.
   Try multi-monitor moves and removing a monitor; pins remain reachable.
4. Confirm lock, clear, source deletion, and disabling close screen pins and editor.
5. Test OCR with actual Chinese, Japanese, Korean, Spanish, and French images after
   installing their language packs; review results before copying. Exercise Ctrl+C
   with a selected range and empty/noisy inputs. Close during recognition.
6. Save to a chosen folder, reopen Save, and verify location and filename tokens;
   cancel and overwrite a disposable file. Invalid patterns cannot create paths.
7. Upgrade the prior package without uninstalling, log out/in, verify version 0.1.8,
   retained settings, and the shutdown-clearing preference.

Automated checks do not establish hardware GPU behavior, all receiving apps,
OCR accuracy on arbitrary documents, or interactive monitor/lock acceptance.

## v0.1.14 visual OCR

- Capture a screenshot, open **Copy text from image**, and confirm the preview
  matches the current crop and annotations. OCR highlights must not appear in
  PNG exports or alter the original image.
- Click one highlighted word and drag forward/backward over a region. The text
  field must show just the intersected words, in reading order. Click **Select
  all text** to restore the original result.
- Edit the result with Chinese and emoji, select a range, and use **Copy text**
  and Ctrl+C. Both copy the selected range, or the complete field if there is no
  selection. Empty/oversized results leave the clipboard alone.
- Rerun with another installed language; old results disappear during recognition.
  Close while loading languages or recognizing, then reopen. Late results must
  not reach the closed window or clipboard.
- Check the seven interface languages, small windows and 100%/200% scaling.
  Use the text field and buttons with the keyboard and a screen reader.

## v0.1.13 regressions

- Open a notification/menu, press Super+Shift+S, wait for it to disappear, and
  select its original location. Preview and output must retain it. Cancel another
  selection; check clipboard, clear/lock/disable, and repeated shortcuts.
- Copy a photo with QQ’s Copy image. It should appear as a thumbnail in Super+V
  and paste into an image-capable app. Repeat with PNG/JPEG aliases, JPEG offered
  as PNG, and BMP pixels. The exact installed QQ path requires desktop acceptance.
- Copy one local PNG/JPEG/BMP image file. Import URI-list and GNOME file offers;
  delete the source afterward and verify the history image still pastes. Reject
  links, multiple files, invalid images, oversized inputs and symlinks.
- Native automation removes a colored desktop element during selection and
  verifies the exported pixel color still matches the frozen snapshot.
