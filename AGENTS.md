# Repository agent instructions

This file is a sanitized project-local mirror of the shared contributor requirements. Machine-specific paths, credentials, private vocabulary, and infrastructure details are intentionally omitted.

## Scope and safety

- Preserve unrelated work and inspect repository status before changing files.
- Use the repository's normal `main` workflow without rewriting published history.
- Never commit credentials, tokens, private user data, dependency trees, generated build output, or scratch files.
- Code signing is intentionally prohibited. Windows installers remain unsigned and must state that clearly.
- Package mutations use exact validated WinGet identifiers. Unsupported higher-risk operations remain visibly unavailable and fail closed.

## Product quality

- Keep the desktop application, documentation site, README, roadmap, handoff, and feature documentation synchronized.
- User-facing surfaces use Material Design 3, keyboard-accessible controls, visible focus, adequate targets, responsive layouts, and honest unavailable states.
- Do not ship mock data, placeholder security behavior, counterfeit QR codes, fake success states, or decorative controls that appear operational.
- English, Hong Kong Cantonese, and bilingual presentation remain usable wherever localization is implemented.
- Search fields retain plain-text search by default and their adjacent regex-builder route.

## Verification and delivery

- Run `npm run check`, `node docs/site/scripts/verify-site.mjs`, and `git diff --check` before committing.
- Build runnable output with `build.bat /s` and the unsigned Squirrel.Windows installer with `build-installer.bat /s`.
- GitHub Actions uses the pinned `windows-2025` GitHub-hosted runner. Do not introduce self-hosted runner selectors.
- Workflows build, package, publish Pages, and publish releases; tests and lint stay local rather than becoming release gates.
- Every successful push or manual dispatch publishes one unique, non-draft release with setup, `RELEASES`, full `.nupkg`, hashes, timing, line-count, and dim-sum metadata.
- Verify the release target commit, downloadable assets, hashes, unsigned signature state, Pages endpoint, and remote `main` ancestry before closing work.

## Public records

- Commit messages and public documentation use ordinary technical language plus clear English and natural Hong Kong Cantonese where appropriate.
- Attribute commits to `Claude Fable 5 <noreply@anthropic.com>` and include the matching co-author trailer exactly once.
- Keep public issues and Discussions factual: distinguish local, running, failed, and verified evidence; never predict success.
