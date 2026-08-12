# Local history

The current History destination is a bounded local event log, not a Git-backed version-control system.

## Behavior

Actions recorded by the renderer appear as timestamped entries with an action, detail, and generated identifier. The History destination supports local text search, from/to date inputs, an action filter derived from existing entries, and a detail view.

The main process stores valid entries as JSON Lines in the application's user-data directory. Reads retain at most the newest 500 valid entries from a bounded two-megabyte tail. When the file grows beyond twice that bound, it is compacted to the retained entries.

## Configuration

The file location follows Electron's stable application user-data directory. It is not stored inside a user's project and is never pushed automatically. There is currently no retention editor, label editor, snapshot repository, diff engine, restore operation, or history-access credential.

## Failure modes

- A missing history file produces an empty list.
- Malformed or oversized lines are skipped without hiding later valid entries.
- A failed persistent append is currently caught by the renderer after the in-memory entry has been added. The interface does not yet provide a durable-write failure notification, so the live row must not be treated as proof that the file was updated.
- There is no restore path; selecting an entry opens its details only.

## Security considerations

Input fields are bounded and projected before storage. Files are created with user-only mode where the platform honors it, and compaction uses an atomic temporary-file replacement. The log is not encrypted and must not contain credentials or TOTP secrets. It is an audit aid, not a security boundary.

## Verification

Contract checks exercise bounded input, append serialization, malformed-line tolerance, and projected reads. Git-backed snapshots, diffs, append-only restore commits, encrypted secret history, and password-protected management remain unavailable and unverified.

## Suggested articles

- [Notifications](notifications.md)
- [Exports and selection profiles](exports-and-selection-profiles.md)
- [Locks and authenticator boundary](locks-and-authenticator.md)

