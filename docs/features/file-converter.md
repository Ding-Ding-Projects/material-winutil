# Local file-converter core

## Behavior

The shared core exposes a categorized adapter catalog for Documents/PDF, Images, Audio, Video, Archives, Structured Data/Spreadsheets, Code/Text, and Binary Encodings. It detects selected files from bounded signature bytes and reports extension/content conflicts.

Every current adapter is deliberately visible but unavailable: no bundled package proof exists yet, so no developer PATH tool or network service can make a format look enabled. The persistent queue stores paged metadata rather than file bytes, supports pause, resume, cancellation, bounded retry, storage preflight, bounded concurrency, byte backpressure, and safe recovery of interrupted running items.

## Configuration

The registry records source kinds, target format, metadata behavior, lossiness, resource limits, an isolated-local sandbox declaration, output validation expectations, and exact unavailable reasons. An available adapter must carry a bundled artifact path, SHA-256, and verifier record.

## Failure modes

Unknown, ambiguous, oversized-signature, extension-conflicting, and unbundled formats fail closed. Insufficient destination capacity blocks queue admission. A cancelled queue admits no more work; interrupted running records return to queued or cancelled state based on durable queue state.

## Security considerations

The core has no process spawning, PATH discovery, file reads, network route, or converter implementation. It is intentionally not a claim that PDF or media conversion is currently available. The renderer, picker, isolated adapters, atomic output/reopen validation, and packaged proof remain to be built.

## Verification

`scripts/tests/file-converter.test.mjs` covers the eight required categories, unavailable/bundled-proof policy, magic-byte detection, storage preflight, paged queue backpressure/pause/resume/recovery, and cancellation without retaining file bytes.

## Suggested articles

- [Exports and selection profiles](exports-and-selection-profiles.md)
- [Build and installer](build-and-installer.md)
