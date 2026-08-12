# Dim sum interaction boundary

The current renderer contains a small selection-triggered dim sum dialog. It is not the required startup surprise and does not use the public photo catalogue.

## Behavior

After a selection grows beyond ten rows, the renderer performs a ten-percent random draw. A successful draw opens a dialog after a short delay, showing one of ten English dish names, a short English description, and a local restaurant icon. A one-minute throttle prevents immediate repeated dialogs. **Another one** chooses a different random entry, and **Back to work** closes the dialog.

The dialog states that it changes no application or system state. **Another one** chooses another random entry, which can repeat the current dish, and **Back to work** closes the dialog.

## Configuration

There is no preference that disables this current interaction. The dish list and descriptions are compiled into the renderer. No image, catalog revision, bilingual authoritative name, or release-asset URL is configured.

## Current boundary

This interaction is triggered by row selection rather than a fresh ten-percent startup draw. It uses an application dialog rather than a non-blocking auto-dismissing surface, has no dish photo or meaningful image alt text, and does not honor the complete language, funny-level, quiet-hours, first-run, update, focus, and reduced-motion requirements.

It must not be described as the shipped startup surprise. The public `Ding-Ding-Projects/dim-sum-photos` catalogue remains the only approved source for future authoritative names and published photos; no photo is vendored here.

## Failure modes

- No draw means no dialog, with no effect on selection.
- The minute-based throttle is not a once-per-launch guarantee.
- Missing public-catalog data cannot be detected because the current list is not connected to that catalogue.
- The icon-only presentation does not satisfy the photo requirement.

## Security considerations

The current interaction makes no network request and handles no user data beyond the selection count. Future catalog use must consume only published public assets and must not add generated, downloaded, or copied photos to this repository.

## Verification

Smoke capture can force the dialog state for visual inspection. Random startup probability, photo decoding, authoritative bilingual names, non-blocking behavior, focus preservation, and once-per-launch behavior remain unverified because they are not implemented.

## Suggested articles

- [Settings, localization, and narration boundary](settings-localization-and-narration.md)
- [Notifications](notifications.md)
- [Release boundary](release-boundary.md)
