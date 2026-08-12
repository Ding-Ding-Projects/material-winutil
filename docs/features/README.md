# Feature documentation

This index documents the current Material System Utility baseline. A feature is called available only when its production path exists and its bounded contract has local verification. Partial, preview, and unavailable surfaces are listed separately so a visible control is never mistaken for a completed runtime.

## Available

- [Package operations](package-operations.md) — exact WinGet and Microsoft Store catalogue installs and uninstalls, WinGet upgrade-all, progress, and failure reporting.
- [Workspace and search](workspace-and-search.md) — catalogue browsing, category filters, local search and regex mode, tabs, groups, pinning, and the implemented appearance subset.
- [Build and installer](build-and-installer.md) — one-click runnable builds and unsigned Squirrel.Windows installer builds.
- [Release boundary](release-boundary.md) — the authoritative split between available, catalogue-only, in-development, and unavailable behavior.
- [Command palette](command-palette.md) — the available fixed command list, local search, shortcut, and current completeness boundary.
- [Locks and authenticator boundary](locks-and-authenticator.md) — a working local RFC 6238 authenticator; password and OTP locks and support-ticket recovery remain unavailable.
- [Offline documentation browser](offline-documentation.md) — every feature article bundled at build time, verified by manifest and SHA-256, safely rendered from an AST, internally linked, and independently searchable by title and body.
- [Dim sum startup surprise](dim-sum-boundary.md) — a non-blocking once-per-launch public-catalog photo card with protected-state suppression and bounded application-data caching.

## Available with bounded limitations

- [Application updates](application-updates.md) — installed Squirrel event wiring and visible controls; the complete installed replacement and rollback cycle is not yet proven.
- [Local history](local-history.md) — bounded JSON Lines event history with search and filters, not Git-backed snapshots, diffs, or restore.
- [Settings, localization, and narration](settings-localization-and-narration.md) — persisted display-name and dialog-emoji settings, shared School mode, partial localization, and a production local platform-speech narrator.
- [Scheduled and external settings](scheduled-settings.md) — persistent local-time rules with base-value recovery, bounded HTTPS settings documents, and vault-backed Home Assistant boolean activation.
- [Notifications](notifications.md) — session-local snackbars and a notification centre without durable history or complete export.
- [Exports and selection profiles](exports-and-selection-profiles.md) — row-identifier exports and local selection profiles, not complete round-trip or archive export.
- [Destructive confirmation](destructive-confirmation.md) — a bounded two-control-and-slider flow that does not yet cover every destructive action.
- [Appearance controls](appearance-controls.md) — working global preferences and color tools, with a partial non-root element editor.

## Read-only previews

- [Tweaks and configuration catalogue](tweaks-and-configuration.md) — searchable records and selection presets; execution and undo fail closed.
- [ISO customization preview](iso-preview.md) — explanatory steps and a local preview log; no image selection, mounting, servicing, or output.

The application also deliberately refuses tweak execution and undo, optional-feature application and undo, Windows Update policy profiles, AppX removal, and ISO servicing. The complete appearance surface is not available. Scheduled settings, display-name customization, dialog emoji, shared School mode, personal-vocabulary loading, production narration, structured export/archive handling, external-editor handoff, and Git-backed local restore history are implemented with their documented bounds.

The documentation site exposes a small set of local visitor preferences. Those preferences customize the site only and do not imply equivalent desktop-application behavior.
