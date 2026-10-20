Super V Ubuntu 0.1.15 fixes screenshots in Ubuntu Show Applications.

Previously Super+Shift+S stopped responding after clicking the dock's
**Show Applications** button. GNOME switches to its OVERVIEW action mode there,
which the shortcut did not allow. The configured screenshot shortcut now works
in the application grid, window overview and overview search as well as normal
applications and popups.

Capture keeps the visible overview in the frozen snapshot. Drag to select an
area; Escape cancels without adding a history item. Custom screenshot shortcuts
also work in the overview. A completed capture leaves the overview when opening
the automatic editor so its window is visible. Existing screenshot editing, local OCR, clipboard
history and screen pins remain available.

Upgrade using your distribution's installer, then save your work, log out and
log back in to load the new GNOME extension. Settings and saved history are
retained; history configured to clear at logout is erased according to that setting.

Native Wayland regression tests deliver actual keyboard and pointer events in
window overview, Show Applications and search. They check frozen exported pixels,
Escape cancellation and custom accelerators. The release pipeline builds and
checks Ubuntu 24.04 / GNOME 46, Ubuntu 26.04 / GNOME 50, and Debian 13 / GNOME 48
on amd64 and arm64 before publishing installers and SHA256SUMS.
