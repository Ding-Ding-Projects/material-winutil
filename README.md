# Material System Utility

Material System Utility is a Windows desktop application that presents the
open-source WinUtil catalogue in a frameless Material Design 3 interface.

> [!IMPORTANT]
> The first baseline enables only exact, allowlisted WinGet package operations.
> Tweaks, optional features, update profiles, AppX removal, ISO servicing, and
> other higher-risk operations fail closed until their reviewed adapters ship.

## Build

```powershell
npm install
npm run check
npm start
```

The Windows installer is unsigned by permanent project policy and may trigger
an unknown-publisher or SmartScreen warning:

```powershell
npm run dist
```

## Provenance

Catalogue data is derived from WinUtil at commit
`aee3e7a1f4a3249ff2f95e75b5bd3768626a21b6`. The complete upstream MIT notice
is retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This project
uses distinct branding and does not reuse upstream logos or screenshots.

## Current verification boundary

- The renderer is context-isolated and receives only named IPC methods.
- Package IDs are validated again in the main process.
- System operations without a reviewed adapter return an explicit unsupported result.
- The app bundles no remote fonts, analytics, credentials, sample history, or sample secrets.

Long-form feature documentation, one-click fresh-machine scripts, release automation,
the landing page, real captures, and the remaining reviewed system adapters are part of
the active release-grade implementation and are not claimed complete by this baseline.
