# Local file converter

## Behavior

The desktop application exposes a first-class **File converter** destination backed by the fail-closed contracts in `src/shared/file-converter.ts`.

- Eight required adapter categories are separate tabs. Each category owns its own local search field and adjacent anchored regex builder.
- Every known current format stays visible but disabled. The exact reason is `Unavailable: this adapter is not bundled and verified in the packaged artifact.`
- The installed application uses the native multi-file picker. The renderer receives only the basename, size, bounded detection result, and conflict status; it never receives the full local path.
- The main process reads at most 4 KiB from the start of each regular file and reports magic-byte, extension-only, unknown, or extension-conflict evidence. Ambiguous or polyglot signatures fail closed.
- Application-data capacity, selected input bytes, and a 256 MiB reserve are compared before queueing. Unavailable or insufficient capacity leaves conversion disabled.
- Queue metadata is persisted in bounded 64-item pages below application data. Pause, resume, cancel-all, reset, interruption recovery, per-item outcomes, bounded concurrency, and byte backpressure are real controls. Queue metadata never stores file bytes.

No control pretends to convert. A queue action can become enabled only for an adapter whose registry entry has `bundled=true`, a 64-character artifact hash, an artifact path, and a verifier. This build has no such adapter, so no conversion runs.

## Configuration

The registry records source kinds, target format, metadata behavior, lossiness, resource limits, an isolated-local sandbox declaration, output validation expectations, and exact unavailable reasons. An available adapter must carry a bundled artifact path, SHA-256, and verifier record.

The persistent queue uses a versioned index and page files under the application's data directory. Source paths exist only in privileged queue metadata; UI snapshots replace them with basenames. The renderer cannot submit an arbitrary path.

## Failure modes

Unknown, ambiguous, oversized-signature, extension-conflicting, and unbundled formats fail closed. Insufficient destination capacity blocks queue admission. A cancelled queue admits no more work until the user explicitly creates a new empty queue. Interrupted running records return to queued or cancelled state according to the durable queue state.

If application-data capacity cannot be read, the UI reports an unavailable storage preflight and leaves conversion disabled. A picker cancellation preserves the current selection.

## Security considerations

The service has no process spawning, PATH discovery, network route, or converter implementation. File reads are limited to paths returned by the native picker and the bounded signature prefix. PDF and media conversion remain unavailable until isolated bundled adapters, atomic output, and reopen validation exist in the packaged artifact.

The source file is never modified. Full paths, file bytes, and document contents are not sent to the renderer, logs, exports, or telemetry.

## Verification

`scripts/tests/file-converter.test.mjs` covers the eight required categories, unavailable/bundled-proof policy, magic-byte detection, storage preflight, paged queue backpressure/pause/resume/recovery, cancellation without retaining file bytes, renderer path redaction, and the real destination/search/control wiring.

The smoke manifest captures the categorized disabled catalog and the empty persistent queue from the built application. It performs no conversion and reads no user file.

## Suggested articles

- [Exports and selection profiles](exports-and-selection-profiles.md)
- [Build and installer](build-and-installer.md)
- [Scheduled settings](scheduled-settings.md)
