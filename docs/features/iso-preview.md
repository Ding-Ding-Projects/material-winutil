# ISO customization preview

The Win11 Creator destination is a nonfunctional preview. It documents a possible four-step workflow but does not browse for, mount, inspect, service, or write an ISO.

## Behavior

The preview presents these planned stages:

1. choose an official Microsoft Windows 11 ISO;
2. mount and verify the image read-only;
3. apply selected offline-image changes; and
4. create an output ISO, retain a working directory, or reset.

All file, mount, modification, and output controls are disabled. The build-log area is searchable and its **Clear** action changes only the preview text held in the renderer session.

## Configuration

There is no ISO path setting, working-directory setting, DISM adapter, `oscdimg` adapter, edition selector, or output policy in the production bridge. The explanatory step definitions are renderer copy, not executable job configuration.

## Failure modes

- No ISO can be selected, so an invalid image cannot progress into a mount attempt.
- No DISM or `oscdimg` process starts from this surface.
- Clearing the preview log does not clean a disk directory or undo an operation.
- The preview cannot report real progress or recovery because no ISO job exists.

## Security considerations

Keeping every mutation control disabled prevents unreviewed paths, answer files, AppX selections, or catalogue data from reaching an elevated servicing tool. Future implementation will need strict path validation, official-image checks, bounded child-process arguments, space checks, cleanup rules, cancellation, and exact output provenance.

## Verification

Static and renderer contracts verify that the controls remain unavailable and that the surface labels itself as a documented preview. There is no ISO artifact or servicing verification to claim.

## Suggested articles

- [Tweaks and configuration catalogue](tweaks-and-configuration.md)
- [Destructive confirmation](destructive-confirmation.md)
- [Release boundary](release-boundary.md)

