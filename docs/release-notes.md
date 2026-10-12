Super V Ubuntu 0.1.14 adds visual screenshot text recognition.

Press Super+Shift+S to capture an area, then click **Copy text from image** in the
editor (or press Ctrl+Shift+O). Recognized words are highlighted over the edited
screenshot. Click a word or drag across a region to extract its text, correct the
editable result, and click **Copy text**. **Select all text** restores the full
recognition; selecting text in the result field copies just that range.

Recognition runs entirely on your computer with Tesseract. English is included
with the package. For Chinese, install `tesseract-ocr-chi-sim` or
`tesseract-ocr-chi-tra` and choose that language in the dialog. Installed English
is included with the selected language for mixed text. Japanese, Korean, Spanish,
French and other installed Tesseract packs are also available.

The seven interface languages include the new controls. Closing the dialog
cancels recognition; retries clear stale text. Recognition output, word geometry,
word counts and runtime are bounded, and OCR creates no scratch images or network
requests. Review OCR text before using it.

Upgrade with the package matching your distribution, then log out and back in to
reload the GNOME extension. Settings and clipboard history are retained.

Native CI builds and tests Ubuntu 24.04 / GNOME 46, Ubuntu 26.04 / GNOME 50, and
Debian 13 / GNOME 48 on amd64 and arm64 before publication. Automated coverage
includes pointer word/region selection, editable Unicode text, copy selections,
empty/oversized results, cancellation and the existing screenshot, image clipboard
and pin workflows. Arbitrary-document OCR accuracy, hardware GPU behavior and
HiDPI/multi-monitor acceptance still require testing on your desktop.
