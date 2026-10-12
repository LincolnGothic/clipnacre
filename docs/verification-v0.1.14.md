# v0.1.14 validation

Basic OCR previously exposed only an editable text result. The screenshot editor
now has a visible **Copy text from image** action and a visual preview with
recognized word boxes. A click or rectangle drag extracts intersected words in
reading order; **Select all text** restores the original recognition. Users can
edit results and copy a selected Unicode range or the entire field.

Tesseract TSV output is bounded to 512 KiB, 4,096 words and 64 KiB reconstructed
text. Word coordinates must fit the edited/cropped PNG. Recognition uses the same
30-second total deadline for automatic segmentation and the short-block fallback.
Installed English is included with the selected language. Closing cancels work,
clears the preview and prevents late results from updating the dialog.

Executed locally on GNOME Shell 50.1 / GJS 1.88.0:

- `make package` passes, including metadata/syntax/schema/generated-data checks,
  ESLint, 210 Node tests, 44 GJS integration checks and 17 Gettext/regional checks.
- All 348 messages are complete in the six translated catalogs plus English.
- Disposable GNOME 50.1 Wayland sessions pass in English, Simplified Chinese,
  Traditional Chinese, Japanese, Spanish, French and Korean.
- Native Wayland editor checks exercise real pointer clicks and region drags,
  selected-word copying, restoring all words, Unicode editing/range copying,
  empty/oversized results, closing during recognition and late-result rejection.
  Synthetic local English and Simplified Chinese recognition and word geometry
  also pass. The 1280×720 placement/interaction session passes.
- The Debian installer passes the package contents, permissions, translations,
  version and dependency audit. Lintian is unavailable locally; CI runs it for
  every target.
- The preview screenshot in `screenshots/ocr-v0.1.14.png` is captured from the
  actual GTK OCR dialog using synthetic text; its layout is visually inspected.

One initial Japanese session passed the OCR checks but timed out later waiting
for the screenshot editor to open. A clean rerun passed. It was run concurrently
with the package build; the timeout's cause is not established. A later run
passed OCR but encountered a pin Close timing failure after screenshot selection.
The pointer test now waits for its target to be pickable and for removal to settle,
so a fading selector cannot intercept that test click.

Remote CI requires Ubuntu 24.04 / GNOME 46, Ubuntu 26.04 / GNOME 50, and Debian 13 /
GNOME 48 on amd64 and arm64. Publication waits for all six targets and verifies
release installer checksums. See the PR checks and GitHub release for their actual
results. Local checks alone do not establish all platforms, arbitrary-document
OCR accuracy, hardware GPU behavior or HiDPI/multi-monitor desktop acceptance.
