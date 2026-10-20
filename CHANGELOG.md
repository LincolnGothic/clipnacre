# Changelog

## 0.1.16 — 2026-10-20

- Rename Super V Ubuntu to ClipNacre with a platform-neutral public identity and canonical repository URL.
- Update the picker, preferences, notifications, interface catalogs, current documentation and default screenshot filename prefix.
- Preserve the Linux package name, extension UUID, settings schema, gettext domain, saved preferences and history paths for direct upgrades.
- Align publishing and acceptance instructions with the new repository and release version.
- Document that a native macOS version is planned; this release contains the Ubuntu/Debian GNOME application.

## 0.1.15 — 2026-10-19

- Fix Super+Shift+S being ignored after opening Ubuntu Show Applications, the window overview or overview search.
- Allow the configured screenshot shortcut in GNOME's overview action mode, preserving the visible overview in the frozen snapshot.
- Present the automatic screenshot editor by leaving the overview after successful capture; cancellation keeps the overview open.
- Add real Wayland keyboard and pointer checks for overview capture, exported pixels, Escape cancellation, automatic editor visibility and a custom shortcut.

## 0.1.14 — 2026-10-12

- Make screenshot text recognition visible in the editor toolbar. Show the edited screenshot with word highlights above the editable result.
- Click a word or drag across a region to select text in reading order. Restore all text, edit recognition mistakes, and copy a selected text range or the entire result.
- Preserve mixed Chinese/English recognition and all seven interface languages. Keep image and OCR data local, using pipes without scratch images.
- Validate OCR word geometry, bound subprocess output and word counts, clear stale results on retry, and cancel recognition when closing.
- Add native Wayland pointer-selection, Unicode editing/copy, empty/oversized text and cancellation regression checks.

## 0.1.13 — 2026-10-04

- Expand the About description with screenshots, annotations, screen pins and local OCR.
- Freeze the desktop when Super+Shift+S starts, before opening the crosshair selector. Select and export from the same snapshot, preserving transient notifications and menus.
- Read PNG/JPEG MIME aliases and try another offered image format if the first transfer fails. Convert supported BMP/WebP clipboard data to PNG.
- Import a single copied local PNG/JPEG/BMP/WebP file from URI-list or GNOME file clipboard offers. Keep existing image limits, password hints, app exclusions and cancellation.

## 0.1.12 — 2026-10-04

- Fix Super+V opening a fully transparent clipboard popup when layout is not ready, especially when reopening at the same size.
- Position and reveal the popup after painting, retry after layout changes, and cancel pending callbacks when it closes.
- Add visibility checks for the initial clipboard panel and repeated opens without changing its contents.

## 0.1.7 — 2026-10-03

- Add a screenshot editor with cropping, arrows, rectangles, text, highlights, freehand drawing and opaque black covers.
- Undo/redo edits, zoom and pan, and copy or save a flattened PNG.
- Open the editor after Super V captures by default; switch this off in Settings.
- Edit existing PNG/JPEG history images with the pencil button or Ctrl+E.
- Include all seven interface languages and bounded, temporary pipe communication.

## 0.1.6 — 2026-10-03

- Capture and paste PNG/JPEG images with thumbnail previews and private storage.
- Open native screenshot controls with the camera button or configurable Super+Shift+S.
- Keep history only in memory with Clear history on shutdown.

## 0.1.5 — 2026-10-02

- Choose any of the seven supported languages in Settings, or follow the system.
- Update the interface, preferences and localized search without logging out.
- Select emoji, kaomoji and symbol categories directly in horizontal bars.
- Add category tooltips, horizontal scrolling, keyboard navigation and a compact skin-tone menu.

## 0.1.4 — 2026-10-02

- Follow the desktop language: English, Simplified Chinese, Traditional Chinese,
  Japanese, Spanish, French or Korean; use English when no translation is available.
- Translate popup controls, settings, notifications, accessible labels, kaomoji
  and symbol names. Keep category IDs, history and recents stable across languages.
- Search emoji using bundled CLDR 48 names and keywords in the selected language;
  English aliases remain searchable. No runtime downloads.
- Add six translated quick-start guides and a gettext contribution workflow.
- Compile and audit translation catalogs and localized data in both installation
  methods; check actual GJS lookups and isolated Shell layouts in seven languages.

## 0.1.3 — 2026-10-02

Open the picker near the mouse pointer by default, with a centered option in
Settings. Clamp it within the monitor work area. Dismiss on an outside click
even when another Shell actor receives the event. Show the loaded version in
the header to diagnose stale user-local extension copies. Keep the six-column,
glyph-only emoji grid introduced in v0.1.2.

Add searchable kaomoji and symbol grids with categories, and local GIF
favorites managed through a file chooser in Settings. Preview the first frame
and copy image/gif bytes for apps that accept images. GIFs are limited to 40
favorites, 8 MiB per file and 2048 × 2048 pixels. No online GIF service or runtime
network access. Add regression coverage for all new interactions and GIF reads.

## 0.1.2 — 2026-10-02

Display emoji as large, centered tiles in a six-column grid instead of text
rows, reducing the column count on narrow monitors. Preserve accessible names,
search, categories, tones and recents. Add row/column arrow-key navigation,
keep the focused selection visible when loading more results, and preserve
Left/Right text editing in the search field. Clipboard history retains its
list layout and pin/delete controls.

## 0.1.1 — 2026-10-01

Add GNOME Shell 50 API compatibility for Ubuntu 26.04 Wayland, preserving the
GNOME 46 path. Use current widget orientation, stage event actors and stage
context backend lookup. Fix application paste when an older Shell returns
the stage as its unfocused actor. Add eight compatibility regression checks.
Metadata and Debian dependencies allow GNOME 46 and 50. Real desktop
acceptance remains pending on both targets.

## 0.1.0 — 2026-09-30

Initial GNOME 46 implementation: event-driven bounded clipboard capture,
newest-first deduplicated text history, search, pins, keyboard and mouse
selection, private local persistence, conservative focus-checked paste,
Unicode 17/CLDR 48 emoji categories/keywords/tones/recents, GTK4/libadwaita
preferences, GSettings, Debian packaging, offline automated tests and CI.

Real Wayland GUI tests and remote CI/release results remain unverified until
they are actually run. See the completion record in `docs/verification.md`.
