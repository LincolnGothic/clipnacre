# v0.1.15 validation

Ubuntu's Show Applications button opens GNOME's overview. The screenshot binding
previously allowed only NORMAL and POPUP action modes, so Mutter filtered the
shortcut out before `takeScreenshot()` ran. The screenshot binding now also
allows OVERVIEW. The clipboard popup binding is unchanged.

The capture path still freezes the visible scene before opening the area selector.
After successful export, it hides the overview only when opening the automatic
editor, so the GTK window is visible. Cancellation and capture without automatic
editing keep the overview. Lock and greeter checks, cancellation,
image limits, clipboard handling and local OCR remain in place.

Native regression coverage delivers real virtual keyboard and pointer events in
an isolated GNOME Wayland compositor. It covers the window overview, application
grid, search, a custom accelerator, Escape cancellation without adding history,
and the selected image's dimensions and frozen pixels after the live overview
has disappeared. A completed capture with automatic editing enabled also checks
that the editor is presented.

The regression was run against the old binding first: it timed out waiting for
the selector after delivering Super+Shift+S in the window overview. With OVERVIEW
added, the shortcut reaches the selector. A custom-accelerator check waits for
Mutter to rebuild grabs after its GSettings notification. Pixel comparisons decode
PNG data so encoder metadata does not affect the result.

Executed locally on GNOME Shell 50.1:

- `make package` passes metadata/schema/generated-data validation, ESLint,
  all 210 Node tests, native GJS integration and 17 Gettext/regional checks.
- All 348 messages remain complete in the six translated catalogs.
- The universal and Ubuntu 26.04 installers pass the package audit.
- Complete English native Wayland suites pass at 1280×960 and in the 1280×720
  placement/interaction session, including frozen overview pixels, cancellation,
  custom bindings, automatic editor presentation and the existing screenshot,
  clipboard, local OCR and screen-pin workflows.
- A full native run timed out later waiting for the existing screenshot editor
  while a package build was running. The overview checks had passed; the final
  full native checks passed separately from packaging.

The CI pipeline
requires Ubuntu 24.04 / GNOME 46, Ubuntu 26.04 / GNOME 50, and Debian 13 / GNOME 48
on amd64 and arm64 before publishing installers and SHA256SUMS. Headless software
rendering does not establish hardware GPU, HiDPI/multi-monitor or every third-party
extension combination; see [desktop acceptance](testing.md).
