# Application updates

Application updates are partially implemented. Installed Windows builds configure Electron's Squirrel updater against the repository's HTTPS `latest/download` feed, expose the current state in the Updates view, and leave restart timing under the user's control.

## Behavior

An installed build checks the feed about 15 seconds after startup and then every four hours. The Updates view can also request a check manually. It reports checking, available, up-to-date, ready, and error states. When Squirrel reports a downloaded update, the view offers **Restart to install update** and **Later**. The latter keeps the update ready without restarting immediately.

Development runs do not check the feed. The application reports that update checks run only in an installed build.

## Configuration

The feed is fixed at build time to the repository's latest-release download endpoint. Releases provide the Squirrel setup executable, `RELEASES`, and full package consumed by that feed. There is no user-facing custom-feed editor.

## Current boundary

The visible state machine and updater event wiring exist, but the repository has not yet proven the complete installed sequence of download, staging, restart, process replacement, failed hash handling, and rollback. The feature must therefore not be described as end-to-end verified.

GitHub immutable releases are disabled for this repository. HTTPS and Squirrel package hashes provide transport and package-integrity checks, but administrators can replace release assets and the unsigned installer does not authenticate a publisher.

## Failure modes

- A feed or updater exception changes the visible state to an error and preserves the error message.
- A development build remains disabled rather than simulating a successful check.
- Restart is sent to Squirrel only when the in-memory state is `ready`.
- Offline, corrupt-feed, cancellation, rollback, and unsaved-work behavior do not yet have complete installed-artifact proof.

## Security considerations

Every setup executable is intentionally unsigned and may trigger an unknown-publisher or SmartScreen warning. Update credentials are not present in renderer code. The feed URL is not accepted from renderer input, and restart requests from an untrusted frame are ignored.

## Verification

Local contract checks cover updater configuration and release packaging boundaries. Release validation checks the unsigned Squirrel asset set. Those checks are not a substitute for an installed update-cycle test, which remains outstanding.

## Suggested articles

- [Build and installer](build-and-installer.md)
- [Release boundary](release-boundary.md)
- [Notifications](notifications.md)

