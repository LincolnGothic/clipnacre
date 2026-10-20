ClipNacre 0.1.16 — formerly Super V Ubuntu

Clipboard, screenshots, and text—kept local.

This release gives the project a platform-neutral name: ClipNacre. The picker,
notifications, preferences, six translated catalogs and default screenshot
filenames use the new brand. The canonical repository is now
https://github.com/LincolnGothic/clipnacre.

Existing Linux users can upgrade directly. The Debian package remains
super-v-ubuntu, and the GNOME extension UUID, settings schema, gettext domain
and history paths are unchanged. Existing saved filename preferences remain
valid. Historical releases and screenshot images retain their original names.

Downloads target Ubuntu 24.04 / GNOME 46, Ubuntu 26.04 / GNOME 50, and
Debian 13 / GNOME 48, on amd64 and arm64 Wayland sessions. Use your distribution's
installer, save your work, log out and log back in. No uninstall is required.

A native macOS port is planned. This release does not contain a Mac application.

The existing release workflow gates publication on native tests, packaging,
installation checks and package audits across all six Linux distribution/CPU
targets. It publishes four installers and SHA256SUMS, then downloads the assets
again to check their hashes. Interactive physical-desktop acceptance remains
separate from headless automated checks.
