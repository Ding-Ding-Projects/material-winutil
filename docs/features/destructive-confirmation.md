# Destructive confirmation

The application has a bounded two-control-and-slider confirmation dialog for package mutations and settings reset. It is not yet a complete implementation for every destructive action in every surface.

## Behavior

Install, uninstall, upgrade-all, and reset-settings routes open a modal confirmation that names the action. Two independent buttons must be activated before the range slider is enabled. The slider must reach 100 percent before **Authorize** becomes available. **Emergency exit** closes the dialog without running the callback.

After authorization, the dialog records an authorization event and invokes only the already-bounded operation kind or callback supplied by the application.

## Configuration

There is no setting that removes this confirmation from the routed operations. The dialog honors the global theme and reduced-motion styling, but has no per-action timing or key mapping setting.

## Current boundary

The two controls are clickable buttons labelled **Press A** and **Press L**; they are toggles, not physical key-hold detection. The slider has a simple fill update but no distinct progress and completion animation. Package installation also uses the dialog even though ordinary installation is not inherently destructive.

Several immediate deletion routes, including notification and selection-profile deletion, do not use this confirmation. Escape/focus restoration and the complete keyboard, screen-reader, high-scale, and reduced-motion matrix are not fully proven.

## Failure modes

- Either control being off resets and disables the slider.
- A partial slider cannot authorize the action.
- Closing the dialog or using Emergency exit invokes no action.
- The dialog cannot make an unsupported tweak, optional-feature, update-policy, or ISO adapter available.

## Security considerations

The confirmation is a user-decision boundary, not an authorization or privilege boundary. Main-process validation still decides which operation can run. It never permits arbitrary commands, and it cannot replace operating-system elevation or package-manager publisher review.

## Verification

Local renderer contracts and smoke states cover the untouched, armed, partial, and fully authorized UI states for the implemented flow. Complete coverage of every destructive route and every accessibility state remains outstanding.

## Suggested articles

- [Package operations](package-operations.md)
- [Tweaks and configuration catalogue](tweaks-and-configuration.md)
- [Notifications](notifications.md)
- [Local history](local-history.md)

