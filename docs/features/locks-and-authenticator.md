# Locks and authenticator boundary

The built-in TOTP authenticator is available. Password and OTP locks, lock recovery, and support tickets remain unavailable.

## Behavior

The **Authenticator** destination opens a local entry list with its own search and adjacent regex builder. A user can generate a new registration or import a bounded `otpauth://totp/` URI, scan a locally rendered QR code, explicitly reveal the one-time manual Base32 secret, and confirm one current code before the entry is saved. Stored entries show the current code, next code, numeric countdown, refresh, copy, and removal actions.

Removal uses the destructive confirmation flow. Closing or cancelling registration invalidates the pending operation. Registration expiry clears the QR, URI, manual secret, and confirmation state. Five failed confirmations invalidate the pending registration, with a bounded delay between attempts.

Lock commands can still be discovered from tabs, rows, groups, filters, profiles, and update-profile previews. Every lock route opens an explicit unavailable dialog and never creates a credential-backed lock.

## Configuration

TOTP entries support SHA-1, SHA-256, and SHA-512; six to eight digits; and a bounded period. Imported URI parameters are preserved. Metadata is stored in the stable application-data directory while each usable secret is stored under an application-owned key in Windows Credential Manager. The display name does not affect these storage identities.

There is no credential-store account for a password lock, lock list, unlock-duration setting, recovery-ticket list, or secret export. Workspace records contain a legacy boolean `locked` shape for tab organization, but the production lock dialog does not set a credential-backed lock and the value must not be treated as protection.

## Failure modes

- A malformed or oversized URI, invalid parameter set, expired registration, wrong code, unavailable credential vault, corrupt metadata file, or failed history write produces an explicit failure and does not report success.
- A failed save or removal attempts to roll credentials and metadata back. A rollback failure is reported as a separate recovery failure instead of being hidden.
- A missing stored credential leaves metadata intact and reports that codes are unavailable.
- Any attempted lock setup stops at the unavailable explanation.
- QR-image import, clipboard image scanning, and camera scanning are not implemented; URI import and manual generation are the available registration routes.
- There is no forgotten-password workflow and no application-data-folder launcher for locks.

## Security considerations

Registration, QR rendering, code generation, and verification are local. The QR renderer receives no network URL. Secrets are excluded from metadata, redacted local Git history, ordinary exports, logs, smoke captures, and public documentation. Renderer IPC accepts only exact bounded request shapes from the trusted application frame. Pending buffers are overwritten on success, cancel, expiry, or the failed-attempt limit.

The one-time registration surface deliberately reveals a manual secret only after an explicit action. The app does not display, hint at, or characterize a stored secret afterward. Ordinary export copy states that authenticator secrets are omitted.

Locks remain a separate unimplemented feature. When implemented, each lock will need its own credential, explicit non-security wording, rate-limited verification, self-service reset, and secret-free history and exports.

## Verification

Local contracts cover RFC 4226 and RFC 6238 vectors for SHA-1, SHA-256, and SHA-512; canonical Base32; strict URI parsing; current and next codes; QR PNG decoding back to the exact generated URI; confirmation success and failure; retry invalidation; timer expiry; explicit cancellation; Credential Manager write/read/list/replace/delete; metadata bounds; redacted append-only local Git history; and rollback behavior. Renderer contracts cover trusted IPC use, secret-state purging, stale-response rejection, expiry handling, localized English/Cantonese/bilingual copy, accessible dialog semantics, searchable entries, 44-pixel targets, and metadata-only smoke fixtures.

The complete lock, recovery, and secret-export contracts remain unverified because those features are not implemented.

## Suggested articles

- [Local history](local-history.md)
- [Exports and selection profiles](exports-and-selection-profiles.md)
- [Appearance controls](appearance-controls.md)
- [Release boundary](release-boundary.md)
