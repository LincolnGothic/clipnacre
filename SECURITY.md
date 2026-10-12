# Security and privacy

This extension operates inside GNOME Shell and can read clipboard text and images and
send input to your applications. Enable it only if you trust the source.
There are no runtime network calls, telemetry, cloud storage or analytics.
Developer publishing and upstream-data maintenance scripts are explicit
network operations; they are not installed as part of the extension.

Persistent history and emoji recents are stored, unencrypted, in
`${XDG_STATE_HOME:-$HOME/.local/state}/super-v-ubuntu/history.json`. Image bytes
are in its private `images/` subdirectory under validated digest filenames.
Stored image bytes are bounded and checksum-checked before decoding a small
thumbnail. The directory
is mode 0700 and files are mode 0600. Atomic private replacements keep no
backup. Symbolic links at the project state-directory path are refused, and
symbolic links at the history-file path are removed without following them.
An invalid JSON/version/record is treated as corrupt state and removed.
Disk loading is bounded to 16 MiB, individual text to 16 KiB, total text to
2 MiB, ordinary count to 500 and pins to 100. PNG/JPEG images are limited to
8 MiB each, 32 MiB total (including pins), 8192 pixels per side and 16 megapixels. Other users cannot normally read
this file, but your account, administrator, malware running as you and backups
can. File permissions do not encrypt it or securely erase storage media.

Capture defaults to enabled, with persistence. Pause capture to prevent future
automatic additions. Pausing does not delete memory or disk history. Turning
off **Remember after logout** deletes the state file and managed images after pending writes finish
and keeps current history only in memory. The extension does not capture copies
while it is disabled or locked; it does not sample the existing clipboard on
startup. Disabling without turning off persistence keeps the saved history.
**Clear history on shutdown** overrides persistence and keeps all history, pins
and recents only in memory. Enabling it removes existing disk state while keeping
current memory. Restart, logout, shutdown and extension reload lose those items.
There is no shutdown callback that can race with pending writes.
GNOME’s Print Screen UI saves its own files in Pictures/Screenshots and copies a
PNG to the system clipboard. Super V does not remove those separate files or
clear another application’s system clipboard when history is erased.

The temporary screenshot editor receives images through anonymous pipes and
keeps drawing/undo state in memory, without a scratch image. Locking, clearing
history, deleting its source entry or disabling Super V closes it. Copy exports
flattened PNG pixels through Shell; Save writes only to the chosen destination.
The light mosaic brush paints opaque gray/white tiles over exported pixels. The original history image and
separately saved files remain separate and may still contain sensitive data.
Saved exports are independent files and are not cleared with clipboard history.

Screen pins are temporary, with five pins and a 32 MiB compressed-input budget.
Their decoded previews are limited to 1024×1024; original pin bytes are held only
in memory for Copy. Lock, clear, and disable destroy overlays and references.
OCR invokes the installed Tesseract executable directly, without a command shell;
images enter stdin and bounded text/word geometry leaves stdout. No scratch images or network
service is used. Cancelling or closing the editor stops recognition; a run is
limited to 30 seconds, 64 KiB recognized text, 512 KiB TSV output and 4,096 word
highlights. Word coordinates must fit the edited image. OCR text reaches the clipboard only after
an explicit Copy. Settings store a save-folder URI, filename pattern, and OCR
language ID, but no image or recognized text. Independent exports and GNOME
screenshots retain the same erasure limitations described above.

Password-manager MIME hints `x-kde-passwordManagerHint`,
`application/x-keepassxc`, `application/x-keepass`, `x-gtk-password` and
`application/x-bitwarden` are rejected. Defaults also exclude common password
manager WM classes/application IDs. Exclusions use the focused app at copy
time and recheck after the read; that app may differ from the actual origin.
Background copies, browser password fields, browser extensions, remote
clipboard services and clipboard managers that strip MIME hints can defeat
these measures. They are safeguards, not a promise that secrets cannot enter
history. If a secret was captured, delete it and rotate it where appropriate.

Automatic paste checks the exact destination window, user-session state and
held modifiers. Each emitted key is released even on failure. Terminals can
use Ctrl+Shift+V; configurable overrides include manual paste. A receiving
terminal may execute pasted lines according to its own configuration; inspect
what you choose to paste. The extension does not run copied text as commands.

Emoji clipboard snapshots are bounded plain text, held only in memory and
discarded on full clear, a new history choice, disable or lock. Nontext formats
and password-marked data are not saved. Restore is explicit and only succeeds
if the current clipboard still equals the selected emoji. Internal text and image writes are
suppressed from capture for three seconds; copying exactly the same value
yourself during that brief window may also be ignored. No timer overwrites an
application's pending paste.

To erase all history while active, use preferences **Erase all saved items**.
If disabled, a clear request is deferred until enabling. For immediate erasure
without enabling, run as your desktop user:

```sh
gnome-extensions disable super-v-ubuntu@super-v-ubuntu.local
```

Log out and back in to ensure shell memory and pending writes are gone. Then:

```sh
rm -f -- "${XDG_STATE_HOME:-$HOME/.local/state}/super-v-ubuntu/history.json"
rm -rf -- "${XDG_STATE_HOME:-$HOME/.local/state}/super-v-ubuntu/images"
```

This does not clear the system clipboard or external backups. Settings contain
no clipboard text; reset them separately if desired using an explicit schema
directory, as described in `docs/development.md`. Uninstallation deliberately
does not modify any user's state as root.

For a suspected vulnerability, contact the repository owner privately through
GitHub rather than posting clipboard contents or exploit-sensitive details in
a public issue. Private security reporting must be enabled by the owner after
publication; its availability has not been verified in this local checkout.
Include version, GNOME version, reproduction steps and redacted logs.

Super V freezes the desktop before its fresh crosshair selector takes an input
grab. The preview and export use that same snapshot, including visible transient
notifications and menus.
It writes the PNG to the clipboard and optional bounded image history, without
an extra raw screenshot file. Cancellation, clear, lock and disable invalidate
pending captures before they can copy, store or open an editor.

Clipboard image import also recognizes MIME aliases and mislabeled PNG/JPEG data.
Supported BMP/WebP input is decoded only with bounded dimensions and converted
to bounded PNG. URI-list or GNOME file clipboard offers may cause one explicitly
copied local PNG/JPEG/BMP/WebP file to be read into history. File reads reject
non-regular files and symlinks at the metadata check, have a three-second timeout,
and cap bytes during transfer. Remote links and file collections are ignored.
All imports obey history pause, app exclusions, password hints and generation
cancellation. Reading a copied file does not delete or modify its original.
