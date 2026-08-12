# Command palette

The desktop application provides a searchable command palette opened with `Ctrl+Shift+F`. It is a useful fixed command list, not yet a complete index of every feature, setting, article, and element.

## Behavior

The palette can navigate to the primary destinations, toggle theme and density, cycle language, open the regex builder, open the tab manager, open the application-root appearance editor, open the unavailable authenticator explanation, export the current view, detect installed packages, and apply the Standard tweak preset as a selection.

Its search is local, keyboard-focusable, and has an adjacent regex-builder route. Empty results produce an explicit no-match state.

## Configuration

The command list is compiled into the renderer. There is no plugin command registry, user-command editor, or size preference. The palette uses the application's current theme and language state, although many command labels remain English-only.

## Current boundary

The palette does not enumerate every setting, offline article, appearance property, menu action, profile, notification, or row. Results are action buttons rather than inline rich setting controls. Selecting a navigation result opens the destination, but there is no general teleport-and-highlight mechanism for an exact nested control.

The unavailable authenticator result opens an honest boundary explanation and does not activate authentication.

## Failure modes

- Invalid regex feedback comes from the shared local matcher and does not execute commands.
- No match produces a visible empty state.
- A listed destination can still contain unavailable actions; palette discoverability does not change their runtime boundary.
- The current build has no complete automated proof that every user-facing control is indexed.

## Security considerations

Search text is evaluated locally and never becomes a shell command. Palette actions call the same bounded functions as their original surfaces, so the palette does not bypass main-process validation or destructive confirmation.

## Verification

Static contracts verify the `Ctrl+Shift+F` handler and principal entries, and smoke states capture the palette. Completeness, rich inline controls, exact-element focus, full localization, and a full-window palette mode remain future work.

## Suggested articles

- [Offline documentation browser](offline-documentation.md)
- [Workspace and search](workspace-and-search.md)
- [Appearance controls](appearance-controls.md)

