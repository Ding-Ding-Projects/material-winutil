# Release boundary

This article is the truth table for the current Material System Utility baseline. Catalogue presence, a visible control, source code under development, and release verification are different evidence boundaries.

## Available in the verified baseline

- Reviewed application catalogue browsing and local filtering.
- Installed-package detection through WinGet.
- Exact validated install and uninstall for catalogue package identifiers.
- WinGet upgrade-all through a bounded non-interactive command.
- Sequential package progress and real result output.
- Plain-text and regex search surfaces currently wired by the desktop shell.
- Basic tabs, groups, pinning, safe close previews, and a persisted appearance subset.
- A local RFC 6238 authenticator with generated or URI-imported registration, QR pairing, Windows Credential Manager storage, current and next codes, and redacted local Git history.
- Persistent application display-name customization with stable package and storage identity.
- A persisted presentation-only dialog/message-box emoji switch.
- Shared local School mode with a user-renamable label, Credential Manager-backed password verifier, live record watching, English-only projection, and suppression of personalization surfaces.
- One-click runnable builds and unsigned Squirrel.Windows installer builds.

## Catalogue-only or read-only

Tweak and optional-feature records are visible for discovery. Their execution paths are not enabled. A record in the catalogue is never evidence that an operating-system modification adapter exists.

The Windows image creator is a nonfunctional preview. Its controls do not mount, service, or write an ISO.

## In development, not release-proven

Release `v0.1.0-build.6.1` publishes the unsigned Squirrel.Windows setup, `RELEASES`,
and full package required by the feed. The installed application exposes visible update
states, a bounded background schedule, and an explicit restart action. End-to-end proof
of download, staging, restart, replacement detection, and rollback remains in development.

GitHub immutable releases are disabled. The unsigned feed and release assets are mutable
administrator-controlled inputs even after publication. HTTPS and hashes do not make the
release immutable and do not authenticate a software publisher.

## Explicitly unavailable

- Tweak execution and undo.
- Optional-feature application and undo.
- AppX removal and update-policy profiles.
- ISO mounting, servicing, and output creation.
- Password or OTP locks and support-ticket recovery.
- The complete scheduled/external-settings surface.
- Complete per-element appearance editing and color-space translation.
- Git-backed snapshot, diff, and restore history.
- Complete exports, archive export, and external-editor handoff.
- A complete offline Markdown documentation browser and full changelog viewer.
- End-to-end installed-update download, staging, restart, replacement detection, and rollback proof.

Unavailable behavior must remain visibly unavailable. The application must not simulate completion, display deterministic fake QR data, or turn a decorative preview into a safety claim.

## Suggested articles

- [Package operations](package-operations.md)
- [Workspace and search](workspace-and-search.md)
- [Build and installer](build-and-installer.md)
