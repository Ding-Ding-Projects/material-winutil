# Feature documentation

This index documents the behavior that is implemented in the current Material System Utility baseline. A feature is called available only when its production path exists in the application and its bounded contract has local verification.

## Available

- [Package operations](package-operations.md) — exact WinGet and Microsoft Store catalogue installs and uninstalls, WinGet upgrade-all, progress, and failure reporting.
- [Workspace and search](workspace-and-search.md) — catalogue browsing, category filters, local search and regex mode, tabs, groups, pinning, and the implemented appearance subset.
- [Build and installer](build-and-installer.md) — one-click runnable builds and unsigned Squirrel.Windows installer builds.
- [Release boundary](release-boundary.md) — the authoritative split between available, catalogue-only, in-development, and unavailable behavior.

## Not yet available

The current application deliberately refuses tweak execution and undo, optional-feature application and undo, Windows Update policy profiles, AppX removal, and ISO servicing. It also does not ship the larger lock, TOTP, automatic-update runtime verification, shared-mode, scheduling, narration, personal-vocabulary, complete appearance, complete export, and Git-backed history contracts.

The documentation site exposes a small set of local visitor preferences. Those preferences customize the site only and do not imply equivalent desktop-application behavior.
