# Offline documentation browser

The desktop application includes a build-time generated offline documentation browser containing every Markdown article under `docs/features`. The application renders a bounded safe Markdown AST without a network dependency or raw HTML execution.

## Behavior

The Docs destination searches the complete bundled article inventory. Title and body searches are separate fields with independent plain-text or regex state, flags, validation, and adjacent anchored regex builders. When both fields contain a query, an article must match both.

Opening an article renders headings, paragraphs, ordered and unordered lists, inline emphasis, inline code, fenced code blocks, and links through explicit DOM nodes. Internal article links and suggested-article buttons remain inside the app. HTTP, HTTPS, and mail links require an explicit user action and are revalidated by the privileged process before the operating system opens them. Unsafe schemes and unbundled local resources stay inert with an explanation.

## Configuration

`scripts/build-offline-docs-bundle.mjs` recursively discovers `docs/features/**/*.md`, builds the bounded bundle through `src/shared/offline-docs.ts`, verifies article hashes and exact manifest parity, and atomically writes the packaged asset. There is no runtime article download, content-management setting, or user-provided documentation path.

## Failure modes

- No match produces an explicit empty state naming that both active searches were applied.
- Invalid or potentially unsafe regular expressions stay invalid and never silently fall back to plain text.
- A missing, oversized, structurally invalid, or hash-mismatched bundle produces an unavailable state rather than partially rendering it.
- A missing, extra, or case-duplicate Markdown article fails the build-time completeness check.
- An external link that the operating system refuses reports a non-blocking failure; it is never reported as opened without that result.

## Security considerations

Bundled text never reaches `innerHTML`: raw HTML remains literal text and only whitelisted AST node types create DOM elements. The main process validates the bounded bundle before caching it. Every link records `autoOpen: false`; internal paths must resolve to the exact bundled manifest, unsafe schemes and path escapes are inert, and external URLs are reparsed with protocol, credential, control-character, and encoded-newline checks before opening.

## Verification

`scripts/tests/offline-docs.test.mjs` verifies the parser, actual recursive inventory, internal/external/unsafe link classification, independent title/body search, bounded regex validation, raw-HTML inertness, and hash/manifest tamper detection. `scripts/tests/offline-docs-surface.test.mjs` verifies the generated packaged asset, trusted IPC channels, separate anchored search builders, safe AST rendering, and explicit link routes.

## Suggested articles

- [Command palette](command-palette.md)
- [Workspace and search](workspace-and-search.md)
- [Release boundary](release-boundary.md)
