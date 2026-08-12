# Handoff

## Current state

- Scheduled settings are main-process owned, atomically persisted, evaluated in local time, exposed through trusted IPC/preload types, and editable from the Settings destination. JSON API sources retain the existing HTTPS/loopback, size, timeout, redirect, schema, DNS-rebinding, and generation boundaries. Home Assistant tokens live only in Windows Credential Manager. Packaged visual interaction proof remains pending.

Material System Utility is a public Windows Electron project derived from the reviewed data catalogue in WinUtil. The executable boundary is intentionally narrower than the source catalogue: exact package operations are enabled; higher-risk operating-system adapters are refused.

The current verified baseline includes:

- exact validated WinGet and Microsoft Store catalogue installs and uninstalls;
- WinGet upgrade-all and installed-package detection;
- local catalogue search, regex tooling, basic tabs/groups/pinning, and an appearance subset;
- visible Squirrel.Windows update states, a bounded background check schedule, an unsigned-installer warning, and explicit restart control;
- one-click runnable builds and unsigned Squirrel.Windows installer builds; and
- a local responsive documentation site under `docs/site` with an explicit capability inventory;
- vault-backed for-fun tab/property locks, local Support Tickets recovery disclosure, and a bundled offline documentation browser; and
- a verified 71-state release capture matrix for `v0.1.8601`, including app and live-site surfaces.

## Key implementation boundaries

- `src/main/main.ts` owns the process boundary and must continue to validate operation kinds and package identifiers independently of renderer state.
- `config/winutil.json` is declarative data. It must never become an executable-script transport.
- Unsupported tweak, optional-feature, AppX, update-profile, and image-servicing work must remain unavailable until a bounded adapter exists.
- Code signing is intentionally disabled. Do not add signing discovery or credentials.
- GitHub immutable releases are disabled. Treat the unsigned Squirrel.Windows feed
  and release assets as mutable administrator-controlled inputs, and keep hash checks
  and the visible unsigned-feed warning intact.
- `docs/screenshots/release-v0.1.8601/` contains curated real capture evidence from the published `v0.1.8601` Squirrel full package; the full local matrix is validated by the smoke harness and deliberately excludes machine-local capture metadata from Git.

## Verification

- The TypeScript build and committed baseline verifier are the local source checks.
- `build.bat /s` is the supported runnable-build path.
- `build-installer.bat /s` is the supported manual installer path and must verify unsigned Squirrel.Windows output plus SHA-256.
- `node docs/site/scripts/verify-site.mjs` verifies the local site structure, capability manifest, real capture reference, responsive contracts, and lack of remote assets.

## Remaining release work

- Installed-build automatic-update proof is not yet established here.
- Complete narrow-layout, high-scale, keyboard, and screen-reader runtime evidence remains required.
- Release `v0.1.8601`, its three unsigned Squirrel.Windows assets, workflow timing,
  release line counts, 71 decoded capture frames, and the documentation endpoint are published and independently
  verified. This is release evidence, not proof of the unfinished universal contracts.
- Higher-risk system adapters and the broader universal product contracts remain intentionally unavailable.

## Next owner

Continue from the default branch, preserve the safe main-process boundary, and treat [docs/features/release-boundary.md](docs/features/release-boundary.md) as the user-facing truth table. Update it in the same change whenever a capability crosses from unavailable to verified.
