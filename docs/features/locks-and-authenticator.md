# Locks and authenticator boundary

Locks, TOTP registration, support-ticket recovery, and the built-in authenticator are unavailable in the current build.

## Behavior

Lock commands can be discovered from tabs, rows, groups, filters, profiles, update-profile previews, and the command palette. Every route opens an explicit unavailable dialog. The Authenticator route likewise explains that a standards-compliant QR encoder, RFC 6238 implementation, and operating-system vault adapter have not passed local verification.

No password, PIN, TOTP secret, QR payload, live code, lock state, recovery ticket, or credential hint is created.

## Configuration

There is no credential-store account, lock list, unlock duration, QR registration setting, authenticator-entry database, support-ticket list, or secret export. Workspace records contain a legacy boolean `locked` shape for tab organization, but the production lock dialog does not set a credential-backed lock and the value must not be treated as protection.

## Failure modes

- Any attempted lock setup stops at the unavailable explanation.
- The authenticator cannot import an `otpauth://` URI, scan a QR image, or calculate a code.
- There is no forgotten-password workflow and no application-data-folder launcher.
- Search results or menu labels that mention locks do not indicate a working security feature.

## Security considerations

Failing closed avoids fake QR codes, plaintext secrets, counterfeit vault storage, and ornamental controls described as protection. When implemented, each lock will need its own credential, explicit non-security wording, operating-system vault storage, rate-limited verification, self-service reset, and secret-free history and exports.

## Verification

Baseline checks and smoke states verify that the two dialogs remain honest unavailable surfaces. There are deliberately no TOTP vector, QR decoding, vault, unlock, expiry, recovery, or secret-export results to report.

## Suggested articles

- [Local history](local-history.md)
- [Exports and selection profiles](exports-and-selection-profiles.md)
- [Appearance controls](appearance-controls.md)
- [Release boundary](release-boundary.md)

