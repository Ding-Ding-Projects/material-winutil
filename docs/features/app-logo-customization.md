# App-logo customization core

## Behavior

The shared core defines three shipped presentation presets and a local PNG-only custom-logo pipeline. A supplied image is structurally checked, CRC-decoded, bounded by upload/chunk/dimension/pixel limits, and rejected if it is animated, malformed, spoofed, or has trailing data. Crop, fit, focal-point, and background choices produce six declared PNG display sizes locally.

Only an `app-256` derived raster is eligible for persisted custom state. The selected source path, source filename, original source bytes, and source hash are omitted. The logo changes presentation only; it cannot alter package identity, the executable or installer name, the update feed, or application-data location.

## Configuration

The core exposes searchable control descriptors for preset selection, local upload, crop, fit, focal point, background, and reset. It provides versioned local-only persisted state and compact export metadata that explicitly omits a personal derived raster.

## Failure modes

The prior valid logo remains selected when a new upload fails validation. Unsupported formats, invalid PNG structure, animation, malformed CRCs, resource-limit breaches, and tampered persisted data fail closed.

## Security considerations

The core performs no network, filesystem, PATH lookup, telemetry, history, or identity mutation. It does not accept an installed logo as provenance for a package or installer icon. Renderer/settings wiring and packaged visual proof are not yet present.

## Verification

`scripts/tests/app-logo.test.mjs` covers presets, the local structural/decode boundary, spoofing/animation/bomb rejection, crop/fit/focal/background output at all declared sizes, persistence/tamper rejection, export omission, and absence of network or identity routes.

## Suggested articles

- [Appearance controls](appearance-controls.md)
- [Build and installer](build-and-installer.md)
