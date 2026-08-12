# Scheduled and external settings

## Behavior

The Settings destination contains a tabbed scheduled-settings surface for rule discovery, editing, and external-source status. Rules can temporarily override language, theme, density, accent color, font family, font scale, font weight, corner radius, reduced motion, export format, and the application display name. The saved base preference remains separate and returns when no active rule owns that setting.

Each rule has an enabled state, stable identifier, label, priority, optional start/end date, native start/end time, every-day or selected-weekday recurrence, and one activation source. Higher priority wins per setting; ties use the lexicographically smaller stable rule identifier. Start time is inclusive and end time is exclusive. An equal start/end time is inactive. A cross-midnight window belongs to the local calendar day on which it starts.

## Timezone and daylight-saving behavior

Rules use the operating system's current local timezone and show that timezone in the surface. Daylight-saving changes follow the operating system's local-time conversion. Dates bound the local start day, including for cross-midnight rules. A bounded main-process timer reevaluates active rules and reports the exact evaluation timestamp.

## External sources

A rule may use:

- its local schedule alone;
- a bounded versioned JSON settings document over credential-free HTTPS; or
- a Home Assistant `binary_sensor` or `input_boolean`, where `on` activates the rule and `off` leaves the base or another matching rule in effect.

JSON sources reject redirects, URL credentials and fragments, unsafe DNS results, DNS rebinding, non-JSON media types, oversized responses, unsupported schemas, and unknown setting keys. Plain HTTP is rejected except for an explicitly enabled loopback development source. Private-network Home Assistant endpoints are intentionally unsupported by this bounded production integration; weakening that SSRF boundary requires a separately reviewed explicit host allowlist and address-pinning design.

Home Assistant tokens are accepted only through the trusted preload and IPC boundary and stored in Windows Credential Manager. Tokens are never written to the schedule document, renderer state, exports, logs, notifications, local history, or source status. Clearing a token deletes the matching application-owned vault record.

## Failure and fallback

External sources refresh only while their rule's local time window is active and use generation checks so stale responses cannot overwrite a newer edit. A failed refresh shows a non-blocking source status with a retry action. A previous last valid value remains cached only inside the running main process; otherwise the local base setting stays in effect. Network failure, invalid payloads, missing tokens, and an `off` Home Assistant entity never overwrite the saved base preference.

## Persistence and security

The versioned schedule document is bounded and atomically replaced in the app's local application-data directory. The Electron main process owns evaluation, timers, network requests, credential reads, and persistence. The renderer receives only the validated public document, effective values, active rule identifiers, redacted source status, local timezone, and evaluation timestamp.

## Verification

Focused tests cover schema and source bounds, ordinary and cross-midnight time windows, precedence, base restoration, source hardening, vault-only Home Assistant tokens, trusted IPC/preload parity, native date/time controls, tab roles, responsive layout hooks, and explanatory copy. Packaged visual interaction proof remains a release-verification boundary.

## Suggested articles

- [Settings, localization, and narration](settings-localization-and-narration.md)
- [Appearance controls](appearance-controls.md)
- [Notifications](notifications.md)
- [Release boundary](release-boundary.md)
