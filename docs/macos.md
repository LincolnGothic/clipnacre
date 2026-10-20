# ClipNacre for macOS

ClipNacre is a native Swift/AppKit menu-bar application for macOS 13 or later.
Clipboard history, character search, screenshot editing, floating image pins and
Vision text recognition run locally. No account, Node runtime, Tesseract install,
or cloud service is required on your Mac.

## Download and install

Open [release v0.2.0](https://github.com/LincolnGothic/clipnacre/releases/tag/v0.2.0):

| Your Mac | Disk image | ZIP alternative |
| --- | --- | --- |
| Apple Silicon, including M1/M2/M3/M4 and later | `clipnacre_0.2.0_macos_arm64.dmg` | `clipnacre_0.2.0_macos_arm64.zip` |
| Intel | `clipnacre_0.2.0_macos_x86_64.dmg` | `clipnacre_0.2.0_macos_x86_64.zip` |

Choose Apple menu → About This Mac if you are unsure which processor you have.
Open the disk image and drag **ClipNacre.app** to **Applications**, or unzip the
archive and move its app there. Open ClipNacre; its clipboard icon appears in
the menu bar. Quit the running app before replacing it on upgrade. The app
keeps its history and preferences outside the application bundle.

These builds are **ad-hoc signed and unnotarized**. They do not carry an Apple
Developer ID certificate. If macOS blocks opening a download you trust, attempt
to open it, then use **System Settings → Privacy & Security → Open Anyway** and
follow macOS's confirmation. See [Apple’s opening instructions](https://support.apple.com/en-us/102445). Do not disable Gatekeeper globally. Developer ID
signing and notarization require the project owner's Apple signing credentials.

Download `SHA256SUMS` beside the installer to check its SHA-256 value. For example:

```sh
shasum -a 256 clipnacre_0.2.0_macos_arm64.dmg
```

Compare the full value with that file's entry in `SHA256SUMS`.

## Clipboard and character picker

Copy text or image pixels, then press **⌘⇧V** or click the menu-bar icon. Search
your history, select a row with the arrow keys and press Enter, or double-click
it. Pin/unpin or delete a history item with the labeled buttons. Escape closes
the picker; **⌘F** focuses search and **Ctrl+Tab** cycles tabs.

The other tabs contain the bundled Emoji 17 catalog, kaomoji, symbols and local
GIF favorites. Category and skin-tone controls filter characters. Search uses
localized names and keywords where available. Newer emoji may need a newer
system emoji font to display correctly. Select the interface language in Settings;
English, Simplified/Traditional Chinese, Japanese, Spanish, French and Korean
are included. Mac system dialogs follow the system's language.

Use **Settings → Add local GIF favorites** to select files. Favorites keep their
original paths; moving a file requires re-adding it. Delete on the GIF tab only
removes the favorite. Up to 40 GIFs are supported, at most 8 MiB and 2048×2048
pixels each. The receiving app determines whether pasted GIFs animate.

**Pause capture** stops recording new copies. Settings also controls history
limit (1–500 unpinned items), persistence, automatic paste, editor-after-capture
and comma-separated excluded application bundle IDs. Press Enter after editing
the history limit or exclusion list. Up to 100 history pins have a separate cap.

## Automatic paste permissions

Without Accessibility access, selecting an entry places it on the clipboard for
manual **⌘V**. To enable automatic paste, use **Settings → Enable automatic paste
(Accessibility)** and enable ClipNacre in macOS Privacy & Security. Relaunch if
macOS requests it. New ad-hoc-signed builds may require granting access again.

Automatic paste checks the original destination app/window, clipboard ownership,
session state and held modifiers. If those checks cannot establish the intended
destination, the clipboard remains ready for manual paste. It cannot confirm
that every receiving application accepted a paste.

## Screenshots, editor and OCR

Press **⌘⇧S** or click **Screenshot**. Allow Screen Recording when macOS asks, then
restart ClipNacre if required. Use macOS's native selection crosshair; Escape
cancels. This first version uses fixed global shortcuts; if another application
already owns one, ClipNacre reports it and its menu-bar/buttons remain available.

A screenshot is imported through a private temporary PNG, copied to the clipboard
after validation, optionally added to history, and opened in the editor. The
temporary file and its private directory are removed after import or cancellation.
Capture uses the system selector's behavior rather than GNOME's frozen overview.

In the editor, select Crop, Arrow, Rectangle, Highlight, Pen, Text, Mosaic,
Grayscale or Number and use the image. Text opens an editor-owned input dialog.
Select a mark to move it, drag its handle to resize, or press Delete. Color and
width controls affect annotations. Undo/Redo, zoom, Fit and Pan are available.
Copy image, Save PNG and Pin image export flattened pixels. Closing discards
unsaved edits. Mosaic replaces source pixels with opaque light gray/white tiles;
check exported images before sharing. Original history images remain separate.

Choose **Recognize text**, select an available Vision language, then click or drag
over highlighted words. Review or edit the text panel and use **Copy text**.
Recognition runs on the Mac, can make mistakes, and is canceled when the editor
closes. Runs are limited to 30 seconds, 64 KiB of text and 4,096 word/line boxes.
Where Vision cannot supply separate word geometry, a whole-line box is shown.

Floating image pins stay above application windows across Spaces. Drag, zoom,
change opacity, copy or close them. Up to five pins share a 32 MiB compressed
budget; previews decode at no more than 1024 pixels per side. Pins are temporary
and close on session lock, history clearing or app exit.

## Data and limits

Saved history is plaintext at
`~/Library/Application Support/ClipNacre/history.json`, in a private directory.
Text is limited to 16 KiB per item and 2 MiB total. PNG/JPEG history images are
limited to 8 MiB each, 32 MiB total, 8192 pixels per side and 16 million pixels.
Supported clipboard TIFF pixels are converted to PNG within those limits. One
explicitly copied local PNG/JPEG file can also be imported; remote URLs and groups
of files are not downloaded. Image decoding and file reads are bounded.

Disable **Remember after logout** to erase saved history and retain this session
only in memory. **Erase all saved items** asks for confirmation and clears history,
history pins and character recents. User-saved exports and original GIF files are
independent and are not deleted. Corrupt saved history is preserved and further
disk writes are suspended until the user explicitly erases it.

Common confidential/transient clipboard hints and excluded app bundle IDs are
best-effort safeguards. They cannot identify every password field, background
copy or source application. There is no telemetry, synchronization or runtime
network request. See [security notes](../SECURITY.md).

## Verification and practical limits

Native Apple Silicon and Intel CI builds compile the app, run history/persistence
XCTest cases, clipboard-generation regressions, native image-export/redaction and
Vision OCR smoke tests, and check signing, CPU architecture, ZIP and DMG output.
The release also waits for all six existing native Linux distribution/CPU checks.

The development workstation runs Windows. Automated Mac checks do not establish
interactive Screen Recording/Accessibility approval, paste into arbitrary apps,
multi-monitor screenshot selection, or physical lock/sleep behavior. These remain
manual Mac acceptance checks; macOS 13/14 runtime behavior is not claimed as tested
on the macOS 15 CI runners. No Developer ID or notarization is claimed.
