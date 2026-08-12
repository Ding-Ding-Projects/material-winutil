# Build and installer

The repository provides two root-level one-click build paths for Windows.

The package uses the local multi-resolution icon `build/icon.ico`. It is embedded in the executable and referenced by Squirrel installer metadata; it is a product identity asset, not a signing or authenticity mechanism.

## Build a runnable application

Run:

```bat
build.bat /s
```

The script checks for a supported Node.js runtime, uses a user-scoped installation route when one is needed, restores the current process path, installs the locked project dependencies, ensures the Electron runtime is materialized, builds the TypeScript application, copies local assets, and runs the baseline verifier.

Without `/s`, the script may offer the normal interactive launch path after a successful build. A failed build never offers to run a nonexistent result.

## Build the installer

Run:

```bat
build-installer.bat /s
```

This route performs the same preparation and verification, then builds the Squirrel.Windows artifacts. It checks that the setup executable, `RELEASES`, and a full package exist, verifies that the setup executable is unsigned, and reports its path and SHA-256.

## Signing status

Code signing is intentionally disabled. The installer is unsigned and may trigger an unknown-publisher or SmartScreen warning. The build scripts do not discover, request, generate, or use a signing certificate.

## Failure modes

- An unobtainable toolchain component stops the build with the failed phase.
- An Electron package without a runnable binary is recovered only from a checksum-verified local package cache; missing or mismatched cache material fails closed.
- Missing Squirrel.Windows output fails the installer build.
- A signed setup executable fails the unsigned-artifact verification.

## Security considerations

The scripts do not install secrets or credentials and do not weaken the machine's persistent PowerShell execution policy. The per-process policy argument applies only to the repository helper being invoked.

## Verification

The build scripts are the supported manual release path. Release `v0.1.0-build.6.1`
publishes downloadable `Setup.exe`, `RELEASES`, and full `.nupkg` assets with SHA-256,
workflow timing, and exact-commit evidence. A local setup executable alone is not a
public release.

GitHub immutable releases are disabled for this repository. The published unsigned
assets and update feed can be replaced by repository administrators after publication.
Consumers should compare the published SHA-256 values; transport and hashes reduce
risk but do not create immutability or publisher authentication.

## Suggested articles

- [Package operations](package-operations.md)
- [Release boundary](release-boundary.md)
