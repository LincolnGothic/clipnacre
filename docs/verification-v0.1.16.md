# ClipNacre 0.1.16 release verification

This release changes public branding and release metadata. Runtime algorithms
and Linux installation identifiers are retained. Version 0.1.16 uses GNOME
extension revision 17; the new repository keeps the existing repository history.

## Release gates

The CI workflow runs native packaging, lint, schema, JavaScript, generated-data,
translation, GJS and headless Wayland checks on Ubuntu 24.04 / GNOME 46,
Ubuntu 26.04 / GNOME 50 and Debian 13 / GNOME 48, on both amd64 and arm64.
The updated popup expectations verify the ClipNacre title. Package installation
and removal checks retain the original compatible extension paths.

The release job requires all six targets to succeed before publishing four
Debian installers and SHA256SUMS. It downloads the published assets and checks
their hashes. See the repository's Actions run for the exact commit and result.

## Compatibility and limits

The package remains `super-v-ubuntu`; the extension UUID, gettext domain,
settings schema and `super-v-ubuntu` state directory are unchanged. This avoids
parallel installations and preserves existing preferences and history.
The new default screenshot filename prefix is ClipNacre; saved custom patterns
are retained. Unicode resources and historical copyright attribution are intact.

Existing screenshots and historical verification documents predate the rename.
This release has no macOS binary. The Windows development workstation cannot
run GNOME; native checks run in CI. Physical-desktop checks and their limitations
remain described in [desktop acceptance](testing.md).
