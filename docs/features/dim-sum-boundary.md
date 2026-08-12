# Dim sum startup surprise

The installed application has one main-process-owned ten-percent startup draw per launch. It is a small non-blocking corner card, not a selection-triggered dialog and not a setting that can be disabled.

## Behavior

At startup, the main process makes one cryptographic lower-inclusive, upper-exclusive ten-percent draw. The first run, an error path, an update, an active package task, quiet hours, do-not-disturb, and School mode suppress the surprise before presentation. A cache from a prior successful refresh is required, so network availability never delays the launch.

When the draw succeeds, the renderer displays a focus-safe status card for 6.5 seconds. It shows the authoritative English and Traditional Chinese dish name, localized funny-level copy, and a meaningful image alternative. The card can be dismissed manually and never blocks work or takes focus.

## Configuration

There is no opt-out preference. The service pins an immutable public catalog revision and a published `catalog-v1` PNG release asset. It validates the HTTPS redirect chain against an allowlist, exact byte length, PNG signature and decode, dimensions, and SHA-256 before atomically caching the image and bounded provenance in application data. The renderer receives only a validated data URL for the cached image.

## Current boundary

The public `Ding-Ding-Projects/dim-sum-photos` catalog remains the sole photo authority. The consumer repository does not vendor the PNG. A release may resolve its code name from the public catalog, but an unavailable or invalid catalog image simply results in no surprise.

## Failure modes

- A missed draw, a protected startup condition, or an absent/invalid cache produces no card.
- Redirects beyond three hops, non-HTTPS or non-allowlisted targets, malformed PNG data, oversized dimensions, incorrect byte length, and digest mismatches fail closed and retain the prior valid cache.
- A refresh occurs only after the application is usable, for a future launch. It cannot interrupt startup.

## Security considerations

No user data is sent. The optional post-usable refresh fetches only the pinned public release asset without credentials. Cached bytes stay in application data, never in preferences, history, exports, captures, logs, or this repository.

## Verification

`scripts/tests/dim-sum-surprise.test.mjs` covers the decision core and suppression matrix. `scripts/tests/dim-sum-startup-service.test.mjs` covers bounded redirect handling, PNG decode/hash validation, first-run suppression, cached presentation, and the renderer auto-dismiss/non-modal contract. A new packaged capture is required for the real startup card after this change ships.

## Suggested articles

- [Settings, localization, and narration boundary](settings-localization-and-narration.md)
- [Notifications](notifications.md)
- [Release boundary](release-boundary.md)
