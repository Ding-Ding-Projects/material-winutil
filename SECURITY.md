# Security policy

## Supported versions

Material System Utility is pre-1.0 software. Security fixes are applied to the current default branch and the newest published release when one exists. Older builds may not receive backports.

## Report a vulnerability

Use GitHub's private security-advisory reporting flow for this repository. Do not place exploit details, credentials, private machine data, or personal information in a public issue or discussion.

Include only the information needed to reproduce the problem safely:

- affected version or commit;
- affected operation and expected boundary;
- minimal reproduction steps;
- security impact; and
- a proposed mitigation, when known.

Never include a password, token, private key, authenticator secret, or real personal data.

## Security boundary

The current release boundary enables exact validated WinGet package operations. Tweak execution, optional-feature changes, AppX removal, Windows Update policy changes, and image servicing are unavailable until bounded adapters are reviewed and verified.

The application is not a privilege boundary. Any operation that installs or removes software changes the computer under the current user's operating-system permissions. Review the exact selected package identifiers before authorizing an action.

## Update and signing status

Code signing is intentionally disabled. Published installer and update assets, when available, are unsigned and may trigger an unknown-publisher or SmartScreen warning. Transport metadata and hashes improve integrity but do not create a publisher signature.
