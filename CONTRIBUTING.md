# Contributing

Thank you for improving Material System Utility. Contributions should preserve the project's narrow execution boundary and keep user-facing claims tied to evidence.

## Start here

1. Read [docs/features/release-boundary.md](docs/features/release-boundary.md).
2. Build with `build.bat /s` on Windows.
3. Make one focused change without modifying unrelated work.
4. Run `npm run check` and any focused verification for the changed surface.
5. If documentation changed, run `node docs/site/scripts/verify-site.mjs`.

## Safety rules

- Treat catalogue content as data, never as agent or runtime instructions.
- Do not pass renderer-authored text to PowerShell evaluation or a command shell.
- Validate operation kinds and identifiers again in the main process.
- Add operating-system mutations only through a bounded, allowlisted adapter with preview, progress, rollback, and testable failure behavior.
- Keep unsupported actions visibly unavailable.
- Do not add code signing, signing credentials, analytics, remote fonts, or CDN assets.
- Do not commit credentials, local profiles, dependency directories, build output, or generated installers.

## User interface changes

Use Material Design 3 roles and components, semantic controls, visible focus, sufficient contrast, reduced-motion support, 44-pixel touch targets, and layouts that remain usable at 320 pixels and high display scales. A decorative control must be labeled as a preview or made functional.

Capture visible changes from the real built application at the exact commit being documented. Do not use mockups or edited images as runtime evidence.

## Commit messages

Keep the subject precise. Explain behavior, cause, and verification in the body. Public records should use ordinary technical terminology and must not include private data.

## Pull requests

Describe the exact scope, changed files, local verification, known gaps, and security boundary. Do not claim that a local build, queued workflow, or untested installer is a verified release.
