# Workspace and search

The desktop shell makes the reviewed catalogue navigable without turning search text into executable input.

## Catalogue browsing

The package view shows application names, descriptions, categories, and exact identifiers. Category chips and local search narrow the visible set. The tracked [dark-theme catalogue capture](../screenshots/safe-package-catalogue-dark.png) shows the real built surface.

The repository currently contains 227 application records, 67 tweak records, and 33 optional-feature records. The latter two counts describe catalogue data; they do not mean those system changes are executable.

## Search and regex

Plain-text search is the default. Each implemented search field owns its query and regex state. The adjacent regex control opens a builder with a raw pattern, flags, sample text, live matches, capture groups, a replacement preview, an explanation, and a small pattern library.

Regex evaluation is local. Patterns and sample text are not transmitted. Invalid patterns produce visible feedback instead of silently falling back to a different search mode.

## Tabs and groups

The shell provides browser-style tabs with pinning, named groups, group search, current-strip search, master search, and search within a selected group. Bulk-close flows calculate a preview and exclude pinned items unless they are explicitly included.

The current desktop tab strip is horizontal. A complete four-edge, left-default implementation remains future work for the desktop application. The documentation site itself provides a left-default tab rail with four local dock choices.

## Appearance subset

The desktop baseline persists light/dark theme, density, accent, font family, scale, weight, and a bounded radius/element override subset. It does not yet implement a Word-depth editor for every element, every pseudo-state, or the complete color-space translator described in the long-term contract.

## Accessibility

The current repair baseline adds explicit tab, checkbox, group, keyboard, focus-visible, and accessible-name behavior to the principal catalogue surface. Further runtime screen-reader and high-scale verification remains release work and must not be inferred from this article.

## Failure modes

- An invalid regex reports its syntax problem and yields no guessed result.
- A search with no matches displays an explicit empty state.
- A pinned tab is protected from ordinary bulk close unless inclusion is explicit.
- Unsupported lock commands open an unavailable explanation rather than creating a fake credential or QR flow.

## Suggested articles

- [Package operations](package-operations.md)
- [Release boundary](release-boundary.md)
- [Build and installer](build-and-installer.md)
