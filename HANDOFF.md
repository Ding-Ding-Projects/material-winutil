# Handoff

## Current state

Material System Utility is a public Windows Electron project derived from the reviewed data catalogue in WinUtil. The executable boundary is intentionally narrower than the source catalogue: exact package operations are enabled; higher-risk operating-system adapters are refused.

The current verified baseline includes:

- exact validated WinGet and Microsoft Store catalogue installs and uninstalls;
- WinGet upgrade-all and installed-package detection;
- local catalogue search, regex tooling, basic tabs/groups/pinning, and an appearance subset;
- visible Squirrel.Windows update states, a bounded background check schedule, an unsigned-installer warning, and explicit restart control;
- one-click runnable builds and unsigned Squirrel.Windows installer builds; and
- a local responsive documentation site under `docs/site` with an explicit capability inventory.

## Key implementation boundaries

- `src/main/main.ts` owns the process boundary and must continue to validate operation kinds and package identifiers independently of renderer state.
- `config/winutil.json` is declarative data. It must never become an executable-script transport.
- Unsupported tweak, optional-feature, AppX, update-profile, and image-servicing work must remain unavailable until a bounded adapter exists.
- Code signing is intentionally disabled. Do not add signing discovery or credentials.
- The tracked application capture is evidence for the package catalogue surface only.

## Verification

- The TypeScript build and committed baseline verifier are the local source checks.
- `build.bat /s` is the supported runnable-build path.
- `build-installer.bat /s` is the supported manual installer path and must verify unsigned Squirrel.Windows output plus SHA-256.
- `node docs/site/scripts/verify-site.mjs` verifies the local site structure, capability manifest, real capture reference, responsive contracts, and lack of remote assets.

## Remaining release work

- Installed-build automatic-update proof is not yet established here.
- Complete narrow-layout, high-scale, keyboard, and screen-reader runtime evidence remains required.
- The public release workflow, unsigned assets, workflow timing, release line counts, and documentation endpoint are published and independently verified.
- Higher-risk system adapters and the broader universal product contracts remain intentionally unavailable.

## Next owner

Continue from the default branch, preserve the safe main-process boundary, and treat [docs/features/release-boundary.md](docs/features/release-boundary.md) as the user-facing truth table. Update it in the same change whenever a capability crosses from unavailable to verified.
