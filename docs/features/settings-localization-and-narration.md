# Settings, localization, and narration boundary

The Settings destination persists a useful appearance and language subset. Localization is partial, while spoken narration is not implemented despite the presence of narrator controls.

## Behavior

Available preferences include light or dark theme, comfortable or compact density, accent, a bounded font-family list, font scale, font weight, corner radius, reduced motion, export format, tab docking, language mode, two funny-level values, narrator language, and a narrator-enabled value. Valid preferences are projected and written atomically to the application user-data directory.

English, Hong Kong Cantonese, and bilingual modes change the primary navigation, search copy, category labels, and an implemented set of common controls. A substantial amount of secondary copy remains English-only, so this build must not be described as fully localized.

## Configuration

Language and narrator choices are persisted with the other preferences. Values outside the accepted enums and numeric bounds are rejected. The reset action restores the shipped preference object after destructive confirmation.

## Current boundary

There is no speech-synthesis or text-to-speech queue in the production renderer. Enabling the narrator stores a preference but does not speak events. The funny-level values are also persisted without a complete copy-selection engine across every message category.

Shared School mode, app renaming, personal-vocabulary upload and validation, scheduled settings, external API or Home Assistant sources, an emoji toggle, and live cross-application propagation are unavailable.

## Failure modes

- Missing or malformed preference data falls back to shipped values.
- Invalid values are rejected rather than partially applied.
- A narrator preference can appear enabled while producing no audio; this is an implementation boundary, not an audio-device failure.
- Some untranslated secondary text remains English in Cantonese and bilingual modes.

## Security considerations

Preferences contain no credentials. The file is local, bounded, and atomically replaced. No personal-vocabulary payload or Home Assistant token is accepted by this build.

## Verification

Local checks cover preference projection and persistence bounds, and smoke states exercise the principal language and layout modes. Production narration, all-copy localization, funny-level effects, shared-mode propagation, and scheduled sources remain unverified because their runtimes do not exist.

## Suggested articles

- [Appearance controls](appearance-controls.md)
- [Notifications](notifications.md)
- [Offline documentation browser](offline-documentation.md)
- [Release boundary](release-boundary.md)

