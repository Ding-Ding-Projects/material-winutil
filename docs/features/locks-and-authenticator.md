# Locks and authenticator boundary

The built-in TOTP authenticator and local for-fun password or TOTP locks are available. Every lock has an independent operating-system vault credential, explicit self-service recovery, and an entirely local Support Tickets route.

## Behavior

The **Authenticator** destination opens a local entry list with its own search and adjacent regex builder. A user can generate a new registration or import a bounded `otpauth://totp/` URI, scan a locally rendered QR code, explicitly reveal the one-time manual Base32 secret, and confirm one current code before the entry is saved. Stored entries show the current code, next code, numeric countdown, refresh, copy, and removal actions.

Lock commands are discoverable from tabs, rows, groups, filters, profiles, and update-profile previews. Each route opens the production lock setup or unlock surface for that exact target. The Locks manager lists, searches, unlocks, relocks, and removes records. Its search keeps plain text as the default and has an adjacent anchored regex builder.

Every lock owns one password verifier or one TOTP secret. There is no master credential and no inheritance between a group, its tabs, and appearance properties. A successful unlock lasts for the chosen surface, a bounded number of minutes, or until the application closes. **Lock again** ends the lease early.

## Configuration

TOTP entries and locks support SHA-1 TOTP with six to eight digits and a bounded period. Authenticator entries also support SHA-256 and SHA-512. Metadata is stored in the stable application-data directory while each usable secret or password verifier is stored under an application-owned key in Windows Credential Manager. The display name does not affect these storage identities.

Lock metadata contains the target, label, credential method and revision, and unlock-duration policy. It never contains a password, password verifier, TOTP secret, entered code, QR payload, or vault lookup key in the renderer bridge. The workspace tab `locked` presentation is derived from host-owned lock state rather than treated as the authority.

## Failure modes

- Malformed or oversized input, a wrong credential, an unavailable credential vault, corrupt metadata, or a failed history write produces an explicit failure and does not report success.
- Rejected unlock attempts are rate-limited independently per lock. They never wipe content or remove the lock.
- Failed setup or removal rolls metadata and the independent vault credential back where possible; a rollback failure is reported separately.
- A missing stored credential leaves metadata intact and reports the vault route as unavailable.
- **Forgotten your credential?** names the exact application-data folder and can open it in File Explorer. The app never deletes the folder; deletion remains the user's explicit action.
- QR-image import, clipboard image scanning, and camera scanning are not implemented for authenticator entries; URI import and local generation are the available routes.

## Security considerations

These locks are deliberately a user-experience speed bump, not encryption or a security boundary. They do not claim to protect sensitive data from another person who controls the computer. Deleting the application-data folder resets them.

Registration, QR rendering, code generation, and verification are local. Secrets are excluded from metadata, redacted local Git history, ordinary exports, logs, captures, and public documentation. Renderer IPC accepts only bounded requests from the trusted application frame. Passwords and secret buffers are not kept in renderer state after an operation completes.

Support Tickets are fictional and local. The surface says without comedy that nothing is sent, no external ticket exists, no data is collected, and nobody is reading it. Its resolution opens the application-data folder and never deletes anything.

## Verification

Local contracts cover RFC 4226 and RFC 6238 vectors; canonical Base32; strict URI parsing; current and next codes; QR PNG decoding; confirmation success and failure; Credential Manager CRUD; bounded lock metadata persistence; password and TOTP verification; skew and throttling; surface, minute, and application leases; explicit relocking; redacted append-only history; rollback behavior; missing-vault recovery; trusted IPC and preload wiring; renderer search and lock management; local ticket disclosure; and folder-open-only recovery.

Real packaged smoke verification remains required for each release candidate.

## Suggested articles

- [Local history](local-history.md)
- [Exports and selection profiles](exports-and-selection-profiles.md)
- [Appearance controls](appearance-controls.md)
- [Release boundary](release-boundary.md)
