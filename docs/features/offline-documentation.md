# Offline documentation browser

The desktop application includes a small offline reference browser. It is useful for the verified baseline, but it is not yet a complete Markdown documentation browser.

## Behavior

The Docs destination searches six bundled articles covering the release boundary, package operations, search, tabs, the implemented appearance subset, and catalogue provenance. Opening an article renders its bundled title, section, and plain text inside the application without fetching a web page.

Article search is local and has the same adjacent regex-builder route as other implemented search fields. The desktop reference is separate from the GitHub Pages site and from the Markdown files in this directory.

## Configuration

The shipped article list is compiled into the renderer. There is no runtime article download, content-management setting, or user-provided documentation path.

## Failure modes

- No match produces an explicit empty state.
- The current reader uses pre-wrapped text rather than a shared isolated Markdown renderer, so Markdown links and code fences are not promised.
- Article-to-article navigation and a build check comparing every Markdown article on disk with the in-app bundle are not implemented.
- Updating this directory does not automatically add an article to the desktop browser.

## Security considerations

Bundled text does not receive renderer privileges as remote HTML. The current surface makes no documentation network request. A future Markdown renderer must isolate markup, sanitize links, and retain a trusted local base path.

## Verification

The baseline checks confirm the shipped safe article list and the absence of the older unverified articles from the production browser. Complete article-count parity, Markdown rendering, internal-link resolution, and every-feature coverage remain future work.

## Suggested articles

- [Command palette](command-palette.md)
- [Workspace and search](workspace-and-search.md)
- [Release boundary](release-boundary.md)

