# Local Git-backed history

The History destination reads an isolated Git repository inside the application-data directory. Each recorded mutation appends a commit with a redacted JSON snapshot; no remote is configured, hooks and signing are disabled, and restores append a new revision instead of rewriting earlier commits.

## Behavior

The desktop surface provides plain-text or bounded-regex search, typed date-range filters, action filters derived from history, browse details, redacted diffs, restore-as-new-revision, bounded labels, retention-decision revisions, and filtered redacted export. Every dropdown has its own local filter and adjacent anchored regex builder.

The legacy JSON Lines event log remains only as a compatibility activity feed while existing call sites migrate. It is not presented as the version-history authority. The History destination and its management actions read the isolated Git repository.

## Configuration

The repository lives under the stable application-data identity, never in a user project. History search is bounded to 500 results. Labels contain at most 120 single-line characters. Retention decisions accept a bounded keep count and are themselves appended to history.

## Failure modes

- A Git executable or application-data write failure is surfaced without claiming the revision was recorded.
- A repository with a configured remote is refused.
- Invalid commit identifiers, commits outside local-history ancestry, unsafe regex patterns, invalid date ranges, or sensitive snapshot fields fail closed.
- Restore and retention never rewrite append-only history.

## Security considerations

Secret material is not stored in Git. Passwords, PINs, TOTP secrets or codes, QR payloads, private vocabulary, access tokens, verifier proofs, and encryption keys are rejected from snapshots. Redacted exports omit snapshot contents and every credential/key category.

History operations cross the same validated, trusted-renderer IPC boundary as other privileged desktop actions. The credential-proof core remains independent so the renderer never receives vault material.

## Verification

`npm run check` exercises isolated-repository creation, restore, search, sensitive-field rejection, redacted history contracts, renderer behavior, and IPC validation.

## Suggested articles

- [Exports, archives, and editor handoff](exports-and-selection-profiles.md)
- [Notifications](notifications.md)
- [Locks and authenticator boundary](locks-and-authenticator.md)
