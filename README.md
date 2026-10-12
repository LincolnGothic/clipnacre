# Super V Ubuntu

A Windows-style **Super+V** clipboard and character picker for Ubuntu and Debian GNOME,
with screenshot capture, image editing, floating image pins, and local text recognition.
Keep and search text/image clipboard history, annotate screenshots, and click or drag
over recognized words to extract, edit, and copy their text. Emoji, kaomoji, symbols,
and local GIF favorites share the same keyboard-friendly popup.

Seven interface languages are included. Clipboard contents, images, and OCR stay
on your computer; no account or cloud service is needed.
GPL-3.0-or-later; Unicode data uses Unicode-3.0.

[English](README.md) · [简体中文](docs/i18n/README.zh-CN.md) ·
[繁體中文](docs/i18n/README.zh-TW.md) · [日本語](docs/i18n/README.ja.md) ·
[Español](docs/i18n/README.es.md) · [Français](docs/i18n/README.fr.md) ·
[한국어](docs/i18n/README.ko.md)

**Current release: [v0.1.14](https://github.com/LincolnGothic/super-v-ubuntu/releases/tag/v0.1.14)** ·
[Download installer](https://github.com/LincolnGothic/super-v-ubuntu/releases/download/v0.1.14/super-v-ubuntu_0.1.14_all.deb) ·
[First installation](#install-the-debian-package) · [Upgrade](#upgrade-from-an-older-version) ·
[Feature guide](#feature-guide) · [Screenshot OCR](#copy-text-from-an-image) · [Troubleshooting](#troubleshooting)

**Release status:** v0.1.14 installers and `SHA256SUMS` are published. All six
distribution/CPU targets passed the [release CI run](https://github.com/LincolnGothic/super-v-ubuntu/actions/runs/38240409019),
including package installation/removal and isolated GNOME Wayland screenshot,
OCR selection/copy, image paste, and screen-pin checks. See [validation](docs/verification-v0.1.14.md)
and [desktop acceptance](docs/testing.md) for the checks and their limits.

## Platforms and downloads

| Desktop / Wayland session | x86-64 and ARM64 installer |
| --- | --- |
| Ubuntu 24.04 LTS / GNOME 46 | [Ubuntu 24.04 package](https://github.com/LincolnGothic/super-v-ubuntu/releases/download/v0.1.14/super-v-ubuntu_0.1.14_ubuntu24.04_all.deb) |
| Ubuntu 26.04 LTS / GNOME 50 | [Ubuntu 26.04 package](https://github.com/LincolnGothic/super-v-ubuntu/releases/download/v0.1.14/super-v-ubuntu_0.1.14_ubuntu26.04_all.deb) |
| Debian 13 / GNOME 48 | [Debian 13 package](https://github.com/LincolnGothic/super-v-ubuntu/releases/download/v0.1.14/super-v-ubuntu_0.1.14_debian13_all.deb) |

Choose your distribution's package. Each installer is marked **Architecture: all**
because the extension uses JavaScript, translations, and schemas; it has no compiled
CPU-specific binary. The same installer works on **amd64 (x86-64)** and **arm64
(AArch64)** and uses the distribution's native GJS, GTK, and Tesseract packages.
CI builds and runs the native Wayland tests separately on all six distribution/CPU
combinations. An [all-target installer](https://github.com/LincolnGothic/super-v-ubuntu/releases/download/v0.1.14/super-v-ubuntu_0.1.14_all.deb)
is also available; it allows GNOME 46, 48, or 50. Distribution installers restrict
the GNOME dependency to their tested major version.

Check `dpkg --print-architecture` and `gnome-shell --version` before installation.
GNOME 47, 49, 51+, X11, and non-GNOME desktops are not supported. API inspection
and isolated runtime results are recorded in [the API audit](docs/api-audit.md)
and [v0.1.14 verification](docs/verification-v0.1.14.md). Interactive desktop acceptance
remains distinct from these automated checks. No Electron, background daemon, or
`xdotool` is needed.

## New in v0.1.14: visual screenshot OCR

1. Press **Super+Shift+S**, drag an area, and release to capture it. The editor
   opens automatically with the current screenshot.
2. Click **Copy text from image**, or press **Ctrl+Shift+O** in the editor.
3. Click a highlighted word or drag across a region to select the text you need.
4. Review and edit the result, then click **Copy text**. **Select all text**
   restores the complete recognition result.

Recognition runs locally with Tesseract. English is included with the installer;
install the corresponding packs for Chinese and other languages. Installed English
is also used with your chosen language for mixed text. See the
[OCR language setup and full guide](#copy-text-from-an-image).

## Feature guide

Open **Super+V**, then click the gear button in the header to open Settings.

| Task | How to do it |
| --- | --- |
| Paste text or an image from history | Copy text or PNG/JPEG image pixels, open Super+V, and choose an entry. The receiving app must support the selected content. |
| Take a screenshot | Click the camera button or press **Super+Shift+S**, then drag a fresh area with the crosshair. The editor opens automatically after capture. |
| Edit an image | Use the pencil button beside an image in history, or select it and press **Ctrl+E**. |
| Pin an image above your apps | Open its editor and click **Pin to screen**. Drag the image or empty header space; use +/−, the wheel, opacity, or × to close. Escape closes a pin during a drag. New screenshots work while references stay pinned. |
| Number steps in a screenshot | Choose **Numbered marker** and click the image; numbers advance automatically. |
| Change an existing annotation | Choose **Select annotation**, drag to move, use the bottom-right handle to resize, or press Delete. |
| Copy text from an image | Click **Copy text from image** in the editor, select an installed OCR language, click or drag over highlighted words, review the editable result, and copy it. **Select all text** restores the full result. |
| Set screenshot export defaults | **Settings → Screenshot export and OCR** controls the folder, filename pattern, and preferred OCR language. |
| Choose whether the editor opens automatically | **Settings → Desktop integration → Edit after taking a screenshot** (on by default). |
| Change the screenshot shortcut | **Settings → Desktop integration → Screenshot shortcut (GTK accelerator syntax)**. Enter a shortcut such as `<Super><Shift>s` and apply it; an empty field disables the shortcut. |
| Clear history when the computer shuts down | Turn on **Settings → Clipboard history → Clear history on shutdown**. It is off by default and also clears on restart, logout, or extension reload. |
| Choose a language | **Settings → Appearance → Language**. All seven languages are included in the same installer and apply immediately. |
| Pick an emoji or character | Use the emoji, kaomoji, or symbols tab, choose a category in the horizontal bar, and click an item in the grid. |

Screenshot capture enters history when **Capture clipboard history** is enabled.
The shutdown option removes existing saved history and keeps the current session's
text, images, pins, and emoji recents only in memory. GNOME's separately saved
files in Pictures/Screenshots remain. See the [screenshot](#take-a-screenshot)
and [shutdown](#clear-history-on-shutdown) instructions for details.

## Screenshots

**Visual screenshot text recognition — v0.1.14**

Click or drag over recognized words in the screenshot preview, then edit and copy
the selected text. This is the actual GTK dialog in an isolated Wayland test session.

![Visual screenshot OCR with two words selected and extracted](docs/screenshots/ocr-v0.1.14.png)

**Screenshot editor — v0.1.9**

The editor includes inline text entry, light mosaic, a black-and-white filter, annotation selection, numbered markers, local OCR, and screen pins.
This image comes from the isolated native Wayland test session.

![Super V 0.1.9 native screenshot editor with annotation selection, numbered marker, OCR and pin controls](docs/screenshots/screenshot-editor-v0.1.9.png)

**Text entry — v0.1.9**

The input appears directly on the image and retains its text/caret when moved.

![Native text input with its caret](docs/screenshots/text-entry-v0.1.9.png)

**Light mosaic brush — v0.1.9**

This example uses the actual export renderer with two brush/tile sizes.

![Opaque light gray-and-white freehand mosaic strokes](docs/screenshots/mosaic-brush-v0.1.9.png)

**Text and image history — v0.1.6**

Copied images share the clipboard list with text. This screenshot shows the
v0.1.6 interface; current releases capture a fresh area with the camera button or
**Super+Shift+S**. **Print Screen** opens GNOME’s normal screenshot controls.

![Super V 0.1.6 text and image history with thumbnail previews, dimensions and a screenshot button](docs/screenshots/clipboard-images-v0.1.6.png)

**Clipboard settings — v0.1.6**

Clear history on shutdown is enabled in this example, which disables persistent
history while keeping current items in memory.

![Super V 0.1.6 settings showing image capture and Clear history on shutdown](docs/screenshots/shutdown-settings-v0.1.6.png)

**Emoji picker — v0.1.6**

The six-column grid, horizontal category bar and compact skin-tone selector.

![Super V 0.1.6 emoji picker with horizontal category buttons and a screenshot button](docs/screenshots/emoji-picker-v0.1.6.png)

Captured from v0.1.6 in isolated GNOME Shell 50.1 Wayland sessions with synthetic
clipboard items and bundled emoji. Full desktop acceptance is tracked in
[testing](docs/testing.md).

## Install the Debian package

Already using Super V? Follow [Upgrade from an older version](#upgrade-from-an-older-version).

Download [`super-v-ubuntu_0.1.14_all.deb`](https://github.com/LincolnGothic/super-v-ubuntu/releases/download/v0.1.14/super-v-ubuntu_0.1.14_all.deb)
from [release v0.1.14](https://github.com/LincolnGothic/super-v-ubuntu/releases/tag/v0.1.14),
then open a terminal in the folder containing the downloaded file and run:

```sh
sudo apt install ./super-v-ubuntu_0.1.14_all.deb
```

**Save your work, log out, and log back in** so GNOME discovers the system
extension. Then run these commands as your ordinary user, without sudo:

```sh
gsettings set org.gnome.shell.keybindings toggle-message-tray "['<Super>m']"
gnome-extensions enable super-v-ubuntu@super-v-ubuntu.local
gnome-extensions info super-v-ubuntu@super-v-ubuntu.local
gnome-extensions prefs super-v-ubuntu@super-v-ubuntu.local
```

GNOME normally assigns both Super+V and Super+M to notifications. The first
command leaves notifications on Super+M so Super+V can open this extension.
It replaces any custom notification shortcut. To restore GNOME's defaults,
run `gsettings reset org.gnome.shell.keybindings toggle-message-tray` after
disabling this extension.

Press **Super+V**; the header should show **Super V 0.1.14**. Capture begins after
extension initialization, with a default
100-entry limit and persistent history. Change preferences to pause capture,
disable persistence or automatic paste, and choose another shortcut.
Enabling this extension grants it access to clipboard text and images; read
[the privacy notes](SECURITY.md).

## Upgrade from an older version

1. Download the [v0.1.14 installer](https://github.com/LincolnGothic/super-v-ubuntu/releases/download/v0.1.14/super-v-ubuntu_0.1.14_all.deb).
2. Open a terminal in the download's folder and run the command below. Installing
   it over the previous package upgrades Super V; no uninstall is needed.

   ```sh
   sudo apt install ./super-v-ubuntu_0.1.14_all.deb
   ```

3. **Save your work, log out, and log back in.** On Wayland, GNOME keeps the
   extension's previous code loaded until you start a new session.
4. Press **Super+V** and check that the header shows **Super V 0.1.14**. Your
   language and shortcut settings remain. Saved text history, pins, and emoji
   recents migrate; history configured to clear at logout is erased as requested.

To check both the installed package and the extension loaded by GNOME, run
these commands as your ordinary user:

```sh
dpkg-query -W super-v-ubuntu
gnome-extensions info super-v-ubuntu@super-v-ubuntu.local
```

The package should report **0.1.14**; the extension's **Version** should also
report **0.1.14** (the internal extension number is 15). If the package is new but
GNOME still reports an old version, log out/in before reinstalling.

The extension's **Path** should be
`/usr/share/gnome-shell/extensions/super-v-ubuntu@super-v-ubuntu.local` for the
Debian package. A user-local copy of the same UUID overrides this system copy.
If Path points into your home directory, back up and move only that UUID's
directory outside `${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions`,
then log out/in to load the system package. If Super+V does not open afterward,
follow [Troubleshooting](#troubleshooting).

## Languages

One installer includes English, Simplified Chinese, Traditional Chinese, Japanese,
Spanish, French and Korean. Open **Super+V → Settings → Appearance → Language**
to choose a language for Super V. The interface, preferences and localized search
update immediately, without logging out or changing your desktop’s display language.
Language names stay in their native form so you can always switch back.

The default, **Follow system**, uses the GNOME session language. Unsupported
languages and missing messages fall back to English. Changing Ubuntu's session
language itself still requires logging out/in.

Chinese is selected by script/region: Taiwan, Hong Kong and Macau use Traditional
Chinese; mainland China, Singapore and generic Chinese use Simplified Chinese.
Spanish and French use a shared translation across their regional locales.
Emoji names, search keywords, kaomoji/symbol labels, settings, notifications and
accessible control labels are localized. English emoji and character names remain
searchable in every language. See [translation contributions](docs/translations.md).

Emoji categories appear in a single horizontal icon bar, with translated tooltips
and a selected highlight. Use the arrows or horizontal scrolling to reveal more
categories. Focus a category and use Left/Right or Home/End to move along the bar;
Enter selects it and Down moves into the grid. Kaomoji and symbols use horizontal
category labels. The hand button opens a skin-tone menu.

## Position and dismissal

Click the input field you want to use, then press Super+V. The default
**Picker position → Near last click** uses the last primary click in the focused
application, even after the mouse moves away. Moving that window preserves the
relative point; resizing it or switching to an application without a recorded
click falls back to the mouse pointer. Only one window and point are remembered
in memory; no input text or keystrokes are recorded for positioning.

The popup measures its final layout and reduces the scrollable body to fit the
monitor's usable work area. Drag the title bar to move it; dragging stops at the
screen edges. **Picker position → Center of screen** centers it in the usable
area. Reopening resets manual placement. This is approximate input positioning,
not exact text-caret tracking. Clicking outside closes without pasting; Escape
and Super+V also close it.

## Clipboard

Copied plain text appears newest first. Exact duplicates move to the front
without losing their pin. Unicode and multiline contents are preserved; the
popup uses short, single-line previews, while the full text is restored to the
clipboard. Search matches normalized, case-insensitive terms. History never
transmits data. Text over 16 KiB is ignored rather than truncated. Ordinary
history defaults to 100 entries (configurable 1–500); up to 100 pins survive
ordinary trimming and **Clear unpinned**. A total 2 MiB text budget may trim
ordinary entries earlier than their count limit.

Copied **PNG and JPEG images** appear in the same history with a thumbnail and
pixel dimensions. PNG/JPEG aliases and mislabeled image data are recognized;
supported BMP/WebP pixels are converted to PNG. A single copied local image file
is also imported when the app supplies a URI-list or GNOME file clipboard offer.
Remote image URLs and groups of files are not downloaded or imported.
Choose an image to copy its stored bytes and send your application’s paste
shortcut; the receiving app must accept images. Images can be pinned and deleted
just like text. Search matches “Image” in your chosen language, PNG/JPEG, or
dimensions; it does not search text inside images.

Images are limited to **8 MiB each and 32 MiB total**, including pins, with at
most 8192 pixels per side and 16 megapixels. Input and converted PNG output must
both fit the limits. Older unpinned images are removed when that budget is full.
PNG/JPEG data is checked before a bounded thumbnail is decoded. WebP requires a
system GdkPixbuf decoder. Other image formats and rich text are ignored. Existing
text history, pins, and emoji recents migrate on upgrade.

Use Up/Down to select, Enter to paste, Delete to remove the selected entry,
Escape to close, Ctrl+F to focus search, and Ctrl+Tab to cycle through all five tabs.
Tab navigates controls; the pin and delete buttons have accessible labels.
Mouse selection is supported. Preferences can erase pins and emoji recents too.
Clear requests made while disabled are applied on the next enable.

Automatic paste returns focus and sends a virtual-keyboard shortcut. Ctrl+V is
the default; recognized terminal IDs use Ctrl+Shift+V. Configure exact IDs/WM
classes under **Apps using Ctrl+Shift+V**, or set **Paste overrides**, for example:

```json
{"kitty":"ctrl-shift-v","some.editor.desktop":"shift-insert","special.app":"manual"}
```

Allowed values are `ctrl-v`, `ctrl-shift-v`, `shift-insert`, and `manual`. If
the destination disappears, focus changes, physical modifiers stay held, or
injection fails, the item remains on the clipboard for manual paste. The
extension cannot verify that a receiving application accepted the text.

## Take a screenshot

Click the camera button in the Super+V header or press **Super+Shift+S**.
A fresh crosshair appears with **no remembered selection rectangle**. Drag the
area you want, then release the mouse to finish selection.
The desktop freezes as capture starts, before selection opens. Drag over this
snapshot; the exported pixels retain notifications, menus and other transient
content that was visible when capture began. Escape cancels. The PNG goes to the
clipboard and, when enabled, image history.
The previous editor closes before the new selection starts.

The Super V area capture does not automatically save another raw screenshot
file. Use **Save image** in the editor to choose a destination. **Print Screen**
still opens GNOME’s normal area/window/screen controls and follows its own saving
settings. Change or disable the Super V shortcut in **Settings → Desktop
integration → Screenshot shortcut**; an empty field disables only this shortcut.

## Edit a screenshot

Screenshots taken with Super V open a separate editor automatically. Turn off
**Settings → Desktop integration → Edit after taking a screenshot** to keep
capture without opening it. Images in history always have an **Edit image**
pencil button; select an image and press **Ctrl+E** for the same action.

Choose **Crop**, **Arrow**, **Rectangle**, **Highlight**, or **Pen** and drag on
the image. Choose **Text** to show a focused input box directly on the image,
with a native typing caret. Type, click another image location to move the box
without losing your text, and press **Enter** to finish. Escape cancels the text
draft. Selecting a committed text annotation exposes its input box for editing.
Copy, Save, and Pin also finish the current text draft.

**Light mosaic** replaces the old black-cover button. Draw freely across the
area to cover, using **Mosaic brush thickness** (1–256 image pixels) and
**Mosaic tile size** (4–64 image pixels). It paints opaque white/light-gray square
tiles, independent of the source image’s colors. A click paints a round dab.
The visual inspiration is the subtle [GitHub CLI square pattern](https://cli.github.com/);
the application draws its own pattern and includes no downloaded artwork.

**Black and white** in the header toggles grayscale for the source image.
Annotations keep their chosen colors, and mosaics keep their light palette.
The filter, mosaic strokes, and text placement support Undo/Redo. Color and size
controls apply to ordinary annotations. **Zoom** is relative to fitting the
image in the window; **Move image** pans it. Use Undo/Redo, **Ctrl+Z**, or
**Ctrl+Shift+Z** to revise edits; while typing, the input handles text shortcuts.

**Copy image** (**Ctrl+C**) exports a flattened PNG to the clipboard, which you
can paste into your application. With history capture enabled, the edited image
is also added as a separate entry. **Save image** (**Ctrl+S**) asks for a PNG
destination. Closing the editor discards unsaved edits.

Mosaic covers change exported pixels; the original history image and files saved
separately remain. Inspect the export before sharing it. Editing is temporary,
without an on-disk project or scratch image. The same bounded PNG/JPEG inputs and
PNG exports apply. Automatic window detection and scrolling capture are not included.

**Numbered marker** starts at 1 and advances with each click. **Select annotation**
selects the topmost mark in its bounds; drag to move it or drag its bottom-right
handle to resize it. Color and size controls change the selected mark; text marks
also expose their text field. Delete removes only that mark. Undo/Redo preserves
later annotations. Selection outlines and handles do not appear in exports.

## Pin to screen

In an image's editor, click **Pin to screen**. A temporary floating copy stays
above application windows and follows you across workspaces. Drag its image or
header; +/− and the wheel zoom it, and the percentage button cycles image opacity
between 100%, 75%, 50%, and 25%. Copy restores the pin's exported PNG bytes;
Close or Escape removes the focused pin. Up to five pins share a 32 MiB input
budget; their screen previews are decoded to at most 1024×1024 pixels. The image
is kept inside a monitor's work area when moved or monitors change.

These screen pins are separate from pins retained in clipboard history. They
are not saved after logout, and lock, clear, or disabling Super V closes them.
Deleting the source history entry closes its screen pins too. Editing a pin later
requires opening its image from history again.

## Copy text from an image

Click the visible **Copy text from image** button in the editor (or press
**Ctrl+Shift+O**). Tesseract recognizes the edited, cropped image locally and
highlights its words in a preview above the editable result.

- Click a highlighted word or drag across a region to extract just those words,
  in reading order. The image and annotations stay intact.
- Edit the extracted text, then click **Copy text** or press **Ctrl+C**. A selected
  range in the text field is copied when one exists; otherwise the entire field
  is copied. Empty or oversized results leave the clipboard unchanged.
- Click **Select all text** to restore all recognized words. This replaces edits
  in the result field with the original recognition.
- Choose an installed language and click **Recognize text** to run again. Close
  the dialog to cancel a running recognition.

Recognition can make mistakes; review the result before using it. Work is cancelled
when the dialog/editor closes. Each run has a 30-second total timeout, a 64 KiB text
limit, a 512 KiB geometry-output limit and at most 4,096 word highlights. Image
data passes through anonymous pipes without scratch images, accounts, network
requests, or cloud services.

English OCR is installed with the package. For Simplified Chinese, install:

```sh
sudo apt install tesseract-ocr-chi-sim
```

Choose **简体中文** in the OCR dialog and click **Recognize text**. For another
language, install the corresponding package below; install only the packs you need.

| Recognition language | Tesseract package |
| --- | --- |
| English | `tesseract-ocr-eng` (included) |
| 简体中文 / Simplified Chinese | `tesseract-ocr-chi-sim` |
| 繁體中文 / Traditional Chinese | `tesseract-ocr-chi-tra` |
| 日本語 / Japanese | `tesseract-ocr-jpn` |
| 한국어 / Korean | `tesseract-ocr-kor` |
| Español / Spanish | `tesseract-ocr-spa` |
| Français / French | `tesseract-ocr-fra` |

Settings chooses the preferred OCR language; the OCR dialog lists packs actually
installed and falls back to the first available pack if the preference is missing.
English is included with another language when its pack is installed, so mixed
text can be recognized. OCR language and interface language are separate choices.

## Export preferences

**Settings → Screenshot export and OCR → Default save folder** chooses a folder.
A successful save remembers its location. **Filename pattern** accepts `{date}`,
`{time}`, `{width}`, and `{height}`; names end in `.png`. For example,
`capture-{date}-{width}x{height}` becomes `capture-2026-10-03-640x140.png`.
The save dialog still lets you choose a name and destination each time; existing
files require its overwrite confirmation. **Reset export preferences** restores
the default name and folder behavior.

## Clear history on shutdown

Open **Settings → Clipboard history → Clear history on shutdown**. This option
is off by default. When enabled, all history, including images, pins and emoji
recents, stays only in memory. It also clears on restart, logout, or extension
reload. Enabling it removes existing saved history, after pending writes finish,
while retaining the current session’s items in memory. It takes priority over
**Remember after logout**. Returning to persistent history requires disabling
this option and enabling Remember after logout.

## Emoji

The bundled database contains 3,944 fully-qualified Emoji 17.0 sequences,
including ZWJ, flags and skin-tone combinations, with CLDR 48 names and keywords in the six additional languages and English.
Search by name, keyword or emoji. Select All, Recent or a Unicode group directly
from the horizontal category bar; the hand button opens the skin-tone menu.
All includes mixed-tone sequences; individual tones match uniform variants.
Recents are capped at 30 and follow the persistence preference.

Emoji appear as large symbols in a six-column grid, with fewer columns on
narrow monitors. Up/Down move between rows and focus the grid; Left/Right
then move between emoji. Enter inserts the selected emoji, or click a tile.
Use Ctrl+F to return to search, where Left/Right still move the text cursor.
Emoji names remain available to screen readers. More results load as keyboard
selection passes the current page, or with **Show more**.

Emoji insertion saves the previous bounded plain-text clipboard in memory,
copies the emoji, and sends the configured paste shortcut. Reopen the popup
and choose **Restore clipboard** after paste has finished if you want the old
text back. Restoration only happens if the clipboard still contains that
emoji; newer copies are preserved. There is no timed restoration, since a
Wayland paste consumer provides no reliable completion acknowledgment here.
Images, rich-text formats, oversized text and password-marked clipboard data
are not snapshotted. Temporary emoji and restore writes do not enter history.
New emoji may appear as missing glyphs with older installed emoji fonts.
The database is complete even where the system font cannot render a sequence.

## Kaomoji, symbols and GIFs

The **;-)** tab contains text emoticons, and **Ω** contains math symbols, Greek
letters, arrows, currency, punctuation and units. Search by name or character,
choose a category, and click or press Enter to insert. Their grids use the same
keyboard navigation and guarded prior-text restoration as emoji.

In **Settings → GIF favorites**, choose local `.gif` files. The GIF tab previews
their first frame and searches filenames. Up to 40 favorites are supported;
each file must be at most 8 MiB with dimensions no larger than 2048 × 2048.
Files remain in their original location, so moving or deleting one requires
re-adding it. Removing a favorite does not delete the original file.

Choosing a GIF copies the original `image/gif` bytes and sends the normal paste
shortcut. The destination must accept images; some apps paste a still frame
or do not accept this format. GIF insertion replaces the clipboard without a
restore snapshot, and image data does not enter text history. There is no
online GIF search, account, API key or runtime network request.

## Privacy

Everything stays local. There is no telemetry, synchronization, analytics,
logging of clipboard contents, or runtime network access. Persistent state is
plaintext at `${XDG_STATE_HOME:-$HOME/.local/state}/super-v-ubuntu/history.json`,
with image files in its `images/` subdirectory and 0700 directory/0600 file modes. Common password-manager MIME hints are
rejected; focused-app exclusions are best effort because Mutter does not
provide reliable origin identities for every copy. Private browsing and
password fields without a hint are not automatically detected. See `SECURITY.md`
for exact erasure steps and limitations.

## Build and development

On Ubuntu 24.04:

```sh
sudo apt install build-essential debhelper libglib2.0-bin nodejs python3 gettext locales eslint gjs \
    gir1.2-gtk-4.0 gir1.2-adw-1 gir1.2-gdkpixbuf-2.0 lintian git gh
make test
make package
lintian --fail-on error,warning ../super-v-ubuntu_0.1.14_all.deb
```

No npm dependencies or runtime downloads are required. Debian's build invokes
the checks, ESLint, Node tests and GJS integration tests itself. `make package`
uses debhelper/dpkg-buildpackage and writes the `.deb` into the parent directory.
`make install-local` installs just the runtime extension for your current user;
run it without sudo, log out/in, then enable the UUID as above. This user copy
takes precedence over a system copy, so remove it when testing the `.deb`.
See `docs/development.md`, `docs/architecture.md` and `CONTRIBUTING.md`.

## Troubleshooting

**Super+V does not open:** check `gnome-extensions info` below. If the extension
is disabled, run `gnome-extensions enable super-v-ubuntu@super-v-ubuntu.local`
without sudo. If Super+V opens notifications, run the notification-shortcut
command in [First installation](#install-the-debian-package); Super+M will still
open notifications.

**An old version or missing new settings:** follow the package, loaded-version,
and Path checks in [Upgrade](#upgrade-from-an-older-version). Save your work and
log out/in after an installation or upgrade.

**Cannot open Settings from the picker:** run
`gnome-extensions prefs super-v-ubuntu@super-v-ubuntu.local` without sudo.

First inspect version, session and extension state:

```sh
gnome-shell --version
printf '%s\n' "$XDG_SESSION_TYPE"
gnome-extensions info super-v-ubuntu@super-v-ubuntu.local
journalctl --user -b -o cat | rg 'super-v-ubuntu|Super V|JS ERROR'
```

If the extension was newly installed or its code changed, log out/in on Wayland.
Alt+F2 then `r` does not restart a Wayland shell. A shortcut conflict may require
changing the GTK accelerator in preferences, e.g. `<Control><Alt>v`. GNOME's
extension system cannot always detect another program claiming the same key.
If a terminal does not paste, add its identifier or select a paste override.
If capture is missing, check capture/exclusion settings, the 16 KiB text limit and the image limits.
Corrupt state is erased with a generic notification, without copying it into
logs or retaining backups. Report shell errors with clipboard content redacted.

## Uninstall

```sh
gnome-extensions disable super-v-ubuntu@super-v-ubuntu.local
sudo apt remove super-v-ubuntu
```

Uninstalling does not remove user history. To erase it, follow `SECURITY.md`.
For a user-installed copy, disable it first and remove only its UUID directory:

```sh
rm -rf -- "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/super-v-ubuntu@super-v-ubuntu.local"
```

## Publish

GitHub Actions validates and builds each main-branch push. After these checks
pass, the release job publishes the package and `SHA256SUMS` for the version
in `package.json`, then downloads them again to verify the checksum. Existing
versioned releases are left unchanged. Pull requests do not publish releases.
The release job alone has repository contents-write permission; the build
job uses read-only permission. See the repository's Actions page for actual
run results. The dated record in `docs/verification.md` describes local checks
performed before initial publication, not current GitHub publication status.

The owner can run `./scripts/publish.sh` from a clean main checkout with GitHub CLI
credentials. It pushes main, waits for the six native CI targets and automatic
release publication, then downloads all installers and verifies `SHA256SUMS`.
It refuses a different origin or an existing private repository.
