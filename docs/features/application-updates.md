# Application updates

Application updates use a main-process-owned lifecycle service. Installed Windows builds validate the fixed credential-free HTTPS `latest/download` feed before handing it to Electron's Squirrel updater, expose real lifecycle states in the Updates view, and leave restart timing under the user's control.

## Behavior

An installed build checks the feed about 15 seconds after startup and then every four hours. The Updates view can also request one serialized check manually. It reports checking, downloading, up-to-date, ready, cancelled, rollback-detected, and error states. Cancellation is available during the bounded metadata check; Electron's Squirrel adapter does not expose safe mid-package-download cancellation, so the control disappears once download begins. When Squirrel reports a downloaded update, the view offers **Restart to install update** and **Later**. Later is persisted and keeps the update ready without allowing a new check to overwrite it.

Before restart, the renderer reports its exact unsaved tabs to the main process. Restart is refused until the user saves/closes them or explicitly confirms discarding them. The service writes a pending restart marker before invoking Squirrel. On the next launch it reports success only when the running version matches the target; otherwise it reports that replacement did not occur and that the prior version remains active.

Development runs do not check the feed. The application reports that update checks run only in an installed build.

## Configuration

The feed is fixed at build time to the repository's latest-release download endpoint. Releases provide the Squirrel setup executable, `RELEASES`, and full package consumed by that feed. There is no user-facing custom-feed editor.

## Current boundary

The lifecycle service, bridge, feed validation, corrupt/hash error mapping, cancellation-before-download, Later persistence, unsaved-work handshake, restart marker, and replacement/rollback detection are verified with disposable local fixtures. These tests never install or replace user software. A real installed two-version Squirrel rollback remains unproven, so the feature must not be described as end-to-end installed-update verified.

GitHub immutable releases are disabled for this repository. HTTPS and Squirrel package hashes provide transport and package-integrity checks, but administrators can replace release assets and the unsigned installer does not authenticate a publisher.

## Failure modes

- A feed or updater exception changes the visible state to an error and preserves the error message.
- A development build remains disabled rather than simulating a successful check.
- Restart is sent to Squirrel only when the in-memory state is `ready`.
- Mid-download cancellation is unavailable because Electron's Squirrel adapter exposes no cancellation primitive.
- Installed two-version rollback remains unproven; local tests prove detection and safe retention semantics without mutating installed software.

## Security considerations

Every setup executable is intentionally unsigned and may trigger an unknown-publisher or SmartScreen warning. Update credentials are not present in renderer code. The feed URL is not accepted from renderer input, and restart requests from an untrusted frame are ignored.

## Verification

Focused local tests use disposable directories, an injected updater adapter, and controlled metadata responses. They cover fixed-feed validation, offline and corrupt metadata, hash/corruption errors, single-flight checks, cancellation before download, real downloading and ready transitions, Later persistence, unsaved-work refusal, restart authorization, replacement detection, rollback detection, and exact preload/renderer/main channel wiring. Capture-manifest updater states are explicitly labelled `controlled-renderer-fixture-only`; they prove presentation, not live bridge or installed replacement behavior.

## Suggested articles

- [Build and installer](build-and-installer.md)
- [Release boundary](release-boundary.md)
- [Notifications](notifications.md)
