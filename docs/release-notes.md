ClipNacre 0.2.0 — native Mac app and fully branded downloads

The native Swift/AppKit Mac app is now included for Apple Silicon and Intel.
It provides clipboard text/image history, emoji/kaomoji/symbol search, local GIF
favorites, native screenshot selection, image annotations/cropping/mosaic,
undo/redo, floating image pins and on-device Vision OCR with selectable results.
Open with Command+Shift+V; capture with Command+Shift+S or the Screenshot button.

Choose clipnacre_0.2.0_macos_arm64.dmg for Apple Silicon or
clipnacre_0.2.0_macos_x86_64.dmg for Intel. ZIP versions are also included.
Drag ClipNacre.app to Applications. Mac downloads are ad-hoc signed and
unnotarized; see the Mac guide for macOS opening and Accessibility/Screen
Recording permission instructions:
https://github.com/LincolnGothic/clipnacre/blob/main/docs/macos.md

All public installer filenames now start with clipnacre. Linux downloads include
Ubuntu 24.04, Ubuntu 26.04, Debian 13 and an all-target Linux package. The internal
Linux package name, GNOME extension UUID, settings and history paths remain
compatible; install the new .deb over the previous package, then log out/in.
Historical releases keep their original downloads.

The release gate requires both native Mac architectures and all six existing
Linux distribution/CPU targets. Mac checks include unit tests, clipboard ownership
regressions, private capture-file limits, native redaction/export and Vision OCR,
app signing/architecture, ZIP and DMG checks. SHA256SUMS covers all eight installers.

macOS 13+ is the deployment target; CI runtime checks use macOS 15. Interactive
TCC permission approval, paste into arbitrary apps, multi-monitor screenshot
selection and physical lock/sleep behavior still require manual Mac acceptance.
No Developer ID signing, notarization or full interactive desktop acceptance is
claimed. Everything processed by the app remains local; screenshot import uses a
private temporary PNG that is removed after import or cancellation.
