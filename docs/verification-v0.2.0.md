# ClipNacre 0.2.0 verification and acceptance limits

The release contains native Mac applications plus compatible Linux packages.
The Mac deployment target is macOS 13+, compiled separately for arm64 and x86_64.
Linux remains a JavaScript GNOME extension with version 0.2.0/revision 18.

## Automated release gates

- Both macOS 15 native CPU runners compile the Swift package and execute the
  history/persistence XCTest suite (limits, pins, Unicode identity/search,
  corruption and symlink refusal).
- Native app smoke tests verify clipboard ownership change handling, same-text
  clipboard replacement, private screenshot-file ownership/limits and synchronous quit cleanup, actual image
  export and crop/redaction boundaries, local Vision recognition and bundled data.
- A native picker preview is generated for visual inspection. Package checks
  verify the executable architecture, ad-hoc signature and version inside the extracted ZIP and mounted DMG.
- All six existing Linux targets run native packaging, lint, schemas, generated
  data, JavaScript, gettext, GJS, headless Wayland and installation checks.
- Publication requires all eight native target jobs. The release creates four
  Linux .deb files and two Mac DMG/ZIP pairs, generates shared SHA256SUMS, downloads
  the published files and checks their hashes again.

See the Actions run on the release's tagged commit for the final result. An
initial Mac integration run passed both architectures before review; later runs
also include the clipboard/capture/redaction fixes and complete language catalogs.
Historical test results are not a substitute for the final tagged-commit run.

## Compatibility and privacy

Public assets are named clipnacre; the Linux package/UUID/schema/domain and saved
state paths retain their prior identifiers. Native Mac history uses a private
Application Support/ClipNacre directory, descriptor-based bounded reads and private
atomic replacement. Corrupt loads suspend further saves until explicit erasure.
Paste requires the selected clipboard generation and original focused destination.
Wake does not establish unlock. Text sheets and transient editors close on cleanup.

Screenshot capture uses its own private temporary PNG so unrelated clipboard copies
cannot be mistaken for the screenshot. Reads are bounded and reject symlinks;
cleanup removes only the exact app-created file and empty private directory after
the native process has exited. Image edits and OCR otherwise remain in memory.

## Remaining manual acceptance

This development host runs Windows; native execution occurs in Mac CI. Tests do
not establish interactive Accessibility/Screen Recording approval, receiving-app
paste acceptance, multi-monitor capture, or physical sleep/lock behavior. Runtime
acceptance on macOS 13/14 is separate from the macOS 15 CI checks. The Mac app is
ad-hoc signed and unnotarized. See [Mac installation and controls](macos.md) and
[Linux desktop acceptance](testing.md). No missing interactive checks are claimed
as completed.
