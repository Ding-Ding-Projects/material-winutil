# Exports and selection profiles

The current build provides a broad row-identifier export and local selection profiles. These are useful bounded tools, not yet a complete export-everything or archival system.

## Behavior

The export dialog previews and saves the identifiers in the current view. It offers Markdown, text, JSON, JSON Lines, YAML, TOML, XML, CSV, TSV, HTML, SQL, TypeScript, Python, Go, Rust, Protobuf, and JSON Schema choices. The main process validates the view, format, payload type, and a two-megabyte payload bound before opening a native save dialog.

Selection profiles store a name, color, source view, and selected row identifiers. Users can apply a profile by replacement, addition, or subtraction, merge selected profiles, recolor them, and delete them. Profiles are stored in local browser storage associated with the application renderer.

## Configuration

The preferred export format is part of validated preferences. Export filenames default to a sanitized view name in the Downloads directory. Profile names fall back to a generated view-based name when left blank.

## Current boundary

Exports contain a flat row-identifier view, not every displayed field or a re-importable full application state. Several source-code formats describe the row shape rather than embedding a complete data set. No ZIP or 7z exporter, encrypted archive path, external-editor handoff, schema-versioned import, or loss preview exists.

A profile's **Export** menu currently opens the generic view export rather than serializing only that profile. Profile deletion is immediate, profile locks are unavailable, and profiles are not recorded in a Git-backed restore history.

## Failure modes

- Canceling the native save dialog returns an empty path and reports cancellation.
- Oversized, invalid, or untrusted export requests are rejected by the main process.
- Browser-storage failure leaves live profiles in memory but can prevent restart persistence without a dedicated error notice.
- Formats that cannot faithfully represent all application state must not be treated as complete backups.

## Security considerations

The exporter uses a fixed view and format allowlist and does not accept a destination path from renderer input. Generated copy states that lock and authenticator secrets are omitted, although those secret features are not currently installed. Exported catalogue identifiers can still reveal a user's chosen software set and should be handled accordingly.

## Verification

Local contracts verify the format allowlist, view allowlist, payload bound, and safe save-dialog boundary. Complete round-trip imports, archive features, per-profile export, external-editor opening, and field-completeness checks remain unavailable.

## Suggested articles

- [Local history](local-history.md)
- [Notifications](notifications.md)
- [Locks and authenticator boundary](locks-and-authenticator.md)

