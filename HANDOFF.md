# Handoff

## Current state

- Scheduled settings are main-process owned, atomically persisted, evaluated in local time, exposed through trusted IPC/preload types, and editable from the Settings destination. JSON API sources retain the existing HTTPS/loopback, size, timeout, redirect, schema, DNS-rebinding, and generation boundaries. Home Assistant tokens live only in Windows Credential Manager. Packaged visual interaction proof remains pending.
- The renderer color picker now consumes `src/shared/appearance.ts` directly through a renderer-only bootstrap. It supports selectable/editable/copyable HEX, RGB, HSL, HSV, HWB, Lab/LCH, OKLab/OKLCH, and CMYK representations with alpha, a 512-character input limit, explicit sRGB clipping-channel feedback, and composited WCAG contrast results. Packaged visual interaction proof remains pending.
- The dim-sum startup service is main-process owned. It makes one cryptographic ten-percent draw per launch, suppresses protected startup states, refreshes a pinned public catalog release PNG only after the app is usable, validates redirect/PNG/size/SHA-256 boundaries, and presents a focus-safe auto-dismissing renderer card from application-data cache. Packaged visual interaction proof remains pending.
- The app-logo feature now supplies shipped presets, bounded local PNG validation, crop/fit/focal/background transforms, derived-only app-data persistence, live previews, searchable Settings and palette routes, and custom-title-bar presentation. Source paths/names/bytes remain private, while installed package, executable, installer, update-feed, data-directory, and committed native-icon identity stay stable.
- `src/shared/file-converter.ts` and `src/main/file-converter-service.ts` now drive a real desktop File converter destination: a native local picker, 4 KiB signature detection, eight independently regex-searchable categories, storage preflight, and a persistent paged queue with pause/resume/cancel/reset/results. Every adapter remains visibly unavailable until a bundled offline adapter, output validation, and packaged proof are added.
- The local Ollama destination uses only the fixed documented loopback API boundary. It provides an accessible Model Store search, health and recovery state, conservative evidence-only fit cards, a bounded non-payment pull cart, local chat, and allowlisted harness planning. Health, catalog, pull, and chat calls have request/body/overall/idle deadlines; catalog refresh is single-flight, timeouts retain validated stale data, and user cancellation remains distinct. Ollama currently documents only local installed-model APIs, not a public-library machine-readable catalogue, so the application does not scrape the official HTML library and keeps that Model Store state fail-closed. Native attachment/export handoff, executable launch/rollback, and current packaged interaction proof remain boundaries.
- `v0.1.10801` supplied nine decoded hidden-desktop package captures for the app-logo studio, converter catalog/queue, and Ollama status/store/cart/chat/harness/hardware states. `docs/screenshots/smoke/metadata.json` binds every frame to commit `beb3386e398e78c93d6200af3c48cb3b68f8f526`, one validated Squirrel full package, and zero visible-desktop or system-changing actions. Targeted capture now refuses to overwrite that evidence metadata.

Material System Utility is a public Windows Electron project derived from the reviewed data catalogue in WinUtil. The executable boundary is intentionally narrower than the source catalogue: exact package operations are enabled; higher-risk operating-system adapters are refused.

The current verified baseline includes:

- exact validated WinGet and Microsoft Store catalogue installs and uninstalls;
- WinGet upgrade-all and installed-package detection;
- local catalogue search, regex tooling, basic tabs/groups/pinning, and an appearance subset with the shared color translator and contrast feedback;
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
- `node --test scripts/tests/appearance.test.mjs scripts/tests/appearance-color-surface.test.mjs` covers the shared color mathematics and its renderer surface contract after `npm run build`.
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
